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
import { log, logError } from '../shared/output-channel';

const FEATURE = 'frontmatter-viewer';

let _panel: vscode.WebviewPanel | undefined;

const SKIP_DIRS = new Set([
    'node_modules', '.git', '.vscode', '.vscode-test', '.claude',
    'out', 'dist', 'reports', 'playwright-report', 'test-results',
]);

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

function walkMd(dir: string, acc: string[] = []): string[] {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
    for (const e of entries) {
        if (SKIP_DIRS.has(e.name)) { continue; }
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { walkMd(full, acc); }
        else if (e.isFile() && /\.md$/i.test(e.name)) { acc.push(full); }
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
    const files = walkMd(root);
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

function esc(s: unknown): string {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function buildViewerHtml(report: Report): string {
    const dupNames = new Set(report.summary.duplicateFilenameDetails.map(d => d.filename));
    const s = report.summary;

    const rows = report.files.map(f => {
        const v = violations(f, dupNames);
        const bad = v.length > 0;
        const absPath = esc(path.join(report.root, f.path));
        const statusHtml = bad
            ? v.map(r => `<span class="reason">${esc(r)}</span>`).join('')
            : '<span class="ok">ok</span>';
        const fieldsHtml = Object.keys(f.fields).length === 0
            ? '<span class="muted">none</span>'
            : Object.keys(f.fields).sort().map(k =>
                `<div class="kv"><span class="k">${esc(k)}</span><span class="v">${esc(f.fields[k])}</span></div>`
              ).join('');
        return `<tr class="${bad ? 'violation' : 'pass'}">
  <td><span class="file-link" data-action="open" data-abs-path="${absPath}">${esc(f.filename)}</span></td>
  <td class="path-cell"><span class="file-link" data-action="open" data-abs-path="${absPath}">${esc(f.path)}</span></td>
  <td>${f.hasFrontmatter ? 'yes' : '<span class="muted">no</span>'}</td>
  <td>${fieldsHtml}</td>
  <td>${statusHtml}</td>
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
#filter-bar select{padding:5px 8px;border:1px solid var(--vscode-panel-border);border-radius:4px;background:var(--vscode-dropdown-background);color:var(--vscode-dropdown-foreground);font-size:12px;cursor:pointer}
#count{font-size:11px;color:var(--vscode-descriptionForeground);white-space:nowrap}
#tbl-wrap{overflow:auto;height:calc(100vh - var(--hdr-h,220px))}
table{width:100%;border-collapse:collapse;min-width:900px}
thead th{position:sticky;top:0;z-index:2;background:var(--vscode-editor-background);border-bottom:2px solid var(--vscode-panel-border);padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--vscode-descriptionForeground);white-space:nowrap;cursor:pointer;user-select:none}
thead th:hover{color:var(--vscode-editor-foreground)}
thead th.sorted{color:var(--vscode-focusBorder)}
tbody td{padding:7px 10px;border-bottom:1px solid var(--vscode-panel-border);vertical-align:top;font-size:12px}
tr.pass{}
tr.violation td{background:rgba(248,81,73,.1)!important;border-bottom-color:rgba(248,81,73,.2)}
tr:hover td{background:var(--vscode-list-hoverBackground)}
.path-cell{font-family:var(--vscode-editor-font-family,monospace);font-size:11px;color:var(--vscode-descriptionForeground);word-break:break-all}
.kv{display:grid;grid-template-columns:140px 1fr;gap:4px;padding:2px 0;border-bottom:1px dashed rgba(128,128,128,.2)}
.kv:last-child{border-bottom:none}
.k{color:#4dabf7;font-weight:600;font-size:11px}
.v{word-break:break-word;font-size:11px}
.muted{color:var(--vscode-descriptionForeground)}
.reason{display:inline-block;font-size:10px;font-weight:700;text-transform:uppercase;padding:2px 7px;border-radius:999px;background:rgba(248,81,73,.15);color:#f85149;border:1px solid rgba(248,81,73,.35);margin:1px 4px 1px 0}
.ok{display:inline-block;font-size:10px;font-weight:700;text-transform:uppercase;padding:2px 7px;border-radius:999px;background:rgba(63,185,80,.12);color:#3fb950;border:1px solid rgba(63,185,80,.3)}
.file-link{cursor:pointer;color:var(--vscode-textLink-foreground);text-decoration:underline dotted;text-underline-offset:2px}
.file-link:hover{color:var(--vscode-textLink-activeForeground);text-decoration:underline}
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
</tr></thead>
<tbody id="tbody">${rows}</tbody>
</table>
</div>
<script>(function(){
var vscode = acquireVsCodeApi();

document.addEventListener('click', function(e) {
  var el = e.target.closest('[data-action="open"]');
  if (el && el.dataset.absPath) { vscode.postMessage({ command: 'open', path: el.dataset.absPath }); }
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

search.addEventListener('input', applyFilter);
statusFilter.addEventListener('change', applyFilter);
applyFilter();
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

            const html = buildViewerHtml(report);
            const violationCount = report.files.filter(f =>
                violations(f, new Set(report.summary.duplicateFilenameDetails.map(d => d.filename))).length > 0
            ).length;

            if (_panel) {
                _panel.webview.html = html;
                _panel.title = `Frontmatter — ${report.summary.total} files`;
                _panel.reveal(vscode.ViewColumn.One);
            } else {
                _panel = vscode.window.createWebviewPanel(
                    'cvsFrontmatterViewer',
                    `Frontmatter — ${report.summary.total} files`,
                    vscode.ViewColumn.One,
                    { enableScripts: true, retainContextWhenHidden: true }
                );
                _panel.webview.html = html;
                _panel.webview.onDidReceiveMessage(async msg => {
                    if (msg.command === 'open' && msg.path) {
                        const doc = await vscode.workspace.openTextDocument(msg.path);
                        await vscode.window.showTextDocument(doc, { preview: true, preserveFocus: true });
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
    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.headers.frontmatterViewer', openFrontmatterViewer)
    );
}

export function deactivate(): void {
    _panel?.dispose();
    _panel = undefined;
}
