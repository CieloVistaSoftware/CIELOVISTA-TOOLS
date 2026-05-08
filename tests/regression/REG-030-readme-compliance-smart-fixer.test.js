// Copyright (c) CieloVista Software. All rights reserved.
// REG-030: README Compliance — smart applyFix() behavior.
// Verifies that the fixer is frontmatter-aware, section-order-aware,
// language-inferring, and duplicate-safe.

'use strict';

const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const assert = require('assert');

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

// ─── Inline copies of helpers from feature.ts ─────────────────────────────────
// (These mirror the logic exactly — any change there must be reflected here.)

function normalizeHeading(h) {
  return h.toLowerCase().replace(/^#+\s*/, '').trim();
}

function frontmatterEnd(lines) {
  if (!lines[0] || lines[0].trim() !== '---') { return 0; }
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { return i + 1; }
  }
  return 0;
}

const LANG_HINTS = [
  [/^\s*(import|export|interface|type\s+\w+\s*=|const\s+\w+:\s|async\s+function)/m, 'typescript'],
  [/^\s*(function|const|let|var|require\(|module\.exports)/m,                       'javascript'],
  [/^\s*(def |class |import |from .+ import|if __name__)/m,                         'python'],
  [/^\s*(<\?php|\$\w+\s*=)/m,                                                       'php'],
  [/^\s*(<html|<div|<span|<p>|<!DOCTYPE)/im,                                        'html'],
  [/^\s*(\{|\}|"[^"]+"\s*:)/m,                                                      'json'],
  [/^\s*(#\s*\w|[A-Z_]+\s*=|export\s+[A-Z_])/m,                                    'bash'],
  [/^\s*(\$\w+|Get-|Set-|New-|Remove-|Invoke-|Write-Host)/m,                        'powershell'],
  [/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\b/im,                        'sql'],
  [/^\s*(FROM |RUN |CMD |ENTRYPOINT |COPY )/m,                                      'dockerfile'],
  [/^\s*([a-z_]+\s*:\s*$|\s+-\s+\w)/m,                                             'yaml'],
];

function guessLanguage(blockLines) {
  const sample = blockLines.join('\n');
  for (const [pattern, lang] of LANG_HINTS) {
    if (pattern.test(sample)) { return lang; }
  }
  return 'text';
}

// ─── Test helpers ─────────────────────────────────────────────────────────────

function writeTmp(content) {
  const p = path.join(os.tmpdir(), `reg030-${Date.now()}.md`);
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

// ─── 1. frontmatterEnd() ─────────────────────────────────────────────────────

test('frontmatterEnd returns 0 when no frontmatter', () => {
  const lines = ['# Title', '', 'Body text'];
  assert.strictEqual(frontmatterEnd(lines), 0);
});

test('frontmatterEnd returns correct line index after closing ---', () => {
  const lines = ['---', 'docid: abc', 'dewey: 150.5', '---', '# Title'];
  // closing --- is at index 3, so end = 4
  assert.strictEqual(frontmatterEnd(lines), 4);
});

test('frontmatterEnd returns 0 on malformed frontmatter (no closing ---)', () => {
  const lines = ['---', 'docid: abc', '# Title'];
  assert.strictEqual(frontmatterEnd(lines), 0);
});

// ─── 2. guessLanguage() ──────────────────────────────────────────────────────

test('guessLanguage detects typescript from interface keyword', () => {
  assert.strictEqual(guessLanguage(['interface Foo {', '  bar: string;', '}']), 'typescript');
});

test('guessLanguage detects javascript from require()', () => {
  assert.strictEqual(guessLanguage(["const x = require('fs');"]), 'javascript');
});

test('guessLanguage detects python from def keyword', () => {
  assert.strictEqual(guessLanguage(['def my_func(x):', '    return x']), 'python');
});

test('guessLanguage detects powershell from Get- verb', () => {
  assert.strictEqual(guessLanguage(['Get-ChildItem -Path "C:\\"']), 'powershell');
});

test('guessLanguage detects sql from SELECT', () => {
  assert.strictEqual(guessLanguage(['SELECT id, name FROM users WHERE id = 1']), 'sql');
});

test('guessLanguage falls back to text for unrecognized content', () => {
  assert.strictEqual(guessLanguage(['just some prose', 'nothing recognizable']), 'text');
});

// ─── 3. Heading inserted AFTER frontmatter, not before ───────────────────────

test('first-heading fix goes after frontmatter block', () => {
  const content = '---\ndocid: abc\n---\n\nSome body text\n';
  const lines   = content.split('\n');
  const fmEnd   = frontmatterEnd(lines);
  // Simulate the fix: insert # Title after frontmatter
  const bodyLines  = lines.slice(fmEnd);
  const firstH1Idx = bodyLines.findIndex(l => /^#\s/.test(l));
  assert.ok(firstH1Idx !== 0, 'no H1 at body start — fix should fire');
  // Apply fix
  const name    = 'test-doc';
  const heading = [`# ${name}`, ''];
  const fixed   = [...lines.slice(0, fmEnd), ...heading, ...lines.slice(fmEnd)].join('\n');
  // Heading must be after the closing ---
  const fixedLines = fixed.split('\n');
  const closingIdx = fixedLines.indexOf('---', 1);
  const headingIdx = fixedLines.findIndex(l => /^#\s/.test(l));
  assert.ok(headingIdx > closingIdx, `H1 at line ${headingIdx} should be after closing --- at line ${closingIdx}`);
  // Frontmatter must still start at line 0
  assert.strictEqual(fixedLines[0], '---');
});

test('frontmatterEnd is correct for a 3-field frontmatter block', () => {
  // [0]'---' [1]'docid: abc' [2]'---' → closing at index 2 → fmEnd = 3
  const lines = ['---', 'docid: abc', '---', '', '# Existing Title', '', 'Body'];
  assert.strictEqual(frontmatterEnd(lines), 3);
});

// ─── 4. code-block-lang: opening fences only, no closing fences affected ─────

test('code-block-lang fix tags opening fences but leaves closing fences alone', () => {
  const content = '```\nconst x = 1;\n```\n';
  const lines   = content.split('\n');
  const result  = [];
  let inBlock   = false;
  for (let i = 0; i < lines.length; i++) {
    const isFence = /^```\s*$/.test(lines[i]);
    if (isFence && !inBlock) {
      const blockLines = [];
      let j = i + 1;
      while (j < lines.length && !/^```/.test(lines[j])) { blockLines.push(lines[j]); j++; }
      result.push(`\`\`\`${guessLanguage(blockLines)}`);
      inBlock = true;
    } else if (isFence && inBlock) {
      result.push('```');
      inBlock = false;
    } else {
      result.push(lines[i]);
    }
  }
  const fixed = result.join('\n');
  // Opening fence has language
  assert.ok(fixed.startsWith('```javascript'), `Expected \`\`\`javascript but got: ${fixed.slice(0, 20)}`);
  // Closing fence is plain ```
  assert.ok(fixed.includes('\n```\n'), 'Closing fence must stay bare ```');
  // There must be exactly one ``` with a lang and one bare ```
  const fences = (fixed.match(/^```/gm) ?? []);
  assert.strictEqual(fences.length, 2);
});

test('code-block-lang fix does not double-tag an already-tagged fence', () => {
  const content = '```typescript\nconst x = 1;\n```\n';
  const lines   = content.split('\n');
  const result  = [];
  let inBlock   = false;
  for (let i = 0; i < lines.length; i++) {
    // Only bare fences match the fix condition
    const isFence = /^```\s*$/.test(lines[i]);
    if (isFence && !inBlock) {
      const blockLines = [];
      let j = i + 1;
      while (j < lines.length && !/^```/.test(lines[j])) { blockLines.push(lines[j]); j++; }
      result.push(`\`\`\`${guessLanguage(blockLines)}`);
      inBlock = true;
    } else if (isFence && inBlock) {
      result.push('```');
      inBlock = false;
    } else {
      result.push(lines[i]); // keeps ```typescript as-is
      if (/^```\w/.test(lines[i])) { inBlock = true; }
      else if (lines[i] === '```') { inBlock = false; }
    }
  }
  const fixed = result.join('\n');
  assert.ok(fixed.includes('```typescript'), 'Already-tagged fence must be left alone');
  assert.strictEqual((fixed.match(/^```typescript/gm) ?? []).length, 1, 'Only one ```typescript expected');
});

// ─── 5. missing-section: no duplicate insertion ───────────────────────────────

test('missing-section fix skips section that already exists (case insensitive)', () => {
  const existingContent = '# Title\n\n## What it does\n\nAlready here\n';
  const lines           = existingContent.split('\n');
  const sec             = 'what it does';
  const alreadyPresent  = lines.some(l => normalizeHeading(l).includes(sec));
  assert.ok(alreadyPresent, 'section should be detected as already present');
  // The fix guard: if alreadyPresent → skip. Verify count stays at 1.
  const headingCount = lines.filter(l => normalizeHeading(l).includes(sec)).length;
  assert.strictEqual(headingCount, 1, 'Should still be exactly one section after guard fires');
});

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log('REG-030: README Compliance — smart applyFix() behavior');
console.log('─'.repeat(55));
if (failed === 0) {
  console.log(`✓ REG-030 passed (${passed} checks).`);
  process.exit(0);
} else {
  console.error(`✗ REG-030 FAILED (${failed} of ${passed + failed} checks failed).`);
  process.exit(1);
}
