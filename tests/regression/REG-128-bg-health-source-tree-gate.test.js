// Copyright (c) 2026 CieloVista Software. All rights reserved.
// REG-128: bg-health-runner must not run the hourly regression suite from a copy
// that ships build output without a source tree — i.e. an installed .vsix (#684).
//
// Root cause: the regression suite is a SOURCE-tree analysis. REG-001a, REG-001c
// and REG-003 through REG-008 all read src/, and the per-file checks read
// tests/regression/. An installed extension carries scripts/ and out/ but neither
// src/ nor tests/, so all eight structural checks fail together on every attempt.
// The #641 gate only disqualified worktree copies and copies missing
// out/extension.js — an installed .vsix passes both of those (`wt=false`,
// `built=true`), so it filed a false "Regression tests failing" bug every hour,
// forever. The forensic diagnostics recorded the proof:
//   root=…\extensions\cielovistasoftware.cielovista-tools-1.0.3
//   wt=false  built=true  attempt=2/2  exit=1
//
// Fix: resolve the root by walking up from __dirname for the source-checkout
// markers (scripts/run-regression-tests.js AND src/ AND tests/regression/)
// instead of assuming a fixed depth. No source checkout above the running module
// → skip entirely: no suite spawned, no bug filed, no retry — and clear any stale
// failure a previous build recorded, so the Fix Bugs panel and the error log stop
// showing a permanent false alarm.

'use strict';

const fs     = require('fs');
const path   = require('path');
const os     = require('os');
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

console.log('REG-128: bg-health skips the regression run from build-output-only copies (#684)');
console.log('-'.repeat(70));

// ── Exercise the REAL resolver, without depending on a build ──────────────────
// The regression runner compiles out/ *after* the suite passes, so requiring the
// compiled module here would test whatever was built last time. Instead lift the
// function straight out of the .ts source: its body is plain JS once the two type
// annotations in the signature are gone, so this runs the shipping logic itself
// rather than a copy of it that could drift.
function loadResolver() {
    const m = RUNNER_SRC.match(/function _findSourceCheckoutRoot\([\s\S]*?\n\}/);
    assert.ok(m, '_findSourceCheckoutRoot() not found in background-health-runner.ts');
    const body = m[0]
        .replace(/^function _findSourceCheckoutRoot\([^)]*\)\s*:\s*[^{]+\{/, '')
        .replace(/\n\}$/, '');
    const fn = new Function('fs', 'path', 'startDir', body);
    return (startDir) => fn(fs, path, startDir);
}

const findSourceCheckoutRoot = loadResolver();

// ── Fixtures ──────────────────────────────────────────────────────────────────
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'reg128-'));

function makeTree(name, dirs, files) {
    const root = path.join(TMP, name);
    for (const d of dirs)  { fs.mkdirSync(path.join(root, d), { recursive: true }); }
    for (const f of files) {
        fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
        fs.writeFileSync(path.join(root, f), '', 'utf8');
    }
    return root;
}

// An installed .vsix: scripts/ and a built out/, but no src/ and no tests/.
const vsix = makeTree('installed-vsix',
    ['out/features', 'data'],
    ['scripts/run-regression-tests.js', 'out/extension.js']);

// A real source checkout: scripts/ + src/ + tests/regression/.
const checkout = makeTree('source-checkout',
    ['src/features', 'tests/regression', 'out/features'],
    ['scripts/run-regression-tests.js', 'out/extension.js']);

test('an installed .vsix layout resolves to no source root', () => {
    assert.strictEqual(findSourceCheckoutRoot(path.join(vsix, 'out', 'features')), undefined,
        'scripts/ + out/ without src/ or tests/regression/ is build output — it can never yield a regression signal');
});

test('the resolver walks up from out/features/ to the checkout root', () => {
    assert.strictEqual(findSourceCheckoutRoot(path.join(checkout, 'out', 'features')), checkout,
        'the compiled module lives two levels below the repo root in the current layout');
});

test('the resolver also handles the older flat out/ layout', () => {
    assert.strictEqual(findSourceCheckoutRoot(path.join(checkout, 'out')), checkout,
        'this module has shipped from out/*.js as well as out/features/*.js — a hardcoded depth breaks on one of them');
});

test('all three markers are required — any one missing disqualifies the copy', () => {
    const noScript = makeTree('no-script', ['src', 'tests/regression'], []);
    const noSrc    = makeTree('no-src',    ['tests/regression'], ['scripts/run-regression-tests.js']);
    const noTests  = makeTree('no-tests',  ['src'],              ['scripts/run-regression-tests.js']);
    for (const [label, dir] of [['runner script', noScript], ['src/', noSrc], ['tests/regression/', noTests]]) {
        assert.strictEqual(findSourceCheckoutRoot(dir), undefined,
            `a tree missing ${label} must not be treated as a source checkout`);
    }
});

test('the resolver does not escape upward into an unrelated parent checkout', () => {
    // The .vsix fixture sits inside TMP; TMP itself is not a checkout, and the
    // walk must stop rather than keep climbing toward the filesystem root.
    assert.strictEqual(findSourceCheckoutRoot(path.join(vsix, 'out', 'features')), undefined,
        'the walk is depth-capped so a build-output copy never borrows an ancestor’s source tree');
});

// ── The gate is wired into runRegressionTests, ahead of the spawn ─────────────
function runRegressionTestsBody() {
    const m = RUNNER_SRC.match(/function runRegressionTests\([^)]*\)\s*:\s*void\s*\{([\s\S]*)\n\}\n\nfunction scheduleTestRun/);
    assert.ok(m, 'runRegressionTests function not found (or scheduleTestRun no longer follows it)');
    return m[1];
}

test('runRegressionTests resolves the root through the source-checkout gate', () => {
    const body = runRegressionTestsBody();
    assert.ok(/_findSourceCheckoutRoot\(\)/.test(body),
        'the root must come from _findSourceCheckoutRoot(), not from a hardcoded path.join(__dirname, ...)');
    assert.ok(!/const extensionRoot\s*=\s*path\.join\(\s*__dirname/.test(body),
        'extensionRoot must no longer be derived from a fixed __dirname depth (#684)');
});

test('the no-source-root gate runs BEFORE the suite is spawned', () => {
    const body     = runRegressionTestsBody();
    const gateIdx  = body.search(/if\s*\(\s*!extensionRoot\s*\)/);
    const spawnIdx = body.search(/spawn\(\s*'node'/);
    assert.ok(gateIdx !== -1, 'no `if (!extensionRoot)` gate found');
    assert.ok(spawnIdx !== -1, "spawn('node', ...) call not found");
    assert.ok(gateIdx < spawnIdx,
        'a copy with no source tree must never even run the suite');
});

test('the skip path files no bug, schedules no retry, and clears the stale failure', () => {
    const body = runRegressionTestsBody();
    const m = body.match(/if\s*\(\s*!extensionRoot\s*\)\s*\{([\s\S]*?)\n    \}/);
    assert.ok(m, 'no-source-root gate block not found');
    const gateBody = m[1];
    assert.ok(/not a regression signal/.test(gateBody),
        'the skip log must say "not a regression signal" so the hourly log line is unambiguous');
    assert.ok(!/addBug/.test(gateBody),   'the skip path must NOT file a bug');
    assert.ok(!/setTimeout/.test(gateBody), 'the skip path must NOT schedule a retry');
    assert.ok(/clearBug\('bug-regression-tests'\)/.test(gateBody),
        'the skip path must clear a stale failure — otherwise an installed copy shows a false alarm forever (#684)');
    assert.ok(/_testRunInProgress = false/.test(gateBody),
        'the skip path must release the in-progress guard');
    assert.ok(/return;/.test(gateBody), 'the skip path must return immediately');
});

test('clearBug reports whether it actually changed anything', () => {
    assert.ok(/function clearBug\(id: string\): boolean/.test(RUNNER_SRC),
        'clearBug must return boolean so the skip path only writes state when a stale bug was really cleared');
});

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* best-effort cleanup */ }

console.log('-'.repeat(70));
console.log(`REG-128: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
