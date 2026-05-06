// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * scripts/backfill-doc-contract.mjs
 *
 * Phase 5 of issue #21 — bulk front-matter backfill for all registered projects.
 * Scans every .md file with missing subject/id, assigns subject via path heuristics,
 * derives id from title or filename, and prepends/updates front-matter.
 *
 * Run: node scripts/backfill-doc-contract.mjs [--dry-run] [--project <name>]
 */

import fs from 'node:fs';
import path from 'node:path';
import { loadRegistry, listDocViolations, buildProjectDeweyMap } from '../mcp-server/dist/tools/catalog-helpers.js';

const args = process.argv.slice(2);
const DRY_RUN     = args.includes('--dry-run');
const PROJECT_ARG = (() => { const i = args.indexOf('--project'); return i >= 0 ? args[i + 1] : null; })();

// ─── Subject heuristics ──────────────────────────────────────────────────────

function guessSubject(filePath, prefix) {
  const p = filePath.toLowerCase().replace(/\\/g, '/');
  const base = path.basename(p);

  if (/test/.test(p) || base.startsWith('test') || /\.test\./.test(base)) { return `${prefix}.3`; }
  if (/architect|arch\/|design\//.test(p))  { return `${prefix}.2`; }
  if (/changelog|release|deploy|versio/.test(p)) { return `${prefix}.6`; }
  if (/api\/|reference\/|ref\//.test(p))    { return `${prefix}.8`; }
  if (/policy|standard|guideline|contributing/.test(p)) { return `${prefix}.4`; }
  if (/ai\/|claude|copilot|agent|prompt/.test(p)) { return `${prefix}.5`; }
  if (/component|feature|command|widget/.test(p)) { return `${prefix}.1`; }
  if (/getting.start|quickstart|setup|onboard|install/.test(p)) { return `${prefix}.7`; }
  if (/readme/i.test(base)) { return `${prefix}.7`; }
  if (/changelog/i.test(base)) { return `${prefix}.6`; }

  // docs/_today or docs/status → Meta
  if (/docs\/_today|status|parking.lot|current/.test(p)) { return `${prefix}.9`; }

  return `${prefix}.9`;
}

// ─── Slug helpers ────────────────────────────────────────────────────────────

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

function deriveId(title, fileName) {
  let raw = slugify(title || fileName.replace(/\.md$/i, ''));
  if (raw.length < 3) { raw = slugify(fileName.replace(/\.md$/i, '')) || 'untitled'; }
  return raw.length >= 3 ? raw : (raw + '-doc').slice(0, 50);
}

// ─── Front-matter parser / writer ───────────────────────────────────────────

function parseFm(content) {
  const m = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(\r?\n|$)/);
  if (!m) { return null; }
  const fields = {};
  for (const line of m[1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx <= 0) { continue; }
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key) { fields[key] = val; }
  }
  return { raw: m[0], fields };
}

function extractTitle(content, fileName) {
  const h1 = content.match(/^#\s+(.+)$/m);
  return h1 ? h1[1].trim() : fileName.replace(/\.md$/i, '').replace(/[-_]/g, ' ');
}

function buildFmBlock(fields) {
  const order = ['subject', 'id', 'title', 'project', 'description', 'status',
                 'owner', 'lastUpdated', 'tags', 'deprecated', 'category', 'relativePath',
                 'created', 'updated', 'version', 'author'];
  const lines = ['---'];
  const seen = new Set();
  for (const k of order) {
    if (fields[k] !== undefined) {
      lines.push(`${k}: ${fields[k]}`);
      seen.add(k);
    }
  }
  // preserve unknown fields
  for (const [k, v] of Object.entries(fields)) {
    if (!seen.has(k)) { lines.push(`${k}: ${v}`); }
  }
  lines.push('---');
  return lines.join('\n');
}

function descriptionFromContent(content) {
  const lines = content.split('\n');
  const textLines = [];
  let pastFirst = false;
  for (const line of lines) {
    const t = line.trim();
    if (!t) { continue; }
    if (t.startsWith('#')) { if (pastFirst && textLines.length) { break; } pastFirst = true; continue; }
    if (t.startsWith('>') || t.startsWith('<!--') || t.startsWith('---') || t.startsWith('|') || t.startsWith('```')) { continue; }
    textLines.push(t.replace(/\*\*|__|\*|_|`/g, ''));
    if (textLines.join(' ').length > 160) { break; }
  }
  const d = textLines.join(' ').trim();
  return d.length > 200 ? d.slice(0, 197) + '…' : (d || 'No description.');
}

// ─── Apply front-matter to one file ─────────────────────────────────────────

function applyFm(filePath, projectName, prefix) {
  let content;
  try { content = fs.readFileSync(filePath, 'utf8'); } catch { return { skipped: true, reason: 'unreadable' }; }

  const existing = parseFm(content);
  const fields = existing ? { ...existing.fields } : {};

  // Only touch missing fields — never overwrite existing values
  const title = fields.title || extractTitle(content, path.basename(filePath));
  if (!fields.subject) { fields.subject = guessSubject(filePath, prefix); }
  if (!fields.id)      { fields.id = deriveId(title, path.basename(filePath)); }
  if (!fields.title)   { fields.title = title; }
  if (!fields.project) { fields.project = projectName; }
  if (!fields.description) {
    const d = descriptionFromContent(content);
    if (d !== 'No description.') { fields.description = d.slice(0, 200); }
    else { fields.description = title.slice(0, 200); }
  }
  if (!fields.status)  { fields.status = 'draft'; }

  const newFm = buildFmBlock(fields);
  let newContent;
  if (existing) {
    newContent = content.replace(existing.raw, newFm + '\n');
  } else {
    newContent = newFm + '\n' + content;
  }

  if (!DRY_RUN) {
    fs.writeFileSync(filePath, newContent, 'utf8');
  }

  return {
    subject: fields.subject,
    id: fields.id,
    wasNew: !existing,
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

const registry = loadRegistry();
const deweyMap  = buildProjectDeweyMap(registry.projects, registry);

// Build list of docs that are missing subject or id (or have no front-matter)
const violations = listDocViolations(registry, PROJECT_ARG || undefined);
const needsFix = new Set(
  violations.violations
    .filter(v => ['missing-subject', 'missing-id', 'missing-frontmatter'].includes(v.code))
    .map(v => v.filePath)
);

// Build projectName + prefix lookup by file path
const roots = [
  { projectName: 'global', rootPath: path.resolve(registry.globalDocsPath), dewey: 0 },
  ...registry.projects.map(p => ({
    projectName: p.name,
    rootPath: path.resolve(p.path),
    dewey: deweyMap.get(p.name)?.num ?? 999,
  })),
];

function ownerOf(filePath) {
  const lower = filePath.toLowerCase();
  return roots.find(r => lower.startsWith(r.rootPath.toLowerCase()));
}

console.log(`\n${'='.repeat(60)}`);
console.log(`Doc Contract Backfill${DRY_RUN ? ' [DRY RUN]' : ''}${PROJECT_ARG ? ` — project: ${PROJECT_ARG}` : ''}`);
console.log(`${'='.repeat(60)}`);
console.log(`Docs needing fix: ${needsFix.size}`);

let applied = 0, skipped = 0, errors = 0;
const byProject = new Map();

for (const filePath of needsFix) {
  const owner = ownerOf(filePath);
  if (!owner) { skipped++; continue; }
  const prefix = String(owner.dewey).padStart(3, '0');

  try {
    const result = applyFm(filePath, owner.projectName, prefix);
    if (result.skipped) { skipped++; continue; }
    applied++;
    const key = owner.projectName;
    byProject.set(key, (byProject.get(key) ?? 0) + 1);
  } catch (e) {
    errors++;
    console.error(`  ERROR: ${filePath} — ${e.message}`);
  }
}

console.log(`\nResults:`);
console.log(`  Applied : ${applied}`);
console.log(`  Skipped : ${skipped}`);
console.log(`  Errors  : ${errors}`);
console.log(`\nBy project:`);
for (const [name, count] of [...byProject.entries()].sort((a,b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(4)}  ${name}`);
}

if (!DRY_RUN && applied > 0) {
  // Verify
  const after = listDocViolations(registry, PROJECT_ARG || undefined);
  const remaining = after.violations.filter(v => ['missing-subject','missing-id','missing-frontmatter'].includes(v.code)).length;
  console.log(`\nRemaining missing-subject/id/frontmatter violations: ${remaining}`);
}

console.log(`${'='.repeat(60)}\n`);
