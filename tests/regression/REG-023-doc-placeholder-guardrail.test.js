// Copyright (c) CieloVista Software. All rights reserved.
// REG-023: Issue #276 — Doc placeholder guardrail (one-time-one-place)
// Scans markdown files in src/, docs/, and root for stub placeholder text
// that indicates content was never filled in.

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  FAIL: ${message}`);
    failed++;
  } else {
    passed++;
  }
}

// Patterns that indicate a placeholder stub rather than real content.
// These are regex patterns — each match is a violation.
const STUB_PATTERNS = [
  /^>\s*TODO[:：]\s*fill\s+in/im,
  /^>\s*TODO[:：]\s*update\s+content/im,
  /^>\s*Update\s+content\s+as\s+needed\.\s*$/im,
  /placeholder\s+content\s+here/i,
  /^#+ Coming soon$/im,
  /^#+ \[TODO\]/im,
];

// Lines that contain these strings are provenance/history comments, not stubs.
// A file is only flagged if a stub pattern appears on a NON-allowlisted line.
const ALLOWLIST_SUBSTRINGS = [
  'Moved from',
  'Copied from',
  'Migrated from',
  'provenance',
  'CHANGELOG',
];

function isAllowlistedLine(line) {
  return ALLOWLIST_SUBSTRINGS.some(s => line.includes(s));
}

function collectMdFiles(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectMdFiles(full, results);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(full);
    }
  }
  return results;
}

const SCAN_DIRS = [
  path.join(ROOT, 'src'),
  path.join(ROOT, 'docs'),
];
// Also scan .md files in root (non-recursive for root)
const rootMdFiles = fs.readdirSync(ROOT)
  .filter(f => f.endsWith('.md'))
  .map(f => path.join(ROOT, f));

const allFiles = [
  ...rootMdFiles,
  ...SCAN_DIRS.flatMap(d => collectMdFiles(d)),
];

const violations = [];

for (const filePath of allFiles) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    continue;
  }

  const lines = content.split('\n');
  for (const pattern of STUB_PATTERNS) {
    // Test whole file for multiline pattern match
    const matches = content.match(new RegExp(pattern.source, 'gim'));
    if (!matches) continue;

    for (const match of matches) {
      // Find the line number for context
      const lineIdx = lines.findIndex(l =>
        l.match(new RegExp(pattern.source, 'i'))
      );
      const line = lineIdx >= 0 ? lines[lineIdx] : match;
      if (isAllowlistedLine(line)) continue;

      const rel = path.relative(ROOT, filePath);
      violations.push(`  ${rel}  →  "${line.trim()}"`);
    }
  }
}

console.log('REG-023: Doc placeholder guardrail');
console.log('─'.repeat(50));

assert(
  violations.length === 0,
  `Found ${violations.length} placeholder stub(s) in docs:\n${violations.join('\n')}`
);

if (violations.length > 0) {
  console.error('Violations:');
  for (const v of violations) console.error(v);
}

console.log(`─`.repeat(50));
if (failed === 0) {
  console.log(`✓ REG-023 passed — no placeholder stubs found (${allFiles.length} files scanned).`);
  process.exit(0);
} else {
  console.error(`✗ REG-023 FAILED — ${violations.length} placeholder stub(s) found.`);
  process.exit(1);
}
