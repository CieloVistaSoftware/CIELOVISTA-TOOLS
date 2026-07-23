// Copyright (c) 2026 CieloVista Software. All rights reserved.
// REG-120: bg-health-runner must not file a false-positive regression bug from
// a transient worktree race (#641/#652).
//
// Root cause: bg-health-runner's hourly regression run spawns
// `node scripts/run-regression-tests.js` against a git worktree that can be
// transiently "not settled" right after it's created — out/ still building via
// the script's own ensureOutBuilt() preflight, or src/ mid-edit by an active
// agent session. A single failed attempt was reported as a hard regression
// bug (chk-regression-tests) even though a manual re-run of the exact same
// script passed 132/132 — see the false "8 REG checks failing" reports filed
// as #641 and re-filed 56x as the auto-filed #652.
//
// Fix: runRegressionTests() now takes a retry attempt counter. A failed run
// is retried once (REGRESSION_MAX_ATTEMPTS) after a short settle delay
// (REGRESSION_RETRY_DELAY_MS) before addBug('bug-regression-tests') is ever
// called — a transient race self-resolves on the retry, a genuine regression
// persists and still gets reported (just one retry-cycle later).
//
// scripts/run-regression-tests.js also had ensureOutBuilt() defined twice
// (harmless — the second definition just shadowed the first — but duplicate
// code all the same); the duplicate is removed as part of this fix.

'use strict';

const fs     = require('fs');
const path   = require('path');
const assert = require('assert');

const ROOT       = path.join(__dirname, '..', '..');
const RUNNER_SRC = fs.readFileSync(
    path.join(ROOT, 'src', 'features', 'background-health-runner.ts'), 'utf8');
const REGRESSION_SCRIPT_SRC = fs.readFileSync(
    path.join(ROOT, 'scripts', 'run-regression-tests.js'), 'utf8');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try   { fn(); console.log(`  PASS ${name}`); passed++; }
    catch (e) { console.error(`  FAIL ${name}\n       ${e.message}`); failed++; }
}

console.log('REG-120: bg-health regression run retries a failure before filing a bug (#641/#652)');
console.log('-'.repeat(70));

function runRegressionTestsBody() {
    const m = RUNNER_SRC.match(/function runRegressionTests\([^)]*\)\s*:\s*void\s*\{([\s\S]*)\n\}\n\nfunction scheduleTestRun/);
    assert.ok(m, 'runRegressionTests function not found (or scheduleTestRun no longer follows it)');
    return m[1];
}

test('runRegressionTests takes a retry attempt counter defaulting to 1', () => {
    assert.ok(
        /function runRegressionTests\(\s*attempt\s*:\s*number\s*=\s*1\s*\)/.test(RUNNER_SRC),
        'runRegressionTests must accept `attempt: number = 1` so it can recurse on retry'
    );
});

test('a failed attempt below the max is retried via setTimeout, not filed as a bug', () => {
    const body = runRegressionTestsBody();
    const retryIdx = body.indexOf('attempt < REGRESSION_MAX_ATTEMPTS');
    const addBugIdx = body.indexOf("addBug({");
    assert.ok(retryIdx !== -1, 'must gate a retry on `attempt < REGRESSION_MAX_ATTEMPTS`');
    assert.ok(addBugIdx !== -1, 'addBug({ ... }) call for the regression bug not found');
    assert.ok(
        retryIdx < addBugIdx,
        'the retry check must be evaluated BEFORE addBug — a failure is retried before it is ever filed as a bug'
    );
    const retrySection = body.slice(retryIdx, addBugIdx);
    assert.ok(
        /setTimeout\(\(\)\s*=>\s*runRegressionTests\(attempt \+ 1\)/.test(retrySection),
        'the retry path must call runRegressionTests(attempt + 1) via setTimeout'
    );
    assert.ok(
        /return;/.test(retrySection),
        'the retry path must return immediately — it must not fall through to addBug on the same attempt'
    );
});

test('REGRESSION_MAX_ATTEMPTS and REGRESSION_RETRY_DELAY_MS are declared module constants', () => {
    assert.ok(/const REGRESSION_MAX_ATTEMPTS\s*=\s*2/.test(RUNNER_SRC),
        'REGRESSION_MAX_ATTEMPTS must be declared (2 total attempts: one try + one retry)');
    assert.ok(/const REGRESSION_RETRY_DELAY_MS\s*=/.test(RUNNER_SRC),
        'REGRESSION_RETRY_DELAY_MS must be declared to space out the retry');
});

test('the top-of-function in-progress guard only applies on the first attempt (does not block its own retry)', () => {
    const body = runRegressionTestsBody();
    assert.ok(
        /if\s*\(\s*attempt === 1\s*\)\s*\{[\s\S]*?_testRunInProgress/.test(body),
        'the `_testRunInProgress` guard/claim must be scoped to `attempt === 1` so the recursive retry call is not itself blocked by the guard it set'
    );
});

test('a retry that succeeds still clears the bug and reports recovery', () => {
    const body = runRegressionTestsBody();
    assert.ok(/clearBug\('bug-regression-tests'\)/.test(body), 'success path must still clear the bug');
    assert.ok(/recovered on retry/.test(body), 'success-after-retry must be distinguishable in the log for diagnosis');
});

test('scripts/run-regression-tests.js ensureOutBuilt() preflight is defined exactly once (no duplicate code)', () => {
    const matches = REGRESSION_SCRIPT_SRC.match(/function ensureOutBuilt\s*\(/g) ?? [];
    assert.strictEqual(matches.length, 1,
        `ensureOutBuilt() must be defined exactly once — found ${matches.length}`);
});

test('main() still calls ensureOutBuilt() before launching the test suite', () => {
    const mainBody = REGRESSION_SCRIPT_SRC.match(/async function main\(\)\s*\{([\s\S]*?)const all = \[\];/)?.[1] ?? '';
    assert.ok(/ensureOutBuilt\(\);/.test(mainBody),
        'main() must call ensureOutBuilt() before building the test list, so out/ is ready before REG-012 and friends run');
});

console.log('-'.repeat(70));
if (failed === 0) {
    console.log(`✓ REG-120 passed (${passed} checks).\n`);
    process.exit(0);
}
console.error(`✗ REG-120 FAILED (${failed} of ${passed + failed} checks failed).\n`);
process.exit(1);
