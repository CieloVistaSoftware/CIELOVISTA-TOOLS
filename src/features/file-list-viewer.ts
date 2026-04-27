// Copyright (c) 2026 CieloVista Software. All rights reserved.
/**
 * file-list-viewer.ts
 *
 * Implements issue #68 — FileList: a sortable alternative to the Explorer
 * tree presented as a Quick Launch button on the CieloVista Home page.
 *
 * The webview shows the current directory as a 4-column table (Name,
 * Date modified, Type, Size). Click any header to sort that column;
 * click again to flip direction. Click a row to open the file in the
 * editor or navigate into the folder. Up button climbs to the parent
 * directory (disabled at workspace root).
 *
 * Sort logic is shared with tests/unit/file-list-sort.test.js via
 * src/shared/file-list-sort.ts so the same comparators run in both the
 * extension host and the webview.
 *
 * Command: cvs.tools.fileList
 * Toggle:  cielovistaTools.features.fileListViewer
 */

import * as vscode from 'vscode';
import * as fs     from 'fs';
import * as path   from 'path';
import { log, logError } from '../shared/output-channel';
import {
    sortEntries,
    DEFAULT_EXCLUDES,
    type FileListEntry,
    type SortColumn,
    type SortDirection,
} from '../shared/file-list-sort';

const FEATURE = 'file-list-viewer';
let _panel: vscode.WebviewPanel | undefined;
let _currentDir: string | undefined;
let _sortColumn: SortColumn = 'name';
let _sortDir:    SortDirection = 'asc';
let _showHidden = true;
let _showExcludes = false;

function esc(s: string): string {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function workspaceRoot(): string | undefined {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) { return undefined; }
    return folders[0].uri.fsPath;
}

function readDirEntries(dir: string): FileListEntry[] {
    let names: string[];
    try { names = fs.readdirSync(dir); }
    catch (err) { logError(`readdir failed: ${dir}`, err instanceof Error ? err.stack || String(err) : String(err), FEATURE); return []; }

    const result: FileListEntry[] = [];
    for (const name of names) {
        if (!_showHidden && name.startsWith('.')) { continue; }
        if (!_showExcludes && DEFAULT_EXCLUDES.has(name)) { continue; }

        const full = path.join(dir, name);
        let st: fs.Stats;
        try { st = fs.statSync(full); }
        catch { continue; /* broken symlink or perms — skip */ }

        const isDir = st.isDirectory();
        const ext   = isDir ? '<dir>' : (path.extname(name).slice(1) || '<no-ext>');
        result.push({
            name,
            isDir,
            size:  isDir ? 0 : st.size,
            mtime: st.mtimeMs,
            type:  ext,
        });
    }
    return result;
}

function buildHtml(): string {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src 'unsafe-inline';script-src 'unsafe-inline';">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;overflow:hidden}
body{font-family:var(--vscode-font-family,sans-serif);font-size:13px;background:var(--vscode-editor-background,#1e1e1e);color:var(--vscode-editor-foreground,#d4d4d4);display:flex;flex-direction:column}
#hdr{display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(255,255,255,.04);border-bottom:1px solid rgba(255,255,255,.08);flex-shrink:0;font-size:12px}
#up-btn{background:transparent;color:#9cdcfe;border:1px solid rgba(255,255,255,.12);border-radius:3px;padding:3px 10px;cursor:pointer;font-family:inherit;font-size:12px}
#up-btn:hover:not(:disabled){background:rgba(255,255,255,.06)}
#up-btn:disabled{opacity:.35;cursor:not-allowed}
#path-display{flex:1;font-family:var(--vscode-editor-font-family,monospace);color:#9cdcfe;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.toggle-row{display:flex;gap:6px}
.toggle-btn{background:transparent;color:#858585;border:1px solid rgba(255,255,255,.12);border-radius:3px;padding:3px 10px;cursor:pointer;font-size:11px;font-family:inherit}
.toggle-btn.on{background:rgba(99,102,241,.18);color:#818cf8;border-color:rgba(99,102,241,.35)}
.toggle-btn:hover{background:rgba(255,255,255,.06)}
#tbl-wrap{flex:1;overflow-y:auto;overflow-x:hidden}
table{width:100%;border-collapse:collapse}
thead{position:sticky;top:0;background:var(--vscode-editor-background,#1e1e1e);z-index:1}
th{text-align:left;padding:6px 12px;font-weight:600;font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:#858585;border-bottom:1px solid rgba(255,255,255,.08);cursor:pointer;user-select:none;white-space:nowrap}
th:hover{color:#d4d4d4;background:rgba(255,255,255,.03)}
th.active{color:#9cdcfe}
th .arrow{display:inline-block;margin-left:4px;font-size:10px;opacity:.7}
td{padding:5px 12px;border-bottom:1px solid rgba(255,255,255,.04);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
td.col-size,td.col-date{font-variant-numeric:tabular-nums;color:#a0a0a0}
td.col-type{color:#a0a0a0;text-transform:uppercase;font-size:11px}
tr{cursor:pointer}
tr:hover{background:rgba(255,255,255,.04)}
tr.dir td.col-name{color:#9cdcfe;font-weight:600}
tr.dir td.col-name::before{content:'\u{1F4C1}';margin-right:6px}
tr.file td.col-name::before{content:'\u{1F4C4}';margin-right:6px;opacity:.5}
tr.hidden td.col-name{opacity:.55}
.empty{padding:30px;text-align:center;color:#858585}
</style></head><body>
<div id="hdr">
  <button id="up-btn" title="Go to parent folder">\u2191 Up</button>
  <span id="path-display"></span>
  <div class="toggle-row">
    <button class="toggle-btn on" id="toggle-hidden" title="Show hidden files (dotfiles)">.hidden</button>
    <button class="toggle-btn"    id="toggle-excludes" title="Show normally-excluded folders (node_modules, .git, out, dist, .vscode-test)">excludes</button>
  </div>
</div>
<div id="tbl-wrap">
  <table id="tbl">
    <thead><tr>
      <th data-col="name">Name <span class="arrow"></span></th>
      <th data-col="date">Date modified <span class="arrow"></span></th>
      <th data-col="type">Type <span class="arrow"></span></th>
      <th data-col="size">Size <span class="arrow"></span></th>
    </tr></thead>
    <tbody id="tbody"></tbody>
  </table>
  <div class="empty" id="empty" style="display:none">(empty folder)</div>
</div>
<script>(function(){
const vsc = acquireVsCodeApi();
let state = { dir: '', entries: [], canGoUp: false, sortCol: 'name', sortDir: 'asc', showHidden: true, showExcludes: false };

function fmtSize(b){
  if(b<1024) return b+' B';
  if(b<1024*1024) return (b/1024).toFixed(1)+' KB';
  if(b<1024*1024*1024) return (b/(1024*1024)).toFixed(1)+' MB';
  return (b/(1024*1024*1024)).toFixed(2)+' GB';
}
function fmtDate(ms){
  if(!ms) return '';
  const d = new Date(ms);
  const pad = n => String(n).padStart(2,'0');
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+' '+pad(d.getHours())+':'+pad(d.getMinutes());
}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

function render(){
  document.getElementById('path-display').textContent = state.dir || '(no workspace folder open)';
  document.getElementById('up-btn').disabled = !state.canGoUp;
  document.getElementById('toggle-hidden').classList.toggle('on', state.showHidden);
  document.getElementById('toggle-excludes').classList.toggle('on', state.showExcludes);

  const ths = document.querySelectorAll('th[data-col]');
  ths.forEach(th => {
    th.classList.toggle('active', th.dataset.col === state.sortCol);
    const arrow = th.querySelector('.arrow');
    arrow.textContent = (th.dataset.col === state.sortCol) ? (state.sortDir === 'asc' ? '\u25B2' : '\u25BC') : '';
  });

  const tbody = document.getElementById('tbody');
  tbody.innerHTML = '';
  document.getElementById('empty').style.display = state.entries.length === 0 ? '' : 'none';
  for (const e of state.entries) {
    const tr = document.createElement('tr');
    tr.className = (e.isDir ? 'dir' : 'file') + (e.name.startsWith('.') ? ' hidden' : '');
    tr.dataset.name = e.name;
    tr.dataset.isDir = e.isDir ? '1' : '0';
    tr.innerHTML =
      '<td class="col-name">' + esc(e.name) + '</td>' +
      '<td class="col-date">' + esc(fmtDate(e.mtime)) + '</td>' +
      '<td class="col-type">' + (e.isDir ? '' : esc(e.type)) + '</td>' +
      '<td class="col-size">' + (e.isDir ? '' : esc(fmtSize(e.size))) + '</td>';
    tbody.appendChild(tr);
  }
}

document.getElementById('tbody').addEventListener('click', ev => {
  const tr = ev.target.closest('tr');
  if (!tr) return;
  vsc.postMessage({ command: tr.dataset.isDir === '1' ? 'navigate-to' : 'open-file', name: tr.dataset.name });
});

document.querySelectorAll('th[data-col]').forEach(th => {
  th.addEventListener('click', () => {
    const col = th.dataset.col;
    if (state.sortCol === col) {
      state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      state.sortCol = col;
      state.sortDir = 'asc';
    }
    vsc.postMessage({ command: 'sort', col: state.sortCol, dir: state.sortDir });
  });
});

document.getElementById('up-btn').addEventListener('click', () => vsc.postMessage({ command: 'up' }));
document.getElementById('toggle-hidden').addEventListener('click',   () => vsc.postMessage({ command: 'toggle-hidden' }));
document.getElementById('toggle-excludes').addEventListener('click', () => vsc.postMessage({ command: 'toggle-excludes' }));

window.addEventListener('message', ev => {
  if (ev.data && ev.data.type === 'update') {
    state = ev.data.state;
    render();
  }
});

vsc.postMessage({ command: 'ready' });
})();</script></body></html>`;
}

function pushUpdate(): void {
    if (!_panel || !_currentDir) { return; }
    const entries = readDirEntries(_currentDir);
    sortEntries(entries, _sortColumn, _sortDir);

    const root = workspaceRoot();
    const canGoUp = !!root && path.resolve(_currentDir) !== path.resolve(root);

    void _panel.webview.postMessage({
        type: 'update',
        state: {
            dir:          _currentDir,
            entries,
            canGoUp,
            sortCol:      _sortColumn,
            sortDir:      _sortDir,
            showHidden:   _showHidden,
            showExcludes: _showExcludes,
        },
    });
}

function navigateTo(target: string): void {
    if (!fs.existsSync(target)) { return; }
    let st: fs.Stats;
    try { st = fs.statSync(target); } catch { return; }
    if (!st.isDirectory()) { return; }
    _currentDir = target;
    if (_panel) {
        const base = path.basename(target);
        _panel.title = `FileList — ${base}`;
    }
    pushUpdate();
}

function openFile(target: string): void {
    if (!fs.existsSync(target)) { return; }
    void vscode.workspace.openTextDocument(target).then(
        doc => vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside),
        err => { logError(`openTextDocument failed: ${target}`, err instanceof Error ? err.stack || String(err) : String(err), FEATURE); }
    );
}

export function openFileListPanel(): void {
    if (_panel) { _panel.reveal(vscode.ViewColumn.One); return; }

    const root = workspaceRoot();
    if (!root) {
        vscode.window.showInformationMessage('FileList: open a workspace folder first.');
        return;
    }
    _currentDir = root;

    _panel = vscode.window.createWebviewPanel(
        'cvsFileList',
        `FileList \u2014 ${path.basename(root)}`,
        vscode.ViewColumn.One,
        { enableScripts: true, retainContextWhenHidden: true },
    );

    _panel.onDidDispose(() => {
        _panel = undefined;
        _currentDir = undefined;
    });

    _panel.webview.onDidReceiveMessage(msg => {
        try {
            if (msg.command === 'ready') {
                pushUpdate();
                return;
            }
            if (msg.command === 'sort') {
                _sortColumn = msg.col as SortColumn;
                _sortDir    = msg.dir as SortDirection;
                pushUpdate();
                return;
            }
            if (msg.command === 'navigate-to') {
                if (!_currentDir) { return; }
                navigateTo(path.join(_currentDir, String(msg.name)));
                return;
            }
            if (msg.command === 'open-file') {
                if (!_currentDir) { return; }
                openFile(path.join(_currentDir, String(msg.name)));
                return;
            }
            if (msg.command === 'up') {
                if (!_currentDir) { return; }
                const parent = path.dirname(_currentDir);
                if (parent && parent !== _currentDir) { navigateTo(parent); }
                return;
            }
            if (msg.command === 'toggle-hidden') {
                _showHidden = !_showHidden;
                pushUpdate();
                return;
            }
            if (msg.command === 'toggle-excludes') {
                _showExcludes = !_showExcludes;
                pushUpdate();
                return;
            }
        } catch (err) {
            logError(`message handler failed: ${msg && msg.command}`, err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
        }
    });

    _panel.webview.html = buildHtml();
    log(FEATURE, `FileList opened at ${root}`);
}

export function activate(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.tools.fileList', openFileListPanel),
    );
}

export function deactivate(): void {
    if (_panel) { _panel.dispose(); _panel = undefined; }
}
