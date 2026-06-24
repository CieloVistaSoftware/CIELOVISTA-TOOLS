// Copyright (c) 2026 CieloVista Software. All rights reserved.
// REG-113: Issue #602 — corequisite-checker must not report a just-installed
// extension as "missing".
//
// Root cause: vscode.extensions.getExtension(id) does not see a freshly
// installed extension until the window reloads. The checker read the live
// registry only, so the startup background check ran a few seconds after a
// successful install and reported the extension as `missing` — a false
// positive that auto-filed an APP_ERROR and drove a re-install loop.
//
// Fix: decideStatus() also accepts an on-disk version (scanned from the
// extensions folder). An extension present on disk but absent from the live
// registry is `pending-reload`, not `missing`.
//
// This test exercises the REAL compiled module (out/shared/corequisite-logic.js)
// with injected data — no VS Code, no filesystem. It self-heals by recompiling
// when the artifact is missing or stale.

'use strict';

const fs      = require('fs');
const path    = require('path');
const assert  = require('assert');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const SRC  = path.join(ROOT, 'src', 'shared', 'corequisite-logic.ts');
const OUT  = path.join(ROOT, 'out', 'shared', 'corequisite-logic.js');

// ── Ensure the compiled module is present and fresh ──────────────────────────
function ensureCompiled() {
    const needsBuild =
        !fs.existsSync(OUT) ||
        fs.statSync(SRC).mtimeMs > fs.statSync(OUT).mtimeMs;
    if (needsBuild) {
        execSync(`node "${path.join(ROOT, 'esbuild.mjs')}"`, { cwd: ROOT, stdio: 'pipe' });
    }
}
ensureCompiled();

const logic = require(OUT);
const { decideStatus, installedVersionFromDirNames, compareVersions } = logic;

let passed = 0;
let failed = 0;

function test(name, fn) {
    try   { fn(); console.log(`  PASS ${name}`); passed++; }
    catch (e) { console.error(`  FAIL ${name}\n       ${e.message}`); failed++; }
}

console.log('REG-113: corequisite-checker — on-disk extension is pending-reload, not missing (#602)');
console.log('-'.repeat(70));

const spec = { minVersion: '1.0.0', displayName: 'Claude Chat' };

// ── The #602 regression itself ───────────────────────────────────────────────
test('on disk but absent from live registry -> pending-reload (NOT missing)', () => {
    const d = decideStatus({ spec, registryPresent: false, registryVersion: undefined, diskVersion: '1.0.0' });
    assert.strictEqual(d.status, 'pending-reload',
        `just-installed extension must be pending-reload, got '${d.status}'`);
    assert.strictEqual(d.installedVersion, '1.0.0');
});

test('absent from registry AND absent from disk -> missing', () => {
    const d = decideStatus({ spec, registryPresent: false, registryVersion: undefined, diskVersion: undefined });
    assert.strictEqual(d.status, 'missing');
});

test('present in registry, meets minVersion -> ok', () => {
    const d = decideStatus({ spec, registryPresent: true, registryVersion: '1.2.0', diskVersion: undefined });
    assert.strictEqual(d.status, 'ok');
    assert.strictEqual(d.installedVersion, '1.2.0');
});

test('present in registry, below minVersion -> outdated', () => {
    const d = decideStatus({ spec, registryPresent: true, registryVersion: '0.9.0', diskVersion: undefined });
    assert.strictEqual(d.status, 'outdated');
});

test('on disk but below minVersion -> outdated (not pending-reload)', () => {
    const d = decideStatus({ spec, registryPresent: false, registryVersion: undefined, diskVersion: '0.9.0' });
    assert.strictEqual(d.status, 'outdated');
});

test('present in registry but version unreadable -> unknown-version', () => {
    const d = decideStatus({ spec, registryPresent: true, registryVersion: undefined, diskVersion: undefined });
    assert.strictEqual(d.status, 'unknown-version');
});

test('live registry is authoritative over disk when both present', () => {
    // Registry says 1.2.0 (ok); disk says 0.5.0. Registry wins.
    const d = decideStatus({ spec, registryPresent: true, registryVersion: '1.2.0', diskVersion: '0.5.0' });
    assert.strictEqual(d.status, 'ok');
    assert.strictEqual(d.installedVersion, '1.2.0');
});

test('no minVersion requirement: on disk -> pending-reload', () => {
    const d = decideStatus({ spec: { displayName: 'X' }, registryPresent: false, diskVersion: '0.0.1' });
    assert.strictEqual(d.status, 'pending-reload');
});

// ── installedVersionFromDirNames ─────────────────────────────────────────────
test('finds installed version from extension dir names', () => {
    const dirs = [
        'ms-python.python-2026.4.0',
        'cielovistasoftware.vscode-claude-1.0.0',
        'cielovistasoftware.cielovista-tools-1.0.2',
    ];
    assert.strictEqual(installedVersionFromDirNames('cielovistasoftware.vscode-claude', dirs), '1.0.0');
});

test('picks the highest version when multiple are present', () => {
    const dirs = [
        'cielovistasoftware.vscode-claude-1.0.0',
        'cielovistasoftware.vscode-claude-1.2.0',
        'cielovistasoftware.vscode-claude-1.0.5',
    ];
    assert.strictEqual(installedVersionFromDirNames('cielovistasoftware.vscode-claude', dirs), '1.2.0');
});

test('does not match a different id that shares a prefix', () => {
    const dirs = ['cielovistasoftware.vscode-claude-extra-1.0.0'];
    assert.strictEqual(installedVersionFromDirNames('cielovistasoftware.vscode-claude', dirs), undefined);
});

test('returns undefined when nothing matches', () => {
    assert.strictEqual(installedVersionFromDirNames('foo.bar', ['baz.qux-1.0.0']), undefined);
});

test('match is case-insensitive (Windows extension folders)', () => {
    const dirs = ['CieloVistaSoftware.VSCode-Claude-1.0.0'];
    assert.strictEqual(installedVersionFromDirNames('cielovistasoftware.vscode-claude', dirs), '1.0.0');
});

test('compareVersions orders correctly', () => {
    assert.ok(compareVersions('1.2.0', '1.0.0') > 0);
    assert.ok(compareVersions('1.0.0', '1.0.1') < 0);
    assert.strictEqual(compareVersions('1.0.0', '1.0.0'), 0);
});

console.log('-'.repeat(70));
if (failed === 0) {
    console.log(`✓ REG-113 passed (${passed} checks).\n`);
    process.exit(0);
}
console.error(`✗ REG-113 FAILED (${failed} of ${passed + failed} checks failed).\n`);
process.exit(1);
