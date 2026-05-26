// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * frontmatter-viewer.ts
 *
 * Scans all .md files in the cielovista-tools project, audits frontmatter,
 * and opens an interactive HTML viewer in a VS Code webview panel.
 *
 * Inline port of:
 *   scripts/audit-frontmatter-by-filename.js
 *   scripts/build-frontmatter-viewer.js
 *
 * Command: cvs.headers.frontmatterViewer
 */

import * as vscode from 'vscode';
import * as fs     from 'fs';
import * as path   from 'path';
import { fileFrontmatterViolationAsIssue } from '../shared/github-issue-filer';
import { log, logError } from '../shared/output-channel';
import { esc as escStr } from '../shared/webview-utils';
import { getLauncherTargetColumn } from '../shared/panel-context';

const FEATURE = 'frontmatter-viewer';
const FILED_ISSUES_KEY = 'frontmatter-viewer.filedIssues';
const FILED_ISSUES_REPAIR_PATH = path.join('data', 'frontmatter-filed-issues.repair.json');

let _panel: vscode.WebviewPanel | undefined;
let _context: vscode.ExtensionContext | undefined;
let _filedIssues = new Map<string, { number: number; url: string }>();

function normalizeRelPath(p: string): string {
    return String(p || '').replace(/\\/g, '/').trim().toLowerCase();
}

function loadRepairSnapshot(root: string): Map<string, { number: number; url: string }> {
    const map = new Map<string, { number: number; url: string }>();
    const abs = path.join(root, FILED_ISSUES_REPAIR_PATH);
    if (!fs.existsSync(abs)) { return map; }

    try {
        const raw = fs.readFileSync(abs, 'utf8');
        const parsed = JSON.parse(raw) as Record<string, { number?: number; url?: string }>;
        for (const [k, v] of Object.entries(parsed || {})) {
            const rel = normalizeRelPath(k);
            const num = Number(v?.number);
            const url = String(v?.url || '').trim();
            if (!rel || !Number.isFinite(num) || num <= 0 || !url) { continue; }
            map.set(rel, { number: num, url });
        }
    } catch (err) {
        logError('Failed to load frontmatter repair snapshot', err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
    }

    return map;
}

function loadFiledIssues(root: string): void {
    if (!_context) { return; }
    const stored = _context.globalState.get<Record<string, { number: number; url: string }>>(FILED_ISSUES_KEY, {});
    _filedIssues = new Map();
    for (const [k, v] of Object.entries(stored || {})) {
        const rel = normalizeRelPath(k);
        const num = Number(v?.number);
        const url = String(v?.url || '').trim();
        if (!rel || !Number.isFinite(num) || num <= 0 || !url) { continue; }
        _filedIssues.set(rel, { number: num, url });
    }

    // One-time repair source: import mappings produced by scripts/repair-frontmatter-filed-issues.js.
    const repaired = loadRepairSnapshot(root);
    let merged = false;
    for (const [rel, info] of repaired) {
        if (!_filedIssues.has(rel)) {
            _filedIssues.set(rel, info);
            merged = true;
        }
    }
    if (merged) { saveFiledIssues(); }
}

function saveFiledIssues(): void {
    if (!_context) { return; }
    const obj: Record<string, { number: number; url: string }> = {};
    for (const [k, v] of _filedIssues) { obj[k] = v; }
    void _context.globalState.update(FILED_ISSUES_KEY, obj);
}

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

function shouldIncludeMarkdown(root: string, absFilePath: string): boolean {
    const rel = path.relative(root, absFilePath).replace(/\\/g, '/');
    if (!rel || rel.startsWith('..')) { return false; }

    const parts = rel.split('/').filter(Boolean);
    if (parts.length === 0) { return false; }

    const filename = parts[parts.length - 1];
    if (/^\.tmp_issue_\d+_comment\.md$/i.test(filename)) { return false; }

    if (parts.length === 1) { return true; }

    const top = parts[0];
    if (UNPACKED_EXTENSION_DIR_RE.test(top)) { return false; }
    if (!ALLOWED_MARKDOWN_ROOT_DIRS.has(top.toLowerCase())) { return false; }

    return true;
}

// ─── Scanner ─────────────────────────────────────────────────────────────────

interface FmFile {
    filename:       string;
    path:           string;
    hasFrontmatter: boolean;
    fieldCount:     number;
    keys:           string[];
    fields:         Record<string, string>;
    error:          string | null;
}

interface DupDetail { filename: string; paths: string[]; }

interface Report {
    generatedAt: string;
    root:        string;
    summary: {
        total:                   number;
        withFrontmatter:         number;
        withoutFrontmatter:      number;
        errors:                  number;
        duplicateFilenames:      number;
        duplicateFilenameDetails: DupDetail[];
    };
    files: FmFile[];
}

function walkMd(dir: string, root: string, acc: string[] = []): string[] {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
    for (const e of entries) {
        if (SKIP_DIRS.has(e.name)) { continue; }
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { walkMd(full, root, acc); }
        else if (e.isFile() && /\.md$/i.test(e.name) && shouldIncludeMarkdown(root, full)) {
            acc.push(full);
        }
    }
    return acc;
}

function parseFm(content: string): { hasFrontmatter: boolean; fields: Record<string, string>; error: string | null } {
    if (!content.startsWith('---')) { return { hasFrontmatter: false, fields: {}, error: null }; }
    const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (!m) { return { hasFrontmatter: true, fields: {}, error: 'Missing closing frontmatter delimiter' }; }
    const fields: Record<string, string> = {};
    for (const line of m[1].split(/\r?\n/)) {
        const kv = line.match(/^\s*([A-Za-z0-9_.-]+)\s*:\s*(.*)\s*$/);
        if (kv) { fields[kv[1]] = kv[2].replace(/^['"]|['"]$/g, ''); }
    }
    return { hasFrontmatter: true, fields, error: null };
}

function scanProject(root: string): Report {
    const files = walkMd(root, root);
    const rows: FmFile[] = files.map(fp => {
        const content = fs.readFileSync(fp, 'utf8');
        const { hasFrontmatter, fields, error } = parseFm(content);
        const keys = Object.keys(fields).sort((a, b) => a.localeCompare(b));
        return { filename: path.basename(fp), path: path.relative(root, fp).replace(/\\/g, '/'), hasFrontmatter, fieldCount: keys.length, keys, fields, error };
    });
    rows.sort((a, b) => a.filename.localeCompare(b.filename) || a.path.localeCompare(b.path));

    const filenameMap = new Map<string, string[]>();
    for (const r of rows) {
        if (!filenameMap.has(r.filename)) { filenameMap.set(r.filename, []); }
        filenameMap.get(r.filename)!.push(r.path);
    }
    const dupDetails: DupDetail[] = [];
    for (const [filename, paths] of filenameMap) {
        if (paths.length > 1) { dupDetails.push({ filename, paths: paths.slice().sort() }); }
    }
    dupDetails.sort((a, b) => a.filename.localeCompare(b.filename));

    return {
        generatedAt: new Date().toISOString(),
        root,
        summary: {
            total:                   rows.length,
            withFrontmatter:         rows.filter(r => r.hasFrontmatter).length,
            withoutFrontmatter:      rows.filter(r => !r.hasFrontmatter).length,
            errors:                  rows.filter(r => !!r.error).length,
            duplicateFilenames:      dupDetails.length,
            duplicateFilenameDetails: dupDetails,
        },
        files: rows,
    };
}

// ─── Viewer HTML ─────────────────────────────────────────────────────────────

function violations(f: FmFile, dupNames: Set<string>): string[] {
    const r: string[] = [];
    if (!f.hasFrontmatter)                         { r.push('missing frontmatter'); }
    if (f.error)                                   { r.push('frontmatter parse error'); }
    if (!f.fields['docid'])                        { r.push('missing docid'); }
    if (f.fields['docid']?.trim() === '')          { r.push('empty docid'); }
    if ('dewey'   in f.fields)                     { r.push('legacy field: dewey'); }
    if ('subject' in f.fields)                     { r.push('legacy field: subject'); }
    if (dupNames.has(f.filename))                  { r.push('duplicate filename'); }
    return r;
}

function esc(s: unknown): string { return escStr(String(s ?? '')); }

function toIssueLabel(v: string): string {
    return v.replace(/\s+/g, ' ').trim().toUpperCase();
}

function proposedFixes(violationList: string[]): string[] {
    const fixes: string[] = [];
    if (violationList.includes('missing frontmatter')) {
        fixes.push('Add a YAML frontmatter block at the top of the markdown file (`---` ... `---`).');
    }
    if (violationList.includes('frontmatter parse error')) {
        fixes.push('Repair malformed frontmatter and ensure a valid closing `---` delimiter.');
    }
    if (violationList.includes('missing docid') || violationList.includes('empty docid')) {
        fixes.push('Set a non-empty `docid` field in frontmatter following the project doc contract.');
    }
    if (violationList.includes('legacy field: dewey')) {
        fixes.push('Remove legacy `dewey` from frontmatter and use current doc contract fields only.');
    }
    if (violationList.includes('legacy field: subject')) {
        fixes.push('Remove legacy `subject` from frontmatter and use current doc contract fields only.');
    }
    if (violationList.includes('duplicate filename')) {
        fixes.push('Rename the file to a unique markdown filename and update links/references.');
    }
    return fixes.length > 0 ? fixes : ['Update this file to satisfy all frontmatter validation rules.'];
}

function toTestSlug(input: string): string {
    return input
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'doc';
}

function buildFailureTestContent(relativePath: string, filename: string, violationList: string[]): string {
    const rel = relativePath.replace(/\\/g, '/');
    const checks: string[] = [];

    if (violationList.includes('missing frontmatter') || violationList.includes('frontmatter parse error')) {
        checks.push("assert.ok(raw.startsWith('---'), 'Expected YAML frontmatter at top of file');");
        checks.push("const fmMatch = raw.match(/^---\\r?\\n([\\s\\S]*?)\\r?\\n---(?:\\r?\\n|$)/);");
        checks.push("assert.ok(fmMatch, 'Expected parseable frontmatter with closing delimiter');");
    } else {
        checks.push("const fmMatch = raw.match(/^---\\r?\\n([\\s\\S]*?)\\r?\\n---(?:\\r?\\n|$)/);");
        checks.push("assert.ok(fmMatch, 'Expected parseable frontmatter with closing delimiter');");
    }
    if (violationList.includes('missing docid') || violationList.includes('empty docid')) {
        checks.push("assert.match(fmMatch[1], /^docid:\\s*\\S+/m, 'Expected non-empty docid field in frontmatter');");
    }
    if (violationList.includes('legacy field: dewey')) {
        checks.push("assert.doesNotMatch(fmMatch[1], /^dewey:\\s*/m, 'Legacy field `dewey` must not be present');");
    }
    if (violationList.includes('legacy field: subject')) {
        checks.push("assert.doesNotMatch(fmMatch[1], /^subject:\\s*/m, 'Legacy field `subject` must not be present');");
    }
    if (violationList.includes('duplicate filename')) {
        checks.push("const repoRoot = path.resolve(__dirname, '..', '..');");
        checks.push("const allMd = [];\n(function walk(dir){\n  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {\n    if (['node_modules','.git','.vscode','out','dist'].includes(e.name)) { continue; }\n    const p = path.join(dir, e.name);\n    if (e.isDirectory()) { walk(p); } else if (e.isFile() && /\\.md$/i.test(e.name)) { allMd.push(p); }\n  }\n})(repoRoot);");
        checks.push("const sameName = allMd.filter((p) => path.basename(p).toLowerCase() === targetBase.toLowerCase());");
        checks.push("assert.strictEqual(sameName.length, 1, 'Expected filename to be unique across repo markdown files');");
    }

    return [
        "'use strict';",
        '',
        '// Auto-generated by Frontmatter Viewer Fix workflow (issue #339).',
        "const assert = require('assert');",
        "const fs = require('fs');",
        "const path = require('path');",
        '',
        "const targetRel = '" + rel.replace(/'/g, "\\'") + "';",
        "const targetBase = '" + filename.replace(/'/g, "\\'") + "';",
        "const targetPath = path.resolve(__dirname, '..', '..', targetRel);",
        "const raw = fs.readFileSync(targetPath, 'utf8');",
        '',
        ...checks,
        '',
        "console.log('Frontmatter fix test passed for', targetRel);",
    ].join('\n');
}

function createFailingFixTest(root: string, relativePath: string, filename: string, violationList: string[]): { absPath: string; relPath: string } {
    const testDir = path.join(root, 'tests', 'regression');
    fs.mkdirSync(testDir, { recursive: true });

    const slug = toTestSlug(filename);
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    let base = `REG-339-frontmatter-fix-${slug}-${stamp}.test.js`;
    let abs = path.join(testDir, base);
    let i = 1;
    while (fs.existsSync(abs)) {
        base = `REG-339-frontmatter-fix-${slug}-${stamp}-${i}.test.js`;
        abs = path.join(testDir, base);
        i += 1;
    }

    const content = buildFailureTestContent(relativePath, filename, violationList);
    fs.writeFileSync(abs, content, 'utf8');
    return { absPath: abs, relPath: path.relative(root, abs).replace(/\\/g, '/') };
}

function buildFrontmatterFixIssueBody(relativePath: string, violationList: string[], testRelPath: string): string {
    const fixes = proposedFixes(violationList);
    const lines: string[] = [];
    lines.push('## Summary');
    lines.push('Frontmatter Viewer Fix action generated this issue from a specific violation row.');
    lines.push('');
    lines.push('## File');
        lines.push(`- Path: \`${relativePath}\``);
    lines.push('');
    lines.push('## Violations');
    for (const v of violationList) {
        lines.push(`- ${toIssueLabel(v)}`);
    }
    lines.push('');
    lines.push('## Proposed Fix');
    for (const f of fixes) {
        lines.push(`- ${f}`);
    }
    lines.push('');
    lines.push('## Reproduction Test (Auto-generated)');
        lines.push(`- Test file: \`${testRelPath}\``);
        lines.push(`- Run: \`node ${testRelPath}\``);
    lines.push('');
    lines.push('## Completion Checklist');
    lines.push('- [ ] Reproduction test fails before the fix.');
    lines.push('- [ ] Code changes are implemented.');
    lines.push('- [ ] Reproduction test passes after the fix.');
    lines.push('- [ ] User reviewed and approved the fix.');
    lines.push('');
    lines.push('---');
    lines.push(`*Filed from Frontmatter Viewer on ${new Date().toISOString()}*`);
    return lines.join('\n');
}

function buildViewerHtml(report: Report, filedIssues: Map<string, { number: number; url: string }>): string {
    const dupNames = new Set(report.summary.duplicateFilenameDetails.map(d => d.filename));
    const s = report.summary;

    const rows = report.files.map((f, idx) => {
        const v = violations(f, dupNames);
        const bad = v.length > 0;
        const absPath = esc(path.join(report.root, f.path));
        const fixId = `fm-fix-${idx}`;
        const violationsAttr = esc(v.join('|'));
        const statusHtml = bad
            ? v.map(r => `<span class="reason">${esc(r)}</span>`).join('')
            : '<span class="ok">ok</span>';
        const fieldsHtml = Object.keys(f.fields).length === 0
            ? '<span class="muted">none</span>'
            : Object.keys(f.fields).sort().map(k =>
                `<div class="kv"><span class="k">${esc(k)}</span><span class="v">${esc(f.fields[k])}</span></div>`
              ).join('');
        const filed = bad ? filedIssues.get(normalizeRelPath(f.path)) : undefined;
        const fixHtml = bad
            ? filed
                ? `<button class="fix-btn fix-btn-filed" data-action="open-issue" data-fix-id="${fixId}" data-url="${esc(filed.url)}" title="Issue filed. Click to open in browser.">Filed #${filed.number}</button>`
                : `<button class="fix-btn" data-action="fix" data-fix-id="${fixId}" data-rel-path="${esc(f.path)}" data-filename="${esc(f.filename)}" data-violations="${violationsAttr}" title="Create issue + failing test for this row">Fix</button>`
            : '<span class="muted">-</span>';
        return `<tr class="${bad ? 'violation' : 'pass'}">
  <td><span class="file-link" data-action="open" data-abs-path="${absPath}">${esc(f.filename)}</span></td>
  <td class="path-cell"><span class="file-link" data-action="open" data-abs-path="${absPath}">${esc(f.path)}</span></td>
    <td class="fm-cell">${f.hasFrontmatter ? 'yes' : '<span class="muted">no</span>'}</td>
  <td>${fieldsHtml}</td>
    <td><div class="status-stack">${statusHtml}</div></td>
  <td>${fixHtml}</td>
</tr>`;
    }).join('\n');

    const violationCount = report.files.filter(f => violations(f, dupNames).length > 0).length;

    return `<!doctype html><html lang="en"><head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src 'unsafe-inline';script-src 'unsafe-inline';">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family,Segoe UI,sans-serif);font-size:13px;background:var(--vscode-editor-background,#1e1e1e);color:var(--vscode-editor-foreground,#d4d4d4)}
#hdr{padding:14px 18px 10px;border-bottom:1px solid var(--vscode-panel-border)}
h1{font-size:16px;font-weight:700;margin-bottom:4px}
.gen{font-size:11px;color:var(--vscode-descriptionForeground);margin-bottom:12px}
.summary{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:0}
.card{background:var(--vscode-textCodeBlock-background);border:1px solid var(--vscode-panel-border);border-radius:6px;padding:8px 14px;min-width:130px}
.card .lbl{font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--vscode-descriptionForeground)}
.card .val{font-size:22px;font-weight:700;margin-top:2px}
.card.bad .val{color:#f85149}
.card.good .val{color:#3fb950}
#filter-bar{display:flex;align-items:center;gap:10px;padding:10px 18px;border-bottom:1px solid var(--vscode-panel-border)}
#filter-bar input{flex:1;padding:5px 10px;border:1px solid var(--vscode-panel-border);border-radius:4px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);font-family:inherit;font-size:12px;outline:none}
#filter-bar input:focus{border-color:var(--vscode-focusBorder)}
#filter-bar .rescan-btn{padding:5px 10px;border:1px solid var(--vscode-panel-border);border-radius:4px;background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);font-size:12px;font-weight:600;cursor:pointer}
#filter-bar .rescan-btn:hover{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border-color:var(--vscode-focusBorder)}
#filter-bar .rescan-btn:disabled{opacity:.7;cursor:wait}
#filter-bar select{padding:5px 8px;border:1px solid var(--vscode-panel-border);border-radius:4px;background:var(--vscode-dropdown-background);color:var(--vscode-dropdown-foreground);font-size:12px;cursor:pointer}
#count{font-size:11px;color:var(--vscode-descriptionForeground);white-space:nowrap}
#tbl-wrap{overflow:auto;height:calc(100vh - var(--hdr-h,220px))}
table{width:100%;border-collapse:collapse;table-layout:fixed}
thead th:nth-child(1),tbody td:nth-child(1){width:17%}
thead th:nth-child(2),tbody td:nth-child(2){width:29%}
thead th:nth-child(3),tbody td:nth-child(3){width:6%}
thead th:nth-child(4),tbody td:nth-child(4){width:16%}
thead th:nth-child(5),tbody td:nth-child(5){width:24%}
thead th:nth-child(6),tbody td:nth-child(6){width:8%}
thead th{position:sticky;top:0;z-index:2;background:var(--vscode-editor-background);border-bottom:2px solid var(--vscode-panel-border);padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--vscode-descriptionForeground);white-space:nowrap;cursor:pointer;user-select:none}
thead th:hover{color:var(--vscode-editor-foreground)}
thead th.sorted{color:var(--vscode-focusBorder)}
tbody td{padding:5px 8px;border-bottom:1px solid var(--vscode-panel-border);vertical-align:top;font-size:12px;overflow:hidden}
tr.pass{}
tr.violation td{background:rgba(248,81,73,.1)!important;border-bottom-color:rgba(248,81,73,.2)}
tr:hover td{background:var(--vscode-list-hoverBackground)}
.path-cell{font-family:var(--vscode-editor-font-family,monospace);font-size:11px;color:var(--vscode-descriptionForeground);word-break:break-all}
.fm-cell{white-space:nowrap}
.kv{display:grid;grid-template-columns:140px 1fr;gap:4px;padding:2px 0;border-bottom:1px dashed rgba(128,128,128,.2)}
.kv:last-child{border-bottom:none}
.k{color:#4dabf7;font-weight:600;font-size:11px}
.v{word-break:break-word;font-size:11px}
.muted{color:var(--vscode-descriptionForeground)}
.status-stack{display:flex;flex-wrap:wrap;gap:4px;align-items:flex-start}
.reason{display:inline-block;font-size:10px;font-weight:700;text-transform:uppercase;padding:2px 7px;border-radius:999px;background:rgba(248,81,73,.15);color:#f85149;border:1px solid rgba(248,81,73,.35);margin:1px 4px 1px 0}
.ok{display:inline-block;font-size:10px;font-weight:700;text-transform:uppercase;padding:2px 7px;border-radius:999px;background:rgba(63,185,80,.12);color:#3fb950;border:1px solid rgba(63,185,80,.3)}
.file-link{cursor:pointer;color:var(--vscode-textLink-foreground);text-decoration:underline dotted;text-underline-offset:2px}
.file-link:hover{color:var(--vscode-textLink-activeForeground);text-decoration:underline}
.fix-btn{padding:3px 10px;border:1px solid var(--vscode-focusBorder);border-radius:5px;background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap}
.fix-btn:hover{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}
.fix-btn:disabled{opacity:.7;cursor:wait}
.fix-btn-filed{border-color:#3fb950;color:#3fb950;background:transparent}
#filter-bar .fix-all-btn{padding:5px 10px;border:1px solid #f85149;border-radius:4px;background:rgba(248,81,73,.12);color:#f85149;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap}
#filter-bar .fix-all-btn:hover{background:rgba(248,81,73,.3)}
#filter-bar .fix-all-btn:disabled{opacity:.6;cursor:wait}
</style>
</head><body>
<div id="hdr">
  <h1>Frontmatter Viewer</h1>
  <div class="gen">Scanned: ${esc(report.generatedAt)}</div>
  <div class="summary">
    <div class="card"><div class="lbl">Files scanned</div><div class="val">${s.total}</div></div>
    <div class="card good"><div class="lbl">With frontmatter</div><div class="val">${s.withFrontmatter}</div></div>
    <div class="card ${s.withoutFrontmatter > 0 ? 'bad' : ''}"><div class="lbl">No frontmatter</div><div class="val">${s.withoutFrontmatter}</div></div>
    <div class="card ${s.errors > 0 ? 'bad' : ''}"><div class="lbl">Parse errors</div><div class="val">${s.errors}</div></div>
    <div class="card ${s.duplicateFilenames > 0 ? 'bad' : ''}"><div class="lbl">Dup filenames</div><div class="val">${s.duplicateFilenames}</div></div>
    <div class="card ${violationCount > 0 ? 'bad' : 'good'}"><div class="lbl">Violations</div><div class="val">${violationCount}</div></div>
  </div>
</div>
<div id="filter-bar">
  <input id="search" type="text" placeholder="Filter by filename, path, field…" autocomplete="off" spellcheck="false">
    <button id="rescanBtn" class="rescan-btn" data-action="rescan" type="button" title="Re-scan markdown files and refresh results">Rescan</button>
    <button id="fixAllBtn" class="fix-all-btn" data-action="fix-all" type="button" title="Apply existing filed issue IDs to all visible violation rows">Fix All</button>
  <select id="status-filter">
    <option value="all">All rows</option>
    <option value="violations">Violations only</option>
    <option value="ok">OK only</option>
  </select>
  <span id="count"></span>
</div>
<div id="tbl-wrap">
<table id="tbl">
<thead><tr>
  <th data-col="0">Filename</th>
  <th data-col="1">Path</th>
  <th data-col="2">FM</th>
  <th>Fields</th>
  <th data-col="4">Status</th>
    <th>Fix</th>
</tr></thead>
<tbody id="tbody">${rows}</tbody>
</table>
</div>
<script>(function(){
var vscode = acquireVsCodeApi();

document.addEventListener('click', function(e) {
    var openEl = e.target.closest('[data-action="open"]');
    if (openEl && openEl.dataset.absPath) {
        vscode.postMessage({ command: 'open', path: openEl.dataset.absPath });
        return;
    }
    var fixEl = e.target.closest('[data-action="fix"]');
    if (fixEl) {
        fixEl.disabled = true;
        fixEl.textContent = 'Filing...';
        vscode.postMessage({
            command: 'fix',
            fixId: fixEl.dataset.fixId,
            relPath: fixEl.dataset.relPath,
            filename: fixEl.dataset.filename,
            violations: fixEl.dataset.violations,
        });
        return;
    }
    var openIssueEl = e.target.closest('[data-action="open-issue"]');
    if (openIssueEl && openIssueEl.dataset.url) {
        vscode.postMessage({ command: 'open-issue', url: openIssueEl.dataset.url });
        return;
    }
    var rescanEl = e.target.closest('[data-action="rescan"]');
    if (rescanEl) {
        rescanEl.disabled = true;
        rescanEl.textContent = 'Scanning...';
        vscode.postMessage({ command: 'rescan' });
        return;
    }
    var fixAllTrigger = e.target.closest('[data-action="fix-all"]');
    if (fixAllTrigger) {
        var items = [];
        tbody.querySelectorAll('tr.violation').forEach(function(tr) {
            if (tr.style.display === 'none') { return; }
            var btn = tr.querySelector('[data-action="fix"]');
            if (!btn || btn.disabled) { return; }
            items.push({ fixId: btn.dataset.fixId, relPath: btn.dataset.relPath, filename: btn.dataset.filename, violations: btn.dataset.violations });
        });
        if (items.length === 0) { return; }
        fixAllTrigger.disabled = true;
        fixAllTrigger.textContent = '0 / ' + items.length;
        vscode.postMessage({ command: 'fix-all', items: items });
        return;
    }
});

window.addEventListener('message', function(ev) {
    var m = ev.data || {};
    if (m.type === 'fix-all-progress') {
        var fab = document.getElementById('fixAllBtn');
        if (fab) {
            if (m.done >= m.total) {
                fab.disabled = false;
                fab.textContent = 'Fix All';
            } else {
                fab.textContent = m.done + ' / ' + m.total;
            }
        }
        return;
    }
    if (m.type !== 'fix-result' || !m.fixId) { return; }
    var btn = document.querySelector('[data-fix-id="' + m.fixId + '"]');
    if (!btn) { return; }
    if (m.ok) {
        btn.classList.add('fix-btn-filed');
        btn.dataset.action = 'open-issue';
        btn.dataset.url = m.url || '';
        btn.disabled = false;
        btn.textContent = 'Filed #' + m.number;
        btn.title = 'Issue filed. Click to open in browser.';
        return;
    }
    btn.disabled = false;
    btn.textContent = 'Fix';
});

var search       = document.getElementById('search');
var statusFilter = document.getElementById('status-filter');
var countEl      = document.getElementById('count');
var tbody        = document.getElementById('tbody');
var hdr          = document.getElementById('hdr');
var filterBar    = document.getElementById('filter-bar');

function updateHdrHeight(){
  var h = (hdr ? hdr.offsetHeight : 0) + (filterBar ? filterBar.offsetHeight : 0);
  document.getElementById('tbl-wrap').style.height = 'calc(100vh - ' + h + 'px)';
}
updateHdrHeight();

function applyFilter(){
  var q   = search.value.toLowerCase().trim();
  var sf  = statusFilter.value;
  var rows = tbody.querySelectorAll('tr');
  var vis = 0;
  rows.forEach(function(tr){
    var isVio = tr.classList.contains('violation');
    var text  = tr.textContent.toLowerCase();
    var matchQ  = !q  || text.includes(q);
    var matchSf = sf === 'all' || (sf === 'violations' && isVio) || (sf === 'ok' && !isVio);
    var show = matchQ && matchSf;
    tr.style.display = show ? '' : 'none';
    if (show) vis++;
  });
  countEl.textContent = vis + ' of ' + rows.length + ' files';
}

function updateFixAllState() {
    var fab = document.getElementById('fixAllBtn');
    if (!fab || fab.disabled) { return; }
    var visVio = 0;
    tbody.querySelectorAll('tr.violation').forEach(function(tr) {
        if (tr.style.display !== 'none') { visVio++; }
    });
    fab.disabled = visVio === 0;
}
search.addEventListener('input', function() { applyFilter(); updateFixAllState(); });
statusFilter.addEventListener('change', function() { applyFilter(); updateFixAllState(); });
applyFilter();
updateFixAllState();
})();</script>
</body></html>`;
}

// ─── Command ─────────────────────────────────────────────────────────────────

async function openFrontmatterViewer(): Promise<void> {
    const root = path.resolve(__dirname, '../..');

    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Scanning frontmatter…' },
        async () => {
            let report: Report;
            try {
                report = scanProject(root);
            } catch (err) {
                logError('frontmatter scan failed', err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
                vscode.window.showErrorMessage(`Frontmatter Viewer: ${err}`);
                return;
            }

            const html = buildViewerHtml(report, _filedIssues);
            const violationCount = report.files.filter(f =>
                violations(f, new Set(report.summary.duplicateFilenameDetails.map(d => d.filename))).length > 0
            ).length;

            if (_panel) {
                _panel.webview.html = html;
                _panel.title = `Frontmatter — ${report.summary.total} files`;
                _panel.reveal(_panel.viewColumn, true);
            } else {
                _panel = vscode.window.createWebviewPanel(
                    'cvsFrontmatterViewer',
                    `Frontmatter — ${report.summary.total} files`,
                    getLauncherTargetColumn(),
                    { enableScripts: true, retainContextWhenHidden: true }
                );
                _panel.webview.html = html;
                const panel = _panel;
                panel.webview.onDidReceiveMessage(async msg => {
                    if (msg.command === 'rescan') {
                        await openFrontmatterViewer();
                        return;
                    }
                    if (msg.command === 'open' && msg.path) {
                        const doc = await vscode.workspace.openTextDocument(msg.path);
                        await vscode.window.showTextDocument(doc, { preview: true, preserveFocus: true });
                    }
                    if (msg.command === 'open-issue' && msg.url) {
                        void vscode.env.openExternal(vscode.Uri.parse(msg.url));
                    }
                    if (msg.command === 'fix-all' && Array.isArray(msg.items) && msg.items.length > 0) {
                        const fixItems = msg.items as Array<{ fixId: string; relPath: string; filename: string; violations: string }>;
                        const choice = await vscode.window.showWarningMessage(
                            `Apply existing filed issue IDs for ${fixItems.length} visible violation${fixItems.length === 1 ? '' : 's'}? This will not open new issues.`,
                            { modal: true },
                            'Proceed'
                        );
                        if (choice !== 'Proceed') {
                            panel.webview.postMessage({ type: 'fix-all-progress', done: fixItems.length, total: fixItems.length });
                            return;
                        }
                        let restored = 0;
                        let done = 0;
                        for (const item of fixItems) {
                            const known = _filedIssues.get(normalizeRelPath(String(item.relPath)));
                            if (!known) {
                                panel.webview.postMessage({ type: 'fix-result', fixId: item.fixId, ok: false });
                                done++;
                                panel.webview.postMessage({ type: 'fix-all-progress', done, total: fixItems.length });
                                continue;
                            }
                            panel.webview.postMessage({
                                type: 'fix-result',
                                fixId: item.fixId,
                                ok: true,
                                url: known.url,
                                number: known.number,
                            });
                            restored++;
                            done++;
                            panel.webview.postMessage({ type: 'fix-all-progress', done, total: fixItems.length });
                        }
                        log(FEATURE, `Fix All complete — ${restored} restored, ${done - restored} unmatched`);
                        void vscode.window.showInformationMessage(`Frontmatter Fix All restored ${restored} filed issue id${restored === 1 ? '' : 's'}${done - restored > 0 ? `, ${done - restored} unmatched` : ''}.`);
                        return;
                    }
                    if (msg.command === 'fix' && msg.fixId && msg.relPath && msg.filename) {
                        const violationList = String(msg.violations ?? '')
                            .split('|')
                            .map((v: string) => v.trim())
                            .filter((v: string) => v.length > 0);
                        if (violationList.length === 0) {
                            panel.webview.postMessage({ type: 'fix-result', fixId: msg.fixId, ok: false });
                            void vscode.window.showErrorMessage('Frontmatter Viewer: no violations were provided for this row.');
                            return;
                        }

                        let testFile: { absPath: string; relPath: string };
                        try {
                            testFile = createFailingFixTest(root, String(msg.relPath), String(msg.filename), violationList);
                        } catch (err) {
                            panel.webview.postMessage({ type: 'fix-result', fixId: msg.fixId, ok: false });
                            void vscode.window.showErrorMessage(`Frontmatter Viewer: failed to create failing test. ${err}`);
                            return;
                        }

                        const title = `[frontmatter] ${String(msg.filename)}: ${violationList.join(', ')}`;
                        const body = buildFrontmatterFixIssueBody(String(msg.relPath), violationList, testFile.relPath);
                        const result = await fileFrontmatterViolationAsIssue({
                            title,
                            body,
                            labels: ['type:bug', 'auto-filed', 'area:frontmatter', 'area:docs'],
                        });

                        if (result.ok && result.issueNumber && result.issueUrl) {
                            _filedIssues.set(normalizeRelPath(String(msg.relPath)), { number: result.issueNumber, url: result.issueUrl });
                            saveFiledIssues();
                        }
                        panel.webview.postMessage({
                            type: 'fix-result',
                            fixId: msg.fixId,
                            ok: result.ok,
                            url: result.issueUrl,
                            number: result.issueNumber,
                        });

                        if (result.ok && result.issueUrl) {
                            const action = await vscode.window.showInformationMessage(
                                `Frontmatter fix issue #${result.issueNumber} filed. Failing test created at ${testFile.relPath}.`,
                                'Open issue'
                            );
                            if (action === 'Open issue') {
                                void vscode.env.openExternal(vscode.Uri.parse(result.issueUrl));
                            }
                        } else {
                            void vscode.window.showErrorMessage(`Frontmatter Viewer: couldn't file issue. ${result.error ?? 'Unknown error'}`);
                        }
                    }
                });
                _panel.onDidDispose(() => { _panel = undefined; });
            }

            log(FEATURE, `Scanned ${report.summary.total} files — ${violationCount} violations`);
        }
    );
}

// ─── Activate / Deactivate ────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
    log(FEATURE, 'Activating');
    _context = context;
    const root = path.resolve(__dirname, '../..');
    loadFiledIssues(root);
    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.headers.frontmatterViewer', openFrontmatterViewer)
    );
}

export function deactivate(): void {
    _panel?.dispose();
    _panel = undefined;
}
