// Copyright (c) CieloVista Software. All rights reserved.
// REG-050: FileList multi-select run + full-path hover/click behavior.
//
// Run: node tests/regression/REG-050-filelist-multiselect-and-path-tooltip.test.js

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'src', 'features', 'file-list-viewer.ts'), 'utf8');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  PASS ${name}`);
        passed += 1;
    } catch (err) {
        console.error(`  FAIL ${name}\n       ${err.message}`);
        failed += 1;
    }
}

console.log('REG-050: FileList multi-select run + path tooltip/click');
console.log('-'.repeat(64));

test('path display exposes full path via title and click action', () => {
    assert(SRC.includes("pathDisplay.title = state.dir || '';"), 'path title binding missing');
    assert(SRC.includes("document.getElementById('path-display').addEventListener('click'"), 'path display click handler missing');
    assert(SRC.includes("command: 'copy-path'"), 'copy-path postMessage missing');
    assert(SRC.includes("msg.command === 'copy-path'"), 'copy-path message handler missing');
});

test('webview supports multi-select state and range selection', () => {
    assert(SRC.includes('state.selectedNames = uniq;'), 'selectedNames state assignment missing');
    assert(SRC.includes('function selectRange(toName)'), 'range selection helper missing');
    assert(SRC.includes('if (ev.shiftKey) {'), 'shift multi-select branch missing');
    assert(SRC.includes('if (ev.ctrlKey || ev.metaKey) {'), 'ctrl/meta multi-select branch missing');
});

test('context menu run action uses selected runnable files and labels batch action', () => {
    assert(SRC.includes('isRunnableTestFile(name)'), 'runnable test predicate missing');
    assert(SRC.includes("/\\.(js|ts)$/i.test(name || '')"), 'js/ts runnable guard missing');
    assert(SRC.includes("document.getElementById('ctx-run-test').textContent = names.length > 1 ? ('▶ Run Tests (' + names.length + ')') : '▶ Run Test';"), 'batch run context label missing');
    assert(SRC.includes("vsc.postMessage({ command: 'run-test', names: _ctxNames });"), 'run-test names[] postMessage missing');
});

test('extension host run-test handler supports names[] and executes each file', () => {
    assert(SRC.includes('Array.isArray(msg.names)'), 'run-test handler names[] normalization missing');
    assert(SRC.includes('for (const testFile of testFiles)'), 'multi-file run loop missing');
    assert(SRC.includes('spawn(process.execPath, [testFile]'), 'node spawn for each selected file missing');
});

console.log('-'.repeat(64));
if (failed === 0) {
    console.log(`✓ REG-050 passed (${passed} checks).\n`);
    process.exit(0);
}

console.error(`✗ REG-050 FAILED (${failed} of ${passed + failed} checks failed).\n`);
process.exit(1);
