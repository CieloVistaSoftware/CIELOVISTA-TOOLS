// Copyright (c) CieloVista Software. All rights reserved.
// REG-029: Issue #76 — Doc Catalog Folder button should open the project in VS Code
//
// openProjectFolderSmart() must call vscode.openFolder with forceNewWindow:true
// so the current workspace is never replaced. Not openExternal or revealInExplorer.
//
// Run: node tests/regression/REG-029-catalog-folder-button.test.js

'use strict';

const fs     = require('fs');
const path   = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC  = fs.readFileSync(path.join(ROOT, 'src/features/doc-catalog/commands.ts'), 'utf8');

let passed = 0, failed = 0;

function test(name, fn) {
    try { fn(); console.log(`  PASS ${name}`); passed++; }
    catch (e) { console.error(`  FAIL ${name}\n       ${e.message}`); failed++; }
}

console.log('REG-029: Doc Catalog Folder button opens project in VS Code (#76)');
console.log('─'.repeat(60));

test('openProjectFolderSmart is defined in commands.ts', () => {
    assert(SRC.includes('openProjectFolderSmart'), 'openProjectFolderSmart must exist in commands.ts');
});

test('Folder button handler dispatches openFolder command', () => {
    assert(SRC.includes("case 'openFolder'"), "case 'openFolder' must be handled");
    assert(SRC.includes('openProjectFolderSmart'), 'handler must call openProjectFolderSmart');
});

test('openProjectFolderSmart uses vscode.openFolder', () => {
    const fnStart = SRC.indexOf('function openProjectFolderSmart');
    assert(fnStart !== -1, 'openProjectFolderSmart not found');
    // Find the closing brace of the function
    let depth = 0, i = fnStart;
    while (i < SRC.length) {
        if (SRC[i] === '{') { depth++; }
        else if (SRC[i] === '}') { depth--; if (depth === 0) { break; } }
        i++;
    }
    const fnBody = SRC.slice(fnStart, i + 1);
    assert(
        fnBody.includes('vscode.openFolder'),
        'openProjectFolderSmart must call vscode.openFolder so the project opens in VS Code (#76)'
    );
});

test('openProjectFolderSmart does NOT call revealInExplorer', () => {
    const fnStart = SRC.indexOf('function openProjectFolderSmart');
    let depth = 0, i = fnStart;
    while (i < SRC.length) {
        if (SRC[i] === '{') { depth++; }
        else if (SRC[i] === '}') { depth--; if (depth === 0) { break; } }
        i++;
    }
    const fnBody = SRC.slice(fnStart, i + 1);
    assert(
        !fnBody.includes('revealInExplorer'),
        'openProjectFolderSmart must NOT call revealInExplorer for this action (#76)'
    );
});

test('openProjectFolderSmart opens in a new window', () => {
    const fnStart = SRC.indexOf('function openProjectFolderSmart');
    let depth = 0, i = fnStart;
    while (i < SRC.length) {
        if (SRC[i] === '{') { depth++; }
        else if (SRC[i] === '}') { depth--; if (depth === 0) { break; } }
        i++;
    }
    const fnBody = SRC.slice(fnStart, i + 1);
    assert(
        fnBody.includes('forceNewWindow: true'),
        'openProjectFolderSmart must open in a new window so the current workspace is not replaced (#76)'
    );
});

console.log('─'.repeat(60));
if (failed === 0) { console.log(`✓ REG-029 passed (${passed} checks).\n`); process.exit(0); }
else { console.error(`✗ REG-029 FAILED (${failed} of ${passed + failed} checks failed).\n`); process.exit(1); }
