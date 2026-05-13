'use strict';
/**
 * scripts/audit-frontmatter-by-filename.js
 *
 * Scans all .md files in the workspace, extracts YAML frontmatter, and writes
 * a filename-based report in JSON and Markdown.
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

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const TODAY_DIR = path.join(ROOT, 'docs', '_today');

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.vscode', '.vscode-test', '.claude',
  'out', 'dist', 'reports', 'playwright-report', 'test-results',
]);

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
    } else if (entry.isFile() && /\.md$/i.test(entry.name)) {
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
  lines.push(`- Duplicate filenames: ${summary.duplicateFilenames}`);
  lines.push('');
  lines.push('## Files');
  lines.push('');
  lines.push('| Filename | Path | Frontmatter | Field Count | Keys | Error |');
  lines.push('|---|---|---:|---:|---|---|');

  for (const row of rows) {
    const keys = row.keys.join(', ');
    lines.push(`| ${row.filename} | ${row.path} | ${row.hasFrontmatter ? 'yes' : 'no'} | ${row.fieldCount} | ${keys} | ${row.error || ''} |`);
  }

  lines.push('');
  lines.push('## Duplicate Filenames');
  lines.push('');

  if (summary.duplicateFilenameDetails.length === 0) {
    lines.push('- None');
  } else {
    for (const d of summary.duplicateFilenameDetails) {
      lines.push(`- ${d.filename}`);
      for (const p of d.paths) {
        lines.push(`  - ${p}`);
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

    return {
      filename: path.basename(filePath),
      path: toRel(filePath),
      hasFrontmatter: parsed.hasFrontmatter,
      fieldCount: keys.length,
      keys,
      fields: parsed.fields,
      error: parsed.error,
    };
  });

  rows.sort((a, b) => {
    const byName = a.filename.localeCompare(b.filename);
    if (byName !== 0) {
      return byName;
    }
    return a.path.localeCompare(b.path);
  });

  const filenameMap = new Map();
  for (const row of rows) {
    if (!filenameMap.has(row.filename)) {
      filenameMap.set(row.filename, []);
    }
    filenameMap.get(row.filename).push(row.path);
  }

  const duplicateFilenameDetails = [];
  for (const [filename, paths] of filenameMap.entries()) {
    if (paths.length > 1) {
      duplicateFilenameDetails.push({ filename, paths: paths.slice().sort((a, b) => a.localeCompare(b)) });
    }
  }
  duplicateFilenameDetails.sort((a, b) => a.filename.localeCompare(b.filename));

  const summary = {
    total: rows.length,
    withFrontmatter: rows.filter((r) => r.hasFrontmatter).length,
    withoutFrontmatter: rows.filter((r) => !r.hasFrontmatter).length,
    errors: rows.filter((r) => !!r.error).length,
    duplicateFilenames: duplicateFilenameDetails.length,
    duplicateFilenameDetails,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    root: ROOT,
    summary,
    files: rows,
  };

  const jsonPath = path.join(DATA_DIR, 'frontmatter-audit-by-filename.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

  const mdPath = path.join(TODAY_DIR, `frontmatter-audit-${dateStamp(new Date())}.md`);
  fs.writeFileSync(mdPath, buildMarkdownReport(rows, summary), 'utf8');

  console.log('Frontmatter audit complete.');
  console.log(`Scanned: ${summary.total} markdown files`);
  console.log(`With frontmatter: ${summary.withFrontmatter}`);
  console.log(`Without frontmatter: ${summary.withoutFrontmatter}`);
  console.log(`Parse errors: ${summary.errors}`);
  console.log(`Duplicate filenames: ${summary.duplicateFilenames}`);
  console.log(`JSON report: ${toRel(jsonPath)}`);
  console.log(`Markdown report: ${toRel(mdPath)}`);
}

main();
