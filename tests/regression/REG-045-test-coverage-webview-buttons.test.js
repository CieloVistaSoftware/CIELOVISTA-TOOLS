// Copyright (c) CieloVista Software. All rights reserved.
// REG-045: Issue #352 - Test Coverage Audit webview button wiring
//
// Run: node tests/regression/REG-045-test-coverage-webview-buttons.test.js

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'src', 'features', 'test-coverage-auditor.ts'), 'utf8');

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

console.log('REG-045: Test Coverage Audit webview buttons (#352)');
console.log('-'.repeat(64));

test('toolbar buttons are present in the webview HTML', () => {
    assert(SRC.includes("id=\"btn-refresh\""), 'Refresh button missing');
    assert(SRC.includes("id=\"btn-export\""), 'Export button missing');
    assert(SRC.includes("id=\"btn-copy-md\""), 'Copy markdown button missing');
    assert(SRC.includes("id=\"btn-copy-chat\""), 'Copy chat button missing');
    assert(SRC.includes("id=\"btn-generate\""), 'Generate button missing');
});

test('button click listeners are wired to handlers', () => {
    assert(SRC.includes("document.getElementById('btn-refresh').addEventListener('click', refresh);"), 'Refresh click handler missing');
    assert(SRC.includes("document.getElementById('btn-export').addEventListener('click', exportReport);"), 'Export click handler missing');
    assert(SRC.includes("document.getElementById('btn-generate').addEventListener('click', generateTests);"), 'Generate click handler missing');
    assert(SRC.includes("document.getElementById('btn-copy-md').addEventListener('click'"), 'Copy markdown click handler missing');
    assert(SRC.includes("document.getElementById('btn-copy-chat').addEventListener('click'"), 'Copy chat click handler missing');
});

test('copy-chat payload includes @workspace prefix and MD_CONTENT', () => {
    assert(
        SRC.includes("'@workspace Here is the current Test Coverage Audit dashboard for cielovista-tools:"),
        'Copy chat payload must start with @workspace prefix'
    );
    assert(
        SRC.includes('MD_CONTENT'),
        'Copy chat payload must reference MD_CONTENT'
    );
    assert(
        SRC.includes('function buildChatPayload()'),
        'buildChatPayload() function must exist'
    );
});

test('webview messages are handled for all button commands', () => {
    assert(SRC.includes("case 'refresh':"), 'refresh message handler missing');
    assert(SRC.includes("case 'export':"), 'export message handler missing');
    assert(SRC.includes("case 'generate':"), 'generate message handler missing');
    assert(SRC.includes("case 'copyFallback':"), 'copyFallback message handler missing');
});

test('onDidReceiveMessage registered once at panel creation, not in refresh path', () => {
    // Root cause of #352: when Refresh replaced webview.html via the
    // if (currentWebviewPanel) branch, no new listener was registered and
    // all subsequent button clicks were silently dropped.
    // Guard: onDidReceiveMessage must appear exactly ONCE in the source —
    // inside the else (panel-creation) branch, never in the update branch.
    const count = (SRC.match(/onDidReceiveMessage/g) || []).length;
    assert(count === 1, `onDidReceiveMessage must appear exactly once (found ${count}) — registering it in the refresh/update path causes buttons to stop working after the first refresh`);

    // The single registration must be paired with context.subscriptions so it
    // is cleaned up on extension deactivation.
    // context.subscriptions appears at the closing of the handler (after ~500+ chars).
    // Search the 1200-char block starting at the registration site.
    const idx = SRC.indexOf('onDidReceiveMessage');
    const block = SRC.slice(idx, idx + 1200);
    assert(block.includes('context.subscriptions'), 'onDidReceiveMessage must pass context.subscriptions as the third argument for proper disposal');
});

console.log('-'.repeat(64));
if (failed === 0) {
    console.log(`\u2713 REG-045 passed (${passed} checks).\n`);
    process.exit(0);
}

console.error(`\u2717 REG-045 FAILED (${failed} of ${passed + failed} checks failed).\n`);
process.exit(1);
