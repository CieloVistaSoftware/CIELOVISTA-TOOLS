// Copyright (c) CieloVista Software. All rights reserved.
// REG-175: Issue #816 — npm run test:watch runs what the gates run
//
// Run: node tests/regression/REG-175-test-watch-runs-the-gate-runners.test.js
//
// scripts/test-watch.js said it ran the full suite every 60 seconds. It ran a
// hand-written list of 17 test files while the suite had 280, and it ran each
// one with plain node, so a test that printed "SKIP: not compiled" and exited
// 0 showed as a pass: the false pass #734 removed from every gate. The Test
// Results panel reads the watcher's data/test-watch.json, so it showed a
// mostly unrun suite as green.
//
// The watcher now has no list and no pass/fail rules of its own. It runs
// scripts/run-unit-tests.js and scripts/run-regression-tests.js and records
// the per-result lines they print. This test holds it to that:
//   1. The source names no test file and never runs node on a test file.
//   2. The full suite and a changed-file run both go through the runners.
//   3. Its parser reads the real unit runner's output for a real test file,
//      and counts a runner's missing-artifact failure line as a failure.

'use strict';

const fs   = require('fs');
const path = require('path');
const cp   = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const WATCH = path.join(ROOT, 'scripts', 'test-watch.js');
let passed = 0, failed = 0;
function check(name, ok, detail) {
    if (ok) { console.log(`  PASS ${name}`); passed++; }
    else    { console.error(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`); failed++; }
}

console.log('REG-175: test:watch runs the gate runners, not a list of its own (#816)');

const src = fs.readFileSync(WATCH, 'utf8');
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// 1. No list, no direct node runs of a test file
const named = code.match(/['"`][^'"`\n]+\.test\.(?:js|ts)['"`]/g) || [];
check('test-watch.js names no test file (no list to fall out of date)', named.length === 0,
    `found: ${named.slice(0, 5).join(', ')}`);
check('test-watch.js does not run a test file directly with node',
    !/spawn(?:Sync)?\(\s*['"]node['"]\s*,\s*\[\s*abs/.test(code) && !/execSync\([^)]*\.test\.js/.test(code));

// 2. Both runners are what it runs
check('the full suite runs scripts/run-unit-tests.js', /['"]run-unit-tests\.js['"]/.test(code));
check('the full suite runs scripts/run-regression-tests.js', /['"]run-regression-tests\.js['"]/.test(code));
check('a changed file runs through the unit runner (which builds its input first)',
    /runRunner\(\s*UNIT_RUNNER\s*,\s*\[\s*relPath\s*\]\s*\)/.test(code));

// 3. The parser reads what the runners print
let parseRunnerOutput = null, verdictOfExplicitRun = null;
try { ({ parseRunnerOutput, verdictOfExplicitRun } = require(WATCH)); } catch (e) { check('test-watch.js loads without starting the watcher', false, e.message); }
check('test-watch.js exports parseRunnerOutput and does not start when required', typeof parseRunnerOutput === 'function');

if (typeof parseRunnerOutput === 'function') {
    const sample = [
        '  out/ and mcp-server/dist/ are newer than their sources: left as built',
        '  - unit/install-verify.test.js — runs at its own rebuild step (npm run test:post-install)',
        '  ✓ doc-header.test.js',
        '  ✗ license-sync.test.js — SKIPPED for a missing build artifact — counts as a failure (#734)',
        '      SKIP: out-test/shared/license-sync.js not compiled',
        '  ✓ REG-001: Extension activation',
        '  ✗ REG-002: Errors are logged with their stack',
        '    → expected logError, got console.error',
        '',
        '98 test file(s) (tests/unit/ and tests/*.test.js): 97 passed, 1 failed',
        '✓ All 180 regression tests + packaging checks passed — proceeding with build.',
    ].join('\n');
    const got = parseRunnerOutput(sample);
    const byName = Object.fromEntries(got.map(r => [r.name, r]));
    check('parses exactly the four per-result lines, not summaries or notes', got.length === 4,
        `got ${got.map(r => r.name).join(' | ')}`);
    check('a missing-artifact skip line is a failure', byName['license-sync.test.js'] && byName['license-sync.test.js'].ok === false);
    check('the failure keeps its detail lines', byName['license-sync.test.js'] &&
        byName['license-sync.test.js'].detail.some(l => l.includes('not compiled')));
    check('a regression runner failure line is a failure', byName['REG-002: Errors are logged with their stack'] &&
        byName['REG-002: Errors are logged with their stack'].ok === false);
    check('a pass line is a pass', byName['doc-header.test.js'] && byName['doc-header.test.js'].ok === true);

    // The real unit runner, on one real, fast test file
    const target = 'tests/unit/doc-header.test.js';
    const run = cp.spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'run-unit-tests.js'), target],
        { cwd: ROOT, encoding: 'utf8', timeout: 300000 });
    const real = typeof verdictOfExplicitRun === 'function' ? verdictOfExplicitRun((run.stdout || '') + (run.stderr || '')) : [];
    check(`the runner's verdict on ${target} is read from its own line, not the test's case lines`,
        run.status === 0 && real.length === 1 && real[0].ok && real[0].name === 'doc-header.test.js',
        `exit ${run.status}; parsed ${JSON.stringify(real.map(r => [r.name, r.ok]))}`);
}

console.log(`\n${passed + failed} checks — ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
