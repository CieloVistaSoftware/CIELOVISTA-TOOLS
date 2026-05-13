'use strict';
/**
 * scripts/build-frontmatter-viewer.js
 *
 * Builds an HTML viewer from data/frontmatter-audit-by-filename.json.
 * The viewer shows all frontmatter fields/values for each .md file.
 * Any violation row is rendered with red background and white text.
 *
 * Usage:
 *   node scripts/build-frontmatter-viewer.js
 *
 * Output:
 *   docs/_today/frontmatter-viewer-YYYY-MM-DD.html
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const INPUT = path.join(ROOT, 'data', 'frontmatter-audit-by-filename.json');
const OUT_DIR = path.join(ROOT, 'docs', '_today');

function pad2(n) {
  return String(n).padStart(2, '0');
}

function dateStamp(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function hasOwn(obj, key) {
  return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
}

function getViolationReasons(file, duplicateNames) {
  const reasons = [];
  const fields = file.fields || {};

  if (!file.hasFrontmatter) {
    reasons.push('missing frontmatter');
  }
  if (file.error) {
    reasons.push('frontmatter parse error');
  }
  if (!hasOwn(fields, 'docid')) {
    reasons.push('missing docid');
  }
  if (hasOwn(fields, 'docid') && String(fields.docid).trim() === '') {
    reasons.push('empty docid');
  }
  if (hasOwn(fields, 'dewey')) {
    reasons.push('legacy field dewey present');
  }
  if (hasOwn(fields, 'subject')) {
    reasons.push('legacy field subject present');
  }
  if (duplicateNames.has(file.filename)) {
    reasons.push('duplicate filename');
  }

  return reasons;
}

function renderFields(fields) {
  const keys = Object.keys(fields || {}).sort((a, b) => a.localeCompare(b));
  if (keys.length === 0) {
    return '<span class="muted">none</span>';
  }

  return keys.map((k) => {
    const val = fields[k];
    return `<div class="kv"><span class="k">${esc(k)}</span><span class="v">${esc(val)}</span></div>`;
  }).join('');
}

function buildHtml(report) {
  const dupNames = new Set((report.summary?.duplicateFilenameDetails || []).map((d) => d.filename));
  const files = Array.isArray(report.files) ? report.files.slice() : [];

  files.sort((a, b) => {
    const byName = String(a.filename || '').localeCompare(String(b.filename || ''));
    if (byName !== 0) {
      return byName;
    }
    return String(a.path || '').localeCompare(String(b.path || ''));
  });

  const rows = files.map((f) => {
    const reasons = getViolationReasons(f, dupNames);
    const bad = reasons.length > 0;

    const reasonHtml = reasons.length > 0
      ? reasons.map((r) => `<span class="reason">${esc(r)}</span>`).join('')
      : '<span class="ok">ok</span>';

    return `<tr class="${bad ? 'violation' : 'pass'}">
      <td>${esc(f.filename)}</td>
      <td>${esc(f.path)}</td>
      <td>${f.hasFrontmatter ? 'yes' : 'no'}</td>
      <td>${renderFields(f.fields || {})}</td>
      <td>${reasonHtml}</td>
    </tr>`;
  }).join('\n');

  const s = report.summary || {};

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Frontmatter Viewer</title>
<style>
:root {
  --bg: #0f1218;
  --panel: #171c24;
  --grid: #2a3140;
  --text: #e6edf7;
  --muted: #99a3b3;
  --accent: #4fb3ff;
  --bad: #b00020;
  --bad-text: #ffffff;
  --ok: #2ea043;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: Segoe UI, Tahoma, sans-serif;
  color: var(--text);
  background: radial-gradient(1200px 700px at 20% -10%, #1c2431, var(--bg));
}
.wrap {
  width: min(1800px, 96vw);
  margin: 22px auto;
  padding: 0 6px 22px;
}
h1 {
  margin: 0 0 8px;
  letter-spacing: 0.2px;
}
.summary {
  display: grid;
  grid-template-columns: repeat(6, minmax(140px, 1fr));
  gap: 10px;
  margin: 14px 0 18px;
}
.card {
  background: var(--panel);
  border: 1px solid var(--grid);
  border-radius: 10px;
  padding: 10px 12px;
}
.card .label { color: var(--muted); font-size: 12px; }
.card .value { font-size: 20px; font-weight: 700; margin-top: 3px; }
.table-wrap {
  border: 1px solid var(--grid);
  border-radius: 10px;
  overflow: auto;
  background: var(--panel);
}
table { width: 100%; border-collapse: collapse; min-width: 1200px; }
thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: #1a2130;
  text-align: left;
  border-bottom: 1px solid var(--grid);
  padding: 10px;
}
tbody td {
  vertical-align: top;
  border-bottom: 1px solid var(--grid);
  padding: 10px;
}
tbody tr.pass { background: #141a23; }
tbody tr.violation {
  background: var(--bad);
  color: var(--bad-text);
}
tbody tr.violation .muted,
tbody tr.violation .k,
tbody tr.violation .v,
tbody tr.violation .reason,
tbody tr.violation .ok {
  color: var(--bad-text);
  border-color: rgba(255, 255, 255, 0.45);
}
.muted { color: var(--muted); }
.kv {
  display: grid;
  grid-template-columns: 170px 1fr;
  gap: 6px;
  padding: 4px 0;
  border-bottom: 1px dashed rgba(153, 163, 179, 0.25);
}
.kv:last-child { border-bottom: none; }
.k { color: #8bd3ff; font-weight: 600; }
.v { color: var(--text); word-break: break-word; }
.reason,
.ok {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.25);
  margin: 0 6px 6px 0;
}
.ok {
  background: rgba(46,160,67,0.2);
  color: #8ce99a;
  border-color: rgba(46,160,67,0.55);
}
.reason {
  background: rgba(0,0,0,0.2);
  color: #ffd9de;
  border-color: rgba(255,217,222,0.4);
}
.note {
  margin: 12px 0 0;
  color: var(--muted);
  font-size: 12px;
}
</style>
</head>
<body>
  <div class="wrap">
    <h1>Frontmatter Viewer</h1>
    <div class="muted">Generated: ${esc(report.generatedAt || new Date().toISOString())}</div>

    <div class="summary">
      <div class="card"><div class="label">Files scanned</div><div class="value">${esc(s.total || 0)}</div></div>
      <div class="card"><div class="label">With frontmatter</div><div class="value">${esc(s.withFrontmatter || 0)}</div></div>
      <div class="card"><div class="label">Without frontmatter</div><div class="value">${esc(s.withoutFrontmatter || 0)}</div></div>
      <div class="card"><div class="label">Parse errors</div><div class="value">${esc(s.errors || 0)}</div></div>
      <div class="card"><div class="label">Duplicate filenames</div><div class="value">${esc(s.duplicateFilenames || 0)}</div></div>
      <div class="card"><div class="label">Violation rows</div><div class="value">${esc(files.filter((f) => getViolationReasons(f, dupNames).length > 0).length)}</div></div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Filename</th>
            <th>Path</th>
            <th>Frontmatter</th>
            <th>Fields + Values</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>

    <div class="note">Rows in violation are red with white text.</div>
  </div>
</body>
</html>`;
}

function main() {
  if (!fs.existsSync(INPUT)) {
    throw new Error(`Missing audit file: ${INPUT}. Run node scripts/audit-frontmatter-by-filename.js first.`);
  }

  const report = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const outPath = path.join(OUT_DIR, `frontmatter-viewer-${dateStamp(new Date())}.html`);
  fs.writeFileSync(outPath, buildHtml(report), 'utf8');

  const rel = path.relative(ROOT, outPath).replace(/\\/g, '/');
  console.log(`Frontmatter viewer generated: ${rel}`);
}

main();
