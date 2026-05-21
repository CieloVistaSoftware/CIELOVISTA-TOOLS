// Copyright (c) CieloVista Software. All rights reserved.
// REG-043: Issue #348 — docs audit must run non-blocking with progress updates
//
// Run: node tests/regression/REG-043-doc-audit-non-blocking.test.js

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..', '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'src', 'features', 'doc-auditor', 'index.ts'), 'utf8');

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

console.log('REG-043: Docs audit non-blocking execution + progress (#348)');
console.log('-'.repeat(64));

test('runFullAudit renders loading UI before starting work', () => {
    assert(INDEX_SRC.includes("panel.webview.html = buildAuditLoadingHtml('Starting…');"), 'loading UI assignment is missing');
    assert(INDEX_SRC.includes('panel.reveal(vscode.ViewColumn.One);'), 'panel should be revealed immediately');
});

test('audit work is launched in detached async flow (non-blocking command handler)', () => {
    assert(INDEX_SRC.includes('void (async () => {'), 'runFullAudit does not start detached async worker');
    assert(INDEX_SRC.includes('const results = await runAudit({'), 'detached worker does not run audit asynchronously');
});

test('progress/status updates are emitted while audit runs', () => {
    assert(INDEX_SRC.includes("_panel.webview.postMessage({ type: 'progress', status: message });"), 'in-flight progress postMessage missing');
    assert(INDEX_SRC.includes("_panel.webview.postMessage({ type: 'progress', status: 'Audit failed.' });"), 'failure progress/status postMessage missing');
});

console.log('-'.repeat(64));
if (failed === 0) {
    console.log(`✓ REG-043 passed (${passed} checks).\n`);
    process.exit(0);
}

console.error(`✗ REG-043 FAILED (${failed} of ${passed + failed} checks failed).\n`);
process.exit(1);
