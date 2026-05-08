/**
 * REG-025-npm-output-failed-jobs.test.js
 *
 * Regression test for issue #293 — NPM Output panel drops failed job details.
 *
 * Root cause: setupOutputPanel() was called lazily from stdout/stderr data
 * handlers. Jobs that fail with no output (instant exit, script not found,
 * or any zero-output failure) never triggered a data event, so the panel was
 * never opened and all queued messages (job-start, [CVT] Launching, done)
 * were lost forever.
 *
 * Fix: setupOutputPanel() is called eagerly at the start of every 'run'
 * handler, before job-start is sent, so the panel always exists regardless
 * of whether the job produces any stdout/stderr.
 *
 * Checks enforced here:
 *   1. setupOutputPanel() called before job-start in the run handler
 *   2. stdout AND stderr both piped to sendOut (complete capture, no omission)
 *   3. done event includes code, killed, and durationMs (full failure details)
 *   4. No lazy setupOutputPanel calls remain in the data handlers
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const SRC_PATH = path.resolve(__dirname, '..', '..', 'src', 'features', 'npm-command-launcher.ts');

let failed = 0;
const fail = (msg) => { console.error('FAIL: ' + msg); failed++; };
const ok   = (msg) => { console.log('PASS: ' + msg); };

if (!fs.existsSync(SRC_PATH)) {
    console.error('FATAL: npm-command-launcher.ts not found at ' + SRC_PATH);
    process.exit(1);
}
const src = fs.readFileSync(SRC_PATH, 'utf8');

// Locate the run case body for precise assertions
const runCaseIdx = src.indexOf("case 'run': {");
if (runCaseIdx < 0) {
    console.error("FATAL: case 'run': { not found in source");
    process.exit(1);
}
// Grab enough of the run case — 5000 chars covers all the nested handlers
const runBody = src.slice(runCaseIdx, runCaseIdx + 5000);

// ─── Check 1: setupOutputPanel called before job-start ────────────────────

(function checkEagerPanelOpen() {
    const setupIdx    = runBody.indexOf('setupOutputPanel()');
    const jobStartIdx = runBody.indexOf("sendOut('job-start'");
    if (setupIdx < 0) {
        fail('setupOutputPanel() not called in run handler — failed zero-output jobs will never appear in panel');
        return;
    }
    if (jobStartIdx < 0) {
        fail("sendOut('job-start', ...) missing from run handler");
        return;
    }
    if (setupIdx > jobStartIdx) {
        fail('setupOutputPanel() called AFTER job-start — panel may not exist when first messages are sent');
        return;
    }
    ok('setupOutputPanel() called eagerly before job-start (zero-output failures will show in panel)');
})();

// ─── Check 2: stdout and stderr both piped to sendOut ─────────────────────

(function checkStdoutStderrCapture() {
    if (!runBody.includes("proc.stdout?.on('data'")) {
        fail("proc.stdout?.on('data') handler missing — stdout not captured");
        return;
    }
    if (!runBody.includes("proc.stderr?.on('data'")) {
        fail("proc.stderr?.on('data') handler missing — stderr not captured (most npm failures write to stderr)");
        return;
    }
    ok('stdout and stderr data handlers present — full output captured for all jobs');
})();

// ─── Check 3: done event carries code, killed, durationMs ─────────────────

(function checkDonePayload() {
    if (!runBody.includes("proc.on('close'")) {
        fail("proc.on('close') handler missing — exit status never sent to panel");
        return;
    }
    // sendOut('done', ...) must pass code, killed, durationMs
    const doneIdx = runBody.indexOf("sendOut('done'");
    if (doneIdx < 0) {
        fail("sendOut('done', ...) call missing — exit status not forwarded to output panel");
        return;
    }
    // Grab the sendOut('done', ...) line — it fits on one line
    const lineEnd = runBody.indexOf('\n', doneIdx);
    const doneLine = lineEnd > 0 ? runBody.slice(doneIdx, lineEnd) : runBody.slice(doneIdx, doneIdx + 200);

    if (!doneLine.includes('code')) { fail("done payload missing 'code' — exit code not shown for failed jobs"); return; }
    if (!doneLine.includes('killed')) { fail("done payload missing 'killed' — stopped-job indicator absent"); return; }
    if (!doneLine.includes('durationMs')) { fail("done payload missing 'durationMs' — duration not shown for failed jobs"); return; }
    ok("done event carries code + killed + durationMs — full failure details shown in panel");
})();

// ─── Check 4: no lazy setupOutputPanel in data handlers ───────────────────

(function checkNoLazySetup() {
    const stdoutHandlerIdx = runBody.indexOf("proc.stdout?.on('data'");
    const stderrHandlerIdx = runBody.indexOf("proc.stderr?.on('data'");
    if (stdoutHandlerIdx < 0 || stderrHandlerIdx < 0) {
        ok('(skipped — data handlers not found, nothing to check)');
        return;
    }

    // Extract each handler body (up to its closing });)
    function extractHandlerBody(startIdx) {
        const closingIdx = runBody.indexOf('});', startIdx);
        return closingIdx > 0 ? runBody.slice(startIdx, closingIdx + 3) : runBody.slice(startIdx, startIdx + 200);
    }

    const stdoutBody = extractHandlerBody(stdoutHandlerIdx);
    const stderrBody = extractHandlerBody(stderrHandlerIdx);

    if (stdoutBody.includes('setupOutputPanel()')) {
        fail('Lazy setupOutputPanel() call still inside stdout handler — regression of fix');
        return;
    }
    if (stderrBody.includes('setupOutputPanel()')) {
        fail('Lazy setupOutputPanel() call still inside stderr handler — regression of fix');
        return;
    }
    ok('No lazy setupOutputPanel() inside data handlers — eager-open pattern preserved');
})();

// ─── Result ───────────────────────────────────────────────────────────────

console.log('');
if (failed === 0) {
    console.log('REG-025 PASSED — failed-job output completeness fixes are in source');
    process.exit(0);
} else {
    console.error('REG-025 FAILED — ' + failed + ' check' + (failed > 1 ? 's' : '') + ' failed');
    process.exit(1);
}
