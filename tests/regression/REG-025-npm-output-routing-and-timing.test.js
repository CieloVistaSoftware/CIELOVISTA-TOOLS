'use strict';

/**
 * REG-025-npm-output-routing-and-timing.test.js
 *
 * Regression test for issue #293 (expanded scope) — npm scripts must run in
 * real VS Code terminals. Complements REG-026 (failed-jobs).
 *
 * Checks enforced here:
 *   1. Terminal is named after the script (user can identify it in the tab bar)
 *   2. Terminal opens beside the editor, preserving focus (non-disruptive UX)
 *   3. sendCard('status', ...) posts run-state back to the project card webview
 *   4. _runningTerminals Map is declared for multi-job tracking
 *   5. stop handler disposes the terminal and removes it from the Map
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

const runCaseIdx = src.indexOf("case 'run': {");
if (runCaseIdx < 0) {
    console.error("FATAL: case 'run': { not found in source");
    process.exit(1);
}
const runBody = src.slice(runCaseIdx, runCaseIdx + 3000);

// ─── Check 1: Terminal is named with the script ───────────────────────────

(function checkTerminalName() {
    // createTerminal must include `name: ...` that incorporates the script
    // so the user can identify it in the terminal tab bar.
    if (!runBody.includes('name:') || !runBody.includes('script')) {
        fail('Terminal name does not reference the script — user cannot identify which tab is which');
        return;
    }
    ok('Terminal name includes script reference');
})();

// ─── Check 2: Terminal opens beside editor, preserving focus ─────────────

(function checkTerminalLocation() {
    if (!runBody.includes('ViewColumn.Beside')) {
        fail('Terminal does not open ViewColumn.Beside — disrupts the editor layout');
        return;
    }
    if (!runBody.includes('preserveFocus: true')) {
        fail('Terminal does not set preserveFocus: true — steals focus on every run');
        return;
    }
    ok('Terminal opens beside editor with preserveFocus: true');
})();

// ─── Check 3: sendCard posts status back to the project card ─────────────

(function checkStatusFeedback() {
    // The run handler must send state updates back to the webview card so
    // the card can show running / ok / error / stopped state visually.
    if (!runBody.includes("sendCard(")) {
        fail('sendCard() not called in run handler — card never updates its run state');
        return;
    }
    if (!runBody.includes("state: 'running'")) {
        fail("state: 'running' not posted — card shows no visual feedback while script runs");
        return;
    }
    // Exit status update is inside the close listener, within the run block
    const closeIdx = runBody.indexOf('onDidCloseTerminal');
    if (closeIdx < 0) {
        fail('onDidCloseTerminal block missing — exit state never sent back to card');
        return;
    }
    const closeBody = runBody.slice(closeIdx, closeIdx + 500);
    if (!closeBody.includes('sendCard(')) {
        fail('sendCard() not called inside onDidCloseTerminal — card stays in "running" state forever');
        return;
    }
    ok('sendCard() posts running + exit state back to project card');
})();

// ─── Check 4: _runningTerminals Map declared for multi-job tracking ───────

(function checkRunningMap() {
    if (!src.includes('_runningTerminals')) {
        fail('_runningTerminals Map missing — cannot track or stop running jobs');
        return;
    }
    if (!src.includes('new Map')) {
        fail('_runningTerminals is not initialized as a Map');
        return;
    }
    if (!runBody.includes('_runningTerminals.set(')) {
        fail('run handler does not call _runningTerminals.set() — job never tracked');
        return;
    }
    ok('_runningTerminals Map declared and populated on run');
})();

// ─── Check 5: stop handler disposes terminal and removes from Map ─────────

(function checkStopHandler() {
    const stopIdx = src.indexOf("case 'stop': {");
    if (stopIdx < 0) {
        fail("case 'stop': { missing — stop button will not kill the terminal");
        return;
    }
    const stopBody = src.slice(stopIdx, stopIdx + 400);
    if (!stopBody.includes('term.dispose()') && !stopBody.includes('.dispose()')) {
        fail('stop handler does not dispose() the terminal — process keeps running');
        return;
    }
    if (!stopBody.includes('_runningTerminals.delete(')) {
        fail('stop handler does not delete from _runningTerminals — map leaks stale entries');
        return;
    }
    ok('stop handler disposes terminal and removes it from _runningTerminals');
})();

// ─── Result ───────────────────────────────────────────────────────────────

console.log('');
if (failed === 0) {
    console.log('REG-025 PASSED — npm scripts terminal routing + lifecycle guarantees are in source');
    process.exit(0);
} else {
    console.error('REG-025 FAILED — ' + failed + ' check' + (failed > 1 ? 's' : '') + ' failed');
    process.exit(1);
}
