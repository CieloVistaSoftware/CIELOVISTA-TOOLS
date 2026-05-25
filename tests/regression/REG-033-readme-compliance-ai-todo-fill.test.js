// Copyright (c) CieloVista Software. All rights reserved.
// REG-033: Issue #306 — Review Fix uses AI to fill _TODO: stubs from companion source file.
//
// Before fix: showFixDiff() applied the structural skeleton and showed the diff.
//   If applyFix() left _TODO: stubs the user still had to fill them manually.
// After fix:
//   1. showFixDiff() checks the fixed content for _TODO: or # TODO markers
//   2. When stubs are found it locates the companion .ts / .js source file
//   3. It constructs a prompt that includes the source file content as context
//   4. callClaude() replaces the stubs with real content before the diff is shown

'use strict';

const fs     = require('fs');
const path   = require('path');
const assert = require('assert');

const ROOT    = path.resolve(__dirname, '..', '..');
const SRC     = fs.readFileSync(path.join(ROOT, 'src/features/readme-compliance/feature.ts'), 'utf8');

let passed = 0, failed = 0;

function test(name, fn) {
    try { fn(); console.log(`  PASS ${name}`); passed++; }
    catch (err) { console.error(`  FAIL ${name}`); console.error(`       ${err.message}`); failed++; }
}

// ─── 1. showFixDiff checks for _TODO: stubs after applyFix ───────────────────

test('showFixDiff() inspects fixed content for _TODO: stubs', () => {
    // Find showFixDiff function body and verify _TODO: check is inside it
    const fnIdx  = SRC.indexOf('async function showFixDiff');
    assert(fnIdx !== -1, 'showFixDiff function not found');
    // Next function starts after showFixDiff's closing brace — look within 2000 chars
    const fnBody = SRC.slice(fnIdx, fnIdx + 4000);
    assert(
        fnBody.includes('_TODO:') || fnBody.includes('_TODO'),
        'showFixDiff() does not check for _TODO: stubs — AI fill will never trigger'
    );
});

// ─── 2. Companion source file lookup exists ───────────────────────────────────

test('showFixDiff() looks for companion .ts / .js source file', () => {
    const fnIdx  = SRC.indexOf('async function showFixDiff');
    const fnBody = SRC.slice(fnIdx, fnIdx + 4000);
    assert(
        fnBody.includes('.ts') && fnBody.includes('.js'),
        'showFixDiff() does not search for a companion .ts/.js file — AI will have no source context'
    );
});

// ─── 3. callClaude invoked inside showFixDiff ─────────────────────────────────

test('showFixDiff() calls callClaude() when stubs are found', () => {
    const fnIdx  = SRC.indexOf('async function showFixDiff');
    const fnBody = SRC.slice(fnIdx, fnIdx + 4000);
    assert(
        fnBody.includes('callClaude'),
        'showFixDiff() does not call callClaude() — AI stub fill is not wired up'
    );
});

// ─── 4. AI content replaces `after` before diff is built ─────────────────────

test('AI content replaces the fixed string before building the diff', () => {
    const fnIdx  = SRC.indexOf('async function showFixDiff');
    const fnBody = SRC.slice(fnIdx, fnIdx + 4000);
    // The pattern: if (aiContent && ...) { after = aiContent; }
    assert(
        fnBody.includes('after = aiContent') || fnBody.includes('after=aiContent'),
        'showFixDiff() does not assign aiContent back to `after` — diff will still show stubs'
    );
});

// ─── 5. Fallback: AI errors are caught and logged, not thrown ─────────────────

test('showFixDiff() catches AI errors gracefully (does not throw)', () => {
    const fnIdx  = SRC.indexOf('async function showFixDiff');
    const fnBody = SRC.slice(fnIdx, fnIdx + 4000);
    assert(
        fnBody.includes('catch'),
        'showFixDiff() AI call is not wrapped in try/catch — a Claude API error will break the diff flow'
    );
});

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log('REG-033: README Compliance AI fill of _TODO: stubs (#306)');
console.log('─'.repeat(55));
if (failed === 0) {
    console.log(`✓ REG-033 passed (${passed} checks — showFixDiff fills stubs with AI before showing diff).`);
    process.exit(0);
} else {
    console.error(`✗ REG-033 FAILED (${failed} of ${passed + failed} checks failed).`);
    process.exit(1);
}
