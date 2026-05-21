// Copyright (c) CieloVista Software. All rights reserved.
// REG-059: FileList exposes "Open folder here" command for Explorer right-click
// and webview context menu covers all file/folder types (not just test files).

'use strict';

const fs   = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'features', 'file-list-viewer.ts'),
    'utf8'
);
const PKG = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', '..', 'package.json'),
    'utf8'
));

let passed = 0;
let failed = 0;

function pass(msg) { console.log(`PASS: ${msg}`); passed += 1; }
function fail(msg) { console.error(`FAIL: ${msg}`); failed += 1; }

// --- package.json: command registered ---
(function checkCommandRegistered() {
    const cmd = (PKG.contributes?.commands ?? []).find(c => c.command === 'cvs.tools.fileList.navigateTo');
    if (cmd) {
        pass('cvs.tools.fileList.navigateTo command registered in package.json');
    } else {
        fail('cvs.tools.fileList.navigateTo not found in contributes.commands');
    }
})();

// --- package.json: explorer/context menu entry ---
(function checkMenuEntry() {
    const menus = PKG.contributes?.menus?.['explorer/context'] ?? [];
    const entry = menus.find(m => m.command === 'cvs.tools.fileList.navigateTo');
    if (entry && entry.when && entry.when.includes('explorerResourceIsFolder')) {
        pass('cvs.tools.fileList.navigateTo has explorer/context entry with explorerResourceIsFolder when clause');
    } else {
        fail(`Missing or incorrect explorer/context entry for navigateTo: ${JSON.stringify(entry)}`);
    }
})();

// --- source: navigateFileListToFolder helper exists ---
(function checkHelperFn() {
    if (SRC.includes('export function navigateFileListToFolder(folderUri: vscode.Uri): void')) {
        pass('navigateFileListToFolder exported function present');
    } else {
        fail('navigateFileListToFolder export missing');
    }
})();

// --- source: command handler calls navigateFileListToFolder ---
(function checkCommandHandler() {
    const hasHandler = SRC.includes("vscode.commands.registerCommand('cvs.tools.fileList.navigateTo'") &&
                       SRC.includes('navigateFileListToFolder(uri)');
    if (hasHandler) {
        pass('cvs.tools.fileList.navigateTo handler wired to navigateFileListToFolder');
    } else {
        fail('cvs.tools.fileList.navigateTo command handler not found or not calling navigateFileListToFolder');
    }
})();

// --- webview: ctx-open button exists (for non-dir files) ---
(function checkCtxOpenButton() {
    if (SRC.includes("id=\"ctx-open\"")) {
        pass('ctx-open button present in webview context menu');
    } else {
        fail('ctx-open button missing from webview context menu');
    }
})();

// --- webview: ctx-navigate button exists (for directories) ---
(function checkCtxNavigateButton() {
    if (SRC.includes("id=\"ctx-navigate\"")) {
        pass('ctx-navigate button present in webview context menu');
    } else {
        fail('ctx-navigate button missing from webview context menu');
    }
})();

// --- webview: ctx-reveal and ctx-copy-path buttons exist ---
(function checkUniversalCtxButtons() {
    const hasReveal  = SRC.includes("id=\"ctx-reveal\"");
    const hasCopy    = SRC.includes("id=\"ctx-copy-path\"");
    if (hasReveal && hasCopy) {
        pass('ctx-reveal and ctx-copy-path buttons present (universal actions)');
    } else {
        fail(`Universal context menu buttons missing: reveal=${hasReveal} copy=${hasCopy}`);
    }
})();

// --- webview: contextmenu handler no longer bails out for non-test files ---
(function checkMenuAlwaysShows() {
    // Old code had: if (!isRunnableTestFile(name)) { hideCtxMenu(); return; }
    // New code should always show the menu for any row.
    const hasOldBailout = SRC.includes("if (!isRunnableTestFile(name)) { hideCtxMenu(); return; }");
    if (!hasOldBailout) {
        pass('contextmenu handler no longer bails for non-test files');
    } else {
        fail('old bailout still present — context menu still hidden for non-test files');
    }
})();

// --- source: reveal-in-explorer message handler ---
(function checkRevealHandler() {
    if (SRC.includes("msg.command === 'reveal-in-explorer'") && SRC.includes("'revealInExplorer'")) {
        pass('reveal-in-explorer message routed to revealInExplorer VS Code command');
    } else {
        fail('reveal-in-explorer message handler missing');
    }
})();

console.log(`\n${passed + failed} checks: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
