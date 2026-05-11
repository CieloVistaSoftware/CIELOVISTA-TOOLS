/**
 * REG-025-npm-output-failed-jobs.test.js
 *
 * Regression test for issue #293 (expanded scope) — npm script runs must open
 * a real VS Code terminal, not a webview output panel. Every run — including
 * zero-output failures — is immediately visible because the terminal IS the
 * output, not a secondary panel waiting on a handshake.
 *
 * Checks enforced here:
 *   1. createTerminal() called in the run handler (not setupOutputPanel/cp.spawn)
 *   2. term.show() called to make the terminal visible
 *   3. term.sendText() sends the npm run command
 *   4. onDidCloseTerminal used for exit status tracking
 *   5. No webview output panel remnants (setupOutputPanel, sendOut, postToOutput)
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

const runCaseIdx = src.indexOf("case 'run': {");
if (runCaseIdx < 0) {
    console.error("FATAL: case 'run': { not found in source");
    process.exit(1);
}
const runBody = src.slice(runCaseIdx, runCaseIdx + 3000);

// ─── Check 1: createTerminal called in run handler ────────────────────────

(function checkCreateTerminal() {
    if (!runBody.includes('createTerminal(')) {
        fail('createTerminal() not called in run handler — terminal not opened for script runs');
        return;
    }
    ok('createTerminal() called in run handler');
})();

// ─── Check 2: terminal is shown ───────────────────────────────────────────

(function checkTermShow() {
    if (!runBody.includes('term.show(')) {
        fail('term.show() missing — terminal will not be visible when script runs');
        return;
    }
    ok('term.show() called — terminal visible on run');
})();

// ─── Check 3: sendText issues the npm run command ─────────────────────────

(function checkSendText() {
    if (!runBody.includes('term.sendText(')) {
        fail('term.sendText() missing — command never sent to terminal');
        return;
    }
    if (!runBody.includes('npm run')) {
        fail('sendText does not include "npm run" — wrong command sent to terminal');
        return;
    }
    ok('term.sendText() sends npm run command');
})();

// ─── Check 4: onDidCloseTerminal tracks exit status ───────────────────────

(function checkCloseTracking() {
    if (!runBody.includes('onDidCloseTerminal')) {
        fail('onDidCloseTerminal missing — exit status never reported back to NPM Scripts card');
        return;
    }
    ok('onDidCloseTerminal used for exit status tracking');
})();

// ─── Check 5: no webview output panel remnants ────────────────────────────

(function checkNoWebviewRemnants() {
    if (runBody.includes('setupOutputPanel(')) {
        fail('setupOutputPanel() still present in run handler — webview panel not fully removed');
        return;
    }
    if (runBody.includes("sendOut('job-start'")) {
        fail("sendOut('job-start') still present — webview messaging not fully removed");
        return;
    }
    if (runBody.includes('cp.spawn(')) {
        fail('cp.spawn() still present in run handler — should use createTerminal instead');
        return;
    }
    ok('No webview output panel remnants in run handler');
})();

// ─── Result ───────────────────────────────────────────────────────────────

console.log('');
if (failed === 0) {
    console.log('REG-025 PASSED — npm scripts run in real VS Code terminals');
    process.exit(0);
} else {
    console.error('REG-025 FAILED — ' + failed + ' check' + (failed > 1 ? 's' : '') + ' failed');
    process.exit(1);
}
