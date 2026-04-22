/**
 * tests/unit/license-sync.test.js
 *
 * Unit tests for src/features/license-sync.ts pure logic.
 * Uses the _test export handle — no VS Code needed.
 *
 * Covers:
 *   esc()          — HTML escaping
 *   scanProject()  — LICENSE file detection and status classification
 *     - missing (project path doesn't exist)
 *     - missing (project exists, no LICENSE file)
 *     - matches (LICENSE matches canonical)
 *     - differs  (LICENSE differs from canonical)
 *     - prefers LICENSE over LICENSE.txt when both exist
 *     - falls back to LICENSE.txt when no bare LICENSE
 *
 * Run: node tests/unit/license-sync.test.js
 */
'use strict';

const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');
const Module = require('module');

// ── vscode mock ───────────────────────────────────────────────────────────────
const vscodeMock = {
    window: {
        createOutputChannel: () => ({ appendLine: () => {}, show: () => {}, dispose: () => {} }),
        showErrorMessage: () => Promise.resolve(),
        showWarningMessage: () => Promise.resolve(),
        showInformationMessage: () => Promise.resolve(),
        createWebviewPanel: () => ({
            webview: { html: '', onDidReceiveMessage: () => {}, postMessage: () => {} },
            reveal: () => {}, onDidDispose: () => {}, dispose: () => {},
        }),
    },
    workspace: { workspaceFolders: [] },
    commands: { registerCommand: () => ({ dispose: () => {} }) },
    ViewColumn: { One: 1, Beside: 2 },
};

const _orig = Module._resolveFilename.bind(Module);
Module._resolveFilename = (req, ...args) => req === 'vscode' ? '__vs_ls__' : _orig(req, ...args);
require.cache['__vs_ls__'] = {
    id: '__vs_ls__', filename: '__vs_ls__', loaded: true,
    exports: vscodeMock, parent: null, children: [], path: '', paths: [],
};

// ── Load modules ──────────────────────────────────────────────────────────────
const OUT_CHANNEL  = path.join(__dirname, '../../out/shared/output-channel.js');
const OUT_REGISTRY = path.join(__dirname, '../../out/shared/registry.js');
const OUT          = path.join(__dirname, '../../out/features/license-sync.js');

for (const p of [OUT_CHANNEL, OUT_REGISTRY, OUT]) {
    if (!fs.existsSync(p)) {
        console.error(`SKIP: ${p} not found — run npm run compile`);
        process.exit(0);
    }
}

const ls = require(OUT);
const t  = ls._test;

if (!t) {
    console.error('SKIP: _test handle not exported from license-sync.js');
    process.exit(0);
}

// ── Temp workspace ────────────────────────────────────────────────────────────
const TMP = path.join(os.tmpdir(), `cvt-ls-${Date.now()}`);
fs.mkdirSync(TMP, { recursive: true });

// ── Runner ────────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;

function test(name, fn) {
    try { fn(); console.log(`  \u2713 ${name}`); passed++; }
    catch (e) { console.error(`  \u2717 ${name}\n    \u2192 ${e.message}`); failed++; }
}
function eq(a, b, msg)  { assert.strictEqual(a, b, msg); }
function ok(v, msg)     { assert.ok(v, msg); }
function has(s, sub)    { ok(String(s).includes(sub), `Expected: ${sub}`); }
function hasNot(s, sub) { ok(!String(s).includes(sub), `Must not contain: ${sub}`); }

const CANONICAL = 'Copyright (c) 2025 CieloVista Software. All rights reserved.';

function makeProject(name, projPath, type = 'node') {
    return { name, path: projPath, type, description: '' };
}

console.log('\nlicense-sync unit tests\n' + '\u2500'.repeat(50));

// ═══════════════════════════════════════════════════════════
// esc()
// ═══════════════════════════════════════════════════════════
console.log('\n-- esc() --');

test('& becomes &amp;',  () => eq(t.esc('a & b'),    'a &amp; b'));
test('< becomes &lt;',   () => eq(t.esc('<script>'), '&lt;script&gt;'));
test('> becomes &gt;',   () => eq(t.esc('a>b'),      'a&gt;b'));
test('" becomes &quot;', () => eq(t.esc('"hello"'),  '&quot;hello&quot;'));
test('safe string unchanged', () => eq(t.esc('hello world'), 'hello world'));
test('empty string unchanged', () => eq(t.esc(''), ''));

// ═══════════════════════════════════════════════════════════
// scanProject()
// ═══════════════════════════════════════════════════════════
console.log('\n-- scanProject() --');

// ── missing: project path does not exist ─────────────────
test('status=missing when project path does not exist', () => {
    const proj = makeProject('ghost', path.join(TMP, 'nonexistent'));
    const result = t.scanProject(proj, CANONICAL);
    eq(result.status, 'missing');
    eq(result.name, 'ghost');
    eq(result.current, '');
});

// ── missing: project exists but no LICENSE ───────────────
test('status=missing when project has no LICENSE file', () => {
    const dir = path.join(TMP, 'no-license');
    fs.mkdirSync(dir, { recursive: true });
    const proj = makeProject('no-license', dir);
    const result = t.scanProject(proj, CANONICAL);
    eq(result.status, 'missing');
    eq(result.current, '');
});

// ── matches: LICENSE exactly equals canonical ────────────
test('status=matches when LICENSE content matches canonical (trimmed)', () => {
    const dir = path.join(TMP, 'matching');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'LICENSE'), CANONICAL + '\n', 'utf8');
    const proj = makeProject('matching', dir);
    const result = t.scanProject(proj, CANONICAL);
    eq(result.status, 'matches');
    ok(result.current.includes('CieloVista'));
});

// ── differs: LICENSE has different content ───────────────
test('status=differs when LICENSE content does not match canonical', () => {
    const dir = path.join(TMP, 'different');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'LICENSE'), 'MIT License\n\nPermission is hereby granted...', 'utf8');
    const proj = makeProject('different', dir);
    const result = t.scanProject(proj, CANONICAL);
    eq(result.status, 'differs');
    ok(result.current.includes('MIT'));
});

// ── prefers LICENSE over LICENSE.txt ────────────────────
test('prefers bare LICENSE over LICENSE.txt when both exist', () => {
    const dir = path.join(TMP, 'both-files');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'LICENSE'),     CANONICAL, 'utf8');
    fs.writeFileSync(path.join(dir, 'LICENSE.txt'), 'Different text', 'utf8');
    const proj = makeProject('both-files', dir);
    const result = t.scanProject(proj, CANONICAL);
    eq(result.status, 'matches', 'Should use bare LICENSE and find it matches');
    eq(result.licensePath, path.join(dir, 'LICENSE'), 'licensePath should point to bare LICENSE');
});

// ── falls back to LICENSE.txt ────────────────────────────
test('falls back to LICENSE.txt when no bare LICENSE exists', () => {
    const dir = path.join(TMP, 'txt-only');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'LICENSE.txt'), CANONICAL, 'utf8');
    const proj = makeProject('txt-only', dir);
    const result = t.scanProject(proj, CANONICAL);
    eq(result.status, 'matches', 'Should use LICENSE.txt and find it matches');
    eq(result.licensePath, path.join(dir, 'LICENSE.txt'), 'licensePath should point to LICENSE.txt');
});

// ── result shape ──────────────────────────────────────────
test('result always has name, projPath, type, status, licensePath, current fields', () => {
    const proj = makeProject('shape-test', path.join(TMP, 'nonexistent2'), 'dotnet');
    const result = t.scanProject(proj, CANONICAL);
    ok('name'        in result, 'Must have name');
    ok('projPath'    in result, 'Must have projPath');
    ok('type'        in result, 'Must have type');
    ok('status'      in result, 'Must have status');
    ok('licensePath' in result, 'Must have licensePath');
    ok('current'     in result, 'Must have current');
    eq(result.type, 'dotnet', 'type must be passed through');
});

// ── status is one of valid values ────────────────────────
test('status is always one of: missing, matches, differs', () => {
    const valid = new Set(['missing', 'matches', 'differs']);
    const cases = [
        makeProject('a', path.join(TMP, 'nonexistent3')),
        (() => { const d = path.join(TMP, 'case-missing'); fs.mkdirSync(d, {recursive:true}); return makeProject('b', d); })(),
        (() => { const d = path.join(TMP, 'case-match');   fs.mkdirSync(d, {recursive:true}); fs.writeFileSync(path.join(d,'LICENSE'), CANONICAL); return makeProject('c', d); })(),
        (() => { const d = path.join(TMP, 'case-differ');  fs.mkdirSync(d, {recursive:true}); fs.writeFileSync(path.join(d,'LICENSE'), 'Other'); return makeProject('d', d); })(),
    ];
    for (const proj of cases) {
        const result = t.scanProject(proj, CANONICAL);
        ok(valid.has(result.status), `Status "${result.status}" must be one of: missing, matches, differs`);
    }
});

// ── empty canonical ───────────────────────────────────────
test('empty canonical string with empty LICENSE counts as matches', () => {
    const dir = path.join(TMP, 'empty-both');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'LICENSE'), '', 'utf8');
    const proj = makeProject('empty-both', dir);
    const result = t.scanProject(proj, '');
    eq(result.status, 'matches', 'Empty vs empty should match');
});

// Cleanup
fs.rmSync(TMP, { recursive: true, force: true });

console.log('\n' + '\u2500'.repeat(50));
if (failed === 0) { console.log(`\u2713 All ${passed} tests passed\n`); process.exit(0); }
else { console.error(`\n\u2717 ${failed} test(s) FAILED\n`); process.exit(1); }
