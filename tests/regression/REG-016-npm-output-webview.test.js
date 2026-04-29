/**
 * REG-016-npm-output-webview.test.js
 *
 * Regression test for issue #66 — NPM Output webview blank when running scripts.
 *
 * The rule established for REG-016:
 *   "The npm output webview must (a) echo the launched command within
 *    milliseconds of clicking Run via an explicit '[CVT] Launching:' line
 *    emitted right after job-start, (b) carry a safety-net timeout in
 *    setupOutputPanel that force-flushes the queue if the output-ready
 *    handshake hasn't arrived in 2s, and (c) swap the '(no output yet)'
 *    running placeholder for a final '(no output)' indicator on done so
 *    the panel is never visually empty after a job ends."
 *
 * The webview is hard to drive end-to-end without launching VS Code, so
 * this test relies on static-source inspection of npm-command-launcher.ts.
 * Each check is a structural assertion: the source must contain the
 * specific patterns that implement the fix. If a future refactor removes
 * one of them, this test fails and the build is aborted.
 *
 * Spawned via REG-016 inside scripts/run-regression-tests.js. Exits 0 on
 * pass, 1 on any failure.
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

// ─── Check 1: immediate launch echo after job-start ───────────────────────

(function checkImmediateLaunchEcho() {
    // The fix emits '[CVT] Launching: npm run <script>' right after the
    // job-start message so the user sees the command within milliseconds.
    const jobStartIdx = src.indexOf("sendOut('job-start'");
    const launchingIdx = src.indexOf('[CVT] Launching:');
    if (jobStartIdx < 0) { fail('sendOut(\'job-start\', ...) call missing entirely'); return; }
    if (launchingIdx < 0) { fail('"[CVT] Launching:" echo line missing — user will not see launched command immediately'); return; }
    if (launchingIdx < jobStartIdx) {
        fail('"[CVT] Launching:" echo appears BEFORE the job-start call — wrong order, no job exists yet to attach output to');
        return;
    }
    // It must be reasonably close to job-start (within ~500 chars), not just
    // any random reference somewhere else in the file.
    if (launchingIdx - jobStartIdx > 500) {
        fail('"[CVT] Launching:" echo is too far from job-start — likely not in the run path');
        return;
    }
    ok('immediate "[CVT] Launching:" echo line present right after job-start');
})();

// ─── Check 2: safety-net timeout in setupOutputPanel ──────────────────────

(function checkSafetyNetTimeout() {
    // The fix adds a setTimeout(...) inside setupOutputPanel that, after
    // 2 seconds, sets _outputReady = true and calls flushOutputQueue if
    // the handshake hasn't arrived. This rescues the panel from a stuck
    // queue caused by deserializer / retainContextWhenHidden races.
    const setupIdx = src.indexOf('function setupOutputPanel(');
    if (setupIdx < 0) { fail('setupOutputPanel function missing'); return; }
    // Find the end of the function — the next top-level "function " at
    // column 0 — and slice the body.
    const afterSetup = src.indexOf('\nfunction ', setupIdx + 1);
    const setupBody = afterSetup > 0 ? src.slice(setupIdx, afterSetup) : src.slice(setupIdx);

    if (!/setTimeout\s*\(/.test(setupBody)) {
        fail('setupOutputPanel has no setTimeout — safety-net for stuck output-ready handshake is missing');
        return;
    }
    if (!setupBody.includes('flushOutputQueue')) {
        fail('setupOutputPanel safety-net does not call flushOutputQueue');
        return;
    }
    if (!setupBody.includes('_outputReady = true')) {
        fail('setupOutputPanel safety-net does not promote _outputReady to true');
        return;
    }
    if (!/2000\s*\)/.test(setupBody)) {
        fail('setupOutputPanel safety-net does not use a 2000ms timeout (acceptance criterion)');
        return;
    }
    ok('setupOutputPanel safety-net timeout (2s -> _outputReady + flushOutputQueue) is present');
})();

// ─── Check 3: '(no output)' placeholder swap on done ──────────────────────

(function checkNoOutputPlaceholderSwap() {
    // The fix updates the JS done handler in buildOutputShellHtml so that
    // when a job exits with no output, the running placeholder
    // '(no output yet)' is replaced with a final '(no output)' label.
    if (!src.includes("'(no output)'") && !src.includes('"(no output)"')) {
        fail('"(no output)" placeholder string missing from JS — empty-output jobs will keep "(no output yet)" forever');
        return;
    }
    if (!/m\.type\s*===\s*'done'/.test(src)) {
        fail("done message handler missing in webview JS");
        return;
    }
    ok('"(no output)" placeholder swap is present in webview JS');
})();

// ─── Check 4: listener-first pattern preserved ────────────────────────────

(function checkListenerFirstPattern() {
    // setupOutputPanel must register onDidReceiveMessage BEFORE assigning
    // panel.webview.html. If the order is ever reversed, output-ready can
    // arrive before the handler is wired and the queue never flushes.
    const handlerIdx = src.indexOf('panel.webview.onDidReceiveMessage(async msg =>');
    const htmlIdx    = src.indexOf('panel.webview.html = buildOutputShellHtml()');
    if (handlerIdx < 0) { fail('onDidReceiveMessage handler registration missing in setupOutputPanel'); return; }
    if (htmlIdx < 0)    { fail('panel.webview.html assignment missing in setupOutputPanel'); return; }
    if (handlerIdx > htmlIdx) {
        fail('Listener-first pattern broken: panel.webview.html is set BEFORE onDidReceiveMessage is registered. ' +
             'output-ready can arrive before the handler exists, leaving the queue stuck.');
        return;
    }
    ok('listener-first pattern preserved (handler registered before html assignment)');
})();

// ─── Check 5: webview-side output-ready retry preserved ───────────────────

(function checkOutputReadyRetry() {
    // Belt and braces: the JS still sends output-ready twice (immediately
    // and again at 1s) so brief races against the extension-side handler
    // registration are also covered.
    const retryRe = /setTimeout\s*\(\s*function\s*\(\s*\)\s*\{\s*vsc\.postMessage\s*\(\s*\{\s*command\s*:\s*'output-ready'/;
    if (!retryRe.test(src)) {
        fail('webview JS no longer retries output-ready — race against handshake reintroduced');
        return;
    }
    ok('webview-side output-ready retry preserved');
})();

// ─── Result ───────────────────────────────────────────────────────────────

console.log('');
if (failed === 0) {
    console.log('REG-016 PASSED — npm output webview fixes are in source');
    process.exit(0);
} else {
    console.error('REG-016 FAILED — ' + failed + ' check' + (failed > 1 ? 's' : '') + ' failed');
    process.exit(1);
}
