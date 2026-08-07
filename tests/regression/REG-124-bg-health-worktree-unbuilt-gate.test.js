// Copyright (c) 2026 CieloVista Software. All rights reserved.
// REG-124: bg-health-runner must not run (or fail, or file bugs from) the hourly
// regression suite when it is running from an unbuilt or worktree copy (#641).
//
// Root cause: runRegressionTests() resolves extensionRoot from __dirname — i.e.
// whatever copy of the compiled extension is RUNNING, not the healthy main
// checkout. An extension instance loaded from a .claude/worktrees/ copy that has
// node_modules but no out/ (or no dev sources at all) fails the 8 structural REG
// checks (REG-001a/001c/003/004/005/006/007/008) identically on every attempt —
// so the single 20s retry added for #641/#652 transient races cannot help
// ("failed on attempt 2/2"), and a false "Regression tests failing" bug was
// filed every hour, forever.
//
// Fix: before spawning the suite, runRegressionTests() gates on the running
// copy being a trustworthy source of regression signal:
//   - extensionRoot inside `.claude/worktrees/`  → skip (worktree copies are
//     never the source of truth; main-checkout runs and CI cover the signal), OR
//   - out/extension.js absent under extensionRoot → skip (unbuilt copy).
// The skip logs a clear "not a regression signal" message and returns WITHOUT
// filing a bug, retrying, or recording a failure. The existing transient-race
// retry is kept for built, non-worktree checkouts.

'use strict';

const fs     = require('fs');
const path   = require('path');
const assert = require('assert');

const ROOT       = path.join(__dirname, '..', '..');
const RUNNER_SRC = fs.readFileSync(
    path.join(ROOT, 'src', 'features', 'background-health-runner.ts'), 'utf8');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try   { fn(); console.log(`  PASS ${name}`); passed++; }
    catch (e) { console.error(`  FAIL ${name}\n       ${e.message}`); failed++; }
}

console.log('REG-124: bg-health skips the regression run from unbuilt/worktree copies (#641)');
console.log('-'.repeat(70));

function runRegressionTestsBody() {
    const m = RUNNER_SRC.match(/function runRegressionTests\([^)]*\)\s*:\s*void\s*\{([\s\S]*)\n\}\n\nfunction scheduleTestRun/);
    assert.ok(m, 'runRegressionTests function not found (or scheduleTestRun no longer follows it)');
    return m[1];
}

test('the gate detects a .claude/worktrees/ copy via a path-separator-safe check', () => {
    const body = runRegressionTestsBody();
    assert.ok(
        /path\.join\(\s*'\.claude'\s*,\s*'worktrees'\s*\)/.test(body),
        "must build the worktree marker with path.join('.claude', 'worktrees') so the check matches the platform separator (backslash on Windows)"
    );
    assert.ok(
        /extensionRoot\.includes\(\s*path\.join\(\s*'\.claude'\s*,\s*'worktrees'\s*\)\s*\)/.test(body),
        'must test extensionRoot for the .claude/worktrees marker'
    );
});

test('the gate checks out/extension.js exists under extensionRoot', () => {
    const body = runRegressionTestsBody();
    assert.ok(
        /fs\.existsSync\(\s*path\.join\(\s*extensionRoot\s*,\s*'out'\s*,\s*'extension\.js'\s*\)\s*\)/.test(body),
        "must check fs.existsSync(path.join(extensionRoot, 'out', 'extension.js')) — an unbuilt copy can never yield a real regression signal"
    );
});

test('worktree-copy OR unbuilt → skip: gate fires on either condition', () => {
    const body = runRegressionTestsBody();
    assert.ok(
        /if\s*\(\s*isWorktreeCopy\s*\|\|\s*!outBuilt\s*\)/.test(body),
        'the gate must be `if (isWorktreeCopy || !outBuilt)` — either condition alone disqualifies the copy as a regression source'
    );
});

test('the gate runs BEFORE the suite is spawned', () => {
    const body = runRegressionTestsBody();
    const gateIdx  = body.indexOf('isWorktreeCopy || !outBuilt');
    const spawnIdx = body.search(/spawn\(\s*'node'/);
    assert.ok(gateIdx !== -1, 'gate condition not found');
    assert.ok(spawnIdx !== -1, "spawn('node', ...) call not found");
    assert.ok(gateIdx < spawnIdx,
        'the gate must be evaluated before spawn() — a disqualified copy must never even run the suite');
});

test('the skip path logs "not a regression signal" and returns without filing, retrying, or recording a failure', () => {
    const body = runRegressionTestsBody();
    const gateMatch = body.match(/if\s*\(\s*isWorktreeCopy\s*\|\|\s*!outBuilt\s*\)\s*\{([\s\S]*?)\n    \}/);
    assert.ok(gateMatch, 'gate block not found');
    const gateBody = gateMatch[1];
    assert.ok(/not a regression signal/.test(gateBody),
        'the skip log must say "not a regression signal" so the hourly log line is unambiguous');
    assert.ok(/_testRunInProgress = false/.test(gateBody),
        'the skip path must release the in-progress guard');
    assert.ok(/return;/.test(gateBody),
        'the skip path must return immediately');
    assert.ok(!/addBug/.test(gateBody), 'the skip path must NOT file a bug');
    assert.ok(!/setTimeout/.test(gateBody), 'the skip path must NOT schedule a retry');
    assert.ok(!/saveState/.test(gateBody), 'the skip path must NOT record state (no failure recorded)');
});

test('the transient-race retry is KEPT for built, non-worktree checkouts (#641/#652)', () => {
    const body = runRegressionTestsBody();
    const retryIdx = body.indexOf('attempt < REGRESSION_MAX_ATTEMPTS');
    assert.ok(retryIdx !== -1,
        'the existing retry (`attempt < REGRESSION_MAX_ATTEMPTS`) must remain — the gate replaces it only for disqualified copies, not for real checkouts');
    assert.ok(
        /setTimeout\(\(\)\s*=>\s*runRegressionTests\(attempt \+ 1\)/.test(body),
        'the retry path must still call runRegressionTests(attempt + 1) via setTimeout'
    );
});

test('a genuine failure in a built checkout still files the bug', () => {
    const body = runRegressionTestsBody();
    assert.ok(/addBug\(\{/.test(body), 'addBug({ ... }) must remain for real regressions');
    assert.ok(/clearBug\('bug-regression-tests'\)/.test(body), 'the success path must still clear the bug');
});

console.log('-'.repeat(70));
if (failed === 0) {
    console.log(`✓ REG-124 passed (${passed} checks).\n`);
    process.exit(0);
}
console.error(`✗ REG-124 FAILED (${failed} of ${passed + failed} checks failed).\n`);
process.exit(1);
