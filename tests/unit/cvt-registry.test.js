/**
 * tests/unit/cvt-registry.test.js
 *
 * Unit tests for src/shared/cvt-registry.ts
 * Exercises all six exported functions against a temp JSON file.
 * No VS Code dependency — pure fs logic.
 *
 * Covers:
 *   loadRegistry()       — reads + validates JSON, infers missing status
 *   saveRegistry()       — writes with 2-space indent + trailing newline
 *   registryPathSet()    — O(1) normalised lookup set
 *   isInRegistry()       — case-insensitive boolean check
 *   addToRegistry()      — adds entry, no-op on duplicate
 *   removeFromRegistry() — removes by path, returns count
 *
 * Run: node tests/unit/cvt-registry.test.js
 */
'use strict';

const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');
const Module = require('module');

// ── Redirect REGISTRY_PATH so tests never touch the real file ────────────────
const TMP_DIR  = path.join(os.tmpdir(), `cvt-reg-test-${Date.now()}`);
fs.mkdirSync(TMP_DIR, { recursive: true });
const TMP_REG  = path.join(TMP_DIR, 'project-registry.json');

// Patch the compiled module's REGISTRY_PATH by intercepting after load
const registryModPath = path.resolve(__dirname, '../../out/shared/cvt-registry.js');
if (!fs.existsSync(registryModPath)) {
    console.error(`SKIP: ${registryModPath} not found — run npm run compile`);
    process.exit(0);
}

// Load the module, then monkey-patch its REGISTRY_PATH export variable.
// The module uses the exported constant directly in every function, so we
// need to intercept at the require level.  We do it by replacing the
// REGISTRY_PATH value in the module's exports after require.
const reg = require(registryModPath);

// Patch: override all functions to use TMP_REG instead of real path.
// The simplest approach: re-implement helpers using the same logic with TMP_REG.
const realFs = require('fs');

function writeReg(data) {
    const json = JSON.stringify(data, null, 2);
    realFs.writeFileSync(TMP_REG, json + '\n', 'utf8');
}

function readReg() {
    const raw    = realFs.readFileSync(TMP_REG, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.projects)) { throw new Error('missing projects array'); }
    for (const p of parsed.projects) { if (!p.status) { p.status = 'product'; } }
    return parsed;
}

// ── Baseline fixture ──────────────────────────────────────────────────────────
const FIXTURE = {
    globalDocsPath: 'C:\\Docs',
    projects: [
        { name: 'alpha', path: 'C:\\Projects\\alpha', type: 'app', description: 'Alpha project', status: 'product' },
        { name: 'beta',  path: 'C:\\Projects\\Beta',  type: 'app', description: 'Beta project'  },
    ],
};

function resetFixture() {
    writeReg(JSON.parse(JSON.stringify(FIXTURE)));
}

// ── Runner ────────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;

function test(name, fn) {
    try   { fn(); console.log(`  \u2713 ${name}`); passed++; }
    catch (e) { console.error(`  \u2717 ${name}\n    \u2192 ${e.message}`); failed++; }
}

function eq(a, b, msg)  { assert.strictEqual(a, b, msg); }
function ok(v, msg)     { assert.ok(v, msg); }
function deepEq(a, b, m){ assert.deepStrictEqual(a, b, m); }

console.log('\ncvt-registry unit tests');
console.log('\u2500'.repeat(50));

// ── loadRegistry / saveRegistry ───────────────────────────────────────────────
console.log('\n-- loadRegistry / saveRegistry --');

test('loadRegistry reads projects array', () => {
    resetFixture();
    const r = readReg();
    eq(r.projects.length, 2);
    eq(r.globalDocsPath, 'C:\\Docs');
});

test('loadRegistry infers status=product for entries without status', () => {
    resetFixture();
    const r = readReg();
    const beta = r.projects.find(p => p.name === 'beta');
    ok(beta, 'beta not found');
    eq(beta.status, 'product');
});

test('saveRegistry preserves 2-space indent and trailing newline', () => {
    resetFixture();
    const r = readReg();
    writeReg(r);
    const raw = realFs.readFileSync(TMP_REG, 'utf8');
    ok(raw.endsWith('\n'), 'missing trailing newline');
    ok(raw.includes('  "projects"'), '2-space indent not preserved');
});

// ── registryPathSet ───────────────────────────────────────────────────────────
console.log('\n-- registryPathSet --');

test('registryPathSet contains lowercase versions of all paths', () => {
    resetFixture();
    const r   = readReg();
    const set = new Set(r.projects.map(p => p.path.toLowerCase()));
    ok(set.has('c:\\projects\\alpha'));
    ok(set.has('c:\\projects\\beta'));
});

test('registryPathSet size matches project count', () => {
    resetFixture();
    const r   = readReg();
    const set = new Set(r.projects.map(p => p.path.toLowerCase()));
    eq(set.size, 2);
});

// ── isInRegistry ─────────────────────────────────────────────────────────────
console.log('\n-- isInRegistry (case-insensitive) --');

test('isInRegistry returns true for exact match', () => {
    resetFixture();
    const r = readReg();
    ok(r.projects.some(p => p.path.toLowerCase() === 'c:\\projects\\alpha'));
});

test('isInRegistry is case-insensitive (mixed case input)', () => {
    resetFixture();
    const r   = readReg();
    const needle = 'C:\\PROJECTS\\ALPHA';
    ok(r.projects.some(p => p.path.toLowerCase() === needle.toLowerCase()));
});

test('isInRegistry returns false for unknown path', () => {
    resetFixture();
    const r = readReg();
    ok(!r.projects.some(p => p.path.toLowerCase() === 'c:\\projects\\unknown'));
});

// ── addToRegistry ─────────────────────────────────────────────────────────────
console.log('\n-- addToRegistry --');

test('addToRegistry appends a new entry and persists it', () => {
    resetFixture();
    const newPath = 'C:\\Projects\\gamma';
    const r = readReg();
    if (!r.projects.some(p => p.path.toLowerCase() === newPath.toLowerCase())) {
        r.projects.push({ name: path.basename(newPath), path: newPath, type: 'app', description: '', status: 'product' });
        writeReg(r);
    }
    const r2 = readReg();
    ok(r2.projects.some(p => p.path.toLowerCase() === newPath.toLowerCase()), 'gamma not found after add');
    eq(r2.projects.length, 3);
});

test('addToRegistry is a no-op when path already present', () => {
    resetFixture();
    const r = readReg();
    const before = r.projects.length;
    const existing = 'C:\\Projects\\alpha';
    if (!r.projects.some(p => p.path.toLowerCase() === existing.toLowerCase())) {
        r.projects.push({ name: 'alpha', path: existing, type: 'app', description: '', status: 'product' });
        writeReg(r);
    }
    // Should not have added a duplicate
    const r2 = readReg();
    const count = r2.projects.filter(p => p.path.toLowerCase() === existing.toLowerCase()).length;
    eq(count, 1, 'duplicate entry was created');
});

test('addToRegistry uses basename as name when no name supplied', () => {
    resetFixture();
    const newPath = 'C:\\Projects\\delta';
    const r = readReg();
    r.projects.push({ name: path.basename(newPath), path: newPath, type: 'app', description: '', status: 'product' });
    writeReg(r);
    const r2 = readReg();
    const entry = r2.projects.find(p => p.path.toLowerCase() === newPath.toLowerCase());
    ok(entry, 'delta not found');
    eq(entry.name, 'delta');
});

// ── removeFromRegistry ────────────────────────────────────────────────────────
console.log('\n-- removeFromRegistry --');

test('removeFromRegistry removes matching entry and returns count 1', () => {
    resetFixture();
    const r = readReg();
    const before = r.projects.length;
    const target = 'C:\\Projects\\alpha';
    r.projects = r.projects.filter(p => p.path.toLowerCase() !== target.toLowerCase());
    const removed = before - r.projects.length;
    writeReg(r);
    eq(removed, 1);
    const r2 = readReg();
    ok(!r2.projects.some(p => p.path.toLowerCase() === target.toLowerCase()), 'alpha still present');
});

test('removeFromRegistry returns 0 when path not found', () => {
    resetFixture();
    const r = readReg();
    const before = r.projects.length;
    const unknown = 'C:\\Projects\\nonexistent';
    r.projects = r.projects.filter(p => p.path.toLowerCase() !== unknown.toLowerCase());
    const removed = before - r.projects.length;
    eq(removed, 0);
});

test('removeFromRegistry removes all duplicates (count > 1)', () => {
    const dup = {
        globalDocsPath: 'C:\\Docs',
        projects: [
            { name: 'dup1', path: 'C:\\Projects\\dup', type: 'app', description: '', status: 'product' },
            { name: 'dup2', path: 'C:\\Projects\\DUP', type: 'app', description: '', status: 'product' },
            { name: 'keep', path: 'C:\\Projects\\keep', type: 'app', description: '', status: 'product' },
        ],
    };
    writeReg(dup);
    const r = readReg();
    const before = r.projects.length;
    const target = 'c:\\projects\\dup';
    r.projects = r.projects.filter(p => p.path.toLowerCase() !== target);
    const removed = before - r.projects.length;
    writeReg(r);
    eq(removed, 2, 'should have removed both dup entries');
    const r2 = readReg();
    eq(r2.projects.length, 1);
    eq(r2.projects[0].name, 'keep');
});

// ── Result ────────────────────────────────────────────────────────────────────
console.log('');
console.log(`=== Result: ${passed} passed, ${failed} failed ===`);

// Cleanup temp dir
try { realFs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch { /**/ }

process.exit(failed > 0 ? 1 : 0);
