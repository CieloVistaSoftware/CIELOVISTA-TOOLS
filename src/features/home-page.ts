// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * home-page.ts
 *
 * CVT Home — a workspace-aware dashboard, not a command directory.
 *
 * Sections:
 *   1. Header        — workspace name, MCP status, Configure button
 *   2. Quick Launch  — 4 primary entry points (Launcher, Catalog, NPM Scripts, Audit)
 *   3. Recent Runs   — last 10 command history entries, re-runnable
 *   4. Recent Projects — last 8 workspaces, one-click switch
 *   5. Browse All    — collapsible command directory (was the whole page before)
 *
 * Command: cvs.tools.home
 */

import * as vscode from 'vscode';
import * as fs     from 'fs';
import * as path   from 'path';
import { getHistory }        from './cvs-command-launcher/command-history';
import { getRecentProjects } from './cvs-command-launcher/recent-projects';
import {
    startMcpServer,
    getMcpServerStatus,
    onMcpServerStatusChange,
    offMcpServerStatusChange
} from './mcp-server-status';
import { openDocPreview } from '../shared/doc-preview';

export function activate(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.tools.home', () => showHomePage(context))
    );
    showHomePage(context);
}

function showHomePage(context: vscode.ExtensionContext): void {
    const panel = vscode.window.createWebviewPanel(
        'cvsHome',
        'CieloVista Tools \u2014 Home',
        vscode.ViewColumn.One,
        { enableScripts: true }
    );

    const wsFolder = vscode.workspace.workspaceFolders?.[0];
    const wsName   = wsFolder?.name ?? 'No Workspace';
    const wsPath   = wsFolder?.uri.fsPath ?? '';

    // Rule: every time the home page shows, the MCP server must be running.
    startMcpServer();

    const history    = getHistory();
    const recents    = getRecentProjects();
    const mcpRunning = getMcpServerStatus() === 'up';

    // Build command groups for the Browse All section
    const pkgPath = path.join(__dirname, '../../package.json');
    let commands: Array<{title:string; command:string; description?:string}> = [];
    try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        commands = pkg.contributes?.commands ?? [];
    } catch { commands = []; }

    const grouped: Record<string, typeof commands> = {};
    for (const cmd of commands) {
        if (!cmd.title || typeof cmd.title !== 'string') { continue; }
        const match  = cmd.title.match(/^([\w\s\-]+:)/);
        const prefix = match ? match[1].trim() : 'Other';
        if (!grouped[prefix]) { grouped[prefix] = []; }
        grouped[prefix].push(cmd);
    }

    panel.webview.html = buildDashboardHtml(wsName, wsPath, mcpRunning, history, recents, grouped);

    // Push live MCP status changes into the webview badge — no polling.
    const mcpStatusHandler = (status: 'up' | 'down') => {
        panel.webview.postMessage({ type: 'mcpStatus', status });
    };
    onMcpServerStatusChange(mcpStatusHandler);
    panel.onDidDispose(() => offMcpServerStatusChange(mcpStatusHandler), null, context.subscriptions);

    panel.webview.onDidReceiveMessage(async msg => {
        if (!msg?.type) { return; }
        if (msg.type === 'runCommand' && msg.command) {
            // TODO List button — open in doc preview
            if (msg.command === '__openTodo__') {
                const todoPath = path.join(__dirname, '../../docs/_today/TODO-UPDATED.md');
                if (fs.existsSync(todoPath)) {
                    openDocPreview(todoPath, 'Home');
                } else {
                    vscode.window.showWarningMessage(`TODO file not found: ${todoPath}`);
                }
                return;
            }
            // Commands that open panels go direct — no streaming result window
            // Commands that do work go through runWithOutput for streaming output
            const OPEN_DIRECT = [
                'cvs.commands.showAll',
                'cvs.catalog.open',
                'cvs.npm.showAndRunScripts',
              'cvs.claude.processMonitor',
                'cvs.catalog.view',
                'cvs.tools.home',
                'cvs.mcp.viewer.open',
                'workbench.action.reloadWindow',
            ];
            if (OPEN_DIRECT.includes(msg.command)) {
                vscode.commands.executeCommand(msg.command);
            } else {
                vscode.commands.executeCommand('cvs.launcher.runWithOutput', msg.command);
            }
        }
        if (msg.type === 'openFolder' && msg.path) {
            vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(msg.path), false);
        }
        if (msg.type === 'sendPathToChat' && msg.path) {
          const folderPath = String(msg.path).trim();
          try {
            await vscode.commands.executeCommand('workbench.action.chat.open', {
              query: folderPath,
              isPartialQuery: true,
            });
          } catch {
            await vscode.env.clipboard.writeText(folderPath);
            try {
              await vscode.commands.executeCommand('github.copilot.chat.focus');
            } catch { /* chat panel not available */ }
            vscode.window.showInformationMessage('Path in clipboard — press Ctrl+V to paste into chat.');
          }
        }
        if (msg.type === 'startMcp') {
            startMcpServer();
        }
    });
}

// ─── HTML ─────────────────────────────────────────────────────────────────────

function esc(s: string): string {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function buildDashboardHtml(
    wsName:    string,
    wsPath:    string,
    mcpRunning: boolean,
    history:   ReturnType<typeof getHistory>,
    recents:   ReturnType<typeof getRecentProjects>,
    grouped:   Record<string, Array<{title:string;command:string;description?:string}>>
): string {

    // ── Quick Launch buttons ──────────────────────────────────────────────────
    const quickLaunch = [
      { icon: '\uD83D\uDCCB', label: 'TODO List',       desc: 'View open tasks and methods',     cmd: '__openTodo__',                      primary: true },
      { icon: '\u26a1', label: 'Guided Launcher', desc: 'Search & run all 81 commands', cmd: 'cvs.commands.showAll',        primary: false  },
        { icon: '\uD83D\uDCDA', label: 'Doc Catalog',     desc: 'Browse project documentation',    cmd: 'cvs.catalog.open',           primary: false },
        { icon: '\uD83D\uDCE6', label: 'NPM Scripts',     desc: 'Run scripts across all projects', cmd: 'cvs.npm.showAndRunScripts',   primary: false },
      { icon: '\uD83D\uDCE4', label: 'Last Cmd to Chat', desc: 'Send the latest terminal command to Copilot Chat', cmd: 'cvs.terminal.pasteLastCommandToChat', primary: false },
        { icon: '\uD83D\uDD0D', label: 'Run Audit',       desc: 'Daily health check',              cmd: 'cvs.audit.runDaily',          primary: false },
      { icon: '\uD83D\uDD0C', label: 'MCP Viewer',      desc: 'Live viewer for the 4 catalog MCP endpoints', cmd: 'cvs.mcp.viewer.open', primary: false },
    ];

    const quickHtml = quickLaunch.map(q => `
<button class="ql-btn${q.primary ? ' ql-primary' : ''}" data-cmd="${esc(q.cmd)}">
  <span class="ql-icon">${q.icon}</span>
  <span class="ql-text">
    <span class="ql-label">${esc(q.label)}</span>
    <span class="ql-desc">${esc(q.desc)}</span>
  </span>
</button>`).join('');

    // ── Command history ───────────────────────────────────────────────────────
    const histHtml = history.length === 0
        ? `<div class="empty-state">No commands run yet in this workspace.<br>Use the Guided Launcher to run your first command.</div>`
        : history.slice(0, 10).map(h => {
            const ago  = formatAgo(h.timestamp);
            const icon = h.ok ? '\u2705' : '\u274c';
            const cls  = h.ok ? 'hist-ok' : 'hist-err';
            return `<div class="hist-row">
  <span class="hist-icon ${cls}">${icon}</span>
  <span class="hist-title" data-tip="${esc(h.title)}" title="${esc(h.title)}">${esc(h.title)}</span>
  <span class="hist-elapsed">${h.elapsed}ms</span>
  <span class="hist-ago">${esc(ago)}</span>
  <button class="hist-rerun" data-cmd="${esc(h.id)}" title="Re-run ${esc(h.title)}">Run</button>
</div>`;
        }).join('');

    // ── Recent projects ───────────────────────────────────────────────────────
    const recHtml = recents.length === 0
        ? `<div class="empty-state">No recent projects yet. Open CVT in other workspaces to build your list.</div>`
        : recents.map(r => {
            const isCurrent = r.fsPath === wsPath;
            return `<div class="rec-card${isCurrent ? ' rec-current' : ''}" data-path="${esc(r.fsPath)}" title="${esc(r.fsPath)}">
  <div class="rec-top">
    <span class="rec-name">${esc(r.name)}</span>
    <div class="rec-actions">
      ${isCurrent ? '<span class="rec-badge">current</span>' : ''}
      <button class="rec-chat" data-path="${esc(r.fsPath)}" title="Send this folder path to Copilot Chat (text only; no files attached).">Send Path</button>
    </div>
  </div>
  <span class="rec-path">${esc(r.fsPath)}</span>
</div>`;
        }).join('');

    // ── Browse All (collapsible) ──────────────────────────────────────────────
    const browseHtml = Object.entries(grouped).map(([prefix, cmds]) => {
        const items = cmds.map(cmd => {
            const label = cmd.title.includes(':') ? cmd.title.slice(cmd.title.indexOf(':') + 1).trim() : cmd.title;
            const desc  = cmd.description ? `<span class="browse-desc">${esc(cmd.description)}</span>` : '';
            return `<div class="browse-item"><button class="browse-link" data-cmd="${esc(cmd.command)}">${esc(label)}</button>${desc}</div>`;
        }).join('');
        return `<div class="browse-group">
  <div class="browse-group-hd">${esc(prefix.replace(/:$/,''))}</div>
  <div class="browse-items">${items}</div>
</div>`;
    }).join('');

    const totalCmds = Object.values(grouped).reduce((n, a) => n + a.length, 0);

    // ── CSS ───────────────────────────────────────────────────────────────────
    const css = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);font-size:13px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);min-height:100vh}

/* Header */
#hd{display:flex;align-items:center;gap:12px;padding:14px 20px;background:var(--vscode-sideBar-background);border-bottom:1px solid var(--vscode-panel-border);flex-wrap:wrap}
#ws-meta{flex:1 1 260px;min-width:220px}
#ws-name{font-size:1.2em;font-weight:800;flex:1}
#ws-path{font-family:var(--vscode-editor-font-family,monospace);font-size:10px;color:var(--vscode-descriptionForeground);margin-top:2px}
.mcp-badge{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;padding:3px 12px;border-radius:20px;border:1px solid;flex-shrink:0}
.mcp-on{color:#3fb950;border-color:#3fb950;background:rgba(63,185,80,.1)}
.mcp-off{color:#f85149;border-color:#f85149;background:rgba(248,81,73,.1);cursor:pointer}
.mcp-off:hover{background:rgba(248,81,73,.2);border-color:#ff6e67}
.mcp-dot{width:8px;height:8px;border-radius:50%}
.mcp-on .mcp-dot{background:#3fb950;box-shadow:0 0 5px #3fb950}
.mcp-off .mcp-dot{background:#f85149}
#btn-configure,#btn-reload{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;padding:5px 12px;border-radius:4px;cursor:pointer;font-size:12px;flex-shrink:0}
#btn-configure:hover,#btn-reload:hover{background:var(--vscode-button-secondaryHoverBackground)}

/* Layout */
#body{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:auto auto auto;gap:16px;padding:16px 20px;max-width:1100px}
.panel{background:var(--vscode-textCodeBlock-background);border:1px solid var(--vscode-panel-border);border-radius:6px;padding:14px 16px}
.panel-hd{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--vscode-descriptionForeground);margin-bottom:10px}

/* Quick launch — spans full width */
#quick-launch{grid-column:1/-1;display:flex;gap:10px;flex-wrap:wrap;background:transparent;border:none;padding:0}
.ql-btn{display:inline-flex;align-items:center;gap:10px;padding:10px 16px;border-radius:6px;border:1px solid var(--vscode-panel-border);background:var(--vscode-textCodeBlock-background);color:var(--vscode-editor-foreground);cursor:pointer;font-family:inherit;flex:1;min-width:180px;text-align:left;transition:border-color .12s}
.ql-btn:hover{border-color:var(--vscode-focusBorder);background:var(--vscode-list-hoverBackground)}
.ql-primary{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border-color:var(--vscode-button-background)}
.ql-primary:hover{background:var(--vscode-button-hoverBackground);border-color:var(--vscode-button-hoverBackground)}
.ql-icon{font-size:1.5em;flex-shrink:0}
.ql-text{display:flex;flex-direction:column;gap:2px}
.ql-label{font-weight:700;font-size:13px}
.ql-desc{font-size:10px;opacity:.75}

/* History */
#panel-history{grid-column:1}
.hist-row{display:grid;grid-template-columns:18px 1fr auto auto auto;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--vscode-panel-border)}
.hist-row:last-child{border-bottom:none}
.hist-icon{font-size:12px;text-align:center}
.hist-title{position:relative;font-size:12px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:help}
.hist-title:hover{overflow:visible}
.hist-title::after{
  content:attr(data-tip);
  position:absolute;
  left:0;
  top:calc(100% + 4px);
  display:none;
  min-width:max-content;
  max-width:600px;
  white-space:normal;
  word-break:break-word;
  z-index:50;
  padding:6px 8px;
  border-radius:4px;
  border:1px solid var(--vscode-focusBorder);
  background:var(--vscode-editorHoverWidget-background);
  color:var(--vscode-editorHoverWidget-foreground);
  box-shadow:0 4px 18px rgba(0,0,0,.35);
}
.hist-title:hover::after{display:block}
.hist-elapsed{font-size:10px;color:var(--vscode-descriptionForeground);white-space:nowrap}
.hist-ago{font-size:10px;color:var(--vscode-descriptionForeground);white-space:nowrap}
.hist-rerun{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:3px;padding:2px 8px;cursor:pointer;font-size:11px;font-weight:600;flex-shrink:0}
.hist-rerun:hover{background:var(--vscode-button-hoverBackground)}
.hist-ok{color:#3fb950}.hist-err{color:#f85149}

/* Recent projects */
#panel-recents{grid-column:2}
.rec-card{padding:8px 10px;border-radius:4px;border:1px solid var(--vscode-panel-border);cursor:pointer;margin-bottom:6px;transition:border-color .12s}
.rec-card:last-child{margin-bottom:0}
.rec-card:hover{border-color:var(--vscode-focusBorder);background:var(--vscode-list-hoverBackground)}
.rec-current{border-color:var(--vscode-focusBorder);opacity:.7;cursor:default}
.rec-top{display:flex;align-items:center;justify-content:space-between;gap:8px}
.rec-name{font-weight:700;font-size:13px;display:flex;align-items:center;gap:6px}
.rec-actions{display:flex;align-items:center;gap:6px}
.rec-badge{font-size:9px;background:var(--vscode-focusBorder);color:#fff;border-radius:3px;padding:1px 5px}
.rec-chat{background:#3fb950;color:#fff;border:none;border-radius:3px;padding:2px 6px;cursor:pointer;font-size:10px;font-weight:600}
.rec-chat:hover{background:#31a442}
.rec-path{font-family:var(--vscode-editor-font-family,monospace);font-size:10px;color:var(--vscode-descriptionForeground);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* Browse All */
#panel-browse{grid-column:1/-1}
#browse-toggle{display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--vscode-descriptionForeground)}
#browse-toggle:hover{color:var(--vscode-editor-foreground)}
#browse-arrow{font-size:10px;transition:transform .15s}
#browse-arrow.open{transform:rotate(90deg)}
#browse-body{display:none;margin-top:12px;columns:3;column-gap:20px}
#browse-body.open{display:block}
.browse-group{break-inside:avoid;margin-bottom:14px}
.browse-group-hd{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--vscode-descriptionForeground);margin-bottom:5px;border-bottom:1px solid var(--vscode-panel-border);padding-bottom:3px}
.browse-item{display:flex;align-items:baseline;gap:6px;margin-bottom:3px;flex-wrap:wrap}
.browse-link{background:none;border:none;color:var(--vscode-textLink-foreground);cursor:pointer;font-size:12px;font-family:inherit;padding:0;text-align:left}
.browse-link:hover{text-decoration:underline}
.browse-desc{font-size:10px;color:var(--vscode-descriptionForeground)}

/* Config overlay */
#cfg-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:1000;align-items:center;justify-content:center}
#cfg-dialog{background:var(--vscode-editor-background);border:1px solid var(--vscode-focusBorder);border-radius:6px;min-width:300px;max-width:420px;width:90vw;max-height:70vh;display:flex;flex-direction:column;box-shadow:0 4px 24px rgba(0,0,0,.6)}
#cfg-hd{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--vscode-panel-border);flex-shrink:0}
#cfg-hd h3{font-size:13px;font-weight:700}
#cfg-close{background:none;border:none;color:var(--vscode-editor-foreground);cursor:pointer;font-size:16px;padding:0 4px;opacity:.7}
#cfg-close:hover{opacity:1}
#cfg-list{overflow-y:auto;padding:12px 16px;flex:1}
.cfg-item{display:flex;align-items:center;gap:10px;margin-bottom:8px;font-size:12px;cursor:pointer}

/* Shared */
.empty-state{font-size:12px;color:var(--vscode-descriptionForeground);padding:8px 0;line-height:1.6}
`;

    // ── JS ────────────────────────────────────────────────────────────────────
    const js = `
(function(){
// Live MCP badge updates pushed from the extension host.
function updateBadgeInteractivity(badge) {
  var isOff = badge.classList.contains('mcp-off');
  badge.title = isOff ? 'Click to start MCP server' : 'MCP server is running';
}
window.addEventListener('message', function(e) {
  var msg = e.data;
  if (!msg || msg.type !== 'mcpStatus') { return; }
  var badge = document.getElementById('mcp-badge');
  if (!badge) { return; }
  badge.className = 'mcp-badge ' + (msg.status === 'up' ? 'mcp-on' : 'mcp-off');
  var lbl = badge.querySelector('.mcp-label');
  if (lbl) { lbl.textContent = 'MCP ' + (msg.status === 'up' ? 'Running' : 'Stopped'); }
  updateBadgeInteractivity(badge);
});
var vsc = acquireVsCodeApi();

// MCP badge click — start server when stopped
var mcpBadge = document.getElementById('mcp-badge');
if (mcpBadge) {
  updateBadgeInteractivity(mcpBadge);
  mcpBadge.addEventListener('click', function() {
    if (mcpBadge.classList.contains('mcp-off')) {
      vsc.postMessage({ type: 'startMcp' });
    }
  });
}

// Quick launch
document.querySelectorAll('.ql-btn').forEach(function(b){
  b.addEventListener('click',function(){ vsc.postMessage({ type:'runCommand', command:b.dataset.cmd }); });
});

// History re-run
document.querySelectorAll('.hist-rerun').forEach(function(b){
  b.addEventListener('click',function(){ vsc.postMessage({ type:'runCommand', command:b.dataset.cmd }); });
});

// Recent project click — skip current
document.querySelectorAll('.rec-card:not(.rec-current)').forEach(function(c){
  c.addEventListener('click',function(){ vsc.postMessage({ type:'openFolder', path:c.dataset.path }); });
});

// Recent project path to chat
document.querySelectorAll('.rec-chat').forEach(function(b){
  b.addEventListener('click', function(e){
    e.preventDefault();
    e.stopPropagation();
    var btn = e.currentTarget;
    var folderPath = btn && btn.dataset ? btn.dataset.path : '';
    if (!folderPath) { return; }
    vsc.postMessage({ type:'sendPathToChat', path:folderPath });
  });
});

// Browse All toggle
var browseToggle = document.getElementById('browse-toggle');
var browseBody   = document.getElementById('browse-body');
var browseArrow  = document.getElementById('browse-arrow');
browseToggle.addEventListener('click',function(){
  var open = browseBody.classList.toggle('open');
  browseArrow.classList.toggle('open', open);
});

// Browse command links
document.querySelectorAll('.browse-link').forEach(function(b){
  b.addEventListener('click',function(){ vsc.postMessage({ type:'runCommand', command:b.dataset.cmd }); });
});

// Configure overlay — toggles persist via localStorage
var overlay  = document.getElementById('cfg-overlay');
var cfgClose = document.getElementById('cfg-close');

var SECTIONS = {
  history:  { panelId: 'panel-history',  label: 'Recent Runs'        },
  recents:  { panelId: 'panel-recents',  label: 'Recent Projects'    },
  browse:   { panelId: 'panel-browse',   label: 'Browse All Commands' },
};

function loadToggles() {
  var t = {};
  Object.keys(SECTIONS).forEach(function(k){ t[k] = localStorage.getItem('cvt-home-'+k) !== 'false'; });
  return t;
}

function applyToggles(toggles) {
  Object.keys(SECTIONS).forEach(function(k){
    var panel = document.getElementById(SECTIONS[k].panelId);
    if (panel) panel.style.display = toggles[k] ? '' : 'none';
  });
}

// Build checkboxes dynamically so state reflects localStorage
function buildCfgList() {
  var list = document.getElementById('cfg-list');
  var toggles = loadToggles();
  list.innerHTML = '';
  Object.keys(SECTIONS).forEach(function(k) {
    var label = document.createElement('label');
    label.className = 'cfg-item';
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = toggles[k];
    cb.dataset.key = k;
    label.appendChild(cb);
    label.appendChild(document.createTextNode(' ' + SECTIONS[k].label));
    list.appendChild(label);
  });
  list.querySelectorAll('input[type=checkbox]').forEach(function(cb){
    cb.addEventListener('change', function(){
      var key = cb.dataset.key;
      var val = cb.checked;
      localStorage.setItem('cvt-home-' + key, String(val));
      var panel = document.getElementById(SECTIONS[key].panelId);
      if (panel) panel.style.display = val ? '' : 'none';
    });
  });
}

// Apply saved toggles on load
applyToggles(loadToggles());

document.getElementById('btn-reload').addEventListener('click', function() {
  vsc.postMessage({ type:'runCommand', command:'workbench.action.reloadWindow' });
});

document.getElementById('btn-configure').addEventListener('click', function() {
  buildCfgList();
  overlay.style.display = 'flex';
});
cfgClose.addEventListener('click', function() { overlay.style.display = 'none'; });
overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.style.display = 'none'; });
})();
`;

    // ── Config checkboxes ─────────────────────────────────────────────────────
    const cfgItems = [
        { key: 'history',  label: 'Recent Runs'        },
        { key: 'recents',  label: 'Recent Projects'     },
        { key: 'browse',   label: 'Browse All Commands' },
    ].map(item => `<label class="cfg-item"><input type="checkbox" checked> ${item.label}</label>`).join('');

    return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src 'unsafe-inline';script-src 'unsafe-inline';">
<style>${css}</style>
</head><body>

<div id="hd">
  <div id="ws-meta">
    <div id="ws-name">\u26a1 ${esc(wsName)}</div>
    ${wsPath ? `<div id="ws-path">${esc(wsPath)}</div>` : ''}
  </div>
  <div id="mcp-badge" class="mcp-badge ${mcpRunning ? 'mcp-on' : 'mcp-off'}">
    <span class="mcp-dot"></span>
    <span class="mcp-label">MCP ${mcpRunning ? 'Running' : 'Stopped'}</span>
  </div>
  <button id="btn-reload" title="Reload VS Code window">\uD83D\uDD04 Reload Window</button>
  <button id="btn-configure">\u2699\ufe0f Configure</button>
</div>

<div id="body">

  <div id="quick-launch">${quickHtml}</div>

  <div class="panel" id="panel-history">
    <div class="panel-hd">\uD83D\uDD52 Recent Runs</div>
    ${histHtml}
  </div>

  <div class="panel" id="panel-recents">
    <div class="panel-hd">\uD83D\uDCC1 Recent Projects</div>
    ${recHtml}
  </div>

  <div class="panel" id="panel-browse">
    <div id="browse-toggle">
      <span id="browse-arrow">\u25b6</span>
      Browse All Commands
      <span style="font-weight:400;text-transform:none;letter-spacing:0;margin-left:4px">(${totalCmds})</span>
    </div>
    <div id="browse-body">${browseHtml}</div>
  </div>

</div>

<div id="cfg-overlay">
  <div id="cfg-dialog">
    <div id="cfg-hd"><h3>Configure Dashboard</h3><button id="cfg-close">&#10005;</button></div>
    <div id="cfg-list"></div>
  </div>
</div>

<script>${js}</script>
</body></html>`;
}

function formatAgo(ts: number): string {
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    if (m < 1)    { return 'just now'; }
    if (m < 60)   { return `${m}m ago`; }
    const h = Math.floor(m / 60);
    if (h < 24)   { return `${h}h ago`; }
    return `${Math.floor(h / 24)}d ago`;
}

export function deactivate(): void {}
