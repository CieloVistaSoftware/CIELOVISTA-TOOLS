/**
 * REG-071 — Fix Bugs panel: onDidReceiveMessage registered only once (inside else branch)
 *
 * Root cause: onDidReceiveMessage was registered OUTSIDE the if/else block in
 * showFixBugsPanel(), so every call (re-opens, bg refreshes) stacked another handler.
 * Multiple handlers caused race conditions on file-issue: duplicate API calls,
 * the second finding the just-created issue and commenting on it instead of confirming.
 *
 * Fix: moved onDidReceiveMessage into the `else` branch (panel creation only).
 *      Added top-level try/catch so errors are logged rather than silently swallowed.
 */

'use strict';
const fs   = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '../../src/features/background-health-runner.ts');
const src  = fs.readFileSync(SRC, 'utf8');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try { fn(); console.log(`  ✓ ${name}`); passed++; }
    catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); failed++; }
}

console.log('\nREG-071 — Fix Bugs create-issue handler registered once\n');

// 1. onDidReceiveMessage must appear INSIDE the else block (after panel creation)
test('onDidReceiveMessage is inside the else branch', () => {
    // The else branch ends with '});' for the handler, then '}'  for the else.
    // Simplest check: the handler registration must come BEFORE the sync task comment.
    const elseIdx    = src.indexOf('_panel = vscode.window.createWebviewPanel(');
    const handlerIdx = src.indexOf('_panel.webview.onDidReceiveMessage(');
    const syncIdx    = src.indexOf('// Silently sync issue numbers');
    if (elseIdx === -1) { throw new Error('else branch not found'); }
    if (handlerIdx === -1) { throw new Error('onDidReceiveMessage call not found'); }
    if (handlerIdx > syncIdx) {
        throw new Error('onDidReceiveMessage is AFTER the sync task — still outside else block');
    }
    if (handlerIdx < elseIdx) {
        throw new Error('onDidReceiveMessage is BEFORE the else branch — not inside it');
    }
});

// 2. Only ONE call to onDidReceiveMessage in showFixBugsPanel
test('onDidReceiveMessage called exactly once in showFixBugsPanel', () => {
    // Count occurrences of _panel.webview.onDidReceiveMessage(
    const matches = src.match(/_panel\.webview\.onDidReceiveMessage\(/g) || [];
    if (matches.length !== 1) {
        throw new Error(`Expected 1 onDidReceiveMessage registration, found ${matches.length}`);
    }
});

// 3. file-issue handler must have early-return guard when bug not found
test('file-issue has early-return guard (!bug)', () => {
    if (!src.includes("if (!bug) { return; }")) {
        throw new Error("Missing 'if (!bug) { return; }' guard in file-issue handler");
    }
});

// 4. Top-level try/catch wraps the entire handler
test('message handler has top-level try/catch', () => {
    const handlerIdx = src.indexOf('_panel.webview.onDidReceiveMessage(async msg => {');
    const tryCatch   = src.indexOf('try {', handlerIdx);
    const nextHandler = src.indexOf('_panel.webview.onDidReceiveMessage(', handlerIdx + 1);
    if (tryCatch === -1) { throw new Error('No try/catch found after onDidReceiveMessage'); }
    // Must appear before the next occurrence (which doesn't exist, but belt-and-suspenders)
    if (nextHandler !== -1 && tryCatch > nextHandler) {
        throw new Error('try/catch is outside the expected handler scope');
    }
});

// 5. logError is called in the catch block of the message handler
test('catch block calls logError', () => {
    const handlerIdx = src.indexOf('_panel.webview.onDidReceiveMessage(async msg => {');
    // Find the end of the handler by looking for the closing }) after it
    const afterHandler = src.slice(handlerIdx);
    if (!afterHandler.includes("logError('Fix Bugs panel message error'")) {
        throw new Error("No logError('Fix Bugs panel message error') found in message handler");
    }
});

console.log(`\n${passed + failed} checks: ${passed} passed, ${failed} failed\n`);
if (failed > 0) { process.exit(1); }
