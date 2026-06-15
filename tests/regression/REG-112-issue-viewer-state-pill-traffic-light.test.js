// Copyright (c) 2026 CieloVista Software. All rights reserved.
// REG-112: Issue Viewer state pill must be a traffic light, not always green.
//
// John's feedback (screenshot): green should mean "all is well", so an OPEN
// issue must NOT be green. He also wants a distinct state for issues being
// worked on. Required mapping:
//   open        -> blue  (#58a6ff)  needs attention, nothing started
//   in-progress -> amber (#f0b429)  being worked on (status:in-progress OR priority:1)
//   closed      -> green (#3fb950)  resolved / all is well
//
// Regression guarded: the pill used to be a single hardcoded green class
// rendering esc(iss.state) for every row.

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

console.log('REG-112: Issue Viewer state pill — traffic light (open=blue, in-progress=amber, closed=green)');
console.log('-'.repeat(70));

test('state pill is no longer a single hardcoded-green rule', () => {
    // The old CSS: .state-pill{...background:rgba(63,185,80,.14);color:#3fb950;...}
    // i.e. green baked into the base .state-pill rule with no modifier class.
    const baseRule = SRC.match(/\.state-pill\{[^}]*\}/)?.[0] ?? '';
    assert.ok(baseRule, '.state-pill base rule not found');
    assert.ok(
        !/#3fb950/.test(baseRule) && !/63,185,80/.test(baseRule),
        '.state-pill base rule must not hardcode green — color comes from a state modifier class'
    );
});

test('open pill is blue (#58a6ff)', () => {
    const rule = SRC.match(/\.state-pill\.open\{[^}]*\}/)?.[0] ?? '';
    assert.ok(rule, '.state-pill.open rule not found');
    assert.ok(/#58a6ff/i.test(rule), '.state-pill.open must use blue #58a6ff');
});

test('in-progress pill is amber (#f0b429)', () => {
    const rule = SRC.match(/\.state-pill\.in-progress\{[^}]*\}/)?.[0] ?? '';
    assert.ok(rule, '.state-pill.in-progress rule not found');
    assert.ok(/#f0b429/i.test(rule), '.state-pill.in-progress must use amber #f0b429');
});

test('closed pill is green (#3fb950)', () => {
    const rule = SRC.match(/\.state-pill\.closed\{[^}]*\}/)?.[0] ?? '';
    assert.ok(rule, '.state-pill.closed rule not found');
    assert.ok(/#3fb950/i.test(rule), '.state-pill.closed must use green #3fb950');
});

test('pill class is data-driven (statePillClass), not esc(iss.state)', () => {
    assert.ok(
        /class="state-pill \$\{statePillClass\}"/.test(SRC),
        'state pill must render the computed statePillClass modifier'
    );
    assert.ok(
        !/<span class="state-pill">\$\{esc\(iss\.state\)\}<\/span>/.test(SRC),
        'state pill must not render the raw uppercased state with a class-less green pill'
    );
});

test('statePillClass maps open/in-progress/closed correctly', () => {
    const m = SRC.match(/const statePillClass\s*=\s*([^;]+);/);
    assert.ok(m, 'statePillClass assignment not found');
    const expr = m[1];
    assert.ok(/'closed'/.test(expr),      'must map closed');
    assert.ok(/'in-progress'/.test(expr), 'must map in-progress');
    assert.ok(/'open'/.test(expr),        'must map open');
});

test('in-progress is triggered by status:in-progress OR priority:1', () => {
    const m = SRC.match(/const isInProgress\s*=\s*iss\.labels\.some\([^;]+;/);
    assert.ok(m, 'isInProgress assignment not found');
    const expr = m[0];
    assert.ok(/status:in-progress/.test(expr), 'must check status:in-progress label');
    assert.ok(/priority:1/.test(expr),         'must also check priority:1 label');
});

test('open detection is case-insensitive (handles gh "OPEN" and REST "open")', () => {
    assert.ok(
        /iss\.state\.toLowerCase\(\)\s*===\s*'open'/.test(SRC),
        'isOpen must normalise iss.state with toLowerCase() before comparing'
    );
    // The old strict checks iss.state === 'open' silently failed for gh's "OPEN".
    assert.ok(
        !/iss\.state === 'open'/.test(SRC),
        'no remaining strict iss.state === \'open\' comparisons (case-sensitive bug)'
    );
});

console.log('-'.repeat(70));
if (failed === 0) {
    console.log(`✓ REG-112 passed (${passed} checks).\n`);
    process.exit(0);
}
console.error(`✗ REG-112 FAILED (${failed} of ${passed + failed} checks failed).\n`);
process.exit(1);
