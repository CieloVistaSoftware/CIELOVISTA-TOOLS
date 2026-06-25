/**
 * REG-116-mcp-bundled-node-launch.test.js
 *
 * Regression test for #615 — MCP server crashes on startup with
 * STATUS_DLL_INIT_FAILED (0xC0000142) on Windows.
 *
 * Root cause: the supervisor spawned the server with spawn('node', …), which
 * delegates binary resolution to the system PATH. On Windows the resolved
 * node.exe can be the wrong ABI or an antivirus-wrapped shim whose DLL import
 * table fails to initialize, crashing before any application code runs (empty
 * stdout/stderr, OS-level NTSTATUS exit code), intermittently.
 *
 * The fix: launch via VS Code's own bundled Node — process.execPath with
 * ELECTRON_RUN_AS_NODE=1 — removing the PATH dependency and guaranteeing a
 * matching ABI. windowsHide is also set to avoid console/desktop-heap pressure
 * during rapid restarts (a known 0xC0000142 trigger).
 *
 * Checks (source-level):
 *   1. resolveNodeLauncher() exists and is the spawn command source
 *   2. The launcher prefers process.execPath
 *   3. ELECTRON_RUN_AS_NODE=1 is set on the launch env
 *   4. spawn() no longer hardcodes the literal 'node' binary
 *   5. spawn() passes windowsHide: true
 *   6. resolveNodeLauncher is exported on _test for unit testability
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT   = path.resolve(__dirname, '..', '..');
const MCP_TS = path.join(ROOT, 'src', 'features', 'mcp-server-status.ts');

let failed = 0;
const fail = (msg) => { console.error('FAIL: ' + msg); failed++; };
const ok   = (msg) => { console.log('PASS: ' + msg); };

if (!fs.existsSync(MCP_TS)) {
    console.error('FATAL: mcp-server-status.ts not found at ' + MCP_TS);
    process.exit(1);
}

const src = fs.readFileSync(MCP_TS, 'utf8');

// ─── Check 1: resolveNodeLauncher exists ─────────────────────────────────────

(function checkLauncherDefined() {
    if (!/function\s+resolveNodeLauncher\s*\(/.test(src)) {
        fail('resolveNodeLauncher() not found — node binary resolution is not centralized');
        return;
    }
    ok('resolveNodeLauncher() is defined');
})();

// ─── Check 2: prefers process.execPath ───────────────────────────────────────

(function checkUsesExecPath() {
    if (!/process\.execPath/.test(src)) {
        fail('launcher does not reference process.execPath — still depends on a PATH-resolved node.exe (#615)');
        return;
    }
    ok('launcher prefers process.execPath (VS Code bundled Node)');
})();

// ─── Check 3: ELECTRON_RUN_AS_NODE is set ────────────────────────────────────

(function checkElectronRunAsNode() {
    if (!/ELECTRON_RUN_AS_NODE\s*:\s*['"]1['"]/.test(src)) {
        fail('ELECTRON_RUN_AS_NODE=1 is not set — the Electron host binary will not run as a plain Node interpreter');
        return;
    }
    ok('ELECTRON_RUN_AS_NODE=1 is set on the launch env');
})();

// ─── Check 4: spawn uses the resolved launcher command ───────────────────────

(function checkSpawnUsesResolvedCommand() {
    // The live spawn must use the resolved command variable, not a hardcoded
    // literal. (We assert the positive form so the historical 'node' string in
    // the explanatory doc comment doesn't produce a false negative.)
    if (!/spawn\(\s*command\s*,/.test(src)) {
        fail('spawn() does not use the resolved launcher command — PATH-resolved node.exe remains the failure source (#615)');
        return;
    }
    ok('spawn() uses the resolved launcher command (not a hardcoded binary)');
})();

// ─── Check 5: windowsHide is set on spawn ────────────────────────────────────

(function checkWindowsHide() {
    if (!/windowsHide\s*:\s*true/.test(src)) {
        fail('spawn() does not pass windowsHide: true — rapid console-subsystem spawns can trigger 0xC0000142');
        return;
    }
    ok('spawn() passes windowsHide: true');
})();

// ─── Check 6: resolveNodeLauncher exported on _test ──────────────────────────

(function checkTestExport() {
    if (!/resolveNodeLauncher,/.test(src)) {
        fail('resolveNodeLauncher is not exported on _test — unit tests cannot verify launcher behavior');
        return;
    }
    ok('resolveNodeLauncher is exported on _test for testability');
})();

// ─── Result ──────────────────────────────────────────────────────────────────

console.log('');
if (failed === 0) {
    console.log('REG-116 PASSED — MCP server launches via VS Code bundled Node (#615)');
    process.exit(0);
} else {
    console.error('REG-116 FAILED — ' + failed + ' check' + (failed > 1 ? 's' : '') + ' failed');
    process.exit(1);
}
