// Copyright (c) CieloVista Software. All rights reserved.
// REG-038: Issue #341 — Error log top badge counts unresolved only
//
// Run: node tests/regression/REG-038-error-log-unresolved-count.test.js

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

console.log('REG-038: Error log unresolved count + filed badge (#341)');
console.log('─'.repeat(64));

test('buildHtml computes unresolved and filed counts', () => {
    assert(SRC.includes('const unresolvedCount = errors.filter(e => !e.githubIssueNumber).length;'), 'unresolved count computation missing');
    assert(SRC.includes('const filedCount = errors.length - unresolvedCount;'), 'filed count computation missing');
});

test('toolbar active badge uses unresolved count only', () => {
    assert(SRC.includes('active error'), 'active error label missing');
    assert(SRC.includes('${unresolvedCount} active error'), 'active badge must render unresolved count');
});

test('toolbar can show filed badge', () => {
    assert(SRC.includes('filedCount > 0 ? `<span class="pill" title="Filed errors">✅ ${filedCount} filed</span>`'), 'filed badge rendering missing');
});

test('successful file-as-issue refreshes panel html', () => {
    assert(SRC.includes('_panel!.webview.html = buildHtml(getErrors());'), 'panel should refresh counts after filing succeeds');
});

console.log('─'.repeat(64));
if (failed === 0) {
    console.log(`✓ REG-038 passed (${passed} checks).\n`);
    process.exit(0);
}

console.error(`✗ REG-038 FAILED (${failed} of ${passed + failed} checks failed).\n`);
process.exit(1);
