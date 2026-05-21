/**
 * tests/vscode/suite/home-filelist-gui.test.js
 *
 * GUI-layer integration checks for Home -> File List behavior.
 *
 * This runs inside real VS Code extension host via @vscode/test-electron.
 * It validates:
 *   1) Home webview source still wires quick-launch click to runCommand.
 *   2) Host-side OPEN_DIRECT contains cvs.tools.fileList and focuses group 2.
 *   3) Executing File List opens the actual cvsFileList webview tab.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vscode = require('vscode');

const HOME_SRC_PATH = path.join(__dirname, '../../../src/features/home-page.ts');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitFor(predicate, timeoutMs = 10000, intervalMs = 150) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const value = await predicate();
        if (value) {
            return value;
        }
        await sleep(intervalMs);
    }
    return undefined;
}

function findFileListTab() {
    for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
            const input = tab.input;
            if (
                input instanceof vscode.TabInputWebview &&
                (input.viewType === 'cvsFileList' || String(input.viewType).endsWith('cvsFileList'))
            ) {
                return { group, tab };
            }
        }
    }
    return undefined;
}

function dumpTabs() {
    const rows = [];
    for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
            const input = tab.input;
            const kind = input && input.constructor ? input.constructor.name : typeof input;
            const viewType = input instanceof vscode.TabInputWebview ? input.viewType : '';
            rows.push(`${group.viewColumn}:${tab.label}:${kind}:${viewType}`);
        }
    }
    return rows;
}

suite('Home -> FileList GUI', function () {
    test('Home click wiring + runtime FileList webview visibility', async function () {
        this.timeout(20000);

        const homeSrc = fs.readFileSync(HOME_SRC_PATH, 'utf8');

        assert.ok(
            homeSrc.includes("document.querySelectorAll('.ql-btn').forEach"),
            'Home quick-launch click binding not found'
        );
        assert.ok(
            homeSrc.includes("vsc.postMessage({ type:'runCommand', command:b.dataset.cmd });"),
            'Home quick-launch does not post runCommand'
        );
        assert.ok(
            /const OPEN_DIRECT\s*=\s*\[[\s\S]{0,1200}'cvs\.tools\.fileList'/.test(homeSrc),
            'OPEN_DIRECT is missing cvs.tools.fileList'
        );
        assert.ok(
            homeSrc.includes("workbench.action.focusSecondEditorGroup"),
            'Home direct-open path should focus second editor group'
        );

        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        await vscode.commands.executeCommand('cvs.tools.home');
        await sleep(600);

        const registered = await vscode.commands.getCommands(true);
        assert.ok(
            registered.includes('cvs.tools.fileList'),
            'cvs.tools.fileList is not registered at runtime in this integration run'
        );

        // This command is what Home quick-launch ultimately executes via runCommand.
        await vscode.commands.executeCommand('cvs.tools.fileList');

        const found = await waitFor(() => findFileListTab(), 12000, 200);
        assert.ok(found, `FileList webview tab (viewType=cvsFileList) did not appear. Tabs: ${dumpTabs().join(' | ')}`);
        assert.ok(
            String(found.tab.label || '').startsWith('FileList'),
            `Unexpected FileList tab label: ${found.tab.label}`
        );

        const debugState = await waitFor(async () => {
            const state = await vscode.commands.executeCommand('cvs.tools.fileList._debugState');
            if (!state || typeof state !== 'object') {
                return undefined;
            }
            return state;
        }, 5000, 150);

        assert.ok(debugState, 'FileList debug state unavailable');
        assert.ok(
            Number(debugState.entryCount || 0) > 0,
            `FileList opened but has no rows. Debug state: ${JSON.stringify(debugState)}`
        );
    });

    test('Folder open changes FileList directory', async function () {
        this.timeout(25000);

        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        await vscode.commands.executeCommand('cvs.tools.fileList');

        const startState = await waitFor(async () => {
            const state = await vscode.commands.executeCommand('cvs.tools.fileList._debugState');
            if (!state || typeof state !== 'object' || !state.dir) {
                return undefined;
            }
            return state;
        }, 10000, 200);

        assert.ok(startState, 'FileList start state unavailable');

        const entries = await waitFor(async () => {
            const list = await vscode.commands.executeCommand('cvs.tools.fileList._debugEntries');
            if (!Array.isArray(list)) {
                return undefined;
            }
            return list;
        }, 5000, 150);

        assert.ok(entries, 'FileList entry listing unavailable');
        const firstFolder = entries.find(e => e && e.isDir && e.name);
        assert.ok(firstFolder, 'No folder entry available to validate folder-open behavior');

        await vscode.commands.executeCommand('cvs.tools.fileList._debugOpenEntry', firstFolder.name, 'open');

        const afterState = await waitFor(async () => {
            const state = await vscode.commands.executeCommand('cvs.tools.fileList._debugState');
            if (!state || typeof state !== 'object' || !state.dir) {
                return undefined;
            }
            return state;
        }, 10000, 200);

        assert.ok(afterState, 'FileList post-open state unavailable');
        assert.notStrictEqual(
            String(afterState.dir),
            String(startState.dir),
            `Folder open did not change directory. folder=${firstFolder.name} start=${startState.dir} end=${afterState.dir}`
        );
    });
});
