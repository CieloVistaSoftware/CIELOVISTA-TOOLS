/**
 * tests/unit/readme-compliance.test.js
 *
 * Unit tests for src/features/readme-compliance.ts pure logic.
 * Uses the _test export handle — no VS Code required.
 *
 * Covers:
 *   isReadme()           — filename detection
 *   detectType()         — PROJECT / FEATURE / STANDARD classification
 *   normalizeHeading()   — heading normalization
 *   extractHeadings()    — heading extraction from content
 *   checkCompliance()    — full compliance scoring engine
 *   applyFix()           — auto-fix application
 *   esc()                — HTML escaping
 *   REQUIRED_SECTIONS    — constants exported correctly
 *   LINE_LIMITS          — constants exported correctly
 *
 * Run: node tests/unit/readme-compliance.test.js
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
        createOutputChannel:           () => ({ appendLine: () => {}, show: () => {}, dispose: () => {} }),
        showErrorMessage:              () => Promise.resolve(),
        showWarningMessage:            () => Promise.resolve(),
        showInformationMessage:        () => Promise.resolve(),
        withProgress:                  async (_o, fn) => fn({ report: () => {} }),
        createWebviewPanel:            () => ({ webview: { html: '', onDidReceiveMessage: () => {}, postMessage: () => {} }, reveal: () => {}, onDidDispose: () => {}, dispose: () => {} }),
        registerWebviewPanelSerializer: () => {},
    },
    workspace: { workspaceFolders: [], openTextDocument: async () => ({}) },
    commands:  { registerCommand: () => ({ dispose: () => {} }) },
    ProgressLocation: { Notification: 15 },
    ViewColumn: { One: 1, Beside: 2 },
};

const _orig = Module._resolveFilename.bind(Module);
Module._resolveFilename = (req, ...args) => req === 'vscode' ? '__vs_rc__' : _orig(req, ...args);
require.cache['__vs_rc__'] = { id: '__vs_rc__', filename: '__vs_rc__', loaded: true, exports: vscodeMock, parent: null, children: [], path: '', paths: [] };

// ── Load dependencies ─────────────────────────────────────────────────────────
const DEPS = ['output-channel', 'result-viewer', 'registry', 'anthropic-client'];
for (const d of DEPS) {
    const p = path.join(__dirname, `../../out/shared/${d}.js`);
    if (fs.existsSync(p)) { try { require(p); } catch { /* optional */ } }
}

const OUT = path.join(__dirname, '../../out/features/readme-compliance.js');
if (!fs.existsSync(OUT)) { console.error('SKIP: not compiled'); process.exit(0); }

const rc = require(OUT);
const t  = rc._test;
if (!t) { console.error('SKIP: _test not exported'); process.exit(0); }

// ── Runner ────────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log(`  \u2713 ${name}`); passed++; }
    catch (e) { console.error(`  \u2717 ${name}\n    \u2192 ${e.message}`); failed++; }
}
function eq(a, b, msg)    { assert.strictEqual(a, b, msg); }
function ok(v, msg)       { assert.ok(v, msg); }
function has(s, sub, msg) { ok(String(s).includes(sub), msg || `Expected: ${sub}`); }

// ── Temp workspace ────────────────────────────────────────────────────────────
const TMP = path.join(os.tmpdir(), `cvt-rc-${Date.now()}`);
fs.mkdirSync(TMP, { recursive: true });

function writeFile(relPath, content) {
    const full = path.join(TMP, relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
    return full;
}

// Perfect PROJECT README — all required sections, all code blocks tagged
const PERFECT_PROJECT = [
    '# My Project',
    '',
    'One liner.',
    '',
    '## What it does',
    '',
    'It does stuff for developers.',
    '',
    '## Quick Start',
    '',
    '```powershell',
    'npm start',
    '```',
    '',
    '## Architecture',
    '',
    'Node.js + TypeScript.',
    '',
    '## Project Structure',
    '',
    '```text',
    'src/',
    '  features/',
    '```',
    '',
    '## Common Commands',
    '',
    '```powershell',
    'npm run build',
    'npm run test',
    '```',
    '',
    '## Prerequisites',
    '',
    '- Node.js LTS',
    '- npm 9+',
    '',
    '## License',
    '',
    'Copyright (c) 2025 CieloVista Software. All rights reserved.',
    '',
].join('\n');

console.log('\nreadme-compliance unit tests\n' + '\u2500'.repeat(50));

// ═══════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════
console.log('\n-- Constants --');

test('REQUIRED_SECTIONS.PROJECT has what it does, quick start, license', () => {
    ok(t.REQUIRED_SECTIONS.PROJECT.includes('what it does'));
    ok(t.REQUIRED_SECTIONS.PROJECT.includes('quick start'));
    ok(t.REQUIRED_SECTIONS.PROJECT.includes('license'));
});

test('REQUIRED_SECTIONS.FEATURE has what it does and manual test', () => {
    ok(t.REQUIRED_SECTIONS.FEATURE.includes('what it does'));
    ok(t.REQUIRED_SECTIONS.FEATURE.includes('manual test'));
});

test('REQUIRED_SECTIONS.STANDARD has purpose/rules/changelog', () => {
    ok(t.REQUIRED_SECTIONS.STANDARD.includes('purpose'));
    ok(t.REQUIRED_SECTIONS.STANDARD.includes('rules'));
    ok(t.REQUIRED_SECTIONS.STANDARD.includes('changelog'));
});

test('LINE_LIMITS: PROJECT=300, FEATURE=150, STANDARD=400', () => {
    eq(t.LINE_LIMITS.PROJECT, 300);
    eq(t.LINE_LIMITS.FEATURE, 150);
    eq(t.LINE_LIMITS.STANDARD, 400);
});

test('STUBS: every required section has a stub', () => {
    for (const type of ['PROJECT', 'FEATURE', 'STANDARD']) {
        for (const sec of t.REQUIRED_SECTIONS[type]) {
            ok(t.STUBS[type][sec] !== undefined, `${type} missing stub for "${sec}"`);
        }
    }
});

// ═══════════════════════════════════════════════════════════
// esc()
// ═══════════════════════════════════════════════════════════
console.log('\n-- esc() --');

test('& becomes &amp;',         () => eq(t.esc('a & b'), 'a &amp; b'));
test('< becomes &lt;',          () => eq(t.esc('<b>'), '&lt;b&gt;'));
test('" becomes &quot;',        () => eq(t.esc('"x"'), '&quot;x&quot;'));
test('safe string unchanged',   () => eq(t.esc('hello'), 'hello'));
test('empty string unchanged',  () => eq(t.esc(''), ''));

// ═══════════════════════════════════════════════════════════
// isReadme()
// ═══════════════════════════════════════════════════════════
console.log('\n-- isReadme() --');

test('README.md → true',                () => eq(t.isReadme('README.md'), true));
test('readme.md lowercase → true',      () => eq(t.isReadme('readme.md'), true));
test('feature.README.md → true',        () => eq(t.isReadme('doc-catalog.README.md'), true));
test('.README.md extension → true',     () => eq(t.isReadme('anything.README.md'), true));
test('CHANGELOG.md → false',            () => eq(t.isReadme('CHANGELOG.md'), false));
test('package.json → false',            () => eq(t.isReadme('package.json'), false));
test('notes.md → false',               () => eq(t.isReadme('notes.md'), false));
test('READING.md (not README) → false', () => eq(t.isReadme('READING.md'), false));

// ═══════════════════════════════════════════════════════════
// detectType()
// ═══════════════════════════════════════════════════════════
console.log('\n-- detectType() --');

test('README.md at project root → PROJECT', () => {
    const root = TMP;
    eq(t.detectType(path.join(root, 'README.md'), root, 'myProject'), 'PROJECT');
});

test('feature.README.md → FEATURE regardless of location', () => {
    eq(t.detectType(path.join(TMP, 'src', 'my-feature.README.md'), TMP, 'myProject'), 'FEATURE');
});

test('README.md inside src/ subdir → FEATURE', () => {
    eq(t.detectType(path.join(TMP, 'src', 'README.md'), TMP, 'myProject'), 'FEATURE');
});

test('README.md inside docs/sub/ → STANDARD (regex needs slash on both sides)', () => {
    // /[\\/]docs[\\/]/ matches when docs is a middle path component
    eq(t.detectType(path.join(TMP, 'docs', 'sub', 'README.md'), TMP, 'myProject'), 'STANDARD');
});

test('README.md in global project → STANDARD', () => {
    const root = path.join(TMP, 'global');
    eq(t.detectType(path.join(root, 'README.md'), root, 'global'), 'STANDARD');
});

// ═══════════════════════════════════════════════════════════
// normalizeHeading()
// ═══════════════════════════════════════════════════════════
console.log('\n-- normalizeHeading() --');

test('strips ## and lowercases',   () => eq(t.normalizeHeading('## Quick Start'), 'quick start'));
test('strips # and lowercases',    () => eq(t.normalizeHeading('# What It Does'), 'what it does'));
test('handles ### h3',             () => eq(t.normalizeHeading('### Internal Architecture'), 'internal architecture'));
test('empty string → empty',       () => eq(t.normalizeHeading(''), ''));

// ═══════════════════════════════════════════════════════════
// extractHeadings()
// ═══════════════════════════════════════════════════════════
console.log('\n-- extractHeadings() --');

test('extracts all headings', () => {
    const heads = t.extractHeadings('# Title\n\n## Quick Start\n\n## Architecture');
    ok(heads.includes('title'));
    ok(heads.includes('quick start'));
    ok(heads.includes('architecture'));
});

test('ignores non-heading lines', () => {
    const heads = t.extractHeadings('# Title\n\nParagraph text here.\n\n## Section');
    eq(heads.length, 2);
});

test('no headings → empty array', () => {
    eq(t.extractHeadings('Just plain text.').length, 0);
});

test('handles h4', () => {
    ok(t.extractHeadings('#### Sub-Sub').includes('sub-sub'));
});

// ═══════════════════════════════════════════════════════════
// checkCompliance() — scoring engine
// ═══════════════════════════════════════════════════════════
console.log('\n-- checkCompliance() --');

test('perfect PROJECT README scores >= 80', () => {
    // File must be at project root (not a subdirectory) to be detected as PROJECT type
    const root = path.join(TMP, 'perfect');
    fs.mkdirSync(root, { recursive: true });
    const file = path.join(root, 'README.md');
    fs.writeFileSync(file, PERFECT_PROJECT, 'utf8');
    const r = t.checkCompliance(file, 'myProject', root);
    ok(r.score >= 80, `Expected >= 80, got ${r.score}. Issues: ${r.issues.map(i=>i.message).join('; ')}`);
    eq(r.missingRequiredSections.length, 0, 'Must have no missing sections');
});

test('returns correct readmeType PROJECT for root README', () => {
    const root = path.join(TMP, 'typetest');
    fs.mkdirSync(root, { recursive: true });
    const file = path.join(root, 'README.md');
    fs.writeFileSync(file, '# Test\n\nBody.', 'utf8');
    eq(t.checkCompliance(file, 'typetest', root).readmeType, 'PROJECT');
});

test('minimal README scores < 80', () => {
    const file = writeFile('minimal/README.md', '# Minimal\n\nJust a title.\n');
    ok(t.checkCompliance(file, 'p', TMP).score < 80);
});

test('missing "what it does" flagged as fixable error', () => {
    const file = writeFile('no-wid/README.md', '# Project\n\n## Quick Start\n\nRun it.\n');
    const r = t.checkCompliance(file, 'p', TMP);
    const issue = r.issues.find(i => i.message.includes('what it does'));
    ok(issue, 'Must flag missing section');
    eq(issue.severity, 'error');
    eq(issue.fixable, true);
    ok(issue.fixKey.startsWith('missing-section:'));
});

test('bare code blocks flagged as warning with fixable=true', () => {
    const content = '# P\n\n## What it does\n\nStuff.\n\n```\ncode\n```\n';
    const file = writeFile('bare/README.md', content);
    const r = t.checkCompliance(file, 'p', TMP);
    const issue = r.issues.find(i => i.fixKey === 'code-block-lang');
    ok(issue, 'Must flag bare code blocks');
    eq(issue.severity, 'warning');
    eq(issue.fixable, true);
});

test('score is always 0–100', () => {
    const files = [
        writeFile('s1/README.md', ''),
        writeFile('s2/README.md', '# T\n\nBody.'),
        writeFile('s3/README.md', PERFECT_PROJECT),
    ];
    for (const f of files) {
        const s = t.checkCompliance(f, 'p', TMP).score;
        ok(s >= 0 && s <= 100, `Score ${s} out of range`);
    }
});

test('result has all required shape fields', () => {
    const file = writeFile('shape/README.md', PERFECT_PROJECT);
    const r = t.checkCompliance(file, 'p', TMP);
    for (const f of ['filePath','fileName','projectName','readmeType','score','issues','lineCount','missingRequiredSections','outOfOrderSections']) {
        ok(f in r, `Missing field: ${f}`);
    }
    ok(Array.isArray(r.issues));
});

test('lineCount matches actual line count', () => {
    const file = writeFile('lc/README.md', PERFECT_PROJECT);
    const r = t.checkCompliance(file, 'p', TMP);
    eq(r.lineCount, PERFECT_PROJECT.split('\n').length);
});

test('FEATURE README flags missing feature-specific sections', () => {
    const root = path.join(TMP, 'feattest');
    fs.mkdirSync(root, { recursive: true });
    const file = path.join(root, 'my-thing.README.md');
    fs.writeFileSync(file, '# feature: my-thing\n\n## What it does\n\nStuff.\n', 'utf8');
    const r = t.checkCompliance(file, 'p', root);
    eq(r.readmeType, 'FEATURE');
    ok(r.missingRequiredSections.length > 0, 'Feature README missing sections must be flagged');
});

test('file that does not exist returns score=0 with error issue', () => {
    const r = t.checkCompliance(path.join(TMP, 'nonexistent', 'README.md'), 'p', TMP);
    eq(r.score, 0);
    ok(r.issues.length > 0);
});

// ═══════════════════════════════════════════════════════════
// applyFix()
// ═══════════════════════════════════════════════════════════
console.log('\n-- applyFix() --');

test('applyFix adds missing sections as stubs', () => {
    const file = writeFile('af1/README.md', '# My Project\n\nShort readme.\n');
    const r = t.checkCompliance(file, 'p', TMP);
    const fixed = t.applyFix(r);
    ok(fixed.length > 30, 'Fixed content must be longer');
    ok(fixed.includes('##'), 'Fixed content must have section headings');
});

test('applyFix replaces bare ``` with ```text', () => {
    const content = '# P\n\n## What it does\n\nStuff.\n\n```\ncode\n```\n';
    const file = writeFile('af2/README.md', content);
    const r = t.checkCompliance(file, 'p', TMP);
    const fixed = t.applyFix(r);
    ok(!fixed.includes('```\ncode'), 'Bare code block must be fixed');
    ok(fixed.includes('```text'), 'Must add "text" language tag');
});

test('applyFix preserves existing content in perfect README', () => {
    const file = writeFile('af3/README.md', PERFECT_PROJECT);
    const r = t.checkCompliance(file, 'p', TMP);
    const fixed = t.applyFix(r);
    ok(fixed.includes('My Project'), 'Title preserved');
    ok(fixed.includes('What it does'), 'Existing section preserved');
});

// Cleanup
fs.rmSync(TMP, { recursive: true, force: true });

console.log('\n' + '\u2500'.repeat(50));
if (failed === 0) { console.log(`\u2713 All ${passed} tests passed\n`); process.exit(0); }
else { console.error(`\n\u2717 ${failed} test(s) FAILED\n`); process.exit(1); }
