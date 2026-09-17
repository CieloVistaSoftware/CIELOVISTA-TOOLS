/**
 * REG-137-mcp-bundled-node-launch.test.js
 *
 * Regression test for #615 — the MCP server crashes on startup with
 * STATUS_DLL_INIT_FAILED (0xC0000142) on Windows.
 *
 * Root cause: the supervisor spawned the server with spawn('node', …), which
 * delegates binary resolution to the system PATH. On Windows the resolved
 * node.exe can be the wrong ABI or an antivirus-wrapped shim whose DLL import
 * table fails to initialize, crashing before any application code runs — empty
 * stdout/stderr, an OS-level NTSTATUS exit code, and intermittent because the
 * loader failure is a race in the OS/AV layer rather than in our code.
 *
 * The fix: launch via VS Code's own bundled Node — process.execPath with
 * ELECTRON_RUN_AS_NODE=1 — removing the PATH dependency and guaranteeing a
 * matching ABI. windowsHide is also set, because rapid restarts of console
 * subsystem processes exhaust the desktop heap, a known 0xC0000142 trigger.
 *
 * The checks are source-level on purpose. The failure only reproduces on a
 * Windows host whose PATH node.exe is broken, which is not a condition a test
 * can create; what a test CAN hold is the property that removed the failure —
 * that no PATH lookup is performed at all.
 *
 * Checks:
 *   1. resolveNodeLauncher() exists — binary resolution is in one place
 *   2. the launcher prefers process.execPath
 *   3. ELECTRON_RUN_AS_NODE=1 is set on the launch env
 *   4. spawn() uses the resolved command, not a hardcoded binary
 *   5. spawn() passes windowsHide: true
 *   6. resolveNodeLauncher is exported on _test for unit testability
 *   7. the crash log records which binary was used
 *
 * Run: node tests/regression/REG-137-mcp-bundled-node-launch.test.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT   = path.resolve(__dirname, '..', '..');
const MCP_TS    = path.join(ROOT, 'src', 'features', 'mcp-server-status.ts');
// The launcher moved to src/shared/ when a second and third feature needed it (#723).
const LAUNCH_TS = path.join(ROOT, 'src', 'shared', 'node-launcher.ts');

let failed = 0;
let passed = 0;
const fail = (msg) => { console.error('  FAIL: ' + msg); failed++; };
const ok   = (msg) => { console.log('  PASS: ' + msg); passed++; };

console.log('\nREG-137: the MCP server launches via VS Code bundled Node (#615)\n');

if (!fs.existsSync(MCP_TS)) {
    console.error('FATAL: mcp-server-status.ts not found at ' + MCP_TS);
    process.exit(1);
}

const src    = fs.readFileSync(MCP_TS, 'utf8');
const launch = fs.existsSync(LAUNCH_TS) ? fs.readFileSync(LAUNCH_TS, 'utf8') : '';

// ─── 1: resolveNodeLauncher exists ───────────────────────────────────────────

if (!/function\s+resolveNodeLauncher\s*\(/.test(launch)) {
    fail('resolveNodeLauncher() not found in src/shared/node-launcher.ts — node binary resolution is not centralized (#723)');
} else {
    ok('resolveNodeLauncher() is defined in src/shared/node-launcher.ts');
}

// ─── 2: prefers process.execPath ─────────────────────────────────────────────

if (!/process\.execPath/.test(launch)) {
    fail('launcher does not reference process.execPath — still depends on a PATH-resolved node.exe (#615)');
} else {
    ok('launcher prefers process.execPath (VS Code bundled Node)');
}

// ─── 3: ELECTRON_RUN_AS_NODE is set ──────────────────────────────────────────

if (!/ELECTRON_RUN_AS_NODE\s*:\s*['"]1['"]/.test(launch)) {
    fail('ELECTRON_RUN_AS_NODE=1 is not set — the Electron host binary will not run as a plain Node interpreter');
} else {
    ok('ELECTRON_RUN_AS_NODE=1 is set on the launch env');
}

// ─── 4: spawn uses the resolved launcher command ─────────────────────────────

// Assert the positive form so the historical 'node' string quoted in the
// explanatory doc comment cannot produce a false negative.
if (!/spawn\(\s*command\s*,/.test(src)) {
    fail('spawn() does not use the resolved launcher command — a PATH-resolved node.exe remains the failure source (#615)');
} else {
    ok('spawn() uses the resolved launcher command, not a hardcoded binary');
}

// ─── 5: windowsHide is set on spawn ──────────────────────────────────────────

if (!/windowsHide\s*:\s*true/.test(src)) {
    fail('spawn() does not pass windowsHide: true — rapid console-subsystem spawns can trigger 0xC0000142');
} else {
    ok('spawn() passes windowsHide: true');
}

// ─── 6: resolveNodeLauncher exported on _test ────────────────────────────────

if (!/import\s*\{[^}]*resolveNodeLauncher[^}]*\}\s*from\s*['"]\.\.\/shared\/node-launcher['"]/.test(src)) {
    fail('mcp-server-status.ts does not import the shared launcher — a second copy has been reintroduced (#723)');
} else if (!/_test\s*=\s*\{[^}]*\bresolveNodeLauncher\b/s.test(src)) {
    fail('resolveNodeLauncher is not exported on _test — unit tests cannot verify launcher behavior');
} else {
    ok('the feature imports the shared launcher and re-exports it on _test');
}

// ─── 7: the crash log names the binary that was used ─────────────────────────

// Without this the next 0xC0000142 report is as undiagnosable as the first
// one was: the original crash logs recorded nodeArgs but never nodePath, so
// there was no way to tell which node.exe had actually been loaded.
if (!/nodePath=\$\{/.test(src)) {
    fail('crash diagnostics do not record nodePath — a future launcher failure cannot be attributed to a binary');
} else {
    ok('crash diagnostics record nodePath');
}

// ─── Result ──────────────────────────────────────────────────────────────────

console.log('');
if (failed === 0) {
    console.log(`✓ All ${passed} REG-137 tests passed\n`);
    process.exit(0);
} else {
    console.error(`\n✗ ${failed} REG-137 test(s) FAILED\n`);
    process.exit(1);
}
