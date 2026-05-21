// Copyright (c) CieloVista Software. All rights reserved.
// REG-042: Issue #349 — launcher status field + error log routing
//
// Run: node tests/regression/REG-042-launcher-status-field-and-error-log-routing.test.js

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..', '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'src', 'features', 'cvs-command-launcher', 'index.ts'), 'utf8');
const HTML_SRC = fs.readFileSync(path.join(ROOT, 'src', 'features', 'cvs-command-launcher', 'html.ts'), 'utf8');

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

console.log('REG-042: Launcher status field + error log routing (#349)');
console.log('-'.repeat(64));

test('error log command is routed as a direct panel command', () => {
    assert(INDEX_SRC.includes("'cvs.tools.errorLog'"), 'error log command missing from DIRECT_PANEL_COMMANDS');
    assert(INDEX_SRC.includes("entry?.action === 'read' || DIRECT_PANEL_COMMANDS.has(commandId)"), 'direct panel command bypass path missing');
});

test('error log card default status shows no-log-output state', () => {
    assert(INDEX_SRC.includes("label: 'No Log Output'"), 'error log no-output status label missing');
});

test('card schema contains status field with default status metadata', () => {
    assert(HTML_SRC.includes('class="cmd-status"'), 'card status container missing');
    assert(HTML_SRC.includes('class="cmd-status-value cmd-status-value--${statusInfo.tone}"'), 'card status value binding missing');
    assert(HTML_SRC.includes('data-default-label="${esc(statusInfo.label)}"'), 'default status label metadata missing');
    assert(HTML_SRC.includes('data-default-tone="${esc(statusInfo.tone)}"'), 'default status tone metadata missing');
});

test('status field updates at runtime from run-state messages', () => {
    assert(HTML_SRC.includes('function setCardStatus(card, label, tone, title)'), 'setCardStatus helper missing');
    assert(HTML_SRC.includes("setCardStatus(card, 'Running', 'warn', 'Command is running');"), 'running status update missing');
    assert(HTML_SRC.includes("setCardStatus(card, 'Completed', 'good', 'Last run succeeded');"), 'completed status update missing');
    assert(HTML_SRC.includes("setCardStatus(card, 'Error', 'bad', 'Last run failed');"), 'error status update missing');
});

console.log('-'.repeat(64));
if (failed === 0) {
    console.log(`✓ REG-042 passed (${passed} checks).\n`);
    process.exit(0);
}

console.error(`✗ REG-042 FAILED (${failed} of ${passed + failed} checks failed).\n`);
process.exit(1);
