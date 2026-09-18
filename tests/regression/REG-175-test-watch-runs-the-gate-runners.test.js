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
//   3. Its parser reads the real unit runner's output, run in a sealed temp
//      copy so it never rebuilds the repo's out-test/ mid-suite (#820), and
//      counts a runner's missing-artifact failure line as a failure.

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

    // The real unit runner, run in a sealed temp copy (#820). Running it in the
    // repo rebuilt out-test/ while the rest of the concurrent regression suite
    // was reading it, and other REG tests failed on missing modules. The copy
    // has its own fixture tests and stub builds, so nothing shared is touched.
    const os = require('os');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reg175-'));
    try {
        const put = (rel, body) => {
            const f = path.join(tmp, ...rel.split('/'));
            fs.mkdirSync(path.dirname(f), { recursive: true });
            fs.writeFileSync(f, body);
            return f;
        };
        put('package.json', JSON.stringify({ scripts: {} }));
        put('scripts/run-unit-tests.js', fs.readFileSync(path.join(ROOT, 'scripts', 'run-unit-tests.js')));
        put('scripts/lib/missing-artifact.js', fs.readFileSync(path.join(ROOT, 'scripts', 'lib', 'missing-artifact.js')));
        put('scripts/build-test-modules.mjs', "console.log('stub build-test-modules');\n");
        // The shipped build counts as current when its outputs are newer than its inputs.
        const inputs = [put('esbuild.mjs', '// stub\n'), put('src/x.ts', ''), put('mcp-server/src/x.ts', '')];
        const outputs = [put('out/extension.js', ''), put('mcp-server/dist/index.js', '')];
        const past = new Date(Date.now() - 3600_000);
        for (const f of inputs) { fs.utimesSync(f, past, past); }
        fs.rmSync(path.join(tmp, 'src', 'x.ts')); fs.rmSync(path.join(tmp, 'mcp-server', 'src', 'x.ts'));
        for (const d of ['src', path.join('mcp-server', 'src')]) { fs.utimesSync(path.join(tmp, d), past, past); }
        for (const f of outputs) { fs.utimesSync(f, new Date(), new Date()); }

        // A passing test that prints its own case lines, and one that skips for a missing artifact.
        put('tests/unit/sample.test.js', "console.log('  \u2713 first case');\nconsole.log('  \u2713 second case');\nconsole.log('All 2 tests passed');\n");
        put('tests/unit/skipper.test.js', "console.log('SKIP: out-test/shared/x.js not compiled');\n");

        const runOne = rel => {
            const r = cp.spawnSync(process.execPath, [path.join(tmp, 'scripts', 'run-unit-tests.js'), rel],
                { cwd: tmp, encoding: 'utf8', timeout: 60000 });
            return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
        };
        const pass = runOne('tests/unit/sample.test.js');
        const passVerdict = typeof verdictOfExplicitRun === 'function' ? verdictOfExplicitRun(pass.out) : [];
        check(`the runner's verdict on a passing file is read from its own line, not the test's case lines`,
            pass.status === 0 && passVerdict.length === 1 && passVerdict[0].ok && passVerdict[0].name === 'sample.test.js',
            `exit ${pass.status}; parsed ${JSON.stringify(passVerdict.map(r => [r.name, r.ok]))}\n${pass.out.slice(-400)}`);

        const skip = runOne('tests/unit/skipper.test.js');
        const skipVerdict = typeof verdictOfExplicitRun === 'function' ? verdictOfExplicitRun(skip.out) : [];
        check('a file that skips for a missing artifact reads as a failure through the real runner',
            skip.status !== 0 && skipVerdict.length === 1 && !skipVerdict[0].ok && skipVerdict[0].name === 'skipper.test.js',
            `exit ${skip.status}; parsed ${JSON.stringify(skipVerdict.map(r => [r.name, r.ok]))}`);

        const full = cp.spawnSync(process.execPath, [path.join(tmp, 'scripts', 'run-unit-tests.js')],
            { cwd: tmp, encoding: 'utf8', timeout: 60000 });
        const fullParsed = parseRunnerOutput((full.stdout || '') + (full.stderr || ''));
        check('a full run parses to one result per file: the pass and the skip',
            fullParsed.length === 2 && fullParsed.filter(r => r.ok).length === 1,
            `parsed ${JSON.stringify(fullParsed.map(r => [r.name, r.ok]))}`);
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
    check('REG-175 never runs a runner inside the repo (it would rebuild out-test/ mid-suite, #820)',
        !/spawnSync\(process\.execPath,\s*\[path\.join\(ROOT,\s*'scripts'/.test(fs.readFileSync(__filename, 'utf8')));
}

console.log(`\n${passed + failed} checks — ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
