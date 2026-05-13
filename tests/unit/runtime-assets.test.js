'use strict';
/**
 * tests/unit/runtime-assets.test.js
 *
 * Bill-of-lading — runs AFTER vsce package.
 * Inspects the actual VSIX zip to confirm every required runtime asset shipped.
 * A missing entry here = a guaranteed runtime error in VS Code.
 *
 * Run: node tests/unit/runtime-assets.test.js
 */

const assert = require('assert');
const cp     = require('child_process');
const fs     = require('fs');
const path   = require('path');

const ROOT = path.join(__dirname, '../..');

// ── Find the most-recently-modified VSIX ─────────────────────────────────────
const vsixFiles = fs.readdirSync(ROOT)
    .filter(n => n.endsWith('.vsix'))
    .map(n => ({ name: n, full: path.join(ROOT, n), mtime: fs.statSync(path.join(ROOT, n)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

if (vsixFiles.length === 0) {
    console.error('FAIL: No .vsix found — run npm run package first.');
    process.exit(1);
}

const vsix = vsixFiles[0];

function getZipEntries(vsixPath) {
    const script = [
        "$ErrorActionPreference = 'Stop'",
        `Add-Type -AssemblyName System.IO.Compression.FileSystem; $zip = [System.IO.Compression.ZipFile]::OpenRead('${vsixPath.replace(/'/g, "''")}')`,
        "$zip.Entries | ForEach-Object { $_.FullName }",
        '$zip.Dispose()'
    ].join('; ');
    const out = cp.execSync(`powershell -NoProfile -Command "${script}"`, { encoding: 'utf8' });
    return out.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}

let entries;
try {
    entries = getZipEntries(vsix.full);
} catch (err) {
    console.error(`FAIL: Could not read VSIX zip: ${err.message}`);
    process.exit(1);
}

const has       = entry  => entries.includes(entry);
const hasPrefix = prefix => entries.some(e => e.startsWith(prefix));
const countPrefix = prefix => entries.filter(e => e.startsWith(prefix)).length;

let passed = 0, failed = 0;

function test(name, fn) {
    try { fn(); console.log(`  PASS ${name}`); passed++; }
    catch (e) { console.error(`  FAIL ${name}\n       → ${e.message}`); failed++; }
}

console.log(`\nruntime-assets bill-of-lading — ${vsix.name} (${entries.length} entries)\n` + '─'.repeat(60));

// ── Extension bundle ──────────────────────────────────────────────────────────
console.log('\n[1] Extension bundle');

test('extension/out/extension.js present in VSIX', () => {
    assert.ok(has('extension/out/extension.js'), 'extension/out/extension.js missing from VSIX');
});

// ── Static HTML assets ────────────────────────────────────────────────────────
console.log('\n[2] Static HTML assets');

test('extension/out/catalog.html present in VSIX', () => {
    assert.ok(has('extension/out/catalog.html'),
        'extension/out/catalog.html missing from VSIX.\n' +
        '       __dirname in bundled extension.js resolves to out/ — catalog.html must be at out/catalog.html.\n' +
        '       Check scripts/copy-commandhelp.js copy destination.');
});
test('extension/out/features/doc-catalog/catalog.html NOT in VSIX (old pre-esbuild path)', () => {
    assert.ok(!has('extension/out/features/doc-catalog/catalog.html'),
        'Old pre-esbuild path found in VSIX — catalog.html should be at out/catalog.html, not out/features/doc-catalog/catalog.html');
});

// ── CommandHelp markdown files ─────────────────────────────────────────────────
console.log('\n[3] CommandHelp markdown files');

test('extension/out/features/CommandHelp/ directory present in VSIX', () => {
    assert.ok(hasPrefix('extension/out/features/CommandHelp/'),
        'extension/out/features/CommandHelp/ missing from VSIX — run npm run copy:commandhelp');
});
test('VSIX contains at least 2 CommandHelp files', () => {
    const count = countPrefix('extension/out/features/CommandHelp/');
    assert.ok(count >= 2, `Only ${count} CommandHelp entries in VSIX — expected at least 2 (README files)`);
});

// ── MCP server bundle ─────────────────────────────────────────────────────────
console.log('\n[4] MCP server bundle');

test('extension/mcp-server/dist/index.js present in VSIX', () => {
    assert.ok(has('extension/mcp-server/dist/index.js'),
        'extension/mcp-server/dist/index.js missing from VSIX');
});
test('extension/mcp-server/dist/tools/catalog-helpers.js present in VSIX', () => {
    assert.ok(has('extension/mcp-server/dist/tools/catalog-helpers.js'),
        'catalog-helpers.js missing from VSIX — needed by backfill scripts');
});
test('extension/mcp-server/package.json present in VSIX (ESM type declaration)', () => {
    assert.ok(has('extension/mcp-server/package.json'),
        'mcp-server/package.json missing — Node.js needs this to load dist/index.js as ESM');
});

// ── Core extension metadata ───────────────────────────────────────────────────
console.log('\n[5] Extension metadata');

test('extension/package.json present in VSIX', () => {
    assert.ok(has('extension/package.json'), 'extension/package.json missing from VSIX');
});
test('extension/icon.png present in VSIX', () => {
    assert.ok(has('extension/icon.png'), 'extension/icon.png missing from VSIX');
});

// ── Must NOT be present ───────────────────────────────────────────────────────
console.log('\n[6] Excluded items (must not ship)');

test('node_modules NOT in VSIX (deps inlined by esbuild)', () => {
    assert.ok(!hasPrefix('extension/node_modules/'),
        'VSIX contains node_modules — esbuild should inline all deps. Check .vscodeignore.');
});
test('src/ NOT in VSIX (TypeScript source not needed at runtime)', () => {
    assert.ok(!hasPrefix('extension/src/'),
        'VSIX contains src/ TypeScript source — check .vscodeignore src/** exclusion.');
});
test('.claude/ NOT in VSIX (agent worktrees must not ship)', () => {
    assert.ok(!hasPrefix('extension/.claude/'),
        'VSIX contains .claude/ — check .vscodeignore .claude/** exclusion.');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(60));
console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) { process.exit(1); }
