/**
 * tests/unit/cvt-registry.test.js
 *
 * Unit tests for src/shared/cvt-registry.ts
 * Exercises all six exported functions of the real module against a temp
 * registry file.
 *
 * Covers:
 *   loadRegistry()       — reads + validates JSON, infers missing status
 *   saveRegistry()       — writes with 2-space indent + trailing newline
 *   registryPathSet()    — O(1) normalised lookup set
 *   isInRegistry()       — case-insensitive boolean check
 *   addToRegistry()      — adds entry, no-op on duplicate, creates a missing file
 *   removeFromRegistry() — removes by path, returns count
 *
 * Until #819 every case here ran a re-implementation written inside this file
 * (readReg/writeReg and inline filters), and the module it required was never
 * called. Now the module is loaded from out-test/ with the home directory
 * pointed at a temp folder, so REGISTRY_PATH (computed from os.homedir() at
 * load) lands there and the real functions run without touching the real
 * registry. REG-179 keeps every unit test named after a module loading it.
 *
 * Run: node scripts/run-unit-tests.js cvt-registry
 */
'use strict';

const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');

const OUT = path.resolve(__dirname, '../../out-test/shared/cvt-registry.js');
if (!fs.existsSync(OUT)) {
    console.error('FAIL: out-test/shared/cvt-registry.js not built. Run through node scripts/run-unit-tests.js, which builds it.');
    process.exit(1);
}

// ── Point the home directory at a temp folder before the module computes REGISTRY_PATH ──
const TMP_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'cvt-reg-test-'));
const realHomedir = os.homedir;
os.homedir = () => TMP_HOME;
const reg = require(OUT);
os.homedir = realHomedir;

const TMP_REG = path.join(TMP_HOME, 'Downloads', 'CieloVistaStandards', 'project-registry.json');
assert.strictEqual(reg.REGISTRY_PATH, TMP_REG, 'REGISTRY_PATH must point into the temp home, never the real registry');

function writeReg(data) {
    fs.mkdirSync(path.dirname(TMP_REG), { recursive: true });
    fs.writeFileSync(TMP_REG, JSON.stringify(data, null, 2) + '\n', 'utf8');
}
function onDisk() { return JSON.parse(fs.readFileSync(TMP_REG, 'utf8')); }

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

console.log('\ncvt-registry unit tests');
console.log('\u2500'.repeat(50));

// ── loadRegistry / saveRegistry ───────────────────────────────────────────────
console.log('\n-- loadRegistry / saveRegistry --');

test('loadRegistry reads projects array', () => {
    resetFixture();
    const r = reg.loadRegistry();
    eq(r.projects.length, 2);
    eq(r.globalDocsPath, 'C:\\Docs');
});

test('loadRegistry infers status=product for entries without status', () => {
    resetFixture();
    const beta = reg.loadRegistry().projects.find(p => p.name === 'beta');
    ok(beta, 'beta not found');
    eq(beta.status, 'product');
});

test('loadRegistry throws when the file is missing', () => {
    fs.rmSync(TMP_REG, { force: true });
    assert.throws(() => reg.loadRegistry(), /not found/);
});

test('loadRegistry throws when the projects array is missing', () => {
    writeReg({ globalDocsPath: 'C:\\Docs' });
    assert.throws(() => reg.loadRegistry(), /projects/);
});

test('saveRegistry preserves 2-space indent and trailing newline', () => {
    resetFixture();
    reg.saveRegistry(reg.loadRegistry());
    const raw = fs.readFileSync(TMP_REG, 'utf8');
    ok(raw.endsWith('\n'), 'missing trailing newline');
    ok(raw.includes('  "projects"'), '2-space indent not preserved');
});

// ── registryPathSet ───────────────────────────────────────────────────────────
console.log('\n-- registryPathSet --');

test('registryPathSet contains lowercase versions of all paths', () => {
    resetFixture();
    const set = reg.registryPathSet(reg.loadRegistry());
    ok(set.has('c:\\projects\\alpha'));
    ok(set.has('c:\\projects\\beta'));
});

test('registryPathSet size matches project count', () => {
    resetFixture();
    eq(reg.registryPathSet(reg.loadRegistry()).size, 2);
});

// ── isInRegistry ─────────────────────────────────────────────────────────────
console.log('\n-- isInRegistry (case-insensitive) --');

test('isInRegistry returns true for exact match', () => {
    resetFixture();
    ok(reg.isInRegistry(reg.loadRegistry(), 'C:\\Projects\\alpha'));
});

test('isInRegistry is case-insensitive (mixed case input)', () => {
    resetFixture();
    ok(reg.isInRegistry(reg.loadRegistry(), 'C:\\PROJECTS\\ALPHA'));
});

test('isInRegistry returns false for unknown path', () => {
    resetFixture();
    ok(!reg.isInRegistry(reg.loadRegistry(), 'C:\\Projects\\unknown'));
});

// ── addToRegistry ─────────────────────────────────────────────────────────────
console.log('\n-- addToRegistry --');

test('addToRegistry appends a new entry and persists it', () => {
    resetFixture();
    const newPath = 'C:\\Projects\\gamma';
    reg.addToRegistry(newPath);
    const r2 = onDisk();
    ok(r2.projects.some(p => p.path.toLowerCase() === newPath.toLowerCase()), 'gamma not found after add');
    eq(r2.projects.length, 3);
});

test('addToRegistry is a no-op when path already present', () => {
    resetFixture();
    reg.addToRegistry('C:\\PROJECTS\\ALPHA');
    const count = onDisk().projects.filter(p => p.path.toLowerCase() === 'c:\\projects\\alpha').length;
    eq(count, 1, 'duplicate entry was created');
});

test('addToRegistry uses basename as name when no name supplied', () => {
    resetFixture();
    const newPath = path.join(path.sep === '\\' ? 'C:\\Projects' : '/projects', 'delta');
    reg.addToRegistry(newPath);
    const entry = onDisk().projects.find(p => p.path.toLowerCase() === newPath.toLowerCase());
    ok(entry, 'delta not found');
    eq(entry.name, 'delta');
    eq(entry.status, 'product');
});

test('addToRegistry uses the name it is given', () => {
    resetFixture();
    reg.addToRegistry('C:\\Projects\\epsilon', 'Epsilon App');
    eq(onDisk().projects.find(p => p.path === 'C:\\Projects\\epsilon').name, 'Epsilon App');
});

test('addToRegistry creates the registry when the file is missing', () => {
    fs.rmSync(path.dirname(TMP_REG), { recursive: true, force: true });
    reg.addToRegistry('C:\\Projects\\first');
    const r = onDisk();
    eq(r.projects.length, 1);
    eq(r.projects[0].path, 'C:\\Projects\\first');
});

// ── removeFromRegistry ────────────────────────────────────────────────────────
console.log('\n-- removeFromRegistry --');

test('removeFromRegistry removes matching entry and returns count 1', () => {
    resetFixture();
    const target = 'C:\\Projects\\alpha';
    eq(reg.removeFromRegistry(target), 1);
    ok(!onDisk().projects.some(p => p.path.toLowerCase() === target.toLowerCase()), 'alpha still present');
});

test('removeFromRegistry returns 0 when path not found, and does not rewrite the file', () => {
    resetFixture();
    const before = fs.readFileSync(TMP_REG, 'utf8');
    eq(reg.removeFromRegistry('C:\\Projects\\nonexistent'), 0);
    eq(fs.readFileSync(TMP_REG, 'utf8'), before, 'registry was rewritten');
});

test('removeFromRegistry removes all duplicates (count > 1)', () => {
    writeReg({
        globalDocsPath: 'C:\\Docs',
        projects: [
            { name: 'dup1', path: 'C:\\Projects\\dup', type: 'app', description: '', status: 'product' },
            { name: 'dup2', path: 'C:\\Projects\\DUP', type: 'app', description: '', status: 'product' },
            { name: 'keep', path: 'C:\\Projects\\keep', type: 'app', description: '', status: 'product' },
        ],
    });
    eq(reg.removeFromRegistry('c:\\projects\\dup'), 2, 'should have removed both dup entries');
    const r2 = onDisk();
    eq(r2.projects.length, 1);
    eq(r2.projects[0].name, 'keep');
});

// ── Result ────────────────────────────────────────────────────────────────────
console.log('');
console.log(`=== Result: ${passed} passed, ${failed} failed ===`);

try { fs.rmSync(TMP_HOME, { recursive: true, force: true }); } catch { /**/ }

process.exit(failed > 0 ? 1 : 0);
