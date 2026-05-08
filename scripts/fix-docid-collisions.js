// Copyright (c) CieloVista Software. All rights reserved.
// fix-docid-collisions.js
// Scans all registry projects for duplicate docids and fixes them by appending
// a unique slug derived from each file's name (and parent dir if needed).
// Updates both `docid:` and `dewey:` frontmatter fields in every colliding file.

'use strict';

const fs   = require('fs');
const path = require('path');

const REGISTRY_PATH = 'C:\\Users\\jwpmi\\Downloads\\CieloVistaStandards\\project-registry.json';
const SKIP_DIRS  = new Set(['node_modules', '.git', 'out', 'dist', '.vscode', '.vscode-test', '.claude', 'reports', 'CommandHelp', 'image-reader-assets']);
const SKIP_FILES = new Set(['.gitignore', '.gitattributes']);
const DRY_RUN    = process.argv.includes('--dry-run');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toSlug(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

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

function patchFrontmatter(content, newDocId) {
  const lines = content.split('\n');
  if (!lines[0] || lines[0].trim() !== '---') { return content; }
  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { endIdx = i; break; }
  }
  if (endIdx === -1) { return content; }
  let changed = false;
  for (let i = 1; i < endIdx; i++) {
    // Update docid line
    if (/^docid\s*:/i.test(lines[i])) {
      lines[i] = `docid: ${newDocId}`;
      changed = true;
    }
    // Update dewey line only if it matches the old docid pattern (X.N without slug)
    if (/^dewey\s*:/i.test(lines[i])) {
      const oldDewey = lines[i].match(/^dewey\s*:\s*(.+?)\s*$/i)?.[1]?.trim();
      // Only update dewey if it's the same bare subject code (no slug yet)
      if (oldDewey && /^\d{3}\.\d+$/.test(oldDewey)) {
        lines[i] = `dewey: ${newDocId}`;
      }
    }
  }
  return changed ? lines.join('\n') : content;
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

// ─── Main ─────────────────────────────────────────────────────────────────────

const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));

// Build docid → [{ project, filePath, content }]
const docIdMap = new Map();

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
    docIdMap.get(key).push({ project: proj.name, filePath, content, originalDocId: docId });
  }
}

// Fix collisions
let fixedFiles = 0;
let collisionGroups = 0;

for (const [docIdKey, entries] of docIdMap.entries()) {
  if (entries.length <= 1) { continue; }
  collisionGroups++;

  // Generate slug for each entry using filename stem
  const stemSlugs = entries.map(e => {
    const basename = path.basename(e.filePath);
    const stem = basename.replace(/\.md$/i, '');
    return toSlug(stem);
  });

  // Check for slug collisions within the group — if so, prepend parent dir
  const slugCounts = new Map();
  for (const s of stemSlugs) {
    slugCounts.set(s, (slugCounts.get(s) ?? 0) + 1);
  }

  const finalSlugs = stemSlugs.map((slug, i) => {
    if ((slugCounts.get(slug) ?? 0) > 1) {
      // Disambiguate with parent directory
      const parentDir = path.basename(path.dirname(entries[i].filePath));
      return `${toSlug(parentDir)}-${slug}`;
    }
    return slug;
  });

  // Fix each file
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const slug  = finalSlugs[i];
    const newDocId = `${entry.originalDocId}.${slug}`;
    const newContent = patchFrontmatter(entry.content, newDocId);

    if (newContent === entry.content) {
      console.warn(`  SKIP [${entry.project}] ${entry.filePath} — frontmatter patch produced no change`);
      continue;
    }

    if (DRY_RUN) {
      console.log(`  DRY  ${entry.filePath}`);
      console.log(`       ${entry.originalDocId} → ${newDocId}`);
    } else {
      fs.writeFileSync(entry.filePath, newContent, 'utf8');
      console.log(`  FIX  [${entry.project}] ${path.basename(entry.filePath)}: ${entry.originalDocId} → ${newDocId}`);
      fixedFiles++;
    }
  }
}

console.log('');
console.log(`Collision groups found: ${collisionGroups}`);
if (DRY_RUN) {
  console.log('Dry run — no files written.');
} else {
  console.log(`Files fixed: ${fixedFiles}`);
}
