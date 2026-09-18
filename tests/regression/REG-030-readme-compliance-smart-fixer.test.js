// Copyright (c) CieloVista Software. All rights reserved.
// REG-030: README Compliance — smart applyFix() behavior.
// Verifies that the fixer is frontmatter-aware, language-inferring, and
// duplicate-safe.
//
// Run: node tests/regression/REG-030-readme-compliance-smart-fixer.test.js
//
// Everything here runs the real code: the _test handle of the out-test build
// of src/features/readme-compliance/feature.ts, and applyFix() on real files.
// Until #823 this test held its own copies of frontmatterEnd, LANG_HINTS,
// guessLanguage and normalizeHeading, and re-implemented the fixes inline, so
// the fixer could change or break and this test stayed green.

'use strict';

const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const assert = require('assert');
const Module = require('module');

const ROOT   = path.resolve(__dirname, '..', '..');
const RC_OUT = path.join(ROOT, 'out-test', 'features', 'readme-compliance', 'feature.js');

console.log('REG-030: README Compliance — smart applyFix() behavior');
console.log('─'.repeat(55));

if (!fs.existsSync(RC_OUT)) {
  // Not a skip: the runners build out-test/ first, so this is a real failure.
  console.error(`  FAIL out-test build missing: ${RC_OUT}`);
  process.exit(1);
}

// Anything the module touches at load time that this test does not care about.
function anyObject() {
  return new Proxy(function () { return anyObject(); }, {
    get: (_t, k) => (k === 'then' ? undefined : anyObject()),
    apply: () => anyObject(),
  });
}
const origLoad = Module._load;
Module._load = function (req) { return req === 'vscode' ? anyObject() : origLoad.apply(this, arguments); };
const { _test: rc } = require(RC_OUT);
Module._load = origLoad;

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL ${name}`);
    console.error(`       ${err.message}`);
    failed++;
  }
}

// ─── Test helpers ─────────────────────────────────────────────────────────────

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cvt-reg030-'));
let fileNo = 0;

/** A report for `content`, written to a temp file, carrying exactly the given fix keys. */
function reportFor(content, fixKeys, readmeType = 'FEATURE') {
  const filePath = path.join(TMP, `doc${++fileNo}.md`);
  fs.writeFileSync(filePath, content, 'utf8');
  return {
    filePath, fileName: path.basename(filePath), projectName: 'reg030', readmeType, score: 0,
    issues: fixKeys.map(fixKey => ({ severity: 'error', message: fixKey, fixable: true, fixKey })),
    lineCount: content.split('\n').length, missingRequiredSections: [], outOfOrderSections: [],
  };
}

// ─── 1. frontmatterEnd() ─────────────────────────────────────────────────────

test('frontmatterEnd returns 0 when no frontmatter', () => {
  assert.strictEqual(rc.frontmatterEnd(['# Title', '', 'Body text']), 0);
});

test('frontmatterEnd returns the line after the closing ---', () => {
  assert.strictEqual(rc.frontmatterEnd(['---', 'id: abc', 'title: Title', '---', '# Title']), 4);
});

test('frontmatterEnd returns 0 on malformed frontmatter (no closing ---)', () => {
  assert.strictEqual(rc.frontmatterEnd(['---', 'docid: abc', '# Title']), 0);
});

// ─── 2. guessLanguage() ──────────────────────────────────────────────────────

test('guessLanguage detects typescript from interface keyword', () => {
  assert.strictEqual(rc.guessLanguage(['interface Foo {', '  bar: string;', '}']), 'typescript');
});

test('guessLanguage detects javascript from require()', () => {
  assert.strictEqual(rc.guessLanguage(["const x = require('fs');"]), 'javascript');
});

test('guessLanguage detects python from def keyword', () => {
  assert.strictEqual(rc.guessLanguage(['def my_func(x):', '    return x']), 'python');
});

test('guessLanguage detects powershell from Get- verb', () => {
  assert.strictEqual(rc.guessLanguage(['Get-ChildItem -Path "C:\\"']), 'powershell');
});

test('guessLanguage detects sql from SELECT', () => {
  assert.strictEqual(rc.guessLanguage(['SELECT id, name FROM users WHERE id = 1']), 'sql');
});

test('guessLanguage falls back to text for unrecognized content', () => {
  assert.strictEqual(rc.guessLanguage(['just some prose', 'nothing recognizable']), 'text');
});

// ─── 3. Heading inserted AFTER frontmatter, not before ───────────────────────

test('checkCompliance flags a file whose body has no H1 after its frontmatter', () => {
  const report = reportFor('---\ndocid: abc\n---\n\nSome body text\n', []);
  const found  = rc.checkCompliance(report.filePath, 'reg030', TMP);
  assert.ok(found.issues.some(i => i.fixKey === 'first-heading'), JSON.stringify(found.issues.map(i => i.fixKey)));
});

test('first-heading fix goes after the frontmatter block', () => {
  const fixed = rc.applyFix(reportFor('---\ndocid: abc\n---\n\nSome body text\n', ['first-heading'])).split('\n');
  const closingIdx = fixed.indexOf('---', 1);
  const headingIdx = fixed.findIndex(l => /^#\s/.test(l));
  assert.strictEqual(fixed[0], '---', 'frontmatter must still start at line 0');
  assert.ok(closingIdx > 0 && headingIdx > closingIdx, `H1 at line ${headingIdx}, closing --- at ${closingIdx}:\n${fixed.join('\n')}`);
});

test('first-heading fix leaves a file alone whose body already opens with an H1', () => {
  const content = '---\ndocid: abc\n---\n# Existing Title\n\nBody\n';
  assert.strictEqual(rc.applyFix(reportFor(content, ['first-heading'])), content);
});

// ─── 4. code-block-lang: opening fences only, no closing fences affected ─────

test('code-block-lang fix tags the opening fence and leaves the closing fence bare', () => {
  const fixed = rc.applyFix(reportFor('# T\n\n```\nconst x = 1;\n```\n', ['code-block-lang']));
  assert.ok(fixed.includes('```javascript\nconst x = 1;\n```\n'), `got:\n${fixed}`);
  assert.strictEqual((fixed.match(/^```/gm) || []).length, 2, `got:\n${fixed}`);
});

test('code-block-lang fix does not re-tag an already-tagged fence', () => {
  const fixed = rc.applyFix(reportFor('# T\n\n```typescript\nconst x = 1;\n```\n\n```\ndef f(x):\n    return x\n```\n', ['code-block-lang']));
  assert.strictEqual((fixed.match(/^```typescript$/gm) || []).length, 1, `got:\n${fixed}`);
  assert.strictEqual((fixed.match(/^```python$/gm) || []).length, 1, `got:\n${fixed}`);
  assert.strictEqual((fixed.match(/^```$/gm) || []).length, 2, `closing fences must stay bare; got:\n${fixed}`);
});

// ─── 5. missing-section: no duplicate insertion ───────────────────────────────

test('normalizeHeading lowercases and drops the #s', () => {
  assert.strictEqual(rc.normalizeHeading('## What It Does '), 'what it does');
});

test('missing-section fix skips a section that already exists', () => {
  const content = '# Title\n\n## What it does\n\nAlready here\n';
  const fixed   = rc.applyFix(reportFor(content, ['missing-section:what it does']));
  const count   = fixed.split('\n').filter(l => rc.normalizeHeading(l) === 'what it does').length;
  assert.strictEqual(count, 1, `got:\n${fixed}`);
});

test('missing-section fix adds a missing section once', () => {
  const fixed = rc.applyFix(reportFor('# Title\n\n## What it does\n\nText\n', ['missing-section:manual test']));
  const count = fixed.split('\n').filter(l => rc.normalizeHeading(l) === 'manual test').length;
  assert.strictEqual(count, 1, `got:\n${fixed}`);
});

// ─── Summary ──────────────────────────────────────────────────────────────────

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ }
if (failed === 0) {
  console.log(`✓ REG-030 passed (${passed} checks).`);
  process.exit(0);
} else {
  console.error(`✗ REG-030 FAILED (${failed} of ${passed + failed} checks failed).`);
  process.exit(1);
}
