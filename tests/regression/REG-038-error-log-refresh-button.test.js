// Copyright (c) CieloVista Software. All rights reserved.
// REG-038: Issue #345 — Error Log Viewer must have a Refresh button in toolbar
//
// The Refresh button must:
//   1. Exist in the toolbar HTML (data-action="refresh")
//   2. Have CSS styling in the same file
//   3. Be handled by the onDidReceiveMessage handler (rebuild HTML from getErrors())
//
// Run: node tests/regression/REG-038-error-log-refresh-button.test.js

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT    = path.resolve(__dirname, '..', '..');
const VIEWER  = path.join(ROOT, 'src', 'features', 'error-log-viewer.ts');

let passed = 0, failed = 0;

function test(name, fn) {
    try { fn(); console.log(`  PASS ${name}`); passed++; }
    catch (e) { console.error(`  FAIL ${name}\n       ${e.message}`); failed++; }
}

console.log('REG-038: Error Log Viewer Refresh button (#345)');
console.log('─'.repeat(60));

const src = fs.readFileSync(VIEWER, 'utf8');

test('Refresh button exists in toolbar HTML with data-action="refresh"', () => {
    if (!src.includes('data-action="refresh"') && !src.includes("data-action='refresh'")) {
        throw new Error('Toolbar must have a button with data-action="refresh"');
    }
});

test('Refresh button has visible label text', () => {
    // Must have either text or an icon before the closing </button> tag
    if (!src.includes('Refresh') && !src.includes('🔄') && !src.includes('↻')) {
        throw new Error('Refresh button must have a visible label (text or icon)');
    }
});

test('btn-refresh CSS class is styled in the HTML builder', () => {
    if (!src.includes('btn-refresh')) {
        throw new Error('.btn-refresh CSS class must be defined for the Refresh button');
    }
});

test('refresh command is handled in onDidReceiveMessage', () => {
    if (!src.includes("msg.command === 'refresh'") && !src.includes('msg.command === "refresh"')) {
        throw new Error('onDidReceiveMessage must handle msg.command === "refresh"');
    }
});

test('refresh handler rebuilds HTML from getErrors()', () => {
    const handlerIdx = src.indexOf("msg.command === 'refresh'");
    if (handlerIdx === -1) { throw new Error('refresh handler not found'); }
    const handlerBlock = src.slice(handlerIdx, handlerIdx + 200);
    if (!handlerBlock.includes('buildHtml') || !handlerBlock.includes('getErrors')) {
        throw new Error('refresh handler must call buildHtml(getErrors()) to reload current entries');
    }
});

console.log('─'.repeat(60));
if (failed === 0) { console.log(`✓ REG-038 passed (${passed} checks).\n`); process.exit(0); }
else { console.error(`✗ REG-038 FAILED (${failed} of ${passed + failed} checks failed).\n`); process.exit(1); }
