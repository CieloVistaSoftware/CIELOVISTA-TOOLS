// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

import * as vscode from 'vscode';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { log, logError } from '../shared/output-channel';
import { loadRegistry } from '../shared/registry';

const FEATURE = 'playwright-runner';
let pwProcess: ChildProcessWithoutNullStreams | null = null;
let pwOutput = '';
const PW_MD_PATH = path.join(__dirname, '../data/playwright-run-result.md');

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.playwright.run', runPlaywrightTests),
        vscode.commands.registerCommand('cvs.playwright.stop', stopPlaywrightTests),
        vscode.commands.registerCommand('cvs.playwright.cleanResults', cleanTestResults)
    );
}

export function deactivate() {
    stopPlaywrightTests();
}

async function runPlaywrightTests() {
    if (pwProcess) {
        vscode.window.showWarningMessage('Playwright test run is already in progress.');
        return;
    }
    const wsPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    const testFiles = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: true,
        openLabel: 'Select Playwright Test Files',
        filters: { 'Playwright Tests': ['spec.ts', 'test.ts'] },
        defaultUri: vscode.Uri.file(path.join(wsPath, 'tests'))
    });
    if (!testFiles || testFiles.length === 0) {
        vscode.window.showInformationMessage('No test files selected.');
        return;
    }
    pwOutput = '';
    const args = ['test', '--headed', ...testFiles.map(f => f.fsPath)];
    pwProcess = spawn('npx', ['playwright', ...args], {
        cwd: wsPath,
        shell: true
    });
    log(FEATURE, 'Started Playwright tests in headed mode.');
    pwProcess.stdout.on('data', (data) => {
        pwOutput += data.toString();
    });
    pwProcess.stderr.on('data', (data) => {
        pwOutput += data.toString();
    });
    pwProcess.on('close', (code) => {
        log(FEATURE, `Playwright exited with code ${code ?? -1}`);
        writePlaywrightResultMarkdown(code ?? -1);
        showPlaywrightResultMarkdown();
        pwProcess = null;
    });
    pwProcess.on('error', (err) => {
        logError('Playwright process error', err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
        pwOutput += `\nERROR: ${err}`;
        writePlaywrightResultMarkdown(-1);
        showPlaywrightResultMarkdown();
        pwProcess = null;
    });
}

function stopPlaywrightTests() {
    if (pwProcess) {
        try {
            pwProcess.kill('SIGKILL');
            log(FEATURE, 'Playwright test process killed.');
        } catch (e) {
            logError('Failed to kill Playwright process', e instanceof Error ? e.stack || String(e) : String(e), FEATURE);
        }
        pwProcess = null;
        vscode.window.showInformationMessage('Playwright test run stopped.');
        // Optionally trigger UI refresh here if needed
    }
}

function writePlaywrightResultMarkdown(code: number) {
    const status = code === 0 ? '✅ **All tests passed**' : '❌ **Test failures or error**';
    const md = `# Playwright Test Result\n\n${status}\n\n---\n\n\`\`\`shell\n${pwOutput}\n\`\`\``;
    fs.writeFileSync(PW_MD_PATH, md, 'utf8');
    // Optionally notify UI or emit event here
}

function showPlaywrightResultMarkdown() {
    vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(PW_MD_PATH));
}

const RESULT_DIRS = ['test-results', 'playwright-report'];

async function cleanTestResults(): Promise<void> {
    const registry = loadRegistry();
    const roots: string[] = [];
    if (registry) {
        roots.push(registry.globalDocsPath);
        registry.projects.forEach(p => roots.push(p.path));
    }
    // Also include current workspace folders not in registry
    (vscode.workspace.workspaceFolders ?? []).forEach(wf => {
        if (!roots.includes(wf.uri.fsPath)) { roots.push(wf.uri.fsPath); }
    });

    const deleted: string[] = [];
    for (const root of roots) {
        for (const dirName of RESULT_DIRS) {
            const target = path.join(root, dirName);
            if (fs.existsSync(target)) {
                try {
                    await vscode.workspace.fs.delete(vscode.Uri.file(target), { recursive: true, useTrash: false });
                    deleted.push(target);
                    log(FEATURE, `Deleted: ${target}`);
                } catch (err) {
                    logError(`Failed to delete ${target}`, err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
                }
            }
        }
    }

    if (deleted.length === 0) {
        vscode.window.showInformationMessage('No test-results or playwright-report folders found.');
    } else {
        vscode.window.showInformationMessage(
            `Cleaned ${deleted.length} folder${deleted.length === 1 ? '' : 's'}: ${deleted.map(d => path.basename(path.dirname(d)) + '/' + path.basename(d)).join(', ')}`
        );
    }
}
