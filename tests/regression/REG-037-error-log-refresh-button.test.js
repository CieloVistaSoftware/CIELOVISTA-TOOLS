// Copyright (c) CieloVista Software. All rights reserved.
// REG-037: Issue #345 — Error Log toolbar refresh button
//
// Run: node tests/regression/REG-037-error-log-refresh-button.test.js

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'src/features/error-log-viewer.ts'), 'utf8');

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

console.log('REG-037: Tools Error Log refresh toolbar action (#345)');
console.log('─'.repeat(64));

test('toolbar includes refresh button', () => {
    assert(SRC.includes('data-action="refresh"'), 'refresh button action is missing');
    assert(SRC.includes('🔄 Refresh'), 'refresh button label is missing');
});

test('webview message handler has refresh branch', () => {
    assert(SRC.includes("if (msg.command === 'refresh')"), 'refresh command branch is missing');
    assert(SRC.includes('buildHtml(getErrors())'), 'refresh branch must rebuild from current errors');
});

test('refresh branch logs action', () => {
    assert(SRC.includes("Error log refreshed by user"), 'refresh branch should log refresh action');
});

console.log('─'.repeat(64));
if (failed === 0) {
    console.log(`✓ REG-037 passed (${passed} checks).\n`);
    process.exit(0);
}

console.error(`✗ REG-037 FAILED (${failed} of ${passed + failed} checks failed).\n`);
process.exit(1);
