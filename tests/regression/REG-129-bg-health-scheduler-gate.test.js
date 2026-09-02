// Copyright (c) 2026 CieloVista Software. All rights reserved.
// REG-129: bg-health-runner must not ARM the hourly regression timer in a copy
// that has no source tree — i.e. an installed .vsix (#698).
//
// Root cause: #684 (REG-128) added an in-run gate so an installed copy stops
// filing a false "Regression tests failing" bug. But activate() still called
// scheduleTestRun(TEST_FIRST_DELAY_MS) unconditionally, so every installed copy
// armed a one-hour timer whose only possible outcome was the skip log:
//   ⚠ Hourly regression run skipped: no source checkout above
//     …\extensions\cielovistasoftware.cielovista-tools-1.0.3
// A timer that fires hourly in every install, does nothing, and writes a line
// that reads like a fault report.
//
// Fix: probe once at activation with the SAME _findSourceCheckoutRoot() resolver
// the run itself uses. No source checkout → no timer armed, and one informational
// line at activation instead of an hourly skip. A source checkout → armed exactly
// as before. The in-run gate (REG-128) stays as defence in depth so the run path
// is still safe when reached directly.

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

console.log('REG-129: bg-health arms the hourly regression timer only from a source checkout (#698)');
console.log('-'.repeat(70));

// ── Lift the two REAL functions out of the .ts source ─────────────────────────
// Same technique as REG-128: the regression runner compiles out/ only *after* the
// suite passes, so requiring the compiled module would test whatever was built
// last time. Both bodies are plain JS once the signature annotations are gone, so
// this exercises the shipping logic itself rather than a re-implementation.

function liftBody(signatureRe, label) {
    const m = RUNNER_SRC.match(signatureRe);
    assert.ok(m, `${label} not found in background-health-runner.ts`);
    return m[1];
}

function loadResolver() {
    const body = liftBody(
        /function _findSourceCheckoutRoot\([^)]*\)\s*:\s*[^{]+\{([\s\S]*?)\n\}/,
        '_findSourceCheckoutRoot()');
    const fn = new Function('fs', 'path', 'startDir', body);
    return (startDir) => fn(fs, path, startDir);
}

function loadArmer() {
    const body = liftBody(
        /function armRegressionScheduler\(\)\s*:\s*boolean\s*\{([\s\S]*?)\n\}/,
        'armRegressionScheduler()');
    return new Function(
        '_findSourceCheckoutRoot', 'log', 'FEATURE', 'TEST_FIRST_DELAY_MS', 'scheduleTestRun', '__dirname',
        body);
}

const findSourceCheckoutRoot = loadResolver();
const armRegressionScheduler = loadArmer();

/** Run the real armer against a fixture tree; report what it did. */
function armFrom(startDir) {
    const logs  = [];
    const timers = [];
    const armed = armRegressionScheduler(
        () => findSourceCheckoutRoot(startDir),
        (_feature, msg) => logs.push(String(msg)),
        'bg-health-runner',
        2 * 60 * 1000,
        (delayMs) => timers.push(delayMs),
        startDir);
    return { armed, logs, timers };
}

// ── Fixtures ──────────────────────────────────────────────────────────────────
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'reg129-'));

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

// ── The behaviour #698 is about ───────────────────────────────────────────────

test('an installed .vsix layout arms NO timer', () => {
    const r = armFrom(path.join(vsix, 'out', 'features'));
    assert.strictEqual(r.armed, false, 'armRegressionScheduler() must report that it did not arm');
    assert.deepStrictEqual(r.timers, [],
        'no timer may be scheduled from a copy whose only possible outcome is a skip log (#698)');
});

test('a source checkout DOES arm the hourly timer, at the first-run delay', () => {
    const r = armFrom(path.join(checkout, 'out', 'features'));
    assert.strictEqual(r.armed, true, 'a source checkout must still arm the scheduler');
    assert.deepStrictEqual(r.timers, [2 * 60 * 1000],
        'exactly one timer, armed at TEST_FIRST_DELAY_MS — the pre-#698 behaviour is unchanged here');
});

test('the older flat out/ layout also arms from a source checkout', () => {
    // This module has shipped from out/*.js as well as out/features/*.js.
    const r = armFrom(path.join(checkout, 'out'));
    assert.strictEqual(r.armed, true, 'the probe must not depend on a fixed __dirname depth');
    assert.strictEqual(r.timers.length, 1, 'still exactly one timer');
});

test('declining to arm logs exactly one informational line, not a fault report', () => {
    const r = armFrom(path.join(vsix, 'out', 'features'));
    assert.strictEqual(r.logs.length, 1,
        'the inactive state is announced once at activation — never on an hourly tick');
    const line = r.logs[0];
    assert.ok(/inactive/i.test(line), 'the line must say the check is inactive');
    assert.ok(/normal/i.test(line),
        'the line must read as expected-for-an-install, not as a fault the user should chase');
    assert.ok(!/^\s*[⚠✗]/.test(line) && !/\bfail/i.test(line) && !/\berror\b/i.test(line),
        `the line must not be dressed as a warning or failure: ${line}`);
});

test('arming logs one line naming the checkout it will analyse', () => {
    const r = armFrom(path.join(checkout, 'out', 'features'));
    assert.strictEqual(r.logs.length, 1, 'one activation line when armed');
    assert.ok(r.logs[0].includes(checkout),
        'the armed line must name the resolved source checkout so the operative root is unambiguous');
});

// ── Wiring: activate() must go through the gate, and only through it ──────────

function activateBody() {
    const m = RUNNER_SRC.match(/export function activate\(context: vscode\.ExtensionContext\): void \{([\s\S]*?)\n\}\n\nexport function deactivate/);
    assert.ok(m, 'activate() not found (or deactivate() no longer follows it)');
    return m[1];
}

test('activate() arms the scheduler only through armRegressionScheduler()', () => {
    const body = activateBody();
    assert.ok(/armRegressionScheduler\(\)/.test(body),
        'activate() must call armRegressionScheduler()');
    assert.ok(!/(?<!function )\bscheduleTestRun\(/.test(body),
        'activate() must NOT call scheduleTestRun() directly — that is what armed a dead timer in every install (#698)');
});

test('activate() records whether the scheduler armed, for the UI to report', () => {
    const body = activateBody();
    assert.ok(/_regressionSchedulerArmed\s*=\s*armRegressionScheduler\(\)/.test(body),
        'the armed flag must come from the gate itself, not be assumed true');
});

test('the probe is reused, not re-implemented', () => {
    const armer = liftBody(/function armRegressionScheduler\(\)\s*:\s*boolean\s*\{([\s\S]*?)\n\}/, 'armRegressionScheduler()');
    assert.ok(/_findSourceCheckoutRoot\(\)/.test(armer),
        'the scheduler gate must call the same resolver the run uses');
    assert.ok(!/tests['"\s,)\]]*,?\s*['"]regression/.test(armer) && !/existsSync/.test(armer),
        'the marker checks must live in _findSourceCheckoutRoot() alone — no second copy of that logic');
    const definitions = RUNNER_SRC.match(/function _findSourceCheckoutRoot\b/g) || [];
    assert.strictEqual(definitions.length, 1,
        'exactly one definition of the source-checkout probe may exist');
});

test('the in-run gate survives as defence in depth (REG-128 stays true)', () => {
    const m = RUNNER_SRC.match(/function runRegressionTests\([^)]*\)\s*:\s*void\s*\{([\s\S]*)\n\}\n\nfunction scheduleTestRun/);
    assert.ok(m, 'runRegressionTests() not found (or scheduleTestRun no longer follows it)');
    assert.ok(/if\s*\(\s*!extensionRoot\s*\)/.test(m[1]),
        'runRegressionTests() must stay safe when called directly — the scheduler gate does not replace the run gate');
});

// ── The panel must not imply a check is running when none is ──────────────────

test('the Fix Bugs panel reports the real scheduler state', () => {
    assert.ok(/regressionStatusHtml/.test(RUNNER_SRC),
        'the panel must render a regression-scheduler status');
    const m = RUNNER_SRC.match(/const regressionStatusHtml = ([\s\S]*?);\n/);
    assert.ok(m, 'regressionStatusHtml assignment not found');
    assert.ok(/_regressionSchedulerArmed/.test(m[1]),
        'the status must be driven by whether the timer actually armed');
    assert.ok(/inactive/i.test(m[1]) && /active/i.test(m[1]),
        'both states must be spelled out honestly');
    assert.ok(/<span class="stat" id="regression-status">\$\{regressionStatusHtml\}<\/span>/.test(RUNNER_SRC),
        'the status must actually be placed in the toolbar');
});

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* best-effort cleanup */ }

console.log('-'.repeat(70));
console.log(`REG-129: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
