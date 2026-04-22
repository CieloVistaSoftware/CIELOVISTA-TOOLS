/**
 * tests/unit/doc-auditor-scanner.test.js
 *
 * Unit tests for src/features/doc-auditor/scanner.ts
 * Tests collectDocs() — the doc-auditor's own scanner (separate from shared/docs-audit-utils.ts).
 *
 * The doc-auditor scanner has a slightly different SKIP_DIRS list and is the
 * one used by the actual audit runner, so it gets its own test suite.
 *
 * Covers:
 *   collectDocs()  — recursive markdown collection
 *   SKIP_DIRS      — correct set of excluded directories
 *
 * Run: node tests/unit/doc-auditor-scanner.test.js
 */
'use strict';

const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');

const OUT = path.join(__dirname, '../../out/features/doc-auditor/scanner.js');
if (!fs.existsSync(OUT)) {
    console.error(`SKIP: ${OUT} not found — run npm run compile`);
    process.exit(0);
}

const { collectDocs, SKIP_DIRS } = require(OUT);

let passed = 0, failed = 0;

function test(name, fn) {
    try { fn(); console.log(`  \u2713 ${name}`); passed++; }
    catch (e) { console.error(`  \u2717 ${name}\n    \u2192 ${e.message}`); failed++; }
}
function eq(a, b, msg)  { assert.strictEqual(a, b, msg); }
function ok(v, msg)     { assert.ok(v, msg); }

// ── Setup temp tree ───────────────────────────────────────────────────────────
const TMP = path.join(os.tmpdir(), `cvt-scanner-${Date.now()}`);

function setup() {
    fs.mkdirSync(TMP, { recursive: true });
    fs.writeFileSync(path.join(TMP, 'README.md'),  '# Root', 'utf8');
    fs.writeFileSync(path.join(TMP, 'CLAUDE.md'),  '# Claude', 'utf8');
    fs.writeFileSync(path.join(TMP, 'code.ts'),    'export const x = 1;', 'utf8');

    fs.mkdirSync(path.join(TMP, 'docs'));
    fs.writeFileSync(path.join(TMP, 'docs', 'guide.md'), '# Guide', 'utf8');

    fs.mkdirSync(path.join(TMP, 'docs', 'deep'));
    fs.writeFileSync(path.join(TMP, 'docs', 'deep', 'nested.md'), '# Nested', 'utf8');

    // SKIP_DIRS entries
    const SKIP = ['node_modules', '.git', 'out', 'dist', '.vscode'];
    for (const dir of SKIP) {
        fs.mkdirSync(path.join(TMP, dir));
        fs.writeFileSync(path.join(TMP, dir, 'skip-me.md'), '# Should be skipped', 'utf8');
    }
}

function cleanup() { fs.rmSync(TMP, { recursive: true, force: true }); }

setup();

console.log('\ndoc-auditor scanner unit tests\n' + '\u2500'.repeat(50));

// ── SKIP_DIRS ─────────────────────────────────────────────────────────────────
console.log('\n-- SKIP_DIRS --');

test('SKIP_DIRS is an array', () => ok(Array.isArray(SKIP_DIRS), 'SKIP_DIRS must be an array'));
test('SKIP_DIRS includes node_modules', () => ok(SKIP_DIRS.includes('node_modules')));
test('SKIP_DIRS includes .git',         () => ok(SKIP_DIRS.includes('.git')));
test('SKIP_DIRS includes out',          () => ok(SKIP_DIRS.includes('out')));
test('SKIP_DIRS includes dist',         () => ok(SKIP_DIRS.includes('dist')));
test('SKIP_DIRS includes .vscode',      () => ok(SKIP_DIRS.includes('.vscode')));

// ── collectDocs() ─────────────────────────────────────────────────────────────
console.log('\n-- collectDocs() --');

test('returns empty array for non-existent directory', () => {
    const result = collectDocs('/does/not/exist', 'test');
    ok(Array.isArray(result) && result.length === 0);
});

test('finds .md files at root', () => {
    const result = collectDocs(TMP, 'proj');
    const names = result.map(d => d.fileName);
    ok(names.includes('README.md'));
    ok(names.includes('CLAUDE.md'));
});

test('ignores non-.md files', () => {
    const result = collectDocs(TMP, 'proj');
    const names = result.map(d => d.fileName);
    ok(!names.includes('code.ts'));
});

test('finds .md files in subdirectory', () => {
    const result = collectDocs(TMP, 'proj');
    const names = result.map(d => d.fileName);
    ok(names.includes('guide.md'));
});

test('finds nested .md files within maxDepth', () => {
    const result = collectDocs(TMP, 'proj');
    const names = result.map(d => d.fileName);
    ok(names.includes('nested.md'));
});

const SKIP_LIST = ['node_modules', '.git', 'out', 'dist', '.vscode'];
for (const dir of SKIP_LIST) {
    test(`skips ${dir}/ directory`, () => {
        const result = collectDocs(TMP, 'proj');
        const paths  = result.map(d => d.filePath);
        ok(!paths.some(p => p.includes(`${path.sep}${dir}${path.sep}`)),
            `Must not include files from ${dir}/`);
    });
}

test('DocFile has correct shape', () => {
    const result = collectDocs(TMP, 'myProject');
    const doc = result.find(d => d.fileName === 'README.md');
    ok(doc, 'Must find README.md');
    ok(path.isAbsolute(doc.filePath),         'filePath must be absolute');
    eq(doc.fileName, 'README.md',             'fileName must be correct');
    eq(doc.projectName, 'myProject',          'projectName must match arg');
    ok(typeof doc.sizeBytes === 'number' && doc.sizeBytes > 0, 'sizeBytes must be positive');
    ok(doc.content.includes('Root'),          'content must include file text');
    ok(typeof doc.normalized === 'string',    'normalized must be a string');
});

test('normalized is lowercase', () => {
    const result = collectDocs(TMP, 'proj');
    for (const doc of result) {
        eq(doc.normalized, doc.normalized.toLowerCase(), `${doc.fileName}: normalized must be lowercase`);
    }
});

test('normalized strips markdown symbols', () => {
    const result = collectDocs(TMP, 'proj');
    for (const doc of result) {
        ok(!doc.normalized.includes('#'),  `${doc.fileName}: normalized must not contain #`);
        ok(!doc.normalized.includes('*'),  `${doc.fileName}: normalized must not contain *`);
        ok(!doc.normalized.includes('`'),  `${doc.fileName}: normalized must not contain backtick`);
    }
});

test('projectName is correctly assigned to all docs', () => {
    const result = collectDocs(TMP, 'specialProject');
    for (const doc of result) {
        eq(doc.projectName, 'specialProject', `${doc.fileName}: projectName must match argument`);
    }
});

test('correct total count (4 docs: README, CLAUDE, guide, nested)', () => {
    const result = collectDocs(TMP, 'proj');
    eq(result.length, 4, `Expected 4 docs, got ${result.length}: ${result.map(d => d.fileName).join(', ')}`);
});

cleanup();

console.log('\n' + '\u2500'.repeat(50));
if (failed === 0) { console.log(`\u2713 All ${passed} tests passed\n`); process.exit(0); }
else { console.error(`\n\u2717 ${failed} test(s) FAILED\n`); process.exit(1); }
