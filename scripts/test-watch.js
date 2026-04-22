/**
 * scripts/test-watch.js
 *
 * Continuous background test runner for cielovista-tools.
 *
 * Behavior:
 *   - Watches tests/unit/, tests/regression/, tests/ for .test.js changes
 *   - When a file changes: runs JUST that file immediately (fast feedback)
 *   - Every 60 seconds: runs the full test:all suite
 *   - Writes live status to data/test-watch.json
 *   - Prints a compact pass/fail summary after every run
 *   - Never exits — runs until killed
 *
 * Start:  node scripts/test-watch.js
 * Stop:   Ctrl+C  or  kill the process
 */
'use strict';

const fs    = require('fs');
const path  = require('path');
const { execSync, spawnSync } = require('child_process');

const ROOT      = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'data', 'test-watch.json');
const FULL_SUITE_INTERVAL_MS = 60_000; // run all tests every 60s

// ── All individual test files (same order as test:all) ─────────────────────────
const ALL_TESTS = [
    'tests/catalog-integrity.test.js',
    'tests/command-validation.test.js',
    'tests/doc-catalog.test.js',
    'tests/launcher-script.test.js',
    'tests/launcher-test-coverage.test.js',
    'tests/unit/background-health-runner.test.js',
    'tests/unit/webview-utils.test.js',
    'tests/unit/docs-audit-utils.test.js',
    'tests/unit/error-log.test.js',
    'tests/unit/error-log-utils.test.js',
    'tests/unit/shared-source.test.js',
    'tests/unit/doc-auditor-analyzer.test.js',
    'tests/unit/doc-auditor-scanner.test.js',
    'tests/unit/feature-toggle.test.js',
    'tests/unit/doc-header.test.js',
    'tests/unit/license-sync.test.js',
    'tests/regression/REG-001-extension-activation.test.js',
    'tests/test-coverage-commands.integration.test.js',
];

// ── State ─────────────────────────────────────────────────────────────────────
let state = {
    startedAt:    new Date().toISOString(),
    lastFullRun:  null,
    lastChanged:  null,
    totalRuns:    0,
    fullSuiteRuns: 0,
    results:      {},  // file → { passed, failed, durationMs, lastRun }
    watching:     ALL_TESTS.length,
};

function saveState() {
    try {
        const dir = path.dirname(DATA_FILE);
        if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
        fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), 'utf8');
    } catch { /* non-fatal */ }
}

// ── Run a single test file ────────────────────────────────────────────────────
function runTest(relPath) {
    const absPath = path.join(ROOT, relPath);
    if (!fs.existsSync(absPath)) { return; }

    const start   = Date.now();
    const result  = spawnSync('node', [absPath], {
        cwd:      ROOT,
        encoding: 'utf8',
        timeout:  30_000,
    });

    const duration = Date.now() - start;
    const output   = (result.stdout || '') + (result.stderr || '');

    // Parse pass/fail counts from output patterns
    let passed = 0, failed = 0;

    // Pattern: "N tests: N passed, N failed"
    const summary = output.match(/(\d+) tests?:\s*(\d+) passed,\s*(\d+) failed/i);
    if (summary) { passed = parseInt(summary[2]); failed = parseInt(summary[3]); }

    // Pattern: "All N tests passed"
    const allPassed = output.match(/All (\d+) tests? passed/i);
    if (allPassed && !summary) { passed = parseInt(allPassed[1]); failed = 0; }

    // Pattern: "N test(s) FAILED"
    const failLine = output.match(/(\d+) test\(s\) FAILED/i);
    if (failLine) { failed = parseInt(failLine[1]); }

    // Pattern: "Results: N passed, N failed"
    const resultsLine = output.match(/Results?:\s*(\d+) passed,\s*(\d+) failed/i);
    if (resultsLine) { passed = parseInt(resultsLine[1]); failed = parseInt(resultsLine[2]); }

    // Pattern: "N checks — N passed, N failed"
    const checksLine = output.match(/(\d+) checks?\s*[—-]\s*(\d+) passed,\s*(\d+) failed/i);
    if (checksLine) { passed = parseInt(checksLine[2]); failed = parseInt(checksLine[3]); }

    const short     = path.basename(relPath);
    const status    = result.status === 0 && failed === 0 ? '✓' : '✗';
    const color     = status === '✓' ? '\x1b[32m' : '\x1b[31m';
    const reset     = '\x1b[0m';
    const ts        = new Date().toTimeString().slice(0, 8);

    console.log(`${color}${status}${reset} [${ts}] ${short.padEnd(45)} ${String(passed).padStart(4)} passed${failed > 0 ? `  ${color}${failed} FAILED${reset}` : ''}  ${duration}ms`);

    state.results[relPath] = { passed, failed, durationMs: duration, lastRun: new Date().toISOString(), exit: result.status };
    state.totalRuns++;
    saveState();

    return { passed, failed, exit: result.status };
}

// ── Run the full suite ────────────────────────────────────────────────────────
function runFullSuite() {
    const ts = new Date().toTimeString().slice(0, 8);
    console.log(`\n\x1b[36m${'─'.repeat(64)}\x1b[0m`);
    console.log(`\x1b[36m[${ts}] FULL SUITE RUN #${state.fullSuiteRuns + 1}\x1b[0m`);
    console.log(`\x1b[36m${'─'.repeat(64)}\x1b[0m\n`);

    let totalPassed = 0, totalFailed = 0;

    for (const testFile of ALL_TESTS) {
        const r = runTest(testFile);
        if (r) { totalPassed += r.passed; totalFailed += r.failed; }
    }

    state.fullSuiteRuns++;
    state.lastFullRun = new Date().toISOString();
    saveState();

    const allGreen = totalFailed === 0;
    const color    = allGreen ? '\x1b[32m' : '\x1b[31m';
    const ts2      = new Date().toTimeString().slice(0, 8);
    console.log(`\n${color}${'═'.repeat(64)}\x1b[0m`);
    console.log(`${color}[${ts2}] SUITE COMPLETE: ${totalPassed} passed, ${totalFailed} failed\x1b[0m`);
    console.log(`${color}${'═'.repeat(64)}\x1b[0m\n`);
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
        runTest(relPath);
    }, 300));
}

for (const dir of WATCH_DIRS) {
    if (!fs.existsSync(dir)) { continue; }
    fs.watch(dir, { persistent: true }, (eventType, filename) => {
        onFileChange(eventType, filename, dir);
    });
}

// ── Periodic full suite ───────────────────────────────────────────────────────
let fullSuiteTimer = setInterval(runFullSuite, FULL_SUITE_INTERVAL_MS);

// ── Startup ───────────────────────────────────────────────────────────────────
console.log('\x1b[36m');
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║         CieloVista Tools — Continuous Test Runner            ║');
console.log(`║  Watching ${String(WATCH_DIRS.length).padEnd(2)} directories  •  Full suite every ${FULL_SUITE_INTERVAL_MS/1000}s       ║`);
console.log(`║  Status:  data/test-watch.json                               ║`);
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log('\x1b[0m');
console.log('Key: \x1b[32m✓\x1b[0m pass   \x1b[31m✗\x1b[0m fail   \x1b[33m~\x1b[0m changed\n');

// Run full suite immediately on startup
runFullSuite();

// Keep alive
process.on('SIGINT', () => {
    clearInterval(fullSuiteTimer);
    console.log('\n\x1b[33mTest watcher stopped.\x1b[0m');
    process.exit(0);
});
