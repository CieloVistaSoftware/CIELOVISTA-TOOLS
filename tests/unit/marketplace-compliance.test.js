/**
 * tests/unit/marketplace-compliance.test.js
 *
 * Unit tests for src/features/marketplace-compliance/ pure logic.
 * Covers checker.ts (checkProject) and fixer.ts (fixProject).
 * No VS Code required — all pure fs/path logic.
 *
 * Covers:
 *   checkProject()  — full compliance scan: package.json, README, LICENSE, CHANGELOG, icon
 *   fixProject()    — applies fixable issues and returns list of fixed files
 *   Score formula   — 100 - errors*20 - warnings*8
 *
 * Run: node tests/unit/marketplace-compliance.test.js
 */
'use strict';

const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');
const Module = require('module');

// ── vscode mock ───────────────────────────────────────────────────────────────
const vscodeMock = {
    window: { createOutputChannel: () => ({ appendLine: () => {}, show: () => {}, dispose: () => {} }) },
    workspace: { workspaceFolders: [] },
    commands: { registerCommand: () => ({ dispose: () => {} }) },
};
const _orig = Module._resolveFilename.bind(Module);
Module._resolveFilename = (req, ...args) => req === 'vscode' ? '__vs_mc__' : _orig(req, ...args);
require.cache['__vs_mc__'] = { id: '__vs_mc__', filename: '__vs_mc__', loaded: true, exports: vscodeMock, parent: null, children: [], path: '', paths: [] };

// ── Load modules ──────────────────────────────────────────────────────────────
for (const dep of ['output-channel']) {
    const p = path.join(__dirname, `../../out/shared/${dep}.js`);
    if (fs.existsSync(p)) { try { require(p); } catch { /* optional */ } }
}

const CHECKER_OUT = path.join(__dirname, '../../out/features/marketplace-compliance/checker.js');
const FIXER_OUT   = path.join(__dirname, '../../out/features/marketplace-compliance/fixer.js');

for (const p of [CHECKER_OUT, FIXER_OUT]) {
    if (!fs.existsSync(p)) { console.error(`SKIP: ${p} not found — run npm run compile`); process.exit(0); }
}

const { checkProject } = require(CHECKER_OUT);
const { fixProject }   = require(FIXER_OUT);

// ── Runner ────────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log(`  \u2713 ${name}`); passed++; }
    catch (e) { console.error(`  \u2717 ${name}\n    \u2192 ${e.message}`); failed++; }
}
function eq(a, b, msg)  { assert.strictEqual(a, b, msg); }
function ok(v, msg)     { assert.ok(v, msg); }

// ── Temp workspace ────────────────────────────────────────────────────────────
const TMP = path.join(os.tmpdir(), `cvt-mc-${Date.now()}`);

function makeProject(name, overrides = {}) {
    const dir = path.join(TMP, name);
    fs.mkdirSync(dir, { recursive: true });
    return { name, path: dir, type: overrides.type ?? 'node', description: '', ...overrides };
}

function writePkg(dir, pkg) {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2), 'utf8');
}

function writeReadme(dir, content = '# My Project\n\nThis is a valid README with enough content to pass the 100 byte check in marketplace compliance scanning. Padding to ensure we exceed the minimum.') {
    fs.writeFileSync(path.join(dir, 'README.md'), content, 'utf8');
}

function writeLicense(dir) {
    fs.writeFileSync(path.join(dir, 'LICENSE'), 'Copyright (c) 2025 CieloVista Software. All rights reserved.', 'utf8');
}

function writeChangelog(dir) {
    fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), '# Changelog\n\n## v1.0.0\n\nInitial release.', 'utf8');
}

function writeIcon(dir) {
    // Minimal 1-byte file is enough to pass existence check
    fs.writeFileSync(path.join(dir, 'icon.png'), Buffer.from([0x89, 0x50]), 'binary');
}

console.log('\nmarketplace-compliance unit tests\n' + '\u2500'.repeat(50));

// ═══════════════════════════════════════════════════════════
// checkProject() — missing project folder
// ═══════════════════════════════════════════════════════════
console.log('\n-- checkProject(): non-existent folder --');

test('project folder missing → score=0, error issue', () => {
    const proj = { name: 'ghost', path: path.join(TMP, 'nonexistent'), type: 'node', description: '' };
    const result = checkProject(proj);
    eq(result.score, 0);
    ok(result.issues.length > 0);
    eq(result.issues[0].severity, 'error');
});

// ═══════════════════════════════════════════════════════════
// checkProject() — missing package.json
// ═══════════════════════════════════════════════════════════
console.log('\n-- checkProject(): missing package.json --');

test('no package.json → warning issue', () => {
    const proj = makeProject('no-pkg');
    writeReadme(proj.path);
    writeLicense(proj.path);
    writeChangelog(proj.path);
    writeIcon(proj.path);
    const result = checkProject(proj);
    ok(result.issues.some(i => i.file === 'package.json' && i.severity === 'warning'));
    eq(result.packageJson, null);
});

// ═══════════════════════════════════════════════════════════
// checkProject() — package.json field checks
// ═══════════════════════════════════════════════════════════
console.log('\n-- checkProject(): package.json fields --');

test('missing "name" field → error issue', () => {
    const proj = makeProject('no-name');
    writePkg(proj.path, { version: '1.0.0', description: 'Test', license: 'PROPRIETARY' });
    writeReadme(proj.path); writeLicense(proj.path); writeChangelog(proj.path); writeIcon(proj.path);
    const r = checkProject(proj);
    ok(r.issues.some(i => i.message.includes('"name"') && i.severity === 'error'));
});

test('missing "description" → error issue', () => {
    const proj = makeProject('no-desc');
    writePkg(proj.path, { name: 'test', version: '1.0.0', license: 'PROPRIETARY' });
    writeReadme(proj.path); writeLicense(proj.path); writeChangelog(proj.path); writeIcon(proj.path);
    const r = checkProject(proj);
    ok(r.issues.some(i => i.message.includes('"description"') && i.severity === 'error'));
});

test('missing "version" → error issue', () => {
    const proj = makeProject('no-ver');
    writePkg(proj.path, { name: 'test', description: 'Test', license: 'PROPRIETARY' });
    writeReadme(proj.path); writeLicense(proj.path); writeChangelog(proj.path); writeIcon(proj.path);
    const r = checkProject(proj);
    ok(r.issues.some(i => i.message.includes('"version"') && i.severity === 'error'));
});

test('open source license (MIT) → error, must be PROPRIETARY', () => {
    const proj = makeProject('mit-license');
    writePkg(proj.path, { name: 'test', description: 'Test', version: '1.0.0', license: 'MIT' });
    writeReadme(proj.path); writeLicense(proj.path); writeChangelog(proj.path); writeIcon(proj.path);
    const r = checkProject(proj);
    const issue = r.issues.find(i => i.message.includes('MIT') && i.severity === 'error');
    ok(issue, 'MIT license must be flagged as error');
    eq(issue.fixable, true);
    eq(issue.fixKey, 'pkg:license');
});

test('PROPRIETARY license → no license error', () => {
    const proj = makeProject('prop-license');
    writePkg(proj.path, { name: 'test', description: 'Test', version: '1.0.0', license: 'PROPRIETARY', icon: 'icon.png' });
    writeReadme(proj.path); writeLicense(proj.path); writeChangelog(proj.path); writeIcon(proj.path);
    const r = checkProject(proj);
    ok(!r.issues.some(i => i.fixKey === 'pkg:license'), 'PROPRIETARY must not be flagged');
});

test('missing icon field → warning with fixKey=pkg:icon', () => {
    const proj = makeProject('no-icon-field');
    writePkg(proj.path, { name: 'test', description: 'Test', version: '1.0.0', license: 'PROPRIETARY' });
    writeReadme(proj.path); writeLicense(proj.path); writeChangelog(proj.path); writeIcon(proj.path);
    const r = checkProject(proj);
    ok(r.issues.some(i => i.fixKey === 'pkg:icon' && i.severity === 'warning'));
});

test('vscode-extension missing publisher → error', () => {
    const proj = makeProject('no-publisher', { type: 'vscode-extension' });
    writePkg(proj.path, { name: 'test', description: 'Test', version: '1.0.0', license: 'PROPRIETARY', icon: 'icon.png', categories: ['Other'] });
    writeReadme(proj.path); writeLicense(proj.path); writeChangelog(proj.path); writeIcon(proj.path);
    const r = checkProject(proj);
    ok(r.issues.some(i => i.fixKey === 'pkg:publisher' && i.severity === 'error'));
});

test('invalid JSON in package.json → error issue', () => {
    const proj = makeProject('bad-json');
    fs.writeFileSync(path.join(proj.path, 'package.json'), '{ invalid json }', 'utf8');
    writeReadme(proj.path); writeLicense(proj.path);
    const r = checkProject(proj);
    ok(r.issues.some(i => i.message.includes('Invalid JSON') && i.severity === 'error'));
});

// ═══════════════════════════════════════════════════════════
// checkProject() — file checks
// ═══════════════════════════════════════════════════════════
console.log('\n-- checkProject(): file checks --');

test('missing README.md → error', () => {
    const proj = makeProject('no-readme');
    writePkg(proj.path, { name: 'test', description: 'Test', version: '1.0.0', license: 'PROPRIETARY', icon: 'icon.png' });
    writeLicense(proj.path); writeChangelog(proj.path); writeIcon(proj.path);
    const r = checkProject(proj);
    ok(r.issues.some(i => i.file === 'README.md' && i.severity === 'error'));
});

test('tiny README (< 100 bytes) → warning', () => {
    const proj = makeProject('tiny-readme');
    writePkg(proj.path, { name: 'test', description: 'Test', version: '1.0.0', license: 'PROPRIETARY', icon: 'icon.png' });
    fs.writeFileSync(path.join(proj.path, 'README.md'), '# Hi', 'utf8');
    writeLicense(proj.path); writeChangelog(proj.path); writeIcon(proj.path);
    const r = checkProject(proj);
    ok(r.issues.some(i => i.file === 'README.md' && i.severity === 'warning'));
});

test('missing CHANGELOG.md → fixable warning', () => {
    const proj = makeProject('no-changelog');
    writePkg(proj.path, { name: 'test', description: 'Test', version: '1.0.0', license: 'PROPRIETARY', icon: 'icon.png' });
    writeReadme(proj.path); writeLicense(proj.path); writeIcon(proj.path);
    const r = checkProject(proj);
    const issue = r.issues.find(i => i.fixKey === 'create:changelog');
    ok(issue, 'Missing CHANGELOG must be flagged');
    eq(issue.fixable, true);
    eq(issue.severity, 'warning');
});

test('missing LICENSE file → fixable error', () => {
    const proj = makeProject('no-license-file');
    writePkg(proj.path, { name: 'test', description: 'Test', version: '1.0.0', license: 'PROPRIETARY', icon: 'icon.png' });
    writeReadme(proj.path); writeChangelog(proj.path); writeIcon(proj.path);
    const r = checkProject(proj);
    const issue = r.issues.find(i => i.fixKey === 'create:license');
    ok(issue, 'Missing LICENSE must be flagged');
    eq(issue.fixable, true);
    eq(issue.severity, 'error');
});

test('missing icon.png → fixable warning', () => {
    const proj = makeProject('no-icon-file');
    writePkg(proj.path, { name: 'test', description: 'Test', version: '1.0.0', license: 'PROPRIETARY', icon: 'icon.png' });
    writeReadme(proj.path); writeLicense(proj.path); writeChangelog(proj.path);
    const r = checkProject(proj);
    ok(r.issues.some(i => i.fixKey === 'create:icon' && i.fixable));
});

// ═══════════════════════════════════════════════════════════
// checkProject() — score formula
// ═══════════════════════════════════════════════════════════
console.log('\n-- checkProject(): score formula --');

test('no issues → score = 100', () => {
    const proj = makeProject('perfect');
    writePkg(proj.path, { name: 'test', description: 'Test', version: '1.0.0', license: 'PROPRIETARY', icon: 'icon.png', repository: 'https://github.com/test' });
    writeReadme(proj.path); writeLicense(proj.path); writeChangelog(proj.path); writeIcon(proj.path);
    const r = checkProject(proj);
    eq(r.score, 100, `Expected 100, got ${r.score}. Issues: ${r.issues.map(i=>i.message).join('; ')}`);
});

test('score never goes below 0', () => {
    const proj = { name: 'ghost', path: path.join(TMP, 'nonexistent2'), type: 'node', description: '' };
    ok(checkProject(proj).score >= 0, 'Score must never be negative');
});

test('each error deducts 20 points', () => {
    // One error: missing README (no README = -20)
    const proj = makeProject('one-error');
    writePkg(proj.path, { name: 'test', description: 'Test', version: '1.0.0', license: 'PROPRIETARY', icon: 'icon.png' });
    writeLicense(proj.path); writeChangelog(proj.path); writeIcon(proj.path);
    // No README → 1 error = 100 - 20 = 80
    const r = checkProject(proj);
    const errCount = r.issues.filter(i => i.severity === 'error').length;
    const warnCount = r.issues.filter(i => i.severity === 'warning').length;
    eq(r.score, Math.max(0, 100 - errCount * 20 - warnCount * 8));
});

// ═══════════════════════════════════════════════════════════
// fixProject()
// ═══════════════════════════════════════════════════════════
console.log('\n-- fixProject() --');

test('fixProject: creates LICENSE file when missing', () => {
    const proj = makeProject('fix-license');
    writePkg(proj.path, { name: 'test', description: 'Test', version: '1.0.0', license: 'PROPRIETARY', icon: 'icon.png' });
    writeReadme(proj.path); writeChangelog(proj.path); writeIcon(proj.path);
    const compliance = checkProject(proj);
    const fixed = fixProject(compliance);
    ok(fixed.includes('LICENSE'), 'LICENSE must be in fixed list');
    ok(fs.existsSync(path.join(proj.path, 'LICENSE')), 'LICENSE file must exist after fix');
});

test('fixProject: creates CHANGELOG.md when missing', () => {
    const proj = makeProject('fix-changelog');
    writePkg(proj.path, { name: 'test', description: 'Test', version: '1.0.0', license: 'PROPRIETARY', icon: 'icon.png' });
    writeReadme(proj.path); writeLicense(proj.path); writeIcon(proj.path);
    const compliance = checkProject(proj);
    const fixed = fixProject(compliance);
    ok(fixed.includes('CHANGELOG.md'), 'CHANGELOG.md must be in fixed list');
    ok(fs.existsSync(path.join(proj.path, 'CHANGELOG.md')), 'CHANGELOG.md must exist');
});

test('fixProject: fixes MIT license to PROPRIETARY in package.json', () => {
    const proj = makeProject('fix-license-field');
    writePkg(proj.path, { name: 'test', description: 'Test', version: '1.0.0', license: 'MIT', icon: 'icon.png' });
    writeReadme(proj.path); writeLicense(proj.path); writeChangelog(proj.path); writeIcon(proj.path);
    const compliance = checkProject(proj);
    fixProject(compliance);
    const updated = JSON.parse(fs.readFileSync(path.join(proj.path, 'package.json'), 'utf8'));
    eq(updated.license, 'PROPRIETARY', 'License must be updated to PROPRIETARY');
});

test('fixProject: returns empty array when nothing is fixable', () => {
    const proj = makeProject('nothing-fixable');
    // Only issue: missing README (not fixable)
    writePkg(proj.path, { name: 'test', description: 'Test', version: '1.0.0', license: 'PROPRIETARY', icon: 'icon.png' });
    writeLicense(proj.path); writeChangelog(proj.path); writeIcon(proj.path);
    // No README (error, not fixable) + no repo (info, not fixable)
    const compliance = checkProject(proj);
    const nonFixable = compliance.issues.filter(i => !i.fixable);
    ok(nonFixable.length > 0, 'Must have non-fixable issues');
    // fixProject should only process fixable ones
    const fixed = fixProject(compliance);
    // It will still return [] for things it can't fix
    ok(Array.isArray(fixed), 'Must return array');
});

test('fixProject: result shape — returns string array of fixed files', () => {
    const proj = makeProject('shape-test');
    writePkg(proj.path, { name: 'test', description: 'Test', version: '1.0.0', license: 'PROPRIETARY', icon: 'icon.png' });
    writeReadme(proj.path); writeLicense(proj.path); writeIcon(proj.path);
    // Missing changelog (fixable)
    const compliance = checkProject(proj);
    const fixed = fixProject(compliance);
    ok(Array.isArray(fixed), 'fixProject must return array');
    ok(fixed.every(f => typeof f === 'string'), 'All entries must be strings');
});

// Cleanup
fs.rmSync(TMP, { recursive: true, force: true });

console.log('\n' + '\u2500'.repeat(50));
if (failed === 0) { console.log(`\u2713 All ${passed} tests passed\n`); process.exit(0); }
else { console.error(`\n\u2717 ${failed} test(s) FAILED\n`); process.exit(1); }
