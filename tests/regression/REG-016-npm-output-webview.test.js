'use strict';

/**
 * REG-016-npm-output-webview.test.js
 *
 * Originally guarded issue #66 (NPM Output webview blank when running scripts).
 * That webview panel no longer exists — issue #293 replaced it with a real VS Code
 * terminal. This test now enforces that the OLD webview approach has been completely
 * removed and cannot silently creep back in.
 *
 * Checks enforced here:
 *   1. buildOutputShellHtml() is gone — webview HTML builder removed
 *   2. setupOutputPanel() is gone — webview panel setup removed
 *   3. No child_process / cp.spawn — output no longer captured via Node subprocess
 *   4. sendOut() / postToOutput() are gone — webview message pump removed
 *   5. flushOutputQueue() / _outputPanel are gone — queue and panel state removed
 */

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

// ─── Check 1: buildOutputShellHtml removed ────────────────────────────────

(function checkNoShellHtml() {
    if (src.includes('buildOutputShellHtml')) {
        fail('buildOutputShellHtml() is still present — webview HTML builder was not removed (regression of #293)');
        return;
    }
    ok('buildOutputShellHtml() removed — no webview HTML builder');
})();

// ─── Check 2: setupOutputPanel removed ───────────────────────────────────

(function checkNoSetupPanel() {
    if (src.includes('setupOutputPanel')) {
        fail('setupOutputPanel() is still present — webview panel setup was not removed (regression of #293)');
        return;
    }
    ok('setupOutputPanel() removed — no webview panel setup');
})();

// ─── Check 3: No child_process / cp.spawn ────────────────────────────────

(function checkNoChildProcess() {
    if (/import\s+\*\s+as\s+cp\s+from\s+['"]child_process['"]/.test(src)) {
        fail("import * as cp from 'child_process' still present — subprocess spawning not removed (regression of #293)");
        return;
    }
    if (src.includes('cp.spawn(')) {
        fail('cp.spawn() still in source — subprocess spawning not removed (regression of #293)');
        return;
    }
    ok('No child_process import or cp.spawn() — output capture via subprocess removed');
})();

// ─── Check 4: sendOut / postToOutput removed ─────────────────────────────

(function checkNoWebviewMessaging() {
    if (src.includes('function sendOut(') || src.includes('const sendOut ')) {
        fail('sendOut() function is still present — webview message pump not removed (regression of #293)');
        return;
    }
    if (src.includes('postToOutput(')) {
        fail('postToOutput() is still present — webview message helper not removed (regression of #293)');
        return;
    }
    ok('sendOut() and postToOutput() removed — webview message pump gone');
})();

// ─── Check 5: flushOutputQueue / _outputPanel removed ────────────────────

(function checkNoQueueOrPanel() {
    if (src.includes('flushOutputQueue')) {
        fail('flushOutputQueue() is still present — output queue not removed (regression of #293)');
        return;
    }
    if (src.includes('_outputPanel')) {
        fail('_outputPanel is still present — output panel state variable not removed (regression of #293)');
        return;
    }
    ok('flushOutputQueue() and _outputPanel removed — output queue/panel state gone');
})();

// ─── Result ───────────────────────────────────────────────────────────────

console.log('');
if (failed === 0) {
    console.log('REG-016 PASSED — old webview output panel approach fully removed from source');
    process.exit(0);
} else {
    console.error('REG-016 FAILED — ' + failed + ' check' + (failed > 1 ? 's' : '') + ' failed');
    process.exit(1);
}
