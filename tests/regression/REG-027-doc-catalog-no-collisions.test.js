// Copyright (c) CieloVista Software. All rights reserved.
// REG-027: Doc catalog docid collision detection.
// Asserts that every document across all registry projects has a unique docid.
// A collision means two or more files share the same docid — the catalog renders
// a ⚠ collision badge and the doc is effectively unreachable by its canonical id.

'use strict';

const fs   = require('fs');
const path = require('path');
const assert = require('assert');

const REGISTRY_PATH = 'C:\\Users\\jwpmi\\Downloads\\CieloVistaStandards\\project-registry.json';
const SKIP_DIRS  = new Set(['node_modules', '.git', 'bin', 'out', 'dist', '.vscode', '.vscode-test', '.claude', 'reports', 'CommandHelp', 'image-reader-assets']);
const SKIP_FILES = new Set(['.gitignore', '.gitattributes']);

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractFrontmatterDocId(content) {
  const lines = content.split('\n');
  if (!lines[0] || lines[0].trim() !== '---') { return undefined; }
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '---') { break; }
    const m = line.match(/^docid\s*:\s*(.+?)\s*$/i);
    if (m) { return m[1].trim(); }
  }
  return undefined;
}

function walkMd(dir, results = [], depth = 0) {
  if (depth > 4 || !fs.existsSync(dir)) { return results; }
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return results; }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name) || SKIP_FILES.has(entry.name)) { continue; }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkMd(fullPath, results, depth + 1);
    } else if (entry.isFile() && /\.md$/i.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

// ─── Load registry ────────────────────────────────────────────────────────────

let registry;
test('project-registry.json loads', () => {
  registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  assert(Array.isArray(registry.projects), 'registry.projects is not an array');
  assert(registry.projects.length > 0, 'registry.projects is empty');
});

// ─── Collision scan ───────────────────────────────────────────────────────────

if (registry) {
  // Collect docid → [filePaths] across all projects
  const docIdMap = new Map(); // docid -> [{ project, filePath }]

  for (const proj of registry.projects) {
    if (!proj.path || !fs.existsSync(proj.path)) { continue; }
    const mdFiles = walkMd(proj.path);
    for (const filePath of mdFiles) {
      let content;
      try { content = fs.readFileSync(filePath, 'utf8'); }
      catch { continue; }
      const docId = extractFrontmatterDocId(content);
      if (!docId || docId.toLowerCase() === 'missing-docid') { continue; }
      const key = docId.trim().toLowerCase();
      if (!docIdMap.has(key)) { docIdMap.set(key, []); }
      docIdMap.get(key).push({ project: proj.name, filePath });
    }
  }

  // Find collisions
  const collisions = [];
  for (const [docId, entries] of docIdMap.entries()) {
    if (entries.length > 1) {
      collisions.push({ docId, entries });
    }
  }

  test('all docids are unique across all registry projects (zero collisions)', () => {
    if (collisions.length === 0) { return; }

    const lines = [`${collisions.length} docid collision group(s) found:\n`];
    for (const { docId, entries } of collisions.slice(0, 20)) {
      lines.push(`  docid "${docId}" shared by ${entries.length} files:`);
      for (const e of entries.slice(0, 5)) {
        lines.push(`    [${e.project}] ${e.filePath}`);
      }
      if (entries.length > 5) { lines.push(`    ... and ${entries.length - 5} more`); }
    }
    if (collisions.length > 20) {
      lines.push(`  ... and ${collisions.length - 20} more collision groups`);
    }
    lines.push('\nFix: assign a unique docid slug to each file, e.g. "150.5.copilot-rules"');
    throw new Error(lines.join('\n'));
  });

  test('docid collision count is tracked (informational)', () => {
    const total = collisions.reduce((sum, c) => sum + c.entries.length - 1, 0);
    console.log(`         (${docIdMap.size} unique docids scanned, ${collisions.length} collision groups, ${total} duplicate assignments)`);
    // Always passes — just reports stats
  });
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log('REG-027: Doc catalog docid collision detection');
console.log('─'.repeat(50));
if (failed === 0) {
  console.log(`✓ REG-027 passed (${passed} checks — zero docid collisions across all projects).`);
  process.exit(0);
} else {
  console.error(`✗ REG-027 FAILED (${failed} of ${passed + failed} checks failed).`);
  process.exit(1);
}
