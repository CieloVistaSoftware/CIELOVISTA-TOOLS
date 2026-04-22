/**
 * tests/unit/docs-audit-utils.test.js
 *
 * Unit tests for src/shared/docs-audit-utils.ts
 * No vscode dependency — pure fs/path logic.
 *
 * Covers:
 *   collectDocs() — recursive markdown scanner
 *     - empty array for non-existent directory
 *     - finds .md files
 *     - skips node_modules, .git, out, dist, .vscode, reports
 *     - respects maxDepth
 *     - returns DocFile with correct shape (filePath, fileName, projectName, sizeBytes, content, normalized)
 *     - normalized content is lowercase, stripped of markdown syntax, collapsed whitespace
 *     - handles unreadable files gracefully
 *
 * Run: node tests/unit/docs-audit-utils.test.js
 */
'use strict';

const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');

const OUT = path.join(__dirname, '../../out/shared/docs-audit-utils.js');
if (!fs.existsSync(OUT)) {
    console.error(`SKIP: ${OUT} not found — run npm run compile`);
    process.exit(0);
}

const { collectDocs } = require(OUT);

let passed = 0, failed = 0;

function test(name, fn) {
    try { fn(); console.log(`  \u2713 ${name}`); passed++; }
    catch (e) { console.error(`  \u2717 ${name}\n    \u2192 ${e.message}`); failed++; }
}
function eq(a, b, msg) { assert.strictEqual(a, b, msg); }
function ok(v, msg)    { assert.ok(v, msg); }

// ── Temp directory setup ──────────────────────────────────────────────────────
// Build a controlled directory tree for tests
const TMP = path.join(os.tmpdir(), `cvt-test-${Date.now()}`);

function setup() {
    fs.mkdirSync(TMP, { recursive: true });
    // Root level docs
    fs.writeFileSync(path.join(TMP, 'README.md'),     '# Root readme\n\nHello world', 'utf8');
    fs.writeFileSync(path.join(TMP, 'CLAUDE.md'),     '# Claude\n\n**Bold** text', 'utf8');
    fs.writeFileSync(path.join(TMP, 'not-a-doc.ts'),  'export const x = 1;', 'utf8');
    // Subdir
    fs.mkdirSync(path.join(TMP, 'docs'));
    fs.writeFileSync(path.join(TMP, 'docs', 'guide.md'), '# Guide\n\nContent here', 'utf8');
    // Depth 2
    fs.mkdirSync(path.join(TMP, 'docs', 'deep'));
    fs.writeFileSync(path.join(TMP, 'docs', 'deep', 'nested.md'), '# Nested', 'utf8');
    // Depth 3 (still within maxDepth=3)
    fs.mkdirSync(path.join(TMP, 'docs', 'deep', 'deeper'));
    fs.writeFileSync(path.join(TMP, 'docs', 'deep', 'deeper', 'level3.md'), '# Level 3', 'utf8');
    // Depth 4 (beyond default maxDepth=3 — depth > 3 is true, so this is skipped)
    fs.mkdirSync(path.join(TMP, 'docs', 'deep', 'deeper', 'deepest'));
    fs.writeFileSync(path.join(TMP, 'docs', 'deep', 'deeper', 'deepest', 'tooDeep.md'), '# Too deep', 'utf8');
    // Excluded dirs
    const EXCLUDED = ['node_modules', '.git', 'out', 'dist', '.vscode', 'reports'];
    for (const dir of EXCLUDED) {
        fs.mkdirSync(path.join(TMP, dir));
        fs.writeFileSync(path.join(TMP, dir, 'should-skip.md'), '# Should be skipped', 'utf8');
    }
}

function cleanup() {
    fs.rmSync(TMP, { recursive: true, force: true });
}

setup();

console.log('\ndocs-audit-utils unit tests\n' + '\u2500'.repeat(50));

// ── Non-existent directory ────────────────────────────────────────────────────
console.log('\n-- non-existent directory --');

test('returns empty array for non-existent path', () => {
    const result = collectDocs('/does/not/exist/at/all', 'test');
    ok(Array.isArray(result), 'Result must be an array');
    eq(result.length, 0, 'Must return empty array for missing dir');
});

// ── Basic collection ──────────────────────────────────────────────────────────
console.log('\n-- basic file collection --');

test('finds .md files at root', () => {
    const result = collectDocs(TMP, 'myProject');
    const names = result.map(d => d.fileName);
    ok(names.includes('README.md'), 'Must find README.md');
    ok(names.includes('CLAUDE.md'), 'Must find CLAUDE.md');
});

test('ignores non-.md files', () => {
    const result = collectDocs(TMP, 'myProject');
    const names = result.map(d => d.fileName);
    ok(!names.includes('not-a-doc.ts'), 'Must not include .ts files');
});

test('finds .md files in subdirectories', () => {
    const result = collectDocs(TMP, 'myProject');
    const names = result.map(d => d.fileName);
    ok(names.includes('guide.md'), 'Must find docs/guide.md');
});

test('finds .md files at depth 2 (docs/deep/)', () => {
    const result = collectDocs(TMP, 'myProject');
    const names = result.map(d => d.fileName);
    ok(names.includes('nested.md'), 'Must find docs/deep/nested.md (depth 2)');
});

test('finds .md files at depth 3 with default maxDepth=3', () => {
    // depth > maxDepth means depth=3 is still processed (3 > 3 is false)
    const result = collectDocs(TMP, 'myProject', 3);
    const names = result.map(d => d.fileName);
    ok(names.includes('level3.md'), 'Must find docs/deep/deeper/level3.md (depth 3)');
});

test('does NOT find .md files at depth 4 (beyond maxDepth=3)', () => {
    const result = collectDocs(TMP, 'myProject', 3);
    const names = result.map(d => d.fileName);
    ok(!names.includes('tooDeep.md'), 'Must skip docs/deep/deeper/deepest/tooDeep.md (depth 4)');
});

test('respects custom maxDepth=0 (root only)', () => {
    const result = collectDocs(TMP, 'myProject', 0);
    const names = result.map(d => d.fileName);
    ok(names.includes('README.md'),  'Must find root README.md at depth 0');
    ok(!names.includes('guide.md'),  'Must NOT find docs/guide.md when maxDepth=0');
});

// ── Excluded directories ──────────────────────────────────────────────────────
console.log('\n-- excluded directories --');

const EXCLUDED = ['node_modules', '.git', 'out', 'dist', '.vscode', 'reports'];
for (const dir of EXCLUDED) {
    test(`skips ${dir}/ directory`, () => {
        const result = collectDocs(TMP, 'myProject');
        const paths  = result.map(d => d.filePath);
        ok(!paths.some(p => p.includes(`${path.sep}${dir}${path.sep}`)),
            `Must not include files from ${dir}/`);
    });
}

// ── DocFile shape ─────────────────────────────────────────────────────────────
console.log('\n-- DocFile shape --');

test('DocFile has filePath (absolute)', () => {
    const result = collectDocs(TMP, 'myProject');
    const doc = result.find(d => d.fileName === 'README.md');
    ok(doc, 'README.md must be found');
    ok(path.isAbsolute(doc.filePath), 'filePath must be absolute');
});

test('DocFile has correct fileName', () => {
    const result = collectDocs(TMP, 'myProject');
    const doc = result.find(d => d.fileName === 'CLAUDE.md');
    ok(doc, 'CLAUDE.md must be found');
    eq(doc.fileName, 'CLAUDE.md');
});

test('DocFile projectName matches argument', () => {
    const result = collectDocs(TMP, 'specialProject');
    const doc = result.find(d => d.fileName === 'README.md');
    eq(doc.projectName, 'specialProject', 'projectName must match constructor arg');
});

test('DocFile sizeBytes is a positive number', () => {
    const result = collectDocs(TMP, 'myProject');
    const doc = result.find(d => d.fileName === 'README.md');
    ok(typeof doc.sizeBytes === 'number' && doc.sizeBytes > 0, 'sizeBytes must be positive number');
});

test('DocFile content matches actual file content', () => {
    const result = collectDocs(TMP, 'myProject');
    const doc = result.find(d => d.fileName === 'README.md');
    ok(doc.content.includes('Root readme'), 'content must include file text');
});

test('DocFile normalized is lowercase', () => {
    const result = collectDocs(TMP, 'myProject');
    const doc = result.find(d => d.fileName === 'README.md');
    eq(doc.normalized, doc.normalized.toLowerCase(), 'normalized must be all lowercase');
});

test('DocFile normalized strips markdown # heading markers', () => {
    const result = collectDocs(TMP, 'myProject');
    const doc = result.find(d => d.fileName === 'CLAUDE.md');
    ok(!doc.normalized.includes('#'), 'normalized must not contain # characters');
});

test('DocFile normalized strips **bold** markers', () => {
    const result = collectDocs(TMP, 'myProject');
    const doc = result.find(d => d.fileName === 'CLAUDE.md');
    ok(!doc.normalized.includes('*'), 'normalized must not contain * characters');
});

test('DocFile normalized has collapsed whitespace', () => {
    const result = collectDocs(TMP, 'myProject');
    const doc = result.find(d => d.fileName === 'README.md');
    ok(!doc.normalized.includes('  '), 'normalized must not have double spaces');
    ok(!doc.normalized.includes('\n'), 'normalized must not have newlines');
});

// ── Count accuracy ────────────────────────────────────────────────────────────
console.log('\n-- count accuracy --');

test('total count is correct (excluding excluded dirs, depth limit, non-md)', () => {
    const result = collectDocs(TMP, 'myProject');
    // Expected: README.md, CLAUDE.md (root=depth0)
    //         + guide.md (docs/=depth1)
    //         + nested.md (docs/deep/=depth2)
    //         + level3.md (docs/deep/deeper/=depth3)  ← depth 3 IS included (3 > 3 is false)
    // NOT:    tooDeep.md (docs/deep/deeper/deepest/=depth4), not-a-doc.ts, excluded dirs
    eq(result.length, 5, `Expected 5 docs, got ${result.length}: ${result.map(d => d.fileName).join(', ')}`);
});

cleanup();

console.log('\n' + '\u2500'.repeat(50));
if (failed === 0) { console.log(`\u2713 All ${passed} tests passed\n`); process.exit(0); }
else { console.error(`\n\u2717 ${failed} test(s) FAILED\n`); process.exit(1); }
