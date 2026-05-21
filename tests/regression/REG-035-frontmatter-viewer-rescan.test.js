// Copyright (c) CieloVista Software. All rights reserved.
// REG-035: Issue #338 — Frontmatter Viewer must support in-panel rescan
//
// Run: node tests/regression/REG-035-frontmatter-viewer-rescan.test.js

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'src/features/frontmatter-viewer.ts'), 'utf8');

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

console.log('REG-035: Frontmatter Viewer rescan workflow (#338)');
console.log('─'.repeat(60));

test('viewer HTML includes a rescan button', () => {
    assert(SRC.includes('id="rescanBtn"'), 'rescan button id is missing');
    assert(SRC.includes('data-action="rescan"'), 'rescan button data-action is missing');
});

test('webview click handler posts rescan command', () => {
    assert(SRC.includes("command: 'rescan'"), 'webview must post a rescan command');
    assert(SRC.includes("rescanEl.textContent = 'Scanning...'"), 'rescan button should show scanning state');
});

test('onDidReceiveMessage handles rescan branch', () => {
    assert(SRC.includes("if (msg.command === 'rescan')"), 'rescan handler branch is missing');
    assert(SRC.includes('await openFrontmatterViewer();'), 'rescan branch must trigger an in-panel rescan');
});

console.log('─'.repeat(60));
if (failed === 0) {
    console.log(`✓ REG-035 passed (${passed} checks).\n`);
    process.exit(0);
} else {
    console.error(`✗ REG-035 FAILED (${failed} of ${passed + failed} checks failed).\n`);
    process.exit(1);
}
