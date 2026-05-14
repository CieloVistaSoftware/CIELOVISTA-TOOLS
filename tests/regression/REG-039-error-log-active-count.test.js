// Copyright (c) CieloVista Software. All rights reserved.
// REG-039: Issue #341 — Error Log active count must exclude filed/resolved items
//
// The top error badge (pill-err) must show only unresolved entries.
// Filed entries (githubIssueNumber set) are counted separately.
//
// Run: node tests/regression/REG-039-error-log-active-count.test.js

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT   = path.resolve(__dirname, '..', '..');
const VIEWER = path.join(ROOT, 'src', 'features', 'error-log-viewer.ts');

let passed = 0, failed = 0;

function test(name, fn) {
    try { fn(); console.log(`  PASS ${name}`); passed++; }
    catch (e) { console.error(`  FAIL ${name}\n       ${e.message}`); failed++; }
}

console.log('REG-039: Error Log active count excludes filed/resolved items (#341)');
console.log('─'.repeat(65));

const src = fs.readFileSync(VIEWER, 'utf8');

test('unresolvedCount filters out filed entries (githubIssueNumber check)', () => {
    if (!src.includes('unresolvedCount') || !src.includes('githubIssueNumber')) {
        throw new Error('unresolvedCount must filter entries by !e.githubIssueNumber');
    }
    // Verify it filters by githubIssueNumber, not just counts all errors
    if (!src.includes('!e.githubIssueNumber')) {
        throw new Error('unresolvedCount filter must use !e.githubIssueNumber');
    }
});

test('error badge pill uses unresolvedCount (not errors.length)', () => {
    // The pill-err badge must use unresolvedCount, not the raw total.
    // Use lastIndexOf so we find the HTML template usage, not the CSS definition.
    const pillErrIdx = src.lastIndexOf('pill-err');
    if (pillErrIdx === -1) { throw new Error('pill-err badge not found'); }
    const pillBlock = src.slice(pillErrIdx - 100, pillErrIdx + 200);
    if (pillBlock.includes('errors.length') && !pillBlock.includes('unresolvedCount')) {
        throw new Error('pill-err badge must use unresolvedCount, not errors.length');
    }
    if (!pillBlock.includes('unresolvedCount')) {
        throw new Error('pill-err badge must show unresolvedCount');
    }
});

test('filed count is shown in a separate pill when > 0', () => {
    if (!src.includes('filedCount')) {
        throw new Error('filedCount must be computed and shown separately from the active error count');
    }
    if (!src.includes('filedCount > 0')) {
        throw new Error('A separate filed-count pill must appear when filedCount > 0');
    }
});

test('active count pill says "active" to distinguish from total', () => {
    if (!src.includes('active error')) {
        throw new Error('The badge text must say "active error" to distinguish from the total count');
    }
});

test('clean state shows checkmark when unresolvedCount is 0', () => {
    if (!src.includes('pill-ok') || !src.includes('Clean')) {
        throw new Error('When unresolvedCount is 0, the badge must show ✅ Clean (pill-ok)');
    }
});

console.log('─'.repeat(65));
if (failed === 0) { console.log(`✓ REG-039 passed (${passed} checks).\n`); process.exit(0); }
else { console.error(`✗ REG-039 FAILED (${failed} of ${passed + failed} checks failed).\n`); process.exit(1); }
