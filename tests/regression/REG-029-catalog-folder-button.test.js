// Copyright (c) CieloVista Software. All rights reserved.
// REG-029: Issue #336 — Doc Catalog Folder button must open OS file manager
//
// openProjectFolderSmart() must call vscode.env.openExternal, not revealInExplorer
// or vscode.openFolder (which replaces the current workspace).
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

console.log('REG-029: Doc Catalog Folder button opens OS file manager (#336)');
console.log('─'.repeat(60));

test('openProjectFolderSmart is defined in commands.ts', () => {
    assert(SRC.includes('openProjectFolderSmart'), 'openProjectFolderSmart must exist in commands.ts');
});

test('Folder button handler dispatches openFolder command', () => {
    assert(SRC.includes("case 'openFolder'"), "case 'openFolder' must be handled");
    assert(SRC.includes('openProjectFolderSmart'), 'handler must call openProjectFolderSmart');
});

test('openProjectFolderSmart uses vscode.env.openExternal', () => {
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
        fnBody.includes('openExternal'),
        'openProjectFolderSmart must call vscode.env.openExternal — revealInExplorer and vscode.openFolder are wrong for this action (#336)'
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
        'openProjectFolderSmart must NOT call revealInExplorer — it silently does nothing on workspace root (#336)'
    );
});

test('openProjectFolderSmart does NOT call vscode.openFolder', () => {
    const fnStart = SRC.indexOf('function openProjectFolderSmart');
    let depth = 0, i = fnStart;
    while (i < SRC.length) {
        if (SRC[i] === '{') { depth++; }
        else if (SRC[i] === '}') { depth--; if (depth === 0) { break; } }
        i++;
    }
    const fnBody = SRC.slice(fnStart, i + 1);
    assert(
        !fnBody.includes("'vscode.openFolder'"),
        'openProjectFolderSmart must NOT call vscode.openFolder — that replaces the current workspace (#336)'
    );
});

console.log('─'.repeat(60));
if (failed === 0) { console.log(`✓ REG-029 passed (${passed} checks).\n`); process.exit(0); }
else { console.error(`✗ REG-029 FAILED (${failed} of ${passed + failed} checks failed).\n`); process.exit(1); }
