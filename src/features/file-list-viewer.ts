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
import { spawn }   from 'child_process';
import { log, logError } from '../shared/output-channel';
import {
    sortEntries,
    DEFAULT_EXCLUDES,
    type FileListEntry,
    type SortColumn,
    type SortDirection,
} from '../shared/file-list-sort';
import { esc } from '../shared/webview-utils';

const FEATURE = 'file-list-viewer';
let _panel: vscode.WebviewPanel | undefined;
let _currentDir: string | undefined;
let _sortColumn: SortColumn = 'name';
let _sortDir:    SortDirection = 'asc';
let _showHidden = true;
let _showExcludes = false;
let _selectedNames: string[] = [];
let _lastViewState: FileListViewState | undefined;
let _activationDisposables: vscode.Disposable[] = [];

const MARKDOWN_EXTENSIONS = new Set([
  '.md',
  '.markdown',
  '.mdown',
  '.mkd',
]);

const JAVASCRIPT_EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.cjs',
]);

type FileListViewState = {
  dir: string;
  entries: FileListEntry[];
  canGoUp: boolean;
  sortCol: SortColumn;
  sortDir: SortDirection;
  showHidden: boolean;
  showExcludes: boolean;
  selectedNames: string[];
};

function workspaceRoot(): string | undefined {
  const activeUri = vscode.window.activeTextEditor?.document?.uri;
  if (activeUri) {
    const folder = vscode.workspace.getWorkspaceFolder(activeUri);
    if (folder) { return folder.uri.fsPath; }
  }

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
        const ext   = isDir ? 'dir' : (path.extname(name).slice(1) || 'no-ext');
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

function makeViewState(): FileListViewState | undefined {
  if (!_currentDir) { return undefined; }

  const entries = readDirEntries(_currentDir);
  sortEntries(entries, _sortColumn, _sortDir);

  const root = workspaceRoot();
  const canGoUp = !!root && path.resolve(_currentDir) !== path.resolve(root);

  return {
    dir: _currentDir,
    entries,
    canGoUp,
    sortCol: _sortColumn,
    sortDir: _sortDir,
    showHidden: _showHidden,
    showExcludes: _showExcludes,
    selectedNames: _selectedNames,
  };
}

function fmtSizeBytes(bytes: number): string {
  if (bytes < 1024) { return `${bytes} B`; }
  if (bytes < 1024 * 1024) { return `${(bytes / 1024).toFixed(1)} KB`; }
  if (bytes < 1024 * 1024 * 1024) { return `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function fmtMtime(ms: number): string {
  if (!ms) { return ''; }
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function renderInitialRows(entries: FileListEntry[], selectedNames: string[]): string {
  if (!entries.length) { return ''; }

  const selected = new Set(selectedNames);
  return entries.map(e => {
    const rowClass = `${e.isDir ? 'dir' : 'file'}${e.name.startsWith('.') ? ' hidden' : ''}${selected.has(e.name) ? ' selected' : ''}`;
    const typeCell = e.isDir ? '' : esc(e.type);
    const sizeCell = e.isDir ? '' : esc(fmtSizeBytes(e.size));
    return [
      `<tr class="${rowClass}" data-name="${esc(e.name)}" data-is-dir="${e.isDir ? '1' : '0'}">`,
      `<td class="col-name">${esc(e.name)}</td>`,
      `<td class="col-date">${esc(fmtMtime(e.mtime))}</td>`,
      `<td class="col-type">${typeCell}</td>`,
      `<td class="col-size">${sizeCell}</td>`,
      '</tr>',
    ].join('');
  }).join('');
}

function buildHtml(initialState: FileListViewState | undefined): string {
  const bootstrapState = JSON.stringify(initialState ?? null).replace(/</g, '\\u003c');
  const initialDir = initialState?.dir ?? '';
  const initialRows = renderInitialRows(initialState?.entries ?? [], initialState?.selectedNames ?? []);
  const emptyStyle = (initialState?.entries?.length ?? 0) === 0 ? '' : 'display:none';
  const upDisabled = initialState?.canGoUp ? '' : 'disabled';
  const hiddenClass = initialState?.showHidden ?? true ? 'toggle-btn on' : 'toggle-btn';
  const excludesClass = initialState?.showExcludes ? 'toggle-btn on' : 'toggle-btn';
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src 'unsafe-inline';script-src 'unsafe-inline';">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;overflow:hidden}
body{font-family:var(--vscode-font-family,sans-serif);font-size:13px;background:var(--vscode-editor-background,#1e1e1e);color:var(--vscode-editor-foreground,#d4d4d4);display:flex;flex-direction:column}
#hdr{display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(255,255,255,.04);border-bottom:1px solid rgba(255,255,255,.08);flex-shrink:0;font-size:12px}
#up-btn,#new-folder-btn{background:transparent;border:1px solid rgba(255,255,255,.12);border-radius:3px;padding:3px 10px;cursor:pointer;font-family:inherit;font-size:12px}
#up-btn{color:#9cdcfe}
#up-btn:hover:not(:disabled){background:rgba(255,255,255,.06)}
#up-btn:disabled{opacity:.35;cursor:not-allowed}
#new-folder-btn{color:#4ec9b0}
#new-folder-btn:hover{background:rgba(78,201,176,.1)}
#path-display{flex:1;font-family:var(--vscode-editor-font-family,monospace);color:#9cdcfe;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}
#path-display:hover{text-decoration:underline}
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
tr.selected td{background:var(--vscode-list-activeSelectionBackground)!important;color:var(--vscode-list-activeSelectionForeground)!important}
.empty{padding:30px;text-align:center;color:#858585}
#ctx-menu{display:none;position:fixed;background:var(--vscode-menu-background,#252526);border:1px solid rgba(255,255,255,.15);border-radius:4px;box-shadow:0 4px 12px rgba(0,0,0,.5);z-index:100;min-width:160px;padding:4px 0}
#ctx-menu button{display:block;width:100%;text-align:left;background:transparent;border:none;padding:6px 14px;font-family:inherit;font-size:13px;color:var(--vscode-menu-foreground,#cccccc);cursor:pointer}
#ctx-menu button:hover{background:var(--vscode-list-activeSelectionBackground,#094771);color:var(--vscode-list-activeSelectionForeground,#fff)}
</style></head><body>
<div id="hdr">
  <button id="up-btn" title="Go to parent folder" ${upDisabled}>\u2191 Up</button>
  <span id="path-display" title="${esc(initialDir)}">${esc(initialDir || '(no workspace folder open)')}</span>
  <button id="new-folder-btn" title="Create a new folder here and navigate into it">+ New Folder</button>
  <div class="toggle-row">
    <button class="${hiddenClass}" id="toggle-hidden" title="Show hidden files (dotfiles)">.hidden</button>
    <button class="${excludesClass}" id="toggle-excludes" title="Show normally-excluded folders (node_modules, .git, out, dist, .vscode-test)">excludes</button>
  </div>
</div>
<div id="ctx-menu">
  <button id="ctx-open" style="display:none">📄 Open</button>
  <button id="ctx-navigate" style="display:none">📂 Open here</button>
  <button id="ctx-reveal">🔍 Reveal in Explorer</button>
  <button id="ctx-copy-path">📋 Copy path</button>
  <div id="ctx-sep" style="border-top:1px solid rgba(255,255,255,.1);margin:4px 0"></div>
  <button id="ctx-run-test" style="display:none">▶ Run Test</button>
</div>
<div id="tbl-wrap">
  <table id="tbl">
    <thead><tr>
      <th data-col="name">Name <span class="arrow"></span></th>
      <th data-col="date">Date modified <span class="arrow"></span></th>
      <th data-col="type">Type <span class="arrow"></span></th>
      <th data-col="size">Size <span class="arrow"></span></th>
    </tr></thead>
    <tbody id="tbody">${initialRows}</tbody>
  </table>
  <div class="empty" id="empty" style="${emptyStyle}">(empty folder)</div>
</div>
<script>(function(){
const vsc = acquireVsCodeApi();
const bootstrap = ${bootstrapState};
let state = bootstrap || { dir: '', entries: [], canGoUp: false, sortCol: 'name', sortDir: 'asc', showHidden: true, showExcludes: false, selectedNames: [] };

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
  const pathDisplay = document.getElementById('path-display');
  pathDisplay.textContent = state.dir || '(no workspace folder open)';
  pathDisplay.title = state.dir || '';
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
    const isSelected = (state.selectedNames || []).includes(e.name);
    tr.className = (e.isDir ? 'dir' : 'file') + (e.name.startsWith('.') ? ' hidden' : '') + (isSelected ? ' selected' : '');
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

function setSelected(names) {
  const uniq = Array.from(new Set((names || []).map(function(n){ return String(n || ''); }).filter(Boolean)));
  state.selectedNames = uniq;
  render();
}

render();

function selectRange(toName) {
  const entries = state.entries || [];
  const fromName = state.lastSelectedName || toName;
  const fromIdx = entries.findIndex(function(e){ return e.name === fromName; });
  const toIdx = entries.findIndex(function(e){ return e.name === toName; });
  if (fromIdx < 0 || toIdx < 0) {
    setSelected([toName]);
    state.lastSelectedName = toName;
    return;
  }
  const start = Math.min(fromIdx, toIdx);
  const end = Math.max(fromIdx, toIdx);
  const range = entries.slice(start, end + 1).map(function(e){ return e.name; });
  setSelected(range);
  state.lastSelectedName = toName;
}

function isRunnableTestFile(name) {
  const inTestsDir = state.dir.replace(/\\/g, '/').includes('/tests');
  return inTestsDir && /\.(js|ts)$/i.test(name || '');
}

document.getElementById('tbody').addEventListener('click', ev => {
  const tr = ev.target.closest('tr');
  if (!tr) return;
  const name = tr.dataset.name || '';
  const isDir = tr.dataset.isDir === '1';

  if (ev.shiftKey) {
    selectRange(name);
    return;
  }
  if (ev.ctrlKey || ev.metaKey) {
    const current = new Set(state.selectedNames || []);
    if (current.has(name)) {
      current.delete(name);
    } else {
      current.add(name);
    }
    state.lastSelectedName = name;
    setSelected(Array.from(current));
    return;
  }

  state.lastSelectedName = name;
  setSelected([name]);
  vsc.postMessage({ command: isDir ? 'navigate-to' : 'open-file', name: name, isDir: isDir });
});

var _ctxMenu = document.getElementById('ctx-menu');
var _ctxNames = [];
var _ctxEntry = null;
function hideCtxMenu() { _ctxMenu.style.display = 'none'; }
document.getElementById('tbody').addEventListener('contextmenu', function(ev) {
  var tr = ev.target.closest('tr');
  if (!tr) { hideCtxMenu(); return; }
  ev.preventDefault();

  var clickedName = tr.dataset.name || '';
  if (!(state.selectedNames || []).includes(clickedName)) {
    state.lastSelectedName = clickedName;
    setSelected([clickedName]);
  }

  var entry = (state.entries || []).find(function(e){ return e.name === clickedName; });
  _ctxEntry = entry || { name: clickedName, isDir: tr.dataset.isDir === '1' };
  var isDir = _ctxEntry.isDir;

  document.getElementById('ctx-open').style.display = isDir ? 'none' : 'block';
  document.getElementById('ctx-navigate').style.display = isDir ? 'block' : 'none';

  var selected = state.selectedNames || [];
  _ctxNames = selected.filter(function(name){
    var e = (state.entries || []).find(function(x){ return x.name === name; });
    return !!e && !e.isDir && isRunnableTestFile(name);
  });
  if (_ctxNames.length === 0 && isRunnableTestFile(clickedName)) { _ctxNames = [clickedName]; }

  var runTestBtn = document.getElementById('ctx-run-test');
  if (_ctxNames.length > 0) {
    runTestBtn.style.display = 'block';
    runTestBtn.textContent = _ctxNames.length > 1 ? ('▶ Run Tests (' + _ctxNames.length + ')') : '▶ Run Test';
  } else {
    runTestBtn.style.display = 'none';
  }
  document.getElementById('ctx-sep').style.display = _ctxNames.length > 0 ? 'block' : 'none';

  _ctxMenu.style.display = 'block';
  _ctxMenu.style.left = Math.min(ev.clientX, window.innerWidth - 180) + 'px';
  _ctxMenu.style.top  = Math.min(ev.clientY, window.innerHeight - 140) + 'px';
});
document.addEventListener('click', hideCtxMenu);
document.addEventListener('contextmenu', function(ev) { if (!ev.target.closest('#ctx-menu')) { hideCtxMenu(); } });
document.getElementById('ctx-open').addEventListener('click', function() {
  hideCtxMenu();
  if (_ctxEntry) { vsc.postMessage({ command: 'open-file', name: _ctxEntry.name }); }
});
document.getElementById('ctx-navigate').addEventListener('click', function() {
  hideCtxMenu();
  if (_ctxEntry) { vsc.postMessage({ command: 'navigate-to', name: _ctxEntry.name }); }
});
document.getElementById('ctx-reveal').addEventListener('click', function() {
  hideCtxMenu();
  if (_ctxEntry) { vsc.postMessage({ command: 'reveal-in-explorer', name: _ctxEntry.name, isDir: _ctxEntry.isDir }); }
});
document.getElementById('ctx-copy-path').addEventListener('click', function() {
  hideCtxMenu();
  if (_ctxEntry && state.dir) {
    vsc.postMessage({ command: 'copy-path', path: state.dir + '/' + _ctxEntry.name });
  }
});
document.getElementById('ctx-run-test').addEventListener('click', function() {
  hideCtxMenu();
  vsc.postMessage({ command: 'run-test', names: _ctxNames });
});
document.getElementById('path-display').addEventListener('click', function() {
  if (!state.dir) { return; }
  vsc.postMessage({ command: 'copy-path', path: state.dir });
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
document.getElementById('new-folder-btn').addEventListener('click', () => vsc.postMessage({ command: 'new-folder' }));
document.getElementById('toggle-hidden').addEventListener('click',   () => vsc.postMessage({ command: 'toggle-hidden' }));
document.getElementById('toggle-excludes').addEventListener('click', () => vsc.postMessage({ command: 'toggle-excludes' }));

window.addEventListener('message', ev => {
  if (ev.data && ev.data.type === 'update') {
    const prevSelected = state.selectedNames || [];
    const prevLast = state.lastSelectedName || '';
    state = ev.data.state;
    state.selectedNames = prevSelected.filter(function(name){
      return (state.entries || []).some(function(e){ return e.name === name; });
    });
    state.lastSelectedName = state.selectedNames.includes(prevLast) ? prevLast : (state.selectedNames[0] || '');
    render();
  }
  if (ev.data && ev.data.type === 'select') {
    var selName = ev.data.name;
    document.querySelectorAll('#tbody tr.selected').forEach(function(r) { r.classList.remove('selected'); });
    var rows = document.querySelectorAll('#tbody tr');
    for (var ri = 0; ri < rows.length; ri++) {
      if (rows[ri].dataset.name === selName) {
        rows[ri].classList.add('selected');
        rows[ri].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        break;
      }
    }
  }
});

vsc.postMessage({ command: 'ready' });
})();</script></body></html>`;
}

function pushUpdate(): void {
  if (!_panel) { return; }
  const state = makeViewState();
  if (!state) { return; }
  _lastViewState = state;

    void _panel.webview.postMessage({
        type: 'update',
    state,
    });
}

function navigateTo(target: string): void {
    if (!fs.existsSync(target)) { return; }
    let st: fs.Stats;
    try { st = fs.statSync(target); } catch { return; }
    if (!st.isDirectory()) { return; }
    _currentDir = target;
    _selectedNames = [];
    if (_panel) {
        const base = path.basename(target);
        _panel.title = `FileList — ${base}`;
    }
    pushUpdate();
}

async function openFile(target: string): Promise<void> {
  if (!fs.existsSync(target)) { return; }
  const uri = vscode.Uri.file(target);
  const ext = path.extname(target).toLowerCase();

  try {
    if (ext === '.vsix') {
      await vscode.commands.executeCommand('workbench.extensions.installExtension', uri);
      return;
    }

    if (MARKDOWN_EXTENSIONS.has(ext)) {
      await vscode.commands.executeCommand('markdown.showPreviewToSide', uri);
      return;
    }

    if (JAVASCRIPT_EXTENSIONS.has(ext)) {
      const pick = await vscode.window.showQuickPick(
        [
          { label: 'Run', description: `Execute ${path.basename(target)} with Node.js`, value: 'run' },
          { label: 'View', description: 'Open source in editor/default viewer', value: 'view' },
        ],
        {
          placeHolder: `Open ${path.basename(target)} as:`,
          ignoreFocusOut: true,
        }
      );

      if (!pick) { return; }
      if (pick.value === 'run') {
        const terminal = vscode.window.createTerminal({
          name: `Run ${path.basename(target)}`,
          cwd: path.dirname(target),
        });
        terminal.show(true);
        terminal.sendText(`"${process.execPath}" "${target}"`);
        return;
      }
    }

    // Respect VS Code editor associations so each file type opens in its default viewer.
    await vscode.commands.executeCommand('vscode.open', uri, vscode.ViewColumn.Beside);
  } catch (err) {
    logError(`openFile default viewer failed: ${target}`, err instanceof Error ? err.stack || String(err) : String(err), FEATURE);

    // Fallback to text editor if the preferred viewer command fails for any reason.
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
    } catch (fallbackErr) {
      logError(`openTextDocument fallback failed: ${target}`, fallbackErr instanceof Error ? fallbackErr.stack || String(fallbackErr) : String(fallbackErr), FEATURE);
    }
  }
}

async function openEntryFromCurrentDir(name: string, mode: 'navigate' | 'open'): Promise<void> {
  if (!_currentDir) { return; }
  const entryPath = path.join(_currentDir, name);
  if (!fs.existsSync(entryPath)) { return; }

  let st: fs.Stats;
  try { st = fs.statSync(entryPath); } catch { return; }

  if (st.isDirectory()) {
    navigateTo(entryPath);
    return;
  }

  if (mode === 'navigate') {
    return;
  }

  await openFile(entryPath);
}

export function openFileListPanel(): void {
    if (_panel) { _panel.reveal(vscode.ViewColumn.One); return; }

    const root = workspaceRoot();
    if (!root && !_currentDir) {
        vscode.window.showInformationMessage('FileList: open a workspace folder first.');
        return;
    }
    // Preserve a directory pre-set by navigateFileListToFolder; fall back to workspace root.
    if (!_currentDir) { _currentDir = root!; }

    _panel = vscode.window.createWebviewPanel(
        'cvsFileList',
        `FileList \u2014 ${path.basename(_currentDir)}`,
        vscode.ViewColumn.One,
        { enableScripts: true, retainContextWhenHidden: true },
    );

    _panel.onDidDispose(() => {
        _panel = undefined;
        _currentDir = undefined;
    });

    _panel.webview.onDidReceiveMessage(async msg => {
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
                await openEntryFromCurrentDir(String(msg.name), 'navigate');
                return;
            }
            if (msg.command === 'open-file') {
                await openEntryFromCurrentDir(String(msg.name), 'open');
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
            if (msg.command === 'run-test') {
                if (!_currentDir) { return; }
              const requestedNames = Array.isArray(msg.names)
                ? msg.names.map((n: unknown) => String(n)).filter(Boolean)
                : [String(msg.name ?? '')].filter(Boolean);
              if (requestedNames.length === 0) { return; }

              const testFiles = requestedNames.map((n: string) => path.join(_currentDir!, n));
              const missing = testFiles.filter((f: string) => !fs.existsSync(f));
              if (missing.length > 0) {
                vscode.window.showErrorMessage(`Test file not found: ${missing[0]}`);
                return;
              }

              let totalPass = 0;
              let totalFail = 0;
              let failedFiles = 0;

              for (const testFile of testFiles) {
                log(FEATURE, `\u25b6 Running test: ${path.basename(testFile)}`);
                const runResult = await new Promise<{ code: number; out: string }>((resolve) => {
                  const child = spawn(process.execPath, [testFile], { cwd: path.dirname(testFile) });
                  let out = '';
                  child.stdout.on('data', (d: Buffer) => { const t = d.toString(); out += t; log(FEATURE, t.trimEnd()); });
                  child.stderr.on('data', (d: Buffer) => { const t = d.toString(); out += t; log(FEATURE, t.trimEnd()); });
                  child.on('close', (code: number | null) => resolve({ code: code ?? 1, out }));
                });

                const passCount = (runResult.out.match(/^PASS:/gm) || []).length;
                const failCount = (runResult.out.match(/^FAIL:/gm) || []).length;
                totalPass += passCount;
                totalFail += failCount;
                if (runResult.code !== 0) {
                  failedFiles += 1;
                }
              }

              const fileWord = testFiles.length === 1 ? 'file' : 'files';
              const summary = `${testFiles.length} ${fileWord}: ${totalPass} passed, ${totalFail} failed`;
              if (failedFiles === 0) {
                vscode.window.showInformationMessage(`\u2705 ${summary}`);
              } else {
                vscode.window.showErrorMessage(`\u274C ${summary} (${failedFiles} ${failedFiles === 1 ? 'file' : 'files'} failed)`);
              }
              return;
            }
            if (msg.command === 'copy-path') {
              const text = String(msg.path ?? '').trim();
              if (!text) { return; }
              await vscode.env.clipboard.writeText(text);
              vscode.window.showInformationMessage(`Copied path: ${text}`);
              return;
            }
            if (msg.command === 'reveal-in-explorer') {
                if (!_currentDir) { return; }
                const target = path.join(_currentDir, String(msg.name ?? ''));
                const uri = vscode.Uri.file(target);
                await vscode.commands.executeCommand('revealInExplorer', uri);
                return;
            }
            if (msg.command === 'new-folder') {
                if (!_currentDir) { return; }
                const name = await vscode.window.showInputBox({
                    prompt: 'New folder name',
                    value: _currentDir + path.sep,
                    valueSelection: [_currentDir.length + 1, _currentDir.length + 1],
                    placeHolder: 'folder-name',
                    validateInput: v => {
                        const base = path.basename(v ?? '');
                        return base && /[*?"<>|]/.test(base) ? 'Invalid characters in folder name' : undefined;
                    },
                });
                if (!name?.trim()) { return; }
                const newPath = path.isAbsolute(name.trim()) ? name.trim() : path.join(_currentDir, name.trim());
                try {
                    fs.mkdirSync(newPath, { recursive: true });
                    navigateTo(newPath);
                } catch (err) {
                    vscode.window.showErrorMessage(`Could not create folder: ${err instanceof Error ? err.message : String(err)}`);
                }
                return;
            }
        } catch (err) {
            logError(`message handler failed: ${msg && msg.command}`, err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
        }
    });

    _lastViewState = makeViewState();
    _panel.webview.html = buildHtml(_lastViewState);
    log(FEATURE, `FileList opened at ${root}`);
}

export function revealFileInPanel(filePath: string): void {
    if (!_panel) { return; }
    const dir  = path.dirname(filePath);
    const name = path.basename(filePath);
    if (_currentDir && path.resolve(_currentDir) !== path.resolve(dir)) {
        navigateTo(dir);
    }
    void _panel.webview.postMessage({ type: 'select', name });
}

export function navigateFileListToFolder(folderUri: vscode.Uri): void {
    const folderPath = folderUri.fsPath;
    if (!fs.existsSync(folderPath)) { return; }
    if (_panel) {
        navigateTo(folderPath);
        _panel.reveal(vscode.ViewColumn.One);
    } else {
        _currentDir = folderPath;
        openFileListPanel();
    }
}

export function activate(context: vscode.ExtensionContext): void {
  if (_activationDisposables.length > 0) {
    log(FEATURE, 'activate() called while already active; skipping duplicate command registration');
    return;
  }

  _activationDisposables = [
    vscode.commands.registerCommand('cvs.tools.fileList', openFileListPanel),
    vscode.commands.registerCommand('cvs.tools.fileList.navigateTo', (uri: vscode.Uri) => {
      if (uri && uri.fsPath) { navigateFileListToFolder(uri); }
    }),
    vscode.commands.registerCommand('cvs.tools.fileList._debugState', () => ({
      hasPanel: !!_panel,
      dir: _lastViewState?.dir ?? _currentDir ?? '',
      entryCount: _lastViewState?.entries.length ?? 0,
      sortCol: _sortColumn,
      sortDir: _sortDir,
      showHidden: _showHidden,
      showExcludes: _showExcludes,
    })),
    vscode.commands.registerCommand('cvs.tools.fileList._debugEntries', () =>
      (_lastViewState?.entries ?? []).map(e => ({ name: e.name, isDir: e.isDir }))
    ),
    vscode.commands.registerCommand('cvs.tools.fileList._debugOpenEntry', async (name: string, mode?: 'navigate' | 'open') => {
      await openEntryFromCurrentDir(String(name || ''), mode === 'navigate' ? 'navigate' : 'open');
      return {
        dir: _lastViewState?.dir ?? _currentDir ?? '',
        entryCount: _lastViewState?.entries.length ?? 0,
      };
    }),
  ];
  context.subscriptions.push(..._activationDisposables);
}

export function deactivate(): void {
  _lastViewState = undefined;
  if (_activationDisposables.length > 0) {
    for (const disposable of _activationDisposables) {
      try { disposable.dispose(); } catch {}
    }
    _activationDisposables = [];
  }
    if (_panel) { _panel.dispose(); _panel = undefined; }
}

// Test-only exports — not part of the public API
export const _test = { buildHtml, renderInitialRows };
