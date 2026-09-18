/**
 * tests/unit/doc-header.test.js
 *
 * Unit tests for src/features/doc-header.ts pure logic.
 * Uses the _test export handle to access private functions.
 *
 * Covers:
 *   applyHeader()    — fixing a file keeps its body and writes the three-field contract (#730)
 *   scanDirectory()  — what the compliance panel reports
 *   toRelativePath() — forward-slash relative path
 *
 * Run: node tests/unit/doc-header.test.js
 */
'use strict';

const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const Module = require('module');

// ── vscode mock ───────────────────────────────────────────────────────────────
const vscodeMock = {
    window: {
        createOutputChannel: () => ({ appendLine: () => {}, show: () => {}, dispose: () => {} }),
        showErrorMessage: () => Promise.resolve(),
        showWarningMessage: () => Promise.resolve(),
        showInformationMessage: () => Promise.resolve(),
        withProgress: async (_opts, fn) => fn({ report: () => {} }),
        activeTextEditor: null,
        createWebviewPanel: () => ({
            webview: { html: '', onDidReceiveMessage: () => {}, postMessage: () => {} },
            reveal: () => {}, onDidDispose: () => {}, dispose: () => {},
        }),
    },
    workspace: { workspaceFolders: [], openTextDocument: async () => ({}) },
    commands: { registerCommand: () => ({ dispose: () => {} }), executeCommand: async () => {} },
    ProgressLocation: { Notification: 15 },
    ViewColumn: { One: 1, Beside: 2 },
};

const _orig = Module._resolveFilename.bind(Module);
Module._resolveFilename = (req, ...args) => req === 'vscode' ? '__vs_dh__' : _orig(req, ...args);
require.cache['__vs_dh__'] = {
    id: '__vs_dh__', filename: '__vs_dh__', loaded: true,
    exports: vscodeMock, parent: null, children: [], path: '', paths: [],
};

// ── Load module ───────────────────────────────────────────────────────────────
const OUT_CHANNEL = path.join(__dirname, '../../out-test/shared/output-channel.js');
const OUT         = path.join(__dirname, '../../out-test/features/doc-header/index.js');

// Pre-load show-result-webview stub to avoid missing module errors
const showResultPath = path.join(__dirname, '../../out-test/shared/show-result-webview.js');
if (fs.existsSync(showResultPath)) { require(showResultPath); }

for (const p of [OUT_CHANNEL, OUT]) {
    if (!fs.existsSync(p)) {
        console.error(`SKIP: ${p} not found — run npm run compile`);
        process.exit(0);
    }
}

const dh = require(OUT);
const t  = dh._test;

if (!t) {
    console.error('SKIP: _test handle not exported from doc-header.js');
    process.exit(0);
}

// ── Runner ────────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;

function test(name, fn) {
    try { fn(); console.log(`  \u2713 ${name}`); passed++; }
    catch (e) { console.error(`  \u2717 ${name}\n    \u2192 ${e.message}`); failed++; }
}
function eq(a, b, msg)  { assert.strictEqual(a, b, msg); }
function ok(v, msg)     { assert.ok(v, msg); }
function has(s, sub, msg) { ok(String(s).includes(sub), msg || `Expected: ${sub}`); }

console.log('\ndoc-header unit tests\n' + '─'.repeat(50));

// Parsing, judging and rewriting are src/shared/doc-frontmatter.ts, covered by
// tests/unit/doc-frontmatter.test.js. This file covers what doc-header itself
// does with them: scan a project, and fix a file on disk (#730).

const os  = require('os');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cvt-doc-header-'));
function write(rel, text) {
    const full = path.join(TMP, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, text, 'utf8');
    return full;
}

// ═══════════════════════════════════════════════════════════
// applyHeader() — the fix a user runs from the panel
// ═══════════════════════════════════════════════════════════
console.log('\n-- applyHeader() --');

// The shape of the #731 damage: a doc with horizontal rules and no header.
// The old parser matched from the first --- and the fix kept only the text
// above it, plus lines that looked like "word: value".
test('fixing a doc with horizontal rules keeps every line of its body', () => {
    const body = [
        '# Guide', '', 'Intro.', '', '---', '', '## Architecture', '',
        'Step one: build it.', 'Plain prose line.', '', '---', '', '## Notes', '', 'Last words.', '',
    ].join('\n');
    const file = write('rules/guide.md', body);
    ok(t.applyHeader(file), 'applyHeader reported failure');
    const out = fs.readFileSync(file, 'utf8');
    for (const line of body.split('\n').filter(Boolean)) { has(out, line, `lost: ${line}`); }
});

// The case that actually destroyed prose before #730: a rule in the body AND a
// trailer at the end. main's applyHeader() kept 1 of these 6 prose lines.
test('fixing a doc with a rule in its body and a trailer keeps all its prose', () => {
    const prose = ['Intro.', '## Architecture', 'Step one: build it.', 'Plain prose line.', '## Notes', 'Last words.'];
    const file = write('rule-and-trailer/guide.md', [
        '# Guide', '', prose[0], '', '---', '', prose[1], '', prose[2], prose[3], '', prose[4], '', prose[5], '',
        '---', 'id: guide', 'title: Guide', 'description: A guide.', '---', '',
    ].join('\n'));
    ok(t.applyHeader(file), 'applyHeader reported failure');
    const out = fs.readFileSync(file, 'utf8');
    for (const line of prose) { has(out, line, `lost: ${line}`); }
    ok(out.startsWith('---\nid: guide\n'), out.slice(0, 60));
});

test('fixing a 13-field trailer leaves the three-field block at the top', () => {
    const file = write('trailer/x.README.md',
        '# Feature: X\n\nDoes X.\n\n---\ndocid: 150.1.x\nid: feature-x\ntitle: Feature: X\ndescription: Does X well.\nstatus: active\ntags: [a, b]\n---\n');
    t.applyHeader(file);
    const out = fs.readFileSync(file, 'utf8');
    ok(out.startsWith('---\nid: feature-x\n'), out.slice(0, 80));
    ok(!/docid|status|tags/.test(out), 'retired fields were written back');
    has(out, 'Does X.');
});

test('a compliant doc is not rewritten', () => {
    const text = '---\nid: a\ntitle: A\ndescription: The A doc.\n---\n\n# A\n';
    const file = write('ok/a.md', text);
    const before = fs.statSync(file).mtimeMs;
    t.applyHeader(file);
    eq(fs.readFileSync(file, 'utf8'), text);
    eq(fs.statSync(file).mtimeMs, before, 'file was written although nothing changed');
});

test('an unreadable path reports failure instead of throwing', () => {
    eq(t.applyHeader(path.join(TMP, 'does-not-exist.md')), false);
});

// ═══════════════════════════════════════════════════════════
// scanDirectory() — what the compliance panel lists
// ═══════════════════════════════════════════════════════════
console.log('\n-- scanDirectory() --');

const scanRoot = path.join(TMP, 'scan');
write('scan/good.md', '---\nid: good\ntitle: Good\ndescription: Fine.\n---\n\n# Good\n');
write('scan/none.md', '# No header\n\nText.\n');
write('scan/sub/old.md', '# Old\n\n---\nid: old\ntitle: Old\ndescription: d\ncategory: 150.1\n---\n');
write('scan/node_modules/skip.md', '# skipped\n');

const reports = t.scanDirectory(scanRoot, 'proj', scanRoot);
const byName = Object.fromEntries(reports.map(r => [r.relativePath, r]));

test('scans nested docs and skips node_modules', () => {
    eq(reports.length, 3, reports.map(r => r.relativePath).join(', '));
    ok(!byName['node_modules/skip.md'], 'node_modules was scanned');
});

test('a compliant doc has no problems', () => {
    eq(byName['good.md'].hasFrontmatter, true);
    eq(byName['good.md'].missingFields.length, 0, byName['good.md'].missingFields.join('; '));
});

test('a doc with no header is reported as having none', () => {
    eq(byName['none.md'].hasFrontmatter, false);
});

test('an old trailer is reported for its placement and its extra field', () => {
    const r = byName['sub/old.md'];
    ok(r, 'sub/old.md missing (relative paths must use forward slashes)');
    ok(r.missingFields.includes('frontmatter at the bottom'), r.missingFields.join('; '));
    ok(r.missingFields.some(v => v.includes('category')), r.missingFields.join('; '));
});

// ═══════════════════════════════════════════════════════════
// toRelativePath()
// ═══════════════════════════════════════════════════════════
console.log('\n-- toRelativePath() --');

test('returns a forward-slash path relative to the project root', () => {
    const root = path.join(TMP, 'proj');
    eq(t.toRelativePath(path.join(root, 'src', 'features', 'x.md'), root), 'src/features/x.md');
});

test('returns just the file name when the file is at the project root', () => {
    const root = path.join(TMP, 'proj');
    eq(t.toRelativePath(path.join(root, 'README.md'), root), 'README.md');
});

fs.rmSync(TMP, { recursive: true, force: true });

console.log('\n' + '─'.repeat(50));
if (failed === 0) {
    console.log(`✓ All ${passed} tests passed\n`);
    process.exit(0);
}
console.error(`\n✗ ${failed} test(s) FAILED\n`);
process.exit(1);
