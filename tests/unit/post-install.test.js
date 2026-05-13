'use strict';
/**
 * tests/unit/post-install.test.js
 *
 * Post-install delivery check.
 * Runs AFTER node install.js. Inspects the installed extension directory and
 * confirms every item from the pick was delivered intact on disk.
 * A failure here means install.js copied incomplete files.
 *
 * Run: node tests/unit/post-install.test.js
 */

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');

const pkg    = require('../../package.json');
const extId  = `${pkg.publisher.toLowerCase()}.${pkg.name}`;
const INST   = path.join(os.homedir(), '.vscode-insiders', 'extensions', `${extId}-${pkg.version}`);

let passed = 0, failed = 0;

function test(name, fn) {
    try { fn(); console.log(`  PASS ${name}`); passed++; }
    catch (e) { console.error(`  FAIL ${name}\n       → ${e.message}`); failed++; }
}

function exists(rel)   { return fs.existsSync(path.join(INST, rel)); }
function size(rel)     { try { return fs.statSync(path.join(INST, rel)).size; } catch { return 0; } }
function dirCount(rel) {
    const d = path.join(INST, rel);
    try { return fs.readdirSync(d).filter(f => fs.statSync(path.join(d, f)).isFile()).length; }
    catch { return 0; }
}

console.log(`\nPost-install delivery check — v${pkg.version}\n` + '─'.repeat(60));
console.log(`Install root: ${INST}\n`);

if (!fs.existsSync(INST)) {
    console.error(`FAIL: Installed extension directory not found:\n  ${INST}`);
    process.exit(1);
}

// ── Extension bundle ──────────────────────────────────────────────────────────
console.log('[1] Extension bundle');

test('out/extension.js delivered', () => {
    assert.ok(exists('out/extension.js'), 'out/extension.js missing from installed extension');
});
test('out/extension.js > 500 KB', () => {
    const s = size('out/extension.js');
    assert.ok(s > 500_000, `out/extension.js is only ${s} bytes — bundle looks incomplete`);
});

// ── Static HTML assets ────────────────────────────────────────────────────────
console.log('\n[2] Static HTML assets');

test('out/catalog.html delivered', () => {
    assert.ok(exists('out/catalog.html'),
        'out/catalog.html missing — Doc Catalog will show error panel on open');
});
test('out/catalog.html > 10 KB', () => {
    const s = size('out/catalog.html');
    assert.ok(s > 10_000, `out/catalog.html is only ${s} bytes — file looks empty`);
});
test('out/features/doc-catalog/catalog.html NOT present (wrong path)', () => {
    assert.ok(!exists('out/features/doc-catalog/catalog.html'),
        'Wrong-path copy installed — catalog.html must be at out/catalog.html');
});

// ── CommandHelp markdown files ─────────────────────────────────────────────────
console.log('\n[3] CommandHelp markdown files');

test('out/features/CommandHelp/ delivered', () => {
    assert.ok(exists('out/features/CommandHelp'), 'out/features/CommandHelp/ missing from installed extension');
});
test('out/features/CommandHelp/ has ≥ 2 files', () => {
    const n = dirCount('out/features/CommandHelp');
    assert.ok(n >= 2, `Only ${n} CommandHelp files delivered — expected at least 2 (README files)`);
});

// ── MCP server bundle ─────────────────────────────────────────────────────────
console.log('\n[4] MCP server bundle');

test('mcp-server/dist/index.js delivered', () => {
    assert.ok(exists('mcp-server/dist/index.js'), 'mcp-server/dist/index.js missing from installed extension');
});
test('mcp-server/dist/index.js > 100 KB', () => {
    const s = size('mcp-server/dist/index.js');
    assert.ok(s > 100_000, `mcp-server/dist/index.js is only ${s} bytes — MCP server looks incomplete`);
});
test('mcp-server/dist/tools/catalog-helpers.js delivered', () => {
    assert.ok(exists('mcp-server/dist/tools/catalog-helpers.js'), 'catalog-helpers.js missing from installed extension');
});
test('mcp-server/package.json delivered (ESM type declaration)', () => {
    assert.ok(exists('mcp-server/package.json'), 'mcp-server/package.json missing — MCP server will fail to load');
});

// ── Extension metadata ────────────────────────────────────────────────────────
console.log('\n[5] Extension metadata');

test('package.json delivered', () => {
    assert.ok(exists('package.json'), 'package.json missing from installed extension');
});
test('package.json version matches', () => {
    const installed = JSON.parse(fs.readFileSync(path.join(INST, 'package.json'), 'utf8'));
    assert.strictEqual(installed.version, pkg.version,
        `Installed version ${installed.version} does not match expected ${pkg.version}`);
});
test('icon.png delivered', () => {
    assert.ok(exists('icon.png'), 'icon.png missing from installed extension');
});

// ── Must NOT be present ───────────────────────────────────────────────────────
console.log('\n[6] Excluded items (must not be installed)');

test('node_modules NOT installed (deps inlined by esbuild)', () => {
    assert.ok(!exists('node_modules'), 'node_modules present in installed extension — VSIX is bloated');
});
test('src/ NOT installed (TypeScript source not needed at runtime)', () => {
    assert.ok(!exists('src'), 'src/ TypeScript source present in installed extension');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(60));
console.log(`${passed + failed} items: ${passed} delivered, ${failed} missing`);
if (failed > 0) {
    console.error('\nDelivery incomplete — installed extension is missing required files.');
    process.exit(1);
}
console.log('Delivery complete — all items present in installed extension.');
