// Copyright (c) 2026 CieloVista Software. All rights reserved.
// REG-114: Issue Viewer "Question" status (#605).
//
// When work on an issue is blocked on the user (validate / answer / decide),
// the issue carries status:question and must surface distinctly:
//   - state pill: purple QUESTION (#a371f7), precedence closed > question >
//     in-progress > open
//   - a Questions banner listing how many issues await the user, with a filter
//     to show only those rows so the user can validate one by one
//   - a per-row "Answered" action that removes status:question

'use strict';

const fs     = require('fs');
const path   = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', '..');
const SRC  = fs.readFileSync(
    path.join(ROOT, 'src', 'shared', 'github-issues-view.ts'), 'utf8');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try   { fn(); console.log(`  PASS ${name}`); passed++; }
    catch (e) { console.error(`  FAIL ${name}\n       ${e.message}`); failed++; }
}

console.log('REG-114: Issue Viewer — Question status pill, banner, filter, Answered action (#605)');
console.log('-'.repeat(70));

test('question pill CSS is purple (#a371f7)', () => {
    const rule = SRC.match(/\.state-pill\.question\{[^}]*\}/)?.[0] ?? '';
    assert.ok(rule, '.state-pill.question rule not found');
    assert.ok(/#a371f7/i.test(rule), '.state-pill.question must use purple #a371f7');
});

test('isQuestion is detected from the status:question label', () => {
    const m = SRC.match(/const isQuestion\s*=\s*iss\.labels\.some\([^;]+;/);
    assert.ok(m, 'isQuestion assignment not found');
    assert.ok(/status:question/.test(m[0]), 'isQuestion must check the status:question label');
});

test('state pill precedence is closed > question > in-progress > open', () => {
    const m = SRC.match(/const statePillClass\s*=\s*([^;]+);/);
    assert.ok(m, 'statePillClass assignment not found');
    const expr = m[1];
    assert.ok(/'question'/.test(expr), 'must map question');
    // question must be evaluated before in-progress so a blocked-on-user issue
    // shows QUESTION even when it is also active work.
    const qIdx  = expr.indexOf('isQuestion');
    const ipIdx = expr.indexOf('isInProgress');
    assert.ok(qIdx !== -1 && ipIdx !== -1, 'both isQuestion and isInProgress must appear');
    assert.ok(qIdx < ipIdx, 'isQuestion must be checked before isInProgress (precedence)');
});

test('rows expose data-question for filtering', () => {
    assert.ok(/data-question="\$\{/.test(SRC), 'issue rows must carry a data-question attribute');
});

test('a Questions banner surfaces the count of issues awaiting the user', () => {
    assert.ok(/q-banner/.test(SRC), 'a .q-banner element must be rendered');
    assert.ok(/q-filter-btn/.test(SRC), 'banner must include a question-filter button');
});

test('applyFilter honours a questions-only mode via data-question', () => {
    const fn = SRC.match(/function applyFilter\(\)\{[\s\S]*?\n    \}/)?.[0] ?? '';
    assert.ok(fn, 'applyFilter function not found');
    assert.ok(/data-question|qOnly/.test(fn), 'applyFilter must gate rows on the questions-only flag');
});

test('per-row Answered action posts an answered message', () => {
    assert.ok(/answered-btn/.test(SRC), 'an .answered-btn must be rendered for question rows');
    assert.ok(/type:\s*'answered'/.test(SRC), "Answered button must post { type: 'answered' }");
});

test('answered handler removes the status:question label', () => {
    assert.ok(/msg\.type === 'answered'/.test(SRC), "message handler must handle type 'answered'");
    assert.ok(
        /--remove-label['"\s,]+.*status:question|status:question[\s\S]{0,40}--remove-label|'--remove-label',\s*'status:question'/.test(SRC),
        'answered flow must remove the status:question label via gh'
    );
});

console.log('-'.repeat(70));
if (failed === 0) {
    console.log(`✓ REG-114 passed (${passed} checks).\n`);
    process.exit(0);
}
console.error(`✗ REG-114 FAILED (${failed} of ${passed + failed} checks failed).\n`);
process.exit(1);
