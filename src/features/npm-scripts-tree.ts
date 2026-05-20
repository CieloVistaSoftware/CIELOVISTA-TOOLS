// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * npm-scripts-tree.ts
 *
 * Simple NPM Scripts tree panel — mirrors VS Code's native NPM Scripts sidebar.
 * Shows every package.json found in the workspace, grouped by file path,
 * with each script's name and command.  Click Run to execute in a terminal.
 *
 * Command: cvs.npm.tree
 */

import * as vscode from 'vscode';
import * as path   from 'path';
import * as fs     from 'fs';
import { log, logError } from '../shared/output-channel';
import { esc }           from '../shared/webview-utils';

const FEATURE = 'npm-scripts-tree';
const COMMAND = 'cvs.npm.tree';

let _panel: vscode.WebviewPanel | undefined;

interface PkgEntry {
    label:    string;          // display name (basename of folder)
    relPath:  string;          // workspace-relative path to package.json
    absDir:   string;          // absolute directory of the package.json
    scripts:  { name: string; cmd: string }[];
}

// ─── Script collection ────────────────────────────────────────────────────────

async function collectEntries(): Promise<PkgEntry[]> {
    const wsRoot  = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
    const seen    = new Set<string>();
    const entries: PkgEntry[] = [];

    const addDir = (absDir: string) => {
        const lower = absDir.toLowerCase();
        if (seen.has(lower)) { return; }
        seen.add(lower);
        const pkgFile = path.join(absDir, 'package.json');
        if (!fs.existsSync(pkgFile)) { return; }
        try {
            const pkg     = JSON.parse(fs.readFileSync(pkgFile, 'utf8')) as { scripts?: Record<string, string> };
            const scripts = Object.entries(pkg.scripts ?? {}).map(([name, cmd]) => ({ name, cmd }));
            if (!scripts.length) { return; }
            const relPath = wsRoot ? path.relative(wsRoot, pkgFile).replace(/\\/g, '/') : pkgFile;
            entries.push({ label: path.basename(absDir), relPath, absDir, scripts });
        } catch (err) {
            logError(`npm-scripts-tree: failed to parse ${pkgFile}`,
                err instanceof Error ? (err.stack ?? String(err)) : String(err), FEATURE);
        }
    };

    // 1. Workspace roots
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
        addDir(folder.uri.fsPath);
    }

    // 2. Sub-packages found by findFiles
    try {
        const files = await vscode.workspace.findFiles(
            '**/package.json',
            '{**/node_modules/**,**/.claude/**,**/out/**,**/dist/**}'
        );
        for (const f of files) {
            addDir(path.dirname(f.fsPath));
        }
    } catch { /* workspace not ready */ }

    // Sort: workspace root first, then alphabetically by label
    entries.sort((a, b) => {
        const aIsRoot = a.absDir.toLowerCase() === wsRoot.toLowerCase();
        const bIsRoot = b.absDir.toLowerCase() === wsRoot.toLowerCase();
        if (aIsRoot && !bIsRoot) { return -1; }
        if (!aIsRoot && bIsRoot) { return  1; }
        return a.label.localeCompare(b.label);
    });

    log(FEATURE, `found ${entries.length} package.json files`);
    return entries;
}

// ─── HTML ─────────────────────────────────────────────────────────────────────

function buildHtml(entries: PkgEntry[]): string {
    const css = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);font-size:13px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background)}
#toolbar{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--vscode-panel-border);background:var(--vscode-sideBar-background)}
#filter{flex:1;padding:5px 10px;border:1px solid var(--vscode-panel-border);border-radius:4px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);font-family:inherit;font-size:12px;outline:none}
#filter:focus{border-color:var(--vscode-focusBorder)}
#filter::placeholder{color:var(--vscode-input-placeholderForeground)}
#btn-refresh{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;padding:5px 12px;border-radius:4px;cursor:pointer;font-size:12px;white-space:nowrap}
#btn-refresh:hover{background:var(--vscode-button-secondaryHoverBackground)}
#content{padding:8px 0}
.pkg-group{margin-bottom:2px}
.pkg-header{display:flex;align-items:center;gap:6px;padding:5px 14px;cursor:pointer;user-select:none;font-size:11px;font-weight:700;color:var(--vscode-descriptionForeground);letter-spacing:.03em;background:var(--vscode-sideBar-background);border-bottom:1px solid var(--vscode-panel-border)}
.pkg-header:hover{background:var(--vscode-list-hoverBackground);color:var(--vscode-editor-foreground)}
.pkg-arrow{font-size:9px;transition:transform .12s;display:inline-block;width:10px;text-align:center}
.pkg-arrow.open{transform:rotate(90deg)}
.pkg-label{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pkg-path{font-family:var(--vscode-editor-font-family,monospace);font-size:10px;opacity:.65;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:260px}
.script-list{display:none}
.script-list.open{display:block}
.script-row{display:grid;grid-template-columns:minmax(120px,1fr) minmax(0,2fr) auto;align-items:center;gap:8px;padding:4px 14px 4px 30px;border-bottom:1px solid transparent}
.script-row:hover{background:var(--vscode-list-hoverBackground)}
.script-name{font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--vscode-editor-foreground)}
.script-cmd{font-family:var(--vscode-editor-font-family,monospace);font-size:10px;color:var(--vscode-descriptionForeground);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.btn-run{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:3px;padding:2px 10px;cursor:pointer;font-size:11px;font-weight:600;white-space:nowrap;flex-shrink:0}
.btn-run:hover{background:var(--vscode-button-hoverBackground)}
.btn-run.running{background:#f0883e;color:#fff}
.btn-run.running:hover{background:#e07830}
.empty{padding:24px 20px;font-size:12px;color:var(--vscode-descriptionForeground)}
.count{font-size:10px;font-weight:400;opacity:.7;margin-left:4px}
`;

    const rows = entries.map((e, gi) => {
        const scriptRows = e.scripts.map((s, si) => `
<div class="script-row" data-pkg="${gi}" data-si="${si}" data-hidden="false">
  <span class="script-name">${esc(s.name)}</span>
  <span class="script-cmd" title="${esc(s.cmd)}">${esc(s.cmd)}</span>
  <button class="btn-run" data-dir="${esc(e.absDir)}" data-script="${esc(s.name)}" title="Run: npm run ${esc(s.name)}">&#9654; Run</button>
</div>`).join('');

        return `
<div class="pkg-group" data-group="${gi}">
  <div class="pkg-header" data-group="${gi}">
    <span class="pkg-arrow open">&#9654;</span>
    <span class="pkg-label">${esc(e.label)}<span class="count">(${e.scripts.length})</span></span>
    <span class="pkg-path" title="${esc(e.relPath)}">${esc(e.relPath)}</span>
  </div>
  <div class="script-list open">${scriptRows}</div>
</div>`;
    }).join('');

    const body = entries.length === 0
        ? `<div class="empty">No package.json files with scripts found in this workspace.</div>`
        : rows;

    const js = `
(function(){
var vsc = acquireVsCodeApi();

// Toggle collapse
document.querySelectorAll('.pkg-header').forEach(function(hd){
  hd.addEventListener('click', function(){
    var g   = hd.dataset.group;
    var lst = document.querySelector('.script-list[data-group="'+g+'"]') ||
              hd.parentElement.querySelector('.script-list');
    var arr = hd.querySelector('.pkg-arrow');
    if(!lst){return;}
    var open = lst.classList.toggle('open');
    if(arr){arr.classList.toggle('open',open);}
  });
});
// Make data-group on script-list match parent group
document.querySelectorAll('.pkg-group').forEach(function(grp){
  var sl = grp.querySelector('.script-list');
  if(sl){sl.dataset.group = grp.dataset.group;}
});

// Run button
document.querySelectorAll('.btn-run').forEach(function(btn){
  btn.addEventListener('click', function(e){
    e.stopPropagation();
    vsc.postMessage({ type:'run', dir:btn.dataset.dir, script:btn.dataset.script });
    btn.textContent = '⏳ Running';
    btn.classList.add('running');
    setTimeout(function(){ btn.textContent = '▶ Run'; btn.classList.remove('running'); }, 4000);
  });
});

// Refresh
document.getElementById('btn-refresh').addEventListener('click', function(){
  vsc.postMessage({ type:'refresh' });
});

// Filter
var filter = document.getElementById('filter');
filter.addEventListener('input', function(){
  var q = filter.value.toLowerCase().trim();
  document.querySelectorAll('.pkg-group').forEach(function(grp){
    var any = false;
    grp.querySelectorAll('.script-row').forEach(function(row){
      var name = (row.querySelector('.script-name')||{}).textContent||'';
      var cmd  = (row.querySelector('.script-cmd') ||{}).textContent||'';
      var show = !q || name.toLowerCase().includes(q) || cmd.toLowerCase().includes(q);
      row.style.display = show ? '' : 'none';
      if(show){any=true;}
    });
    grp.style.display = any || !q ? '' : 'none';
    if(q && any){
      var sl = grp.querySelector('.script-list');
      var arr = grp.querySelector('.pkg-arrow');
      if(sl){sl.classList.add('open');}
      if(arr){arr.classList.add('open');}
    }
  });
});

// Status updates from host
window.addEventListener('message', function(e){
  var msg = e.data;
  if(!msg){return;}
  if(msg.type === 'reload'){ location.reload(); }
});
})();
`;

    return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src 'unsafe-inline';script-src 'unsafe-inline';">
<style>${css}</style>
</head><body>
<div id="toolbar">
  <input id="filter" type="text" placeholder="Filter scripts…" autocomplete="off" spellcheck="false">
  <button id="btn-refresh">↻ Refresh</button>
</div>
<div id="content">${body}</div>
<script>${js}</script>
</body></html>`;
}

// ─── Panel ────────────────────────────────────────────────────────────────────

async function openPanel(): Promise<void> {
    if (_panel) {
        _panel.reveal(vscode.ViewColumn.One, false);
        return;
    }

    const entries = await collectEntries();

    _panel = vscode.window.createWebviewPanel(
        'npmScriptsTree', 'NPM Scripts',
        { viewColumn: vscode.ViewColumn.One, preserveFocus: false },
        { enableScripts: true, retainContextWhenHidden: true }
    );

    _panel.webview.html = buildHtml(entries);

    _panel.webview.onDidReceiveMessage(async msg => {
        if (msg.type === 'run') {
            const term = vscode.window.createTerminal({
                name: `npm: ${String(msg.script)}`,
                cwd:  String(msg.dir),
                location: { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
            });
            term.show(true);
            term.sendText(`npm run ${String(msg.script)}`);
            log(FEATURE, `run: ${String(msg.script)} in ${String(msg.dir)}`);
        }
        if (msg.type === 'refresh') {
            const fresh = await collectEntries();
            _panel?.webview.postMessage({ type: 'reload' });
            // Rebuild the full HTML with fresh data
            if (_panel) { _panel.webview.html = buildHtml(fresh); }
        }
    });

    _panel.onDidDispose(() => { _panel = undefined; });
}

// ─── Activation ───────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMAND, openPanel)
    );
    log(FEATURE, 'activated');
}

export function deactivate(): void {
    _panel?.dispose();
    _panel = undefined;
}
