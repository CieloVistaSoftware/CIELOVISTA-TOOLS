/**
 * tests/unit/doc-collector.test.js
 *
 * Unit tests for src/shared/doc-collector.ts, the one walk every doc feature
 * uses (#802). Until #802 this file tested doc-auditor/scanner.ts, which had
 * its own copy of the walk and its own skip list.
 *
 * Covers:
 *   DOC_SKIP_DIRS   — the one skip list
 *   isMarkdownDoc() — which file names are docs
 *   walkDocTree()   — depth, match, skipped directories
 *   collectDocs()   — the record every feature maps from
 *
 * Run: node tests/unit/doc-collector.test.js
 */
'use strict';

const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');
const crypto = require('crypto');

const OUT = path.join(__dirname, '../../out/shared/doc-collector.js');
if (!fs.existsSync(OUT)) {
    console.error(`FAIL: ${OUT} not found — run npm run compile`);
    process.exit(1);
}

const { DOC_SKIP_DIRS, DEFAULT_DOC_DEPTH, isMarkdownDoc, walkDocTree, collectDocs, normalizeDocText } = require(OUT);

let passed = 0, failed = 0;

function test(name, fn) {
    try { fn(); console.log(`  ✓ ${name}`); passed++; }
    catch (e) { console.error(`  ✗ ${name}\n    → ${e.message}`); failed++; }
}
function eq(a, b, msg)  { assert.strictEqual(a, b, msg); }
function ok(v, msg)     { assert.ok(v, msg); }

// ── Setup temp tree ───────────────────────────────────────────────────────────
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cvt-doc-collector-'));

function write(rel, body) {
    const p = path.join(TMP, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body, 'utf8');
}

write('README.md', '---\nid: root\ntitle: Root Doc\ndescription: The root.\n---\n# Root\n');
write('CLAUDE.md', '# Claude');
write('code.ts', 'export const x = 1;');
write('docs/guide.md', '# Guide');
write('docs/deep/nested.md', '# Nested');
write('docs/a/b/level3.md', '# Level 3');
write('docs/a/b/c/level4.md', '# Level 4 -- beyond the default depth');
write('docs/some-test-error-context.md', '# Playwright dump');
write('src/features/foo.README.md', '# Foo');
for (const dir of DOC_SKIP_DIRS) { write(`${dir}/skip-me.md`, '# Should be skipped'); }

function cleanup() { fs.rmSync(TMP, { recursive: true, force: true }); }

console.log('\nshared doc-collector unit tests\n' + '─'.repeat(50));

// ── DOC_SKIP_DIRS ─────────────────────────────────────────────────────────────
console.log('\n-- DOC_SKIP_DIRS --');

test('DOC_SKIP_DIRS is a Set', () => ok(DOC_SKIP_DIRS instanceof Set));
for (const dir of ['node_modules', '.git', 'out', 'dist', '.vscode', '.vscode-test', 'reports', 'CommandHelp',
                   'image-reader-assets', 'test-results', 'playwright-report', 'bin', '.venv']) {
    test(`DOC_SKIP_DIRS includes ${dir}`, () => ok(DOC_SKIP_DIRS.has(dir)));
}
test('DOC_SKIP_DIRS includes .claude (#327 — worktrees must not be scanned)',
    () => ok(DOC_SKIP_DIRS.has('.claude'), '.claude must be skipped so worktree copies are not counted as duplicates'));
test('DOC_SKIP_DIRS does not include legacy (hand-written docs live there, #802)', () => ok(!DOC_SKIP_DIRS.has('legacy')));
test('DOC_SKIP_DIRS does not include docs or src', () => ok(!DOC_SKIP_DIRS.has('docs') && !DOC_SKIP_DIRS.has('src')));

// ── isMarkdownDoc() ───────────────────────────────────────────────────────────
console.log('\n-- isMarkdownDoc() --');

test('README.md is a doc',          () => ok(isMarkdownDoc('README.md')));
test('upper-case .MD is a doc',     () => ok(isMarkdownDoc('NOTES.MD')));
test('code.ts is not a doc',        () => ok(!isMarkdownDoc('code.ts')));
test('Playwright error-context.md is not a doc', () => ok(!isMarkdownDoc('x-error-context.md')));

// ── walkDocTree() ─────────────────────────────────────────────────────────────
console.log('\n-- walkDocTree() --');

const rel = (files) => files.map((f) => path.relative(TMP, f).split(path.sep).join('/')).sort();

test('returns empty array for non-existent directory', () => {
    const result = walkDocTree('/does/not/exist');
    ok(Array.isArray(result) && result.length === 0);
});

test('default depth is 3 and finds exactly the docs', () => {
    eq(DEFAULT_DOC_DEPTH, 3);
    assert.deepStrictEqual(rel(walkDocTree(TMP)),
        ['CLAUDE.md', 'README.md', 'docs/a/b/level3.md', 'docs/deep/nested.md', 'docs/guide.md', 'src/features/foo.README.md']);
});

test('maxDepth Infinity reaches every level', () => {
    ok(rel(walkDocTree(TMP, { maxDepth: Infinity })).includes('docs/a/b/c/level4.md'));
});

test('maxDepth 0 reads only the root', () => {
    assert.deepStrictEqual(rel(walkDocTree(TMP, { maxDepth: 0 })), ['CLAUDE.md', 'README.md']);
});

test('match selects other files and still skips DOC_SKIP_DIRS', () => {
    const all = rel(walkDocTree(TMP, { maxDepth: Infinity, match: () => true }));
    ok(all.includes('code.ts'));
    ok(!all.some((f) => f.endsWith('skip-me.md')), all.join(', '));
});

test('a README-only match finds feature READMEs', () => {
    assert.deepStrictEqual(rel(walkDocTree(TMP, { match: (n) => /\.README\.md$/i.test(n) })), ['src/features/foo.README.md']);
});

// Judge each path relative to the fixture root: the root itself may sit under
// a skipped name (on Linux os.tmpdir() is /tmp, and "tmp" is in the list), and
// only directories BELOW the root are skipped.
for (const dir of DOC_SKIP_DIRS) {
    test(`skips ${dir}/`, () => {
        const hits = rel(walkDocTree(TMP, { maxDepth: Infinity })).filter((p) => p.split('/').includes(dir));
        eq(hits.length, 0, hits.join(', '));
    });
}

test('a root that sits inside a skipped directory name is still walked', () => {
    const inner = path.join(TMP, 'tmp', 'project');
    fs.mkdirSync(inner, { recursive: true });
    fs.writeFileSync(path.join(inner, 'doc.md'), '# Inside tmp/');
    assert.deepStrictEqual(walkDocTree(inner).map((p) => path.basename(p)), ['doc.md']);
});

// ── collectDocs() ─────────────────────────────────────────────────────────────
console.log('\n-- collectDocs() --');

test('collects the same files walkDocTree finds', () => {
    assert.deepStrictEqual(rel(collectDocs(TMP, 'proj').map((d) => d.filePath)), rel(walkDocTree(TMP)));
});

test('CollectedDoc has the right shape', () => {
    const doc = collectDocs(TMP, 'myProject').find((d) => d.fileName === 'README.md');
    ok(doc, 'Must find README.md');
    ok(path.isAbsolute(doc.filePath),                      'filePath must be absolute');
    eq(doc.projectName, 'myProject',                       'projectName must match arg');
    eq(doc.sizeBytes, fs.statSync(doc.filePath).size,      'sizeBytes is the size on disk');
    ok(doc.content.includes('# Root'),                     'content must include file text');
    eq(doc.hash, crypto.createHash('sha256').update(fs.readFileSync(doc.filePath)).digest('hex'), 'hash is sha256 of the bytes');
    ok(typeof doc.mtimeMs === 'number' && doc.mtimeMs > 0, 'mtimeMs must be set');
    eq(doc.frontmatter.title, 'Root Doc',                  'frontmatter is parsed');
});

test('normalized leaves the frontmatter out', () => {
    const doc = collectDocs(TMP, 'p').find((d) => d.fileName === 'README.md');
    eq(doc.normalized, 'root');
});

test('normalized is lower-case, whitespace-collapsed, without markdown symbols', () => {
    eq(normalizeDocText('# Hello   *World*\n\n`code` [link](x)'), 'hello world code linkx');
});

test('a doc with no frontmatter has frontmatter {}', () => {
    const doc = collectDocs(TMP, 'p').find((d) => d.fileName === 'CLAUDE.md');
    assert.deepStrictEqual(doc.frontmatter, {});
});

cleanup();

console.log('\n' + '─'.repeat(50));
if (failed === 0) { console.log(`✓ All ${passed} tests passed\n`); process.exit(0); }
else { console.error(`\n✗ ${failed} test(s) FAILED\n`); process.exit(1); }
