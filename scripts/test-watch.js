// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * scripts/test-watch.js
 *
 * Continuous background test runner for cielovista-tools.
 *
 * Behavior:
 *   - Watches tests/unit/, tests/regression/, tests/ for .test.js changes
 *   - When a file changes: runs JUST that file (node scripts/run-unit-tests.js <file>)
 *   - After each full run, waits 60 seconds and runs the full suite again:
 *     node scripts/run-unit-tests.js, then node scripts/run-regression-tests.js
 *   - Writes live status to data/test-watch.json (the Test Results panel reads it)
 *   - Never exits — runs until killed
 *
 * The watcher has no list of test files and no pass/fail rules of its own
 * (#816). It used to keep a hand-written list of 17 files while the suite had
 * 280, and it ran each one with plain node, so a test that printed "SKIP: not
 * compiled" and exited 0 showed as a pass. Both runners discover every test
 * file, build what the tests read first, and fail a missing-artifact skip
 * (#734). The watcher runs them and records the per-file lines they print, so
 * what it reports is exactly what the gates decide.
 *
 * Start:  node scripts/test-watch.js
 * Stop:   Ctrl+C  or  kill the process
 */
'use strict';

const fs    = require('fs');
const path  = require('path');
const { spawn } = require('child_process');

const ROOT      = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'data', 'test-watch.json');
const FULL_SUITE_PAUSE_MS = 60_000; // pause between the end of one full run and the next

/** The two gate runners. The full suite is both, in this order. */
const UNIT_RUNNER       = path.join(ROOT, 'scripts', 'run-unit-tests.js');
const REGRESSION_RUNNER = path.join(ROOT, 'scripts', 'run-regression-tests.js');

// ── State ─────────────────────────────────────────────────────────────────────
let state = {
    startedAt:    new Date().toISOString(),
    lastFullRun:  null,
    lastChanged:  null,
    totalRuns:    0,
    fullSuiteRuns: 0,
    results:      {},  // name → { passed, failed, durationMs, lastRun, exit, lastOutput? }
    watching:     0,
};

function saveState() {
    try {
        const dir = path.dirname(DATA_FILE);
        if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
        fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), 'utf8');
    } catch { /* non-fatal */ }
}

/**
 * Per-result lines both runners print: "  ✓ name" or "  ✗ name — why",
 * followed on failure by more deeply indented detail lines. Summary lines
 * ("✓ All 180 regression tests ...") are not indented and do not match.
 */
function parseRunnerOutput(output) {
    const results = [];
    let current = null;
    for (const line of output.split(/\r?\n/)) {
        const m = /^ {2}([✓✗]) (.+?)(?: — .*)?$/.exec(line);
        if (m) {
            current = { name: m[2].trim(), ok: m[1] === '✓', detail: [] };
            results.push(current);
            continue;
        }
        if (current && !current.ok && /^ {4,}\S/.test(line)) { current.detail.push(line.trim()); }
        else if (!/^ {4,}/.test(line)) { current = null; }
    }
    return results;
}

/**
 * A single-file run (run-unit-tests.js <file>) prints the test's own output
 * first, and tests print their own "  ✓ case" lines. The runner's verdict for
 * the file is the last per-result line; the ones before it are the test's.
 */
function verdictOfExplicitRun(output) {
    const all = parseRunnerOutput(output);
    return all.length ? [all[all.length - 1]] : [];
}

/** Run one runner to completion; resolves with its exit code, output and duration. */
function runRunner(script, args) {
    return new Promise(resolve => {
        const started = Date.now();
        const child = spawn(process.execPath, [script, ...args], { cwd: ROOT });
        let out = '';
        child.stdout.on('data', d => { out += d; });
        child.stderr.on('data', d => { out += d; });
        child.on('close', code => resolve({ code: code === null ? 1 : code, out, ms: Date.now() - started }));
        child.on('error', err => resolve({ code: 1, out: `${out}\n${err.message}`, ms: Date.now() - started }));
    });
}

/**
 * Record what a runner printed. A runner that failed without printing a single
 * per-file line (a build failure, a crash) is recorded under its own name, so
 * a broken run can never read as a quiet green one.
 */
function record(runnerLabel, run, { explicit = false } = {}) {
    const now = new Date().toISOString();
    const parsed = explicit ? verdictOfExplicitRun(run.out) : parseRunnerOutput(run.out);
    const reset = '\x1b[0m';
    const ts = new Date().toTimeString().slice(0, 8);

    for (const r of parsed) {
        state.results[r.name] = {
            passed: r.ok ? 1 : 0, failed: r.ok ? 0 : 1, durationMs: run.ms, lastRun: now, exit: r.ok ? 0 : 1,
            ...(r.ok ? {} : { lastOutput: r.detail.join('\n') }),
        };
        if (!r.ok) { console.log(`\x1b[31m✗${reset} [${ts}] ${r.name}`); }
    }
    if (run.code !== 0 && !parsed.some(r => !r.ok)) {
        const tail = run.out.trim().split(/\r?\n/).slice(-12).join('\n');
        state.results[runnerLabel] = { passed: 0, failed: 1, durationMs: run.ms, lastRun: now, exit: run.code, lastOutput: tail };
        console.log(`\x1b[31m✗${reset} [${ts}] ${runnerLabel} exited ${run.code} without naming a failing test`);
    }
    state.totalRuns++;
    state.watching = Object.keys(state.results).length;
    saveState();

    const passed = parsed.filter(r => r.ok).length;
    const failed = parsed.length - passed;
    const color  = run.code === 0 ? '\x1b[32m' : '\x1b[31m';
    console.log(`${color}[${ts}] ${runnerLabel}: ${passed} passed, ${failed} failed, exit ${run.code}  ${run.ms}ms${reset}`);
    return run.code === 0;
}

// ── One run at a time ─────────────────────────────────────────────────────────
// Two runners at once would build out/ and out-test/ over each other.
let chain = Promise.resolve();
const pendingFiles = new Set();

function enqueue(job) {
    chain = chain.then(job).catch(err => { console.error(`test-watch: ${err && err.stack || err}`); });
    return chain;
}

function runChangedFile(relPath) {
    if (pendingFiles.has(relPath)) { return; }
    pendingFiles.add(relPath);
    enqueue(async () => {
        pendingFiles.delete(relPath);
        if (!fs.existsSync(path.join(ROOT, relPath))) { return; }
        record(relPath, await runRunner(UNIT_RUNNER, [relPath]), { explicit: true });
    });
}

function runFullSuite() {
    return enqueue(async () => {
        const ts = new Date().toTimeString().slice(0, 8);
        console.log(`\n\x1b[36m${'─'.repeat(64)}\x1b[0m`);
        console.log(`\x1b[36m[${ts}] FULL SUITE RUN #${state.fullSuiteRuns + 1}\x1b[0m`);
        console.log(`\x1b[36m${'─'.repeat(64)}\x1b[0m\n`);

        const unitOk = record('run-unit-tests.js', await runRunner(UNIT_RUNNER, []));
        const regOk  = record('run-regression-tests.js', await runRunner(REGRESSION_RUNNER, []));

        state.fullSuiteRuns++;
        state.lastFullRun = new Date().toISOString();
        saveState();

        const allGreen = unitOk && regOk;
        const color    = allGreen ? '\x1b[32m' : '\x1b[31m';
        const ts2      = new Date().toTimeString().slice(0, 8);
        console.log(`\n${color}${'═'.repeat(64)}\x1b[0m`);
        console.log(`${color}[${ts2}] SUITE COMPLETE: ${allGreen ? 'all green' : 'FAILURES — see above'}\x1b[0m`);
        console.log(`${color}${'═'.repeat(64)}\x1b[0m\n`);
    });
}

// ── File watcher ──────────────────────────────────────────────────────────────
const WATCH_DIRS = [
    path.join(ROOT, 'tests', 'unit'),
    path.join(ROOT, 'tests', 'regression'),
    path.join(ROOT, 'tests'),
];

// Debounce map to avoid double-firing
const debounceMap = new Map();

function onFileChange(eventType, filename, dir) {
    if (!filename || !filename.endsWith('.test.js')) { return; }

    const relPath = path.relative(ROOT, path.join(dir, filename)).replace(/\\/g, '/');
    const absPath = path.join(dir, filename);

    if (!fs.existsSync(absPath)) { return; }

    // Debounce 300ms per file
    if (debounceMap.has(relPath)) { clearTimeout(debounceMap.get(relPath)); }
    debounceMap.set(relPath, setTimeout(() => {
        debounceMap.delete(relPath);
        const ts = new Date().toTimeString().slice(0, 8);
        console.log(`\n\x1b[33m[${ts}] Changed: ${relPath}\x1b[0m`);
        state.lastChanged = relPath;
        runChangedFile(relPath);
    }, 300));
}

module.exports = { parseRunnerOutput, verdictOfExplicitRun };

if (require.main === module) {
    for (const dir of WATCH_DIRS) {
        if (!fs.existsSync(dir)) { continue; }
        fs.watch(dir, { persistent: true }, (eventType, filename) => {
            onFileChange(eventType, filename, dir);
        });
    }

    // ── Periodic full suite: the next run starts a pause after the last one ends
    let fullSuiteTimer = null;
    const cycle = () => runFullSuite().then(() => { fullSuiteTimer = setTimeout(cycle, FULL_SUITE_PAUSE_MS); });

    // ── Startup ───────────────────────────────────────────────────────────────
    console.log('\x1b[36m');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║         CieloVista Tools — Continuous Test Runner            ║');
    console.log(`║  Watching ${String(WATCH_DIRS.length).padEnd(2)} directories  •  Full suite, then ${FULL_SUITE_PAUSE_MS/1000}s pause   ║`);
    console.log(`║  Status:  data/test-watch.json                               ║`);
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('\x1b[0m');
    console.log('Key: \x1b[32m✓\x1b[0m pass   \x1b[31m✗\x1b[0m fail   \x1b[33m~\x1b[0m changed\n');

    cycle();

    // Keep alive
    process.on('SIGINT', () => {
        if (fullSuiteTimer) { clearTimeout(fullSuiteTimer); }
        saveState();
        console.log('\n\x1b[36mTest watcher stopped.\x1b[0m');
        process.exit(0);
    });
}
