'use strict';
/**
 * tests/unit/pick-list.test.js
 *
 * The Pick — pre-package checklist.
 * Runs BEFORE vsce package. Verifies every required file is staged in out/
 * and mcp-server/dist/ before the VSIX is built.
 * If anything is missing here, the package step is aborted.
 *
 * Run: node tests/unit/pick-list.test.js
 */

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');

const ROOT = path.join(__dirname, '../..');

let passed = 0, failed = 0;

function test(name, fn) {
    try { fn(); console.log(`  PASS ${name}`); passed++; }
    catch (e) { console.error(`  FAIL ${name}\n       → ${e.message}`); failed++; }
}

function exists(rel)   { return fs.existsSync(path.join(ROOT, rel)); }
function size(rel)     { try { return fs.statSync(path.join(ROOT, rel)).size; } catch { return 0; } }
function dirCount(rel) {
    const d = path.join(ROOT, rel);
    try { return fs.readdirSync(d).filter(f => fs.statSync(path.join(d, f)).isFile()).length; }
    catch { return 0; }
}

console.log('\nThe Pick — pre-package checklist\n' + '─'.repeat(60));

// ── Extension bundle ──────────────────────────────────────────────────────────
console.log('\n[1] Extension bundle');

test('out/extension.js', () => {
    assert.ok(exists('out/extension.js'), 'Missing — run npm run compile');
});
test('out/extension.js > 500 KB', () => {
    const s = size('out/extension.js');
    assert.ok(s > 500_000, `Only ${s} bytes — bundle looks incomplete`);
});

// ── Static HTML ───────────────────────────────────────────────────────────────
console.log('\n[2] Static HTML assets');

test('out/catalog.html', () => {
    assert.ok(exists('out/catalog.html'),
        'Missing — run npm run copy:commandhelp.\n' +
        '       NOTE: must be out/catalog.html (not out/features/doc-catalog/catalog.html);\n' +
        '       __dirname in the esbuild bundle resolves to out/');
});
test('out/catalog.html > 10 KB', () => {
    const s = size('out/catalog.html');
    assert.ok(s > 10_000, `Only ${s} bytes — file looks empty or truncated`);
});
test('out/features/doc-catalog/catalog.html must NOT exist (old pre-esbuild path)', () => {
    assert.ok(!exists('out/features/doc-catalog/catalog.html'),
        'Wrong-path copy found — catalog.html belongs at out/catalog.html');
});

// ── CommandHelp markdown files ─────────────────────────────────────────────────
console.log('\n[3] CommandHelp markdown files');

test('out/features/CommandHelp/ exists', () => {
    assert.ok(exists('out/features/CommandHelp'), 'Missing — run npm run copy:commandhelp');
});
test('out/features/CommandHelp/ has ≥ 2 files', () => {
    const n = dirCount('out/features/CommandHelp');
    assert.ok(n >= 2, `Only ${n} files — expected at least 2 (README files)`);
});
test('out/features/CommandHelp/ count matches src/features/CommandHelp/', () => {
    const srcN = dirCount('src/features/CommandHelp');
    const outN = dirCount('out/features/CommandHelp');
    assert.strictEqual(outN, srcN, `src has ${srcN} files but out has ${outN} — copy is incomplete`);
});

// ── MCP server bundle ─────────────────────────────────────────────────────────
console.log('\n[4] MCP server bundle');

test('mcp-server/dist/index.js', () => {
    assert.ok(exists('mcp-server/dist/index.js'), 'Missing — run npm run compile');
});
test('mcp-server/dist/index.js > 100 KB', () => {
    const s = size('mcp-server/dist/index.js');
    assert.ok(s > 100_000, `Only ${s} bytes — MCP bundle looks incomplete`);
});
test('mcp-server/dist/tools/catalog-helpers.js', () => {
    assert.ok(exists('mcp-server/dist/tools/catalog-helpers.js'), 'Missing — run npm run compile');
});
test('mcp-server/package.json (ESM type declaration)', () => {
    assert.ok(exists('mcp-server/package.json'), 'Missing — needed so Node.js loads dist/index.js as ESM');
});

// ── Extension metadata ────────────────────────────────────────────────────────
console.log('\n[5] Extension metadata');

test('package.json', () => {
    assert.ok(exists('package.json'), 'Missing package.json');
});
test('icon.png', () => {
    assert.ok(exists('icon.png'), 'Missing icon.png');
});
test('README.md', () => {
    assert.ok(exists('README.md'), 'Missing README.md');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(60));
console.log(`${passed + failed} items: ${passed} picked, ${failed} missing`);
if (failed > 0) {
    console.error('\nPick incomplete — fix the above before packaging.');
    process.exit(1);
}
console.log('Pick complete — all items staged. Safe to package.');
