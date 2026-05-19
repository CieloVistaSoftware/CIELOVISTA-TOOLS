// Copyright (c) CieloVista Software. All rights reserved.
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');

// ── Fixed targets ────────────────────────────────────────────────────────────

const FIXED_TARGETS = [
  // Build logs
  { rel: 'compile_step4.log', kind: 'file' },
  { rel: 'rebuild_output.log', kind: 'file' },
  { rel: 'rebuild_output.txt', kind: 'file' },

  // data/ runtime artifacts
  { rel: 'data/button-click-output.txt', kind: 'file' },
  { rel: 'data/issues-tmp.json', kind: 'file' },
  { rel: 'data/tools-errors.json', kind: 'file' },
  { rel: 'data/cielovista-errors.json', kind: 'file' },

  // Test runner artifacts
  { rel: '.vscode-test', kind: 'dir' },
  { rel: 'playwright-report', kind: 'dir' },
];

// ── Dynamic targets ──────────────────────────────────────────────────────────

const DYNAMIC_TARGETS = [];

// _* scratch files at root (underscore-prefixed)
const UNDERSCORE_KEEP = new Set(['.gitignore', '.gitattributes']);
for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
  if (!entry.isFile()) continue;
  if (!entry.name.startsWith('_')) continue;
  if (UNDERSCORE_KEEP.has(entry.name)) continue;
  DYNAMIC_TARGETS.push({ rel: entry.name, kind: 'file' });
}

// .tmp_* issue comment drafts at root
for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
  if (!entry.isFile()) continue;
  if (entry.name.startsWith('.tmp_')) {
    DYNAMIC_TARGETS.push({ rel: entry.name, kind: 'file' });
  }
}

// *.vsix files at root
for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
  if (!entry.isFile()) continue;
  if (entry.name.endsWith('.vsix')) {
    DYNAMIC_TARGETS.push({ rel: entry.name, kind: 'file' });
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function exists(fullPath) {
  try {
    fs.accessSync(fullPath);
    return true;
  } catch {
    return false;
  }
}

function removeTarget(target) {
  const full = path.join(ROOT, target.rel);
  if (!exists(full)) {
    return { rel: target.rel, status: 'missing' };
  }

  if (!apply) {
    return { rel: target.rel, status: 'would-delete' };
  }

  if (target.kind === 'dir') {
    fs.rmSync(full, { recursive: true, force: true });
  } else {
    fs.rmSync(full, { force: true });
  }

  return { rel: target.rel, status: 'deleted' };
}

// ── Run ──────────────────────────────────────────────────────────────────────

const results = [...FIXED_TARGETS, ...DYNAMIC_TARGETS].map(removeTarget);

const wouldDelete = results.filter((r) => r.status === 'would-delete').length;
const deleted = results.filter((r) => r.status === 'deleted').length;
const missing = results.filter((r) => r.status === 'missing').length;

console.log('Project cleanup');
console.log(`Mode: ${apply ? 'APPLY' : 'DRY RUN'}`);
console.log('');

for (const r of results) {
  if (r.status === 'missing') continue;
  console.log(`  ${r.status.padEnd(14)} ${r.rel}`);
}

console.log('');
console.log(`Summary: ${apply ? deleted + ' deleted' : wouldDelete + ' would delete'}, ${missing} not found`);
if (!apply) {
  console.log('Run with --apply to delete.');
}
