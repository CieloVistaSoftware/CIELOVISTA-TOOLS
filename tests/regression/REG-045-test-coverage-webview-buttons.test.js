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

test('getWebviewHtml uses a nonce — script is not blocked by VS Code CSP', () => {
    // Root cause of buttons-dead-on-first-open: no CSP nonce → VS Code silently blocks
    // the inline <script> block, so acquireVsCodeApi() never runs and no click handlers
    // are registered. Every other webview in the codebase uses getNonce() for this reason.
    assert(
        SRC.includes("getNonce") && SRC.includes("from '../shared/webview-utils'"),
        'getNonce must be imported from shared/webview-utils'
    );
    assert(
        SRC.includes('Content-Security-Policy'),
        'getWebviewHtml must emit a <meta http-equiv="Content-Security-Policy"> tag'
    );
    assert(
        SRC.includes("script-src 'nonce-"),
        'CSP must include script-src nonce directive'
    );
    assert(
        SRC.includes('<script nonce='),
        '<script> tag must carry the nonce attribute'
    );
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

test('tier details panel DOM elements exist in the HTML template', () => {
    assert(SRC.includes('id="tier-details-panel"'),  'tier-details-panel container missing');
    assert(SRC.includes('id="tier-details-title"'),  'tier-details-title element missing');
    assert(SRC.includes('id="tier-details-body"'),   'tier-details-body element missing');
});

test('tier rows carry data-tier attribute for click dispatch', () => {
    assert(SRC.includes('data-tier="${tier.tier}"'), 'data-tier attribute missing from .tier divs');
});

test('renderTierDetails function exists and reads from tier-details DOM elements', () => {
    assert(SRC.includes('function renderTierDetails(tierKey)'), 'renderTierDetails function missing');
    assert(SRC.includes("document.getElementById('tier-details-title')"), 'tier-details-title lookup missing from renderTierDetails');
    assert(SRC.includes("document.getElementById('tier-details-body')"), 'tier-details-body lookup missing from renderTierDetails');
});

test('querySelectorAll(".tier") click listener calls renderTierDetails', () => {
    // The click-registration loop uses 'rowEl' as the parameter; the active-class loop
    // inside renderTierDetails uses 'el'. Search for the click-registration variant.
    const clickLoop = "document.querySelectorAll('.tier').forEach(function(rowEl)";
    assert(SRC.includes(clickLoop), 'querySelectorAll tier click-registration loop missing');
    const idx = SRC.indexOf(clickLoop);
    const block = SRC.slice(idx, idx + 300);
    assert(block.includes('renderTierDetails'), 'querySelectorAll tier listener must call renderTierDetails');
});

test('CSS active state uses higher specificity than present/missing to show visual feedback', () => {
    // Root cause of invisible click feedback: .tier.present comes after .tier.active in CSS,
    // so border-left-color from .tier.present overrides .tier.active on present tiers.
    // Fix: .tier.present.active (3-class selector) must override .tier.present (2-class).
    assert(
        SRC.includes('.tier.present.active') || SRC.includes('.tier.active.present'),
        '.tier.present.active rule must exist to override .tier.present border color when a present tier is selected'
    );
    assert(
        SRC.includes('.tier.missing.active') || SRC.includes('.tier.active.missing'),
        '.tier.missing.active rule must exist to override .tier.missing border color when a missing tier is selected'
    );
});

console.log('-'.repeat(64));
if (failed === 0) {
    console.log(`\u2713 REG-045 passed (${passed} checks).\n`);
    process.exit(0);
}

console.error(`\u2717 REG-045 FAILED (${failed} of ${passed + failed} checks failed).\n`);
process.exit(1);
