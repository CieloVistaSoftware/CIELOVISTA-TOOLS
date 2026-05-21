'use strict';
/**
 * scripts/audit-frontmatter-by-filename.js
 *
 * Scans all .md files in the workspace, extracts YAML frontmatter, and writes
 * a filename-based report in JSON and Markdown.
 *
 * Duplicate detection requires BOTH:
 *   1. Equal byte sizes (cheap first gate — different sizes = different content)
 *   2. Equal SHA-256 hash (content confirmation)
 * Files with the same name but different content are reported as
 * "same-name / different-content" (informational), never as duplicates.
 *
 * Usage:
 *   node scripts/audit-frontmatter-by-filename.js
 *
 * Outputs:
 *   data/frontmatter-audit-by-filename.json
 *   docs/_today/frontmatter-audit-YYYY-MM-DD.md
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const TODAY_DIR = path.join(ROOT, 'docs', '_today');

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.vscode', '.vscode-test', '.claude',
  'out', 'dist', 'reports', 'playwright-report', 'test-results',
]);

const ALLOWED_MARKDOWN_ROOT_DIRS = new Set([
  'data',
  'docs',
  'mcp-server',
  'scripts',
  'src',
  'tests',
]);

const UNPACKED_EXTENSION_DIR_RE = /^[a-z0-9-]+\.[a-z0-9-]+-\d+\.\d+\.\d+(?:[-.][a-z0-9-]+)*$/i;

function shouldIncludeMarkdown(filePath) {
  const rel = toRel(filePath);
  if (!rel || rel.startsWith('..')) {
    return false;
  }

  const parts = rel.split('/').filter(Boolean);
  if (parts.length === 0) {
    return false;
  }

  const filename = parts[parts.length - 1];
  if (/^\.tmp_issue_\d+_comment\.md$/i.test(filename)) {
    return false;
  }

  if (parts.length === 1) {
    return true;
  }

  const top = parts[0];
  if (UNPACKED_EXTENSION_DIR_RE.test(top)) {
    return false;
  }
  if (!ALLOWED_MARKDOWN_ROOT_DIRS.has(top.toLowerCase())) {
    return false;
  }

  return true;
}

function walkMarkdownFiles(dir, acc = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) {
      continue;
    }

    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkMarkdownFiles(full, acc);
    } else if (entry.isFile() && /\.md$/i.test(entry.name) && shouldIncludeMarkdown(full)) {
      acc.push(full);
    }
  }
  return acc;
}

function parseFrontmatter(content) {
  if (!content.startsWith('---')) {
    return { hasFrontmatter: false, fields: {}, raw: '', error: null };
  }

  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    return {
      hasFrontmatter: true,
      fields: {},
      raw: '',
      error: 'Opening frontmatter delimiter found, but closing delimiter is missing',
    };
  }

  const raw = match[1];
  const fields = {};

  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const kv = line.match(/^\s*([A-Za-z0-9_.-]+)\s*:\s*(.*)\s*$/);
    if (!kv) {
      continue;
    }

    const key = kv[1];
    const value = kv[2].replace(/^['"]|['"]$/g, '');
    fields[key] = value;
  }

  return { hasFrontmatter: true, fields, raw, error: null };
}

function toRel(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

/**
 * Compute SHA-256 of a file's content.
 * Returns null on read error so callers can skip gracefully.
 */
function sha256OfFile(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(buf).digest('hex');
  } catch {
    return null;
  }
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function dateStamp(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function buildMarkdownReport(rows, summary) {
  const lines = [];
  lines.push('# Frontmatter Audit (Filename-Based)');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Markdown files scanned: ${summary.total}`);
  lines.push(`- With frontmatter: ${summary.withFrontmatter}`);
  lines.push(`- Without frontmatter: ${summary.withoutFrontmatter}`);
  lines.push(`- Frontmatter parse errors: ${summary.errors}`);
  lines.push(`- True duplicates (same name + same content): ${summary.duplicateFilenames}`);
  lines.push(`- Same name / different content (informational): ${summary.sameNameDifferentContent.length}`);
  lines.push('');
  lines.push('## Files');
  lines.push('');
  lines.push('| Filename | Path | Bytes | Frontmatter | Field Count | Keys | Error |');
  lines.push('|---|---|---:|---|---:|---|---|');

  for (const row of rows) {
    const keys = row.keys.join(', ');
    lines.push(`| ${row.filename} | ${row.path} | ${row.bytes} | ${row.hasFrontmatter ? 'yes' : 'no'} | ${row.fieldCount} | ${keys} | ${row.error || ''} |`);
  }

  lines.push('');
  lines.push('## True Duplicates (same name AND same content)');
  lines.push('');
  lines.push('Files listed here are byte-for-byte identical — safe to deduplicate.');
  lines.push('');

  if (summary.duplicateFilenameDetails.length === 0) {
    lines.push('- None');
  } else {
    for (const d of summary.duplicateFilenameDetails) {
      lines.push(`- **${d.filename}** (${d.bytes} bytes)`);
      for (const p of d.paths) {
        lines.push(`  - ${p}`);
      }
    }
  }

  lines.push('');
  lines.push('## Same Name / Different Content (informational)');
  lines.push('');
  lines.push('These files share a filename but have different content. They are NOT duplicates.');
  lines.push('');

  if (summary.sameNameDifferentContent.length === 0) {
    lines.push('- None');
  } else {
    for (const d of summary.sameNameDifferentContent) {
      lines.push(`- **${d.filename}**`);
      for (const e of d.entries) {
        lines.push(`  - ${e.path} (${e.bytes} bytes)`);
      }
    }
  }

  lines.push('');
  return lines.join('\n');
}

function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(TODAY_DIR, { recursive: true });

  const files = walkMarkdownFiles(ROOT);

  const rows = files.map((filePath) => {
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = parseFrontmatter(content);
    const keys = Object.keys(parsed.fields).sort((a, b) => a.localeCompare(b));

    let bytes = 0;
    try { bytes = fs.statSync(filePath).size; } catch { /* best-effort */ }

    return {
      filename: path.basename(filePath),
      path: toRel(filePath),
      bytes,
      hasFrontmatter: parsed.hasFrontmatter,
      fieldCount: keys.length,
      keys,
      fields: parsed.fields,
      error: parsed.error,
      // _absPath is used internally for hashing — not written to JSON
      _absPath: filePath,
    };
  });

  rows.sort((a, b) => {
    const byName = a.filename.localeCompare(b.filename);
    if (byName !== 0) {
      return byName;
    }
    return a.path.localeCompare(b.path);
  });

  // ── Duplicate detection: name match + size gate + SHA-256 confirmation ──
  //
  // Two files are TRUE DUPLICATES only when:
  //   1. Same filename
  //   2. Same byte size (cheap gate — different sizes = different content)
  //   3. Same SHA-256 hash (content confirmation)
  //
  // Files with the same name but different size/content are "same-name /
  // different-content" — informational, NOT flagged as duplicates.

  const filenameMap = new Map();
  for (const row of rows) {
    if (!filenameMap.has(row.filename)) {
      filenameMap.set(row.filename, []);
    }
    filenameMap.get(row.filename).push(row);
  }

  const duplicateFilenameDetails = [];
  const sameNameDifferentContent = [];

  for (const [filename, entries] of filenameMap.entries()) {
    if (entries.length < 2) continue;

    // Group entries by byte size first (cheap gate)
    const sizeGroups = new Map();
    for (const entry of entries) {
      const key = entry.bytes;
      if (!sizeGroups.has(key)) sizeGroups.set(key, []);
      sizeGroups.get(key).push(entry);
    }

    // Within each size group, confirm by SHA-256
    for (const sizeGroup of sizeGroups.values()) {
      if (sizeGroup.length < 2) continue;

      const hashGroups = new Map();
      for (const entry of sizeGroup) {
        const h = sha256OfFile(entry._absPath) ?? '__hash_error__';
        if (!hashGroups.has(h)) hashGroups.set(h, []);
        hashGroups.get(h).push(entry);
      }

      for (const [, hashGroup] of hashGroups.entries()) {
        if (hashGroup.length >= 2) {
          duplicateFilenameDetails.push({
            filename,
            bytes: hashGroup[0].bytes,
            paths: hashGroup.map((e) => e.path).sort((a, b) => a.localeCompare(b)),
          });
        }
      }
    }

    // Any entries NOT in a true-duplicate group → same-name / different-content
    // Build a set of paths that ended up in a true-duplicate group
    const dupPaths = new Set(
      duplicateFilenameDetails
        .filter((d) => d.filename === filename)
        .flatMap((d) => d.paths),
    );
    const differentEntries = entries.filter((e) => !dupPaths.has(e.path));
    if (differentEntries.length >= 2) {
      sameNameDifferentContent.push({
        filename,
        entries: differentEntries
          .map((e) => ({ path: e.path, bytes: e.bytes }))
          .sort((a, b) => a.path.localeCompare(b.path)),
      });
    } else if (differentEntries.length === 1 && dupPaths.size > 0) {
      // One entry didn't match any duplicate group — still different-content
      sameNameDifferentContent.push({
        filename,
        entries: [{ path: differentEntries[0].path, bytes: differentEntries[0].bytes }],
      });
    }
  }

  duplicateFilenameDetails.sort((a, b) => a.filename.localeCompare(b.filename));
  sameNameDifferentContent.sort((a, b) => a.filename.localeCompare(b.filename));

  const summary = {
    total: rows.length,
    withFrontmatter: rows.filter((r) => r.hasFrontmatter).length,
    withoutFrontmatter: rows.filter((r) => !r.hasFrontmatter).length,
    errors: rows.filter((r) => !!r.error).length,
    duplicateFilenames: duplicateFilenameDetails.length,
    duplicateFilenameDetails,
    sameNameDifferentContent,
  };

  // Strip internal _absPath before writing JSON
  const reportFiles = rows.map(({ _absPath: _ignored, ...rest }) => rest);

  const report = {
    generatedAt: new Date().toISOString(),
    root: ROOT,
    summary,
    files: reportFiles,
  };

  const jsonPath = path.join(DATA_DIR, 'frontmatter-audit-by-filename.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

  const mdPath = path.join(TODAY_DIR, `frontmatter-audit-${dateStamp(new Date())}.md`);
  fs.writeFileSync(mdPath, buildMarkdownReport(reportFiles, summary), 'utf8');

  console.log('Frontmatter audit complete.');
  console.log(`Scanned: ${summary.total} markdown files`);
  console.log(`With frontmatter: ${summary.withFrontmatter}`);
  console.log(`Without frontmatter: ${summary.withoutFrontmatter}`);
  console.log(`Parse errors: ${summary.errors}`);
  console.log(`True duplicates (same name + same content): ${summary.duplicateFilenames}`);
  console.log(`Same name / different content: ${summary.sameNameDifferentContent.length}`);
  console.log(`JSON report: ${toRel(jsonPath)}`);
  console.log(`Markdown report: ${toRel(mdPath)}`);
}

main();
