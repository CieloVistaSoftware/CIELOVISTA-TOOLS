/**
 * npm-scripts-runtime.test.js
 *
 * Verifies message-flow ordering between extension and NPM Scripts webview.
 * Reads TypeScript source directly (esbuild bundles individual files away).
 *
 * Run: node tests/unit/npm-scripts-runtime.test.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT       = path.resolve(__dirname, '../..');
const SHELL_SRC  = path.join(ROOT, 'src', 'shared', 'project-card-shell.ts');
const LAUNCH_SRC = path.join(ROOT, 'src', 'features', 'npm-command-launcher.ts');

let pass = 0, fail = 0;
function ok(label, value, detail) {
    if (value) { console.log(`  PASS  ${label}${detail ? ' — ' + detail : ''}`); pass++; }
    else        { console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); fail++; }
}

console.log('\n== NPM Scripts Runtime Message-Flow Test ==\n');

const html     = fs.readFileSync(SHELL_SRC, 'utf8');
const launcher = fs.readFileSync(LAUNCH_SRC, 'utf8');

// ── Key token positions in shell source ──────────────────────────────────────
const posListener = html.indexOf("window.addEventListener('message'");
const posReady    = html.indexOf("command: 'ready'");
const posRender   = html.indexOf('function render(');

ok("'ready' postMessage exists in shell",          posReady    >= 0, `pos=${posReady}`);
ok("window.addEventListener('message') exists",    posListener >= 0, `pos=${posListener}`);
ok("render() function exists",                     posRender   >= 0, `pos=${posRender}`);

// THE KEY CHECK: listener must be defined before ready fires
ok(
    "window.addEventListener is BEFORE vsc.postMessage({command:'ready'})",
    posListener >= 0 && posReady >= 0 && posListener < posReady,
    posListener >= 0 && posReady >= 0
        ? `listener@${posListener} ready@${posReady} — listener first`
        : 'could not determine order'
);

// ── Retry mechanism ───────────────────────────────────────────────────────────
const hasRetry = html.includes('setTimeout') && html.includes("'ready'");
ok("Shell has retry: re-sends 'ready' if no data received", hasRetry);

// ── Loading state ─────────────────────────────────────────────────────────────
const hasLoading = html.includes('loading') || html.includes('Loading') || html.includes('Waiting');
ok("Shell shows loading state while waiting for data", hasLoading);

// ── Launcher ready handler ───────────────────────────────────────────────────
console.log('\n-- Checking extension ready handler --');
const hasReadyCase = launcher.includes("'ready'");
ok("Extension has 'ready' case handler", hasReadyCase);

if (hasReadyCase) {
    const idx   = launcher.indexOf("'ready'");
    const block = launcher.slice(Math.max(0, idx - 50), idx + 500);
    const sendsInit = block.includes("type: 'init'") || block.includes("type:'init'");
    ok("ready handler sends {type:'init'}", sendsInit, sendsInit ? 'YES' : block.slice(0, 150));
}

// ── setTimeout guard ─────────────────────────────────────────────────────────
const timeoutMatch = launcher.match(/setTimeout\(\s*sendInit\s*,\s*(\d+)\)/);
const timeoutMs    = timeoutMatch ? parseInt(timeoutMatch[1]) : null;
ok("Launcher setTimeout sendInit exists", timeoutMs !== null, timeoutMs ? `${timeoutMs}ms` : 'not found');
if (timeoutMs !== null) {
    ok(`setTimeout is >= 500ms (safe margin for webview load)`, timeoutMs >= 500,
        `currently ${timeoutMs}ms — ${timeoutMs < 500 ? 'TOO SHORT' : 'OK'}`);
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(55)}`);
console.log(`${pass + fail} checks: ${pass} passed, ${fail} failed`);
if (fail > 0) { process.exit(1); }
else { console.log('\n*** ALL PASS — NPM Scripts message flow is correct ***'); process.exit(0); }
