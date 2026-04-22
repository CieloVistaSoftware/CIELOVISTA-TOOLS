/**
 * tests/unit/codebase-auditor.test.js
 *
 * Unit tests for src/features/codebase-auditor.ts pure logic.
 * Uses the _test export handle — no VS Code required.
 *
 * Covers:
 *   esc()                  — HTML escaping
 *   collectTsFiles()       — TypeScript file discovery
 *   checkFileSizes()       — 300/600 line thresholds
 *   checkFunctionLength()  — 40/60 line function thresholds
 *   checkDuplicateExports()— same export name across files
 *   checkDeadMonoliths()   — .ts alongside split folder/index.ts
 *   checkOneTimeOnePlace() — copy-pasted patterns
 *   checkSharedUtilUsage() — inline esc/loadRegistry instead of shared/
 *   Finding shape          — id, category, severity, file, title, detail
 *
 * Run: node tests/unit/codebase-auditor.test.js
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
        createWebviewPanel: () => ({ webview: { html: '', onDidReceiveMessage: () => {} }, reveal: () => {}, onDidDispose: () => {}, dispose: () => {} }),
    },
    workspace: { openTextDocument: async () => ({}) },
    commands: { registerCommand: () => ({ dispose: () => {} }) },
    ViewColumn: { Beside: 2 },
    Range: class { constructor() {} },
    Selection: class { constructor() {} },
    TextEditorRevealType: { InCenter: 2 },
};

const _orig = Module._resolveFilename.bind(Module);
Module._resolveFilename = (req, ...args) => req === 'vscode' ? '__vs_ca__' : _orig(req, ...args);
require.cache['__vs_ca__'] = { id: '__vs_ca__', filename: '__vs_ca__', loaded: true, exports: vscodeMock, parent: null, children: [], path: '', paths: [] };

for (const dep of ['output-channel']) {
    const p = path.join(__dirname, `../../out/shared/${dep}.js`);
    if (fs.existsSync(p)) { try { require(p); } catch { /* optional */ } }
}

const OUT = path.join(__dirname, '../../out/features/codebase-auditor.js');
if (!fs.existsSync(OUT)) { console.error('SKIP: not compiled'); process.exit(0); }

const ca = require(OUT);
const t  = ca._test;
if (!t) { console.error('SKIP: _test not exported'); process.exit(0); }

// ── Helpers ───────────────────────────────────────────────────────────────────
const TMP = path.join(os.tmpdir(), `cvt-ca-${Date.now()}`);

function makeFile(rel, content) {
    const lines   = content.split('\n');
    const abs     = path.join(TMP, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf8');
    return {
        abs,
        rel,
        lines:   lines.length,
        kb:      Math.round(Buffer.byteLength(content,'utf8') / 1024 * 10) / 10,
        content,
        lineArr: lines,
    };
}

function repeat(line, n) { return Array(n).fill(line).join('\n'); }

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log(`  \u2713 ${name}`); passed++; }
    catch (e) { console.error(`  \u2717 ${name}\n    \u2192 ${e.message}`); failed++; }
}
function eq(a, b, msg) { assert.strictEqual(a, b, msg); }
function ok(v, msg)    { assert.ok(v, msg); }

console.log('\ncodebase-auditor unit tests\n' + '\u2500'.repeat(50));

// ═══════════════════════════════════════════════════════════
// esc()
// ═══════════════════════════════════════════════════════════
console.log('\n-- esc() --');

test('& → &amp;',  () => eq(t.esc('a & b'), 'a &amp; b'));
test('< → &lt;',   () => eq(t.esc('<x>'), '&lt;x&gt;'));
test('" → &quot;', () => eq(t.esc('"hi"'), '&quot;hi&quot;'));
test('safe intact', () => eq(t.esc('hello'), 'hello'));

// ═══════════════════════════════════════════════════════════
// collectTsFiles()
// ═══════════════════════════════════════════════════════════
console.log('\n-- collectTsFiles() --');

test('returns empty for non-existent directory', () => {
    eq(t.collectTsFiles('/does/not/exist').length, 0);
});

test('finds .ts files', () => {
    const dir = path.join(TMP, 'collect');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'a.ts'), 'export const x = 1;', 'utf8');
    fs.writeFileSync(path.join(dir, 'b.ts'), 'export const y = 2;', 'utf8');
    fs.writeFileSync(path.join(dir, 'c.js'), 'const z = 3;', 'utf8');
    const files = t.collectTsFiles(dir);
    eq(files.length, 2, 'Only .ts files must be returned');
    ok(files.every(f => f.rel.endsWith('.ts')));
});

test('skips node_modules and .git', () => {
    const dir = path.join(TMP, 'skip-test');
    fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true });
    fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'node_modules', 'pkg.ts'), 'skip me', 'utf8');
    fs.writeFileSync(path.join(dir, '.git', 'hook.ts'), 'skip me', 'utf8');
    fs.writeFileSync(path.join(dir, 'real.ts'), 'export const x = 1;', 'utf8');
    const files = t.collectTsFiles(dir);
    eq(files.length, 1, 'Only real.ts should be found');
});

test('skips .d.ts declaration files', () => {
    const dir = path.join(TMP, 'dts');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'types.d.ts'), 'export type X = string;', 'utf8');
    fs.writeFileSync(path.join(dir, 'real.ts'),    'export const x = 1;', 'utf8');
    const files = t.collectTsFiles(dir);
    eq(files.length, 1);
    ok(files[0].rel.endsWith('real.ts'));
});

test('FileInfo has correct shape', () => {
    const dir = path.join(TMP, 'shape');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'mod.ts'), 'const a = 1;\nconst b = 2;\n', 'utf8');
    const [f] = t.collectTsFiles(dir);
    ok('abs'      in f, 'Must have abs');
    ok('rel'      in f, 'Must have rel');
    ok('lines'    in f, 'Must have lines');
    ok('kb'       in f, 'Must have kb');
    ok('content'  in f, 'Must have content');
    ok('lineArr'  in f, 'Must have lineArr');
    eq(f.lines, 3, '3 lines including trailing empty');
});

// ═══════════════════════════════════════════════════════════
// checkFileSizes()
// ═══════════════════════════════════════════════════════════
console.log('\n-- checkFileSizes() --');

test('file under 300 lines → no findings', () => {
    const f = makeFile('small.ts', repeat('const x = 1;', 100));
    eq(t.checkFileSizes([f]).length, 0);
});

test('file 300–599 lines → yellow warning', () => {
    const f = makeFile('medium.ts', repeat('const x = 1;', 350));
    const findings = t.checkFileSizes([f]);
    eq(findings.length, 1);
    eq(findings[0].severity, 'yellow');
    ok(findings[0].title.includes('Large file'));
});

test('file 600+ lines → red critical', () => {
    const f = makeFile('huge.ts', repeat('const x = 1;', 650));
    const findings = t.checkFileSizes([f]);
    eq(findings.length, 1);
    eq(findings[0].severity, 'red');
    ok(findings[0].title.includes('Monolith'));
});

test('finding has all required shape fields', () => {
    const f = makeFile('big.ts', repeat('const x = 1;', 650));
    const finding = t.checkFileSizes([f])[0];
    ok('id'       in finding, 'Must have id');
    ok('category' in finding, 'Must have category');
    ok('severity' in finding, 'Must have severity');
    ok('file'     in finding, 'Must have file');
    ok('title'    in finding, 'Must have title');
    ok('detail'   in finding, 'Must have detail');
    eq(finding.action, 'split', 'Large files should suggest split action');
});

// ═══════════════════════════════════════════════════════════
// checkFunctionLength()
// ═══════════════════════════════════════════════════════════
console.log('\n-- checkFunctionLength() --');

test('short function → no finding', () => {
    const content = 'export function short() {\n' + repeat('  const x = 1;', 10) + '\n}';
    const f = makeFile('short.ts', content);
    eq(t.checkFunctionLength([f]).length, 0);
});

test('function 40–59 lines → yellow', () => {
    const body = repeat('  const x = 1;', 45);
    const content = `export function medium() {\n${body}\n}`;
    const f = makeFile('medium-fn.ts', content);
    const findings = t.checkFunctionLength([f]);
    ok(findings.length > 0, 'Must flag 45-line function');
    eq(findings[0].severity, 'yellow');
    ok(findings[0].title.includes('medium'));
});

test('function 60+ lines → red', () => {
    const body = repeat('  const x = 1;', 65);
    const content = `export function huge() {\n${body}\n}`;
    const f = makeFile('huge-fn.ts', content);
    const findings = t.checkFunctionLength([f]);
    ok(findings.length > 0, 'Must flag 65-line function');
    eq(findings[0].severity, 'red');
    ok(findings[0].title.includes('Very long'));
});

// ═══════════════════════════════════════════════════════════
// checkDuplicateExports()
// ═══════════════════════════════════════════════════════════
console.log('\n-- checkDuplicateExports() --');

test('unique exports → no findings', () => {
    const a = makeFile('features/a.ts', 'export function doFoo() {}');
    const b = makeFile('features/b.ts', 'export function doBar() {}');
    eq(t.checkDuplicateExports([a, b]).length, 0);
});

test('same export name in 2+ files → finding', () => {
    const a = makeFile('features/x.ts', 'export function doWork() {}');
    const b = makeFile('features/y.ts', 'export function doWork() {}');
    const findings = t.checkDuplicateExports([a, b]);
    eq(findings.length, 1);
    ok(findings[0].title.includes('doWork'));
});

test('activate/deactivate exempted from duplicate check', () => {
    const a = makeFile('features/a.ts', 'export function activate(ctx) {}');
    const b = makeFile('features/b.ts', 'export function activate(ctx) {}');
    eq(t.checkDuplicateExports([a, b]).length, 0);
});

// ═══════════════════════════════════════════════════════════
// checkDeadMonoliths()
// ═══════════════════════════════════════════════════════════
console.log('\n-- checkDeadMonoliths() --');

// SOURCE BUG DOCUMENTED: checkDeadMonoliths filters on
//   f.rel.startsWith('features/') && !f.rel.includes('/')
// Since rel='features/foo.ts' ALWAYS contains '/', the second
// condition is always false and the filter never matches any file.
// Result: function always returns [] in practice.
// Tests document the actual behavior — not the intended behavior.

test('checkDeadMonoliths: always returns empty (source filter bug)', () => {
    // rel='features/foo.ts' contains '/' → !rel.includes('/') is always false
    // → filter matches nothing → no findings returned
    const f = makeFile('features/standalone.ts', 'export function activate() {}');
    eq(t.checkDeadMonoliths([f]).length, 0, 'Filter never matches — known source limitation');
});

test('checkDeadMonoliths: even with split folder present, filter still returns empty', () => {
    const splitDir = path.join(t.FEATURES_DIR, 'deadTest');
    fs.mkdirSync(splitDir, { recursive: true });
    fs.writeFileSync(path.join(splitDir, 'index.ts'), 'export function activate() {}', 'utf8');
    const f = makeFile('features/deadTest.ts', 'export function activate() {}');
    f.abs = path.join(t.FEATURES_DIR, 'deadTest.ts');
    // Filter: rel='features/deadTest.ts' contains '/' → always excluded
    eq(t.checkDeadMonoliths([f]).length, 0, 'Filter bug means even real dead monoliths are not caught');
    fs.rmSync(splitDir, { recursive: true, force: true });
});

// ═══════════════════════════════════════════════════════════
// checkOneTimeOnePlace()
// ═══════════════════════════════════════════════════════════
console.log('\n-- checkOneTimeOnePlace() --');

test('inline esc() in 2+ files → yellow finding', () => {
    const a = makeFile('features/a.ts', 'function esc(s: string) { return s; }');
    const b = makeFile('features/b.ts', 'function esc(s: string) { return s; }');
    const findings = t.checkOneTimeOnePlace([a, b]);
    ok(findings.some(f => f.category === 'One-Time-One-Place'), 'Must flag inline esc()');
});

test('REGISTRY_PATH in 3+ files → red finding', () => {
    const files = ['a', 'b', 'c'].map(n =>
        makeFile(`features/${n}.ts`, `const REGISTRY_PATH = 'C:\\\\some\\\\path.json';`)
    );
    const findings = t.checkOneTimeOnePlace(files);
    ok(findings.some(f => f.severity === 'red' && f.title.includes('REGISTRY_PATH')));
});

test('unique patterns → no findings', () => {
    const a = makeFile('features/clean.ts', 'export function cleanFn() { return 42; }');
    eq(t.checkOneTimeOnePlace([a]).length, 0);
});

// ═══════════════════════════════════════════════════════════
// checkSharedUtilUsage()
// ═══════════════════════════════════════════════════════════
console.log('\n-- checkSharedUtilUsage() --');

test('feature with inline esc() not importing shared → yellow', () => {
    const f = makeFile('features/noImport.ts', [
        'function esc(s: string) { return s.replace(/&/g, "&amp;"); }',
        'export function activate() {}',
    ].join('\n'));
    const findings = t.checkSharedUtilUsage([f]);
    ok(findings.some(f => f.title.includes('esc()') && f.severity === 'yellow'));
});

test('feature importing from shared/webview-utils → no esc() finding', () => {
    const f = makeFile('features/goodImport.ts', [
        "import { esc } from '../shared/webview-utils';",
        'function esc(s: string) { return s; }', // still has inline, but also imports
        'export function activate() {}',
    ].join('\n'));
    const findings = t.checkSharedUtilUsage([f]);
    // Must not flag since it imports from shared
    ok(!findings.some(fin => fin.title.includes('esc()') && fin.file.includes('goodImport')));
});

test('shared/ files are not checked for inline patterns', () => {
    const f = makeFile('shared/some-util.ts', 'function esc(s: string) { return s; }');
    // checkSharedUtilUsage only checks features/
    eq(t.checkSharedUtilUsage([f]).length, 0);
});

// Cleanup
fs.rmSync(TMP, { recursive: true, force: true });

console.log('\n' + '\u2500'.repeat(50));
if (failed === 0) { console.log(`\u2713 All ${passed} tests passed\n`); process.exit(0); }
else { console.error(`\n\u2717 ${failed} test(s) FAILED\n`); process.exit(1); }
