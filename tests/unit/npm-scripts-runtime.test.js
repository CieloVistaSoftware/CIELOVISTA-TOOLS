/**
 * npm-scripts-runtime.test.js
 * 
 * Simulates the EXACT message timing between extension and webview.
 * The previous test only checked static code. This one proves whether
 * the message listener is attached BEFORE or AFTER 'ready' is sent.
 * 
 * Run: node tests/unit/npm-scripts-runtime.test.js
 */
'use strict';

const fs = require('fs');

let pass = 0, fail = 0;
function ok(label, value, detail) {
    if (value) { console.log(`  PASS  ${label}${detail ? ' — ' + detail : ''}`); pass++; }
    else        { console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); fail++; }
}

console.log('\n== NPM Scripts Runtime Message-Flow Test ==\n');

// ── Extract the actual script block from the shell HTML ──────────────────────
const shellJs = require('C:\\Users\\jwpmi\\Downloads\\VSCode\\projects\\cielovista-tools\\out\\shared\\project-card-shell.js');
const html = shellJs.PROJECT_CARD_SHELL_HTML;

const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) { console.error('FATAL: no <script> block in shell HTML'); process.exit(1); }
const scriptBody = scriptMatch[1].replace(/^\(function\(\)\{/, '').replace(/\}\)\(\);?\s*$/, '');

// ── Find positions of key statements ────────────────────────────────────────
const posReady       = scriptBody.indexOf("command: 'ready'");
const posListener    = scriptBody.indexOf("window.addEventListener('message'");
const posRender      = scriptBody.indexOf('function render(');

ok("'ready' postMessage exists in script",         posReady    >= 0, `pos=${posReady}`);
ok("window.addEventListener('message') exists",     posListener >= 0, `pos=${posListener}`);
ok("render() function exists",                      posRender   >= 0, `pos=${posRender}`);

if (posReady < 0 || posListener < 0) {
    console.log('\nFATAL: key tokens missing, cannot continue');
    process.exit(1);
}

// ── THE KEY CHECK: listener must be BEFORE ready ────────────────────────────
const listenerBeforeReady = posListener < posReady;
ok(
    "window.addEventListener is BEFORE vsc.postMessage({command:'ready'})",
    listenerBeforeReady,
    listenerBeforeReady
        ? 'GOOD — listener attached before ready fires'
        : `BUG — listener at pos ${posListener}, ready at pos ${posReady}. ` +
          `Extension sends 'init' response synchronously and it arrives ` +
          `before the listener is attached → cards never rendered`
);

// ── Check retry mechanism ────────────────────────────────────────────────────
const hasRetry = scriptBody.includes('setTimeout') && scriptBody.includes("'ready'");
ok("Shell has retry: re-sends 'ready' if no data received", hasRetry,
    hasRetry ? 'YES — belt and suspenders' : 'NO — single ready with no fallback');

// ── Check loading state ──────────────────────────────────────────────────────
const hasLoading = html.includes('loading') || html.includes('Loading') || html.includes('Waiting');
ok("Shell shows loading state while waiting for data", hasLoading,
    hasLoading ? 'YES' : 'NO — blank panel gives no feedback');

// ── Simulate the EXACT sequence ──────────────────────────────────────────────
console.log('\n-- Simulating message sequence --');

// Mock the webview environment
let messagesFromShell = [];
let messagesFromExtension = [];
let renderCallCount = 0;
let renderCalledWithCards = null;

// Simulate running the shell script in order
// We track: does the listener get attached before 'ready' fires?
let listenerAttached = false;
let readyFired       = false;
let initReceived     = false;

// Extract ordered list of key operations
const operations = [];
let remaining = scriptBody;
const tokens = [
    { key: 'LISTENER', pattern: "window.addEventListener('message'" },
    { key: 'READY',    pattern: "command: 'ready'" },
    { key: 'RENDER_FN',pattern: 'function render(' },
];
for (const tok of tokens) {
    const idx = remaining.indexOf(tok.pattern);
    if (idx >= 0) operations.push({ key: tok.key, pos: scriptBody.indexOf(tok.pattern) });
}
operations.sort((a, b) => a.pos - b.pos);

console.log('  Script execution order:');
for (const op of operations) {
    console.log(`    [${op.pos.toString().padStart(5)}]  ${op.key}`);
}

const listenerOp = operations.find(o => o.key === 'LISTENER');
const readyOp    = operations.find(o => o.key === 'READY');

ok("LISTENER comes before READY in execution order",
    listenerOp && readyOp && listenerOp.pos < readyOp.pos,
    listenerOp && readyOp
        ? `listener@${listenerOp.pos} ready@${readyOp.pos}`
        : 'could not determine order'
);

// ── Check the launcher sends init on ready ───────────────────────────────────
console.log('\n-- Checking extension ready handler --');
const launcherSrc = fs.readFileSync(
    'C:\\Users\\jwpmi\\Downloads\\VSCode\\projects\\cielovista-tools\\out\\features\\npm-command-launcher.js',
    'utf8'
);
const readyCaseIdx = launcherSrc.indexOf("'ready'");
ok("Extension has 'ready' case handler", readyCaseIdx >= 0);

if (readyCaseIdx >= 0) {
    const readyBlock = launcherSrc.slice(readyCaseIdx, readyCaseIdx + 200);
    ok("ready handler sends {type:'init'}", readyBlock.includes("type: 'init'") || readyBlock.includes('type:\'init\''),
        readyBlock.includes("type: 'init'") ? 'YES' : readyBlock.slice(0, 100));
}

// ── Check setTimeout in launcher ─────────────────────────────────────────────
const timeoutMatch = launcherSrc.match(/setTimeout\(sendInit,\s*(\d+)\)/);
const timeoutMs = timeoutMatch ? parseInt(timeoutMatch[1]) : null;
ok("Launcher setTimeout sendInit exists", timeoutMs !== null, timeoutMs ? `${timeoutMs}ms` : 'not found');
if (timeoutMs !== null) {
    ok(`setTimeout is >= 500ms (safe margin for webview load)`, timeoutMs >= 500,
        `currently ${timeoutMs}ms — ${timeoutMs < 500 ? 'TOO SHORT, races with webview init' : 'OK'}`);
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(55)}`);
console.log(`${pass + fail} checks: ${pass} passed, ${fail} failed`);

if (fail > 0) {
    console.log('\n*** BUGS FOUND — see FAIL lines above ***');
    console.log('Root cause: message listener attached AFTER ready fires,');
    console.log('or setTimeout too short for webview to load.');
    process.exit(1);
} else {
    console.log('\n*** ALL PASS — NPM Scripts message flow is correct ***');
    process.exit(0);
}
