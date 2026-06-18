// Copyright (c) 2026 CieloVista Software. All rights reserved.
// REG-117: Issue #592 — corequisite-checker "Failed to install Claude Chat".
//
// Root cause: installViaCli ran cp.spawnSync(bin, args, { shell: true }). With
// shell:true Node does NOT quote the command, so cmd.exe receives the bare
// binary path. The real code-insiders shim lives at
//   C:\Users\<user>\AppData\Local\Programs\Microsoft VS Code Insiders\bin\code-insiders.cmd
// which contains spaces, so cmd.exe split it at the first space and reported
//   "'...\Microsoft' is not recognized as an internal or external command"
// — surfaced to the user as "Failed to install Claude Chat". The old code
// comment claimed shell:true AVOIDS the spaces problem; it is exactly backwards.
//
// Fix: shared/install-command.ts builds the spawnSync inputs. When a shell is
// required (Windows .cmd/.bat), it emits a single, fully-quoted command line so
// a spaced binary path survives cmd.exe parsing.
//
// This test exercises the REAL compiled module (out/shared/install-command.js)
// with injected data — no VS Code, no spawning. It self-heals by recompiling
// when the artifact is missing or stale.

'use strict';

const fs   = require('fs');
const path = require('path');
const assert = require('assert');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const SRC  = path.join(ROOT, 'src', 'shared', 'install-command.ts');
const OUT  = path.join(ROOT, 'out', 'shared', 'install-command.js');

// ── Ensure the compiled module is present and fresh ──────────────────────────
function ensureCompiled() {
    const needsBuild =
        !fs.existsSync(OUT) ||
        !fs.existsSync(SRC) ||
        fs.statSync(SRC).mtimeMs > fs.statSync(OUT).mtimeMs;
    if (needsBuild) {
        execSync(`node "${path.join(ROOT, 'esbuild.mjs')}"`, { cwd: ROOT, stdio: 'pipe' });
    }
}
ensureCompiled();

const mod = require(OUT);
const { buildInstallCommand, shellQuote } = mod;

let passed = 0;
let failed = 0;

function test(name, fn) {
    try   { fn(); console.log(`  PASS ${name}`); passed++; }
    catch (e) { console.error(`  FAIL ${name}\n       ${e.message}`); failed++; }
}

console.log('REG-117: corequisite-checker — install command quotes a spaced .cmd path (#592)');
console.log('-'.repeat(70));

const SPACED_CMD = 'C:\\Users\\jwpmi\\AppData\\Local\\Programs\\Microsoft VS Code Insiders\\bin\\code-insiders.cmd';
const SPACED_VSIX = 'C:\\Users\\jwpmi\\Downloads\\My Extensions\\claude-chat.vsix';

// ── The #592 regression itself ───────────────────────────────────────────────
test('spaced .cmd on win32 -> command line wraps the binary in quotes', () => {
    const r = buildInstallCommand(SPACED_CMD, SPACED_VSIX, 'win32');
    assert.strictEqual(r.shell, true, 'a .cmd shim must run through a shell');
    assert.ok(r.command.includes(`"${SPACED_CMD}"`),
        `binary must be quoted so cmd.exe does not split it at the space — got: ${r.command}`);
});

test('spaced .cmd on win32 -> command line wraps the vsix path in quotes', () => {
    const r = buildInstallCommand(SPACED_CMD, SPACED_VSIX, 'win32');
    assert.ok(r.command.includes(`"${SPACED_VSIX}"`),
        `vsix path must be quoted — got: ${r.command}`);
});

test('the spaced binary is NEVER emitted unquoted (the exact #592 failure)', () => {
    const r = buildInstallCommand(SPACED_CMD, SPACED_VSIX, 'win32');
    // The bug: the bare token "...\Microsoft VS Code Insiders\..." reaching the
    // shell. Assert the unquoted path is not present as a free-standing token.
    assert.ok(!r.command.includes(`${SPACED_CMD} `) && !r.command.endsWith(SPACED_CMD),
        `binary path must not appear unquoted — got: ${r.command}`);
});

test('when shell is used the args array is empty (command carries the line)', () => {
    const r = buildInstallCommand(SPACED_CMD, SPACED_VSIX, 'win32');
    assert.deepStrictEqual(r.args, []);
});

test('--install-extension flag is present and left unquoted', () => {
    const r = buildInstallCommand(SPACED_CMD, SPACED_VSIX, 'win32');
    assert.ok(/(^|\s)--install-extension(\s)/.test(r.command),
        `flag must be a bare token — got: ${r.command}`);
});

// ── Non-shell paths (bare exe / non-Windows) keep the argv form ──────────────
test('non-.cmd binary on win32 -> no shell, argv form preserved', () => {
    const r = buildInstallCommand('code-insiders', SPACED_VSIX, 'win32');
    assert.strictEqual(r.shell, false);
    assert.strictEqual(r.command, 'code-insiders');
    assert.deepStrictEqual(r.args, ['--install-extension', SPACED_VSIX]);
});

test('non-Windows .cmd-looking name -> no shell (shell quoting is Windows-only)', () => {
    const r = buildInstallCommand('/usr/bin/weird.cmd', '/tmp/a b.vsix', 'linux');
    assert.strictEqual(r.shell, false);
    assert.deepStrictEqual(r.args, ['--install-extension', '/tmp/a b.vsix']);
});

test('.bat shim is treated the same as .cmd', () => {
    const r = buildInstallCommand('C:\\Program Files\\x\\code.bat', SPACED_VSIX, 'win32');
    assert.strictEqual(r.shell, true);
    assert.ok(r.command.includes('"C:\\Program Files\\x\\code.bat"'));
});

// ── shellQuote helper ────────────────────────────────────────────────────────
test('shellQuote wraps a plain token in double quotes', () => {
    assert.strictEqual(shellQuote('a b'), '"a b"');
});

test('shellQuote escapes embedded double quotes', () => {
    assert.strictEqual(shellQuote('a"b'), '"a""b"');
});

console.log('-'.repeat(70));
if (failed === 0) {
    console.log(`✓ REG-117 passed (${passed} checks).\n`);
    process.exit(0);
}
console.error(`✗ REG-117 FAILED (${failed} of ${passed + failed} checks failed).\n`);
process.exit(1);
