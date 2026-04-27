/**
 * tests/unit/file-list-sort.test.js
 *
 * Verifies the FileList viewer sort comparators (issue #68).
 *
 * Covered:
 *   - Folders-first invariant in every column / direction combination
 *   - Sort by name (asc/desc), with locale-aware case-insensitive ordering
 *   - Sort by date (asc/desc) on mtime
 *   - Sort by type (asc/desc) by file extension
 *   - Sort by size (asc/desc) on bytes
 *   - Stable tie-break by name when the primary sort column is equal
 *
 * Run: node tests/unit/file-list-sort.test.js
 */
'use strict';

const assert = require('assert');
const path   = require('path');
const fs     = require('fs');

let passed = 0, failed = 0;
function test(name, fn) {
    try   { fn(); console.log(`  \u2713 ${name}`); passed++; }
    catch (e) { console.error(`  \u2717 ${name}\n    \u2192 ${e.message}`); failed++; }
}
function ok(v, msg)  { assert.ok(v, msg); }
function eq(a, b, m) { assert.strictEqual(a, b, m); }
function deepEq(a, b, m) { assert.deepStrictEqual(a, b, m); }

const COMPILED = path.resolve(__dirname, '../../out/shared/file-list-sort.js');
ok(fs.existsSync(COMPILED), `COMPILED: ${COMPILED} not found. Run npx tsc -p ./ first.`);

const { makeComparator, sortEntries, DEFAULT_EXCLUDES } = require(COMPILED);

console.log('\nfile-list-sort unit tests');
console.log('\u2500'.repeat(50));

// ── Sample data ──────────────────────────────────────────────────────────
function entry(name, isDir, size, mtime, type) {
    return { name, isDir, size, mtime, type };
}

const sample = [
    entry('readme.md',     false, 1200,  Date.parse('2026-04-10T10:00:00Z'), 'md'),
    entry('src',           true,  0,     Date.parse('2026-04-26T12:00:00Z'), '<dir>'),
    entry('package.json',  false, 5800,  Date.parse('2026-04-26T15:00:00Z'), 'json'),
    entry('docs',          true,  0,     Date.parse('2026-04-15T09:00:00Z'), '<dir>'),
    entry('CHANGELOG.md',  false, 800,   Date.parse('2026-04-26T15:00:00Z'), 'md'),
    entry('node_modules',  true,  0,     Date.parse('2026-04-25T08:00:00Z'), '<dir>'),
    entry('app.ts',        false, 12000, Date.parse('2026-04-25T18:00:00Z'), 'ts'),
];

function nameOrder(arr) { return arr.map(e => e.name); }

// ── Folders-first invariant ──────────────────────────────────────────────
console.log('\n-- Folders-first invariant --');

test('name asc: every folder before every file', () => {
    const arr = [...sample];
    sortEntries(arr, 'name', 'asc');
    const firstFileIdx = arr.findIndex(e => !e.isDir);
    const lastDirIdx   = arr.map(e => e.isDir).lastIndexOf(true);
    ok(lastDirIdx < firstFileIdx, 'folders should all come before files');
});

test('name desc: every folder before every file (folders first overrides direction)', () => {
    const arr = [...sample];
    sortEntries(arr, 'name', 'desc');
    const firstFileIdx = arr.findIndex(e => !e.isDir);
    const lastDirIdx   = arr.map(e => e.isDir).lastIndexOf(true);
    ok(lastDirIdx < firstFileIdx, 'folders should all come before files even when desc');
});

test('size desc: 0-byte folders still come before any file', () => {
    const arr = [...sample];
    sortEntries(arr, 'size', 'desc');
    // The largest file is 12000 bytes. Folders are 0 bytes. If folders-first is broken,
    // the file would come first.
    eq(arr[0].isDir, true, 'first entry should be a folder');
});

test('date asc: folders cluster at top regardless of mtime', () => {
    const arr = [...sample];
    sortEntries(arr, 'date', 'asc');
    eq(arr[0].isDir, true, 'oldest folder (or tie) at top');
    const dirIdxs = arr.map((e, i) => e.isDir ? i : -1).filter(i => i >= 0);
    deepEq(dirIdxs, [0, 1, 2], 'all 3 folders should be the first 3 entries');
});

// ── Name column ──────────────────────────────────────────────────────────
console.log('\n-- Name column --');

test('name asc within folders: docs, node_modules, src', () => {
    const arr = [...sample];
    sortEntries(arr, 'name', 'asc');
    const folderNames = arr.filter(e => e.isDir).map(e => e.name);
    deepEq(folderNames, ['docs', 'node_modules', 'src']);
});

test('name desc within folders: src, node_modules, docs', () => {
    const arr = [...sample];
    sortEntries(arr, 'name', 'desc');
    const folderNames = arr.filter(e => e.isDir).map(e => e.name);
    deepEq(folderNames, ['src', 'node_modules', 'docs']);
});

test('name asc is case-insensitive (CHANGELOG.md beside readme.md not at top)', () => {
    const arr = [...sample];
    sortEntries(arr, 'name', 'asc');
    const fileNames = arr.filter(e => !e.isDir).map(e => e.name);
    // Expected order: app.ts, CHANGELOG.md, package.json, readme.md
    deepEq(fileNames, ['app.ts', 'CHANGELOG.md', 'package.json', 'readme.md']);
});

// ── Date column ──────────────────────────────────────────────────────────
console.log('\n-- Date column --');

test('date desc within files: most recently modified first', () => {
    const arr = [...sample];
    sortEntries(arr, 'date', 'desc');
    const fileNames = arr.filter(e => !e.isDir).map(e => e.name);
    // mtimes: package.json + CHANGELOG.md tied at 2026-04-26T15:00, app.ts 04-25T18:00, readme.md 04-10
    // Tie-break by name asc -> CHANGELOG.md before package.json
    deepEq(fileNames, ['CHANGELOG.md', 'package.json', 'app.ts', 'readme.md']);
});

test('date asc within files: oldest first', () => {
    const arr = [...sample];
    sortEntries(arr, 'date', 'asc');
    const fileNames = arr.filter(e => !e.isDir).map(e => e.name);
    deepEq(fileNames, ['readme.md', 'app.ts', 'CHANGELOG.md', 'package.json']);
});

// ── Type column ──────────────────────────────────────────────────────────
console.log('\n-- Type column --');

test('type asc within files: json, md, md, ts', () => {
    const arr = [...sample];
    sortEntries(arr, 'type', 'asc');
    const fileTypes = arr.filter(e => !e.isDir).map(e => e.type);
    deepEq(fileTypes, ['json', 'md', 'md', 'ts']);
});

test('type asc tie-break by name: CHANGELOG.md before readme.md', () => {
    const arr = [...sample];
    sortEntries(arr, 'type', 'asc');
    const fileNames = arr.filter(e => !e.isDir).map(e => e.name);
    deepEq(fileNames, ['package.json', 'CHANGELOG.md', 'readme.md', 'app.ts']);
});

test('type desc within files: ts, md, md, json', () => {
    const arr = [...sample];
    sortEntries(arr, 'type', 'desc');
    const fileTypes = arr.filter(e => !e.isDir).map(e => e.type);
    deepEq(fileTypes, ['ts', 'md', 'md', 'json']);
});

// ── Size column ──────────────────────────────────────────────────────────
console.log('\n-- Size column --');

test('size desc within files: largest first', () => {
    const arr = [...sample];
    sortEntries(arr, 'size', 'desc');
    const fileSizes = arr.filter(e => !e.isDir).map(e => e.size);
    deepEq(fileSizes, [12000, 5800, 1200, 800]);
});

test('size asc within files: smallest first', () => {
    const arr = [...sample];
    sortEntries(arr, 'size', 'asc');
    const fileSizes = arr.filter(e => !e.isDir).map(e => e.size);
    deepEq(fileSizes, [800, 1200, 5800, 12000]);
});

// ── Stability under repeated sorts ───────────────────────────────────────
console.log('\n-- Stability --');

test('repeated sort by same column produces identical order', () => {
    const a = [...sample]; sortEntries(a, 'name', 'asc');
    const b = [...sample]; sortEntries(b, 'name', 'asc'); sortEntries(b, 'name', 'asc');
    deepEq(nameOrder(a), nameOrder(b));
});

test('toggle asc -> desc -> asc returns to original asc order', () => {
    const a = [...sample]; sortEntries(a, 'date', 'asc');
    const original = nameOrder(a);
    const b = [...sample];
    sortEntries(b, 'date', 'asc');
    sortEntries(b, 'date', 'desc');
    sortEntries(b, 'date', 'asc');
    deepEq(nameOrder(b), original);
});

// ── DEFAULT_EXCLUDES ────────────────────────────────────────────────────
console.log('\n-- DEFAULT_EXCLUDES --');

test('DEFAULT_EXCLUDES contains expected folders', () => {
    ok(DEFAULT_EXCLUDES.has('node_modules'));
    ok(DEFAULT_EXCLUDES.has('.git'));
    ok(DEFAULT_EXCLUDES.has('out'));
    ok(DEFAULT_EXCLUDES.has('dist'));
    ok(DEFAULT_EXCLUDES.has('.vscode-test'));
});

test('DEFAULT_EXCLUDES does not contain plausible-but-undesired entries', () => {
    ok(!DEFAULT_EXCLUDES.has('src'));
    ok(!DEFAULT_EXCLUDES.has('docs'));
    ok(!DEFAULT_EXCLUDES.has('tests'));
});

// ── Result ──────────────────────────────────────────────────────────────
console.log('');
console.log(`=== Result: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
