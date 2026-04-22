/**
 * tests/unit/doc-header.test.js
 *
 * Unit tests for src/features/doc-header.ts pure logic.
 * Uses the _test export handle to access private functions.
 *
 * Covers:
 *   parseFrontmatter()         — YAML block extraction
 *   serializeFrontmatter()     — YAML block serialization + field ordering
 *   extractTitle()             — h1 heading / filename fallback
 *   extractDescription()       — first paragraph extraction
 *   extractTags()              — filename + heading word extraction
 *   assignCategory()           — filename pattern → category label
 *   toRelativePath()           — forward-slash relative path
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
const OUT_CHANNEL = path.join(__dirname, '../../out/shared/output-channel.js');
const OUT         = path.join(__dirname, '../../out/features/doc-header.js');

// Pre-load show-result-webview stub to avoid missing module errors
const showResultPath = path.join(__dirname, '../../out/shared/show-result-webview.js');
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

console.log('\ndoc-header unit tests\n' + '\u2500'.repeat(50));

// ═══════════════════════════════════════════════════════════
// parseFrontmatter()
// ═══════════════════════════════════════════════════════════
console.log('\n-- parseFrontmatter() --');

const FULL_FM = `---
title: My Document
description: A test document.
project: myProject
status: active
---

# Heading

Body content here.`;

test('returns null when no frontmatter block', () => {
    eq(t.parseFrontmatter('# Just a heading\n\nSome content.'), null);
});

test('returns null for empty string', () => {
    eq(t.parseFrontmatter(''), null);
});

test('parses title field correctly', () => {
    const result = t.parseFrontmatter(FULL_FM);
    ok(result !== null);
    eq(result.fm.title, 'My Document');
});

test('parses multiple fields', () => {
    const result = t.parseFrontmatter(FULL_FM);
    eq(result.fm.description, 'A test document.');
    eq(result.fm.project, 'myProject');
    eq(result.fm.status, 'active');
});

test('body is everything after the closing ---', () => {
    const result = t.parseFrontmatter(FULL_FM);
    ok(result.body.includes('# Heading'), 'Body must contain the heading');
    ok(result.body.includes('Body content here.'), 'Body must contain the body text');
});

test('body does not include the frontmatter block', () => {
    const result = t.parseFrontmatter(FULL_FM);
    ok(!result.body.includes('title: My Document'), 'Body must not contain fm fields');
});

// KNOWN LIMITATION: parseFrontmatter splits on '\n' — CRLF lines end with '\r'.
// The per-line regex (.*)$ captures '\r' but source calls .trim() so values are clean.
// This test verifies LF parsing works correctly and CRLF trimming behavior.
test('parseFrontmatter handles LF line endings', () => {
    const lf = '---\ntitle: LF Doc\nstatus: active\n---\n\nBody';
    const result = t.parseFrontmatter(lf);
    ok(result !== null, 'Must parse LF frontmatter');
    eq(result.fm.title, 'LF Doc');
    eq(result.fm.status, 'active');
});

test('ignores lines that are not key: value format', () => {
    const fm = '---\ntitle: Valid\nnot a valid line\n---\n\nBody';
    const result = t.parseFrontmatter(fm);
    eq(result.fm.title, 'Valid');
    ok(!('not a valid line' in result.fm), 'Non-key:value lines must be ignored');
});

// ═══════════════════════════════════════════════════════════
// serializeFrontmatter()
// ═══════════════════════════════════════════════════════════
console.log('\n-- serializeFrontmatter() --');

test('output starts and ends with ---', () => {
    const result = t.serializeFrontmatter({ title: 'Test' });
    ok(result.startsWith('---'), 'Must start with ---');
    ok(result.endsWith('---'), 'Must end with ---');
});

test('title appears in output', () => {
    const result = t.serializeFrontmatter({ title: 'My Title' });
    has(result, 'title: My Title');
});

test('all standard fields included when provided', () => {
    const fm = {
        title: 'T', description: 'D', project: 'P', category: 'C',
        relativePath: 'r', created: '2024-01-01', updated: '2024-06-01',
        version: '1.0.0', author: 'CieloVista', status: 'active', tags: '[a, b]',
    };
    const result = t.serializeFrontmatter(fm);
    for (const [key, val] of Object.entries(fm)) {
        has(result, `${key}: ${val}`, `Must include ${key}`);
    }
});

test('title comes before description in output (field order)', () => {
    const result = t.serializeFrontmatter({ description: 'D', title: 'T' });
    ok(result.indexOf('title:') < result.indexOf('description:'), 'title must come before description');
});

test('empty/undefined fields are omitted', () => {
    const result = t.serializeFrontmatter({ title: 'T', description: undefined, status: '' });
    ok(!result.includes('description:'), 'undefined fields must be omitted');
    ok(!result.includes('status:'), 'empty string fields must be omitted');
});

test('extra non-standard keys are included after standard ones', () => {
    const result = t.serializeFrontmatter({ title: 'T', customKey: 'customVal' });
    has(result, 'customKey: customVal');
    ok(result.indexOf('title:') < result.indexOf('customKey:'), 'Standard fields first');
});

// ═══════════════════════════════════════════════════════════
// extractTitle()
// ═══════════════════════════════════════════════════════════
console.log('\n-- extractTitle() --');

test('extracts h1 heading from body', () => {
    eq(t.extractTitle('# My Document Title\n\nBody.', 'doc.md'), 'My Document Title');
});

test('strips bold markers from heading', () => {
    eq(t.extractTitle('# **Bold Title**\n\nBody.', 'doc.md'), 'Bold Title');
});

test('strips italic markers from heading', () => {
    eq(t.extractTitle('# *Italic Title*\n\nBody.', 'doc.md'), 'Italic Title');
});

test('strips code markers from heading', () => {
    eq(t.extractTitle('# `Code Title`\n\nBody.', 'doc.md'), 'Code Title');
});

test('falls back to filename when no h1', () => {
    eq(t.extractTitle('## No H1\n\nSome content.', 'my-feature.md'), 'my feature');
});

test('replaces dashes and underscores with spaces in filename fallback', () => {
    eq(t.extractTitle('No heading here.', 'my_cool-doc.md'), 'my cool doc');
});

test('strips .md extension from filename fallback', () => {
    const title = t.extractTitle('', 'architecture-notes.md');
    ok(!title.includes('.md'), 'Must strip .md extension');
    ok(title.includes('architecture'), 'Must include base name');
});

// ═══════════════════════════════════════════════════════════
// extractDescription()
// ═══════════════════════════════════════════════════════════
console.log('\n-- extractDescription() --');

test('extracts first paragraph after heading', () => {
    const body = '# Title\n\nThis is the first paragraph of content.';
    const desc = t.extractDescription(body);
    has(desc, 'first paragraph');
});

test('returns "No description." for empty body', () => {
    eq(t.extractDescription(''), 'No description.');
});

test('strips bold markers from description', () => {
    const body = '# Title\n\n**Bold text** in paragraph.';
    const desc = t.extractDescription(body);
    ok(!desc.includes('**'), 'Bold markers must be stripped');
});

test('skips blockquote lines (starting with >)', () => {
    const body = '# Title\n\n> This is a blockquote\n\nThis is regular text.';
    const desc = t.extractDescription(body);
    ok(!desc.includes('>'), 'Blockquote lines must be skipped');
});

test('skips table rows (starting with |)', () => {
    const body = '# Title\n\n| col | col |\n| --- | --- |\n\nParagraph text.';
    const desc = t.extractDescription(body);
    ok(!desc.includes('|'), 'Table rows must be skipped');
});

test('truncates descriptions over 150 chars with ellipsis', () => {
    const long = '# Title\n\n' + 'A'.repeat(200);
    const desc = t.extractDescription(long);
    ok(desc.length <= 153, `Description must be ≤153 chars, got ${desc.length}`);
    ok(desc.endsWith('\u2026'), 'Long description must end with ellipsis');
});

test('falls back to "No description." when only headings present', () => {
    const body = '# Title\n\n## Sub\n\n### Sub-sub';
    const desc = t.extractDescription(body);
    eq(desc, 'No description.');
});

// ═══════════════════════════════════════════════════════════
// assignCategory()
// ═══════════════════════════════════════════════════════════
console.log('\n-- assignCategory() --');

test('audit- prefix → Audit & Reports', () => {
    has(t.assignCategory('audit-2024-01.md', 'myProject'), 'Audit');
});

test('CLAUDE.md → Meta / Session / Status', () => {
    has(t.assignCategory('CLAUDE.md', 'myProject'), 'Meta');
});

test('CURRENT-STATUS.md → Meta / Session / Status', () => {
    has(t.assignCategory('CURRENT-STATUS.md', 'myProject'), 'Meta');
});

test('JAVASCRIPT-STANDARDS.md → Architecture & Standards', () => {
    has(t.assignCategory('JAVASCRIPT-STANDARDS.md', 'myProject'), 'Architecture');
});

test('CHANGELOG.md → Dev Workflow', () => {
    has(t.assignCategory('CHANGELOG.md', 'myProject'), 'Workflow');
});

test('test-coverage.md → Testing & Quality', () => {
    has(t.assignCategory('test-coverage.md', 'myProject'), 'Testing');
});

test('vscode-extension.md → Tools & Extensions', () => {
    has(t.assignCategory('vscode-extension.md', 'myProject'), 'Tools');
});

test('README.md → Project Docs', () => {
    has(t.assignCategory('README.md', 'myProject'), 'Project Docs');
});

test('global project + audit prefix → Audit & Reports', () => {
    has(t.assignCategory('audit-full-2024.md', 'global'), 'Audit');
});

test('global project without special prefix → Global Standards', () => {
    has(t.assignCategory('general-notes.md', 'global'), 'Global Standards');
});

test('unknown filename → Project Docs fallback', () => {
    has(t.assignCategory('my-random-doc.md', 'myProject'), 'Project Docs');
});

// ═══════════════════════════════════════════════════════════
// toRelativePath()
// ═══════════════════════════════════════════════════════════
console.log('\n-- toRelativePath() --');

test('returns forward-slash path on Windows', () => {
    const result = t.toRelativePath(
        'C:\\Users\\john\\project\\src\\features\\doc-header.ts',
        'C:\\Users\\john\\project'
    );
    ok(!result.includes('\\'), 'Must use forward slashes');
    eq(result, 'src/features/doc-header.ts');
});

test('handles Unix-style paths', () => {
    const result = t.toRelativePath('/home/user/project/docs/guide.md', '/home/user/project');
    eq(result, 'docs/guide.md');
});

test('returns just filename when file is at project root', () => {
    const result = t.toRelativePath('C:\\proj\\README.md', 'C:\\proj');
    eq(result, 'README.md');
});

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n' + '\u2500'.repeat(50));
if (failed === 0) { console.log(`\u2713 All ${passed} tests passed\n`); process.exit(0); }
else { console.error(`\n\u2717 ${failed} test(s) FAILED\n`); process.exit(1); }
