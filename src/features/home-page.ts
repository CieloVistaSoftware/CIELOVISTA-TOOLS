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
import * as os     from 'os';
import * as net    from 'net';
import { getHistory }        from './cvs-command-launcher/command-history';
import { CATALOG }          from './cvs-command-launcher/catalog';
import {
    getDisplayProjects,
    addPinnedProject,
    removeFromDisplay
} from './cvs-command-launcher/recent-projects';
import {
    startMcpServer,
    getMcpServerStatus,
    onMcpServerStatusChange,
    offMcpServerStatusChange
} from './mcp-server-status';
import { openDocPreview } from '../shared/doc-preview';
import { showGithubIssues } from '../shared/github-issues-view';
import {
    loadRegistry,
    registryPathSet,
    addToRegistry,
    removeFromRegistry
} from '../shared/cvt-registry';
import { esc } from '../shared/webview-utils';
import { getDevServerConfig } from '../shared/dev-server-config';
import { isPortOpen } from '../shared/port-check';

let homePanel: vscode.WebviewPanel | undefined;

function normalizeWorkspaceDisplayName(name: string): string {
  const raw = String(name ?? '').trim();
  if (!raw) { return 'No Workspace'; }
  const lower = raw.toLowerCase();
  if (lower === 'cielovista-tools') { return 'CieloVista Tools'; }
  return raw
    .replace(/[-_]+/g, ' ')
    .replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

let browsePanel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.tools.home', () => showHomePage(context)),
        vscode.commands.registerCommand('cvs.commands.browseAll', () => void showBrowseAllPanel()),
    );

  // Opening the webview synchronously during startup is unreliable on reload
  // because VS Code may still be restoring editors. Defer slightly.
  setTimeout(() => showHomePage(context), 300);
}

async function showBrowseAllPanel(): Promise<void> {
    if (browsePanel) { browsePanel.reveal(vscode.ViewColumn.Beside); browsePanel.webview.postMessage({ type: 'flash' }); return; }

    const registered = new Set(await vscode.commands.getCommands(false));
    const grouped    = buildGroupedCommands(registered);
    const totalCmds  = Object.values(grouped).reduce((n, a) => n + a.length, 0);

    browsePanel = vscode.window.createWebviewPanel(
        'cvsBrowseAll',
        `Browse All Commands (${totalCmds})`,
        vscode.ViewColumn.Beside,
        { enableScripts: true }
    );

    browsePanel.webview.html = buildBrowseAllHtml(grouped, totalCmds);

    browsePanel.webview.onDidReceiveMessage(async (msg: { type: string; cmd?: string }) => {
        if (msg.type === 'run' && msg.cmd) {
            await vscode.commands.executeCommand(msg.cmd);
        }
    });

    browsePanel.onDidDispose(() => { browsePanel = undefined; });
}

function buildBrowseAllHtml(
    grouped: Record<string, Array<{title:string;command:string;description?:string}>>,
    totalCmds: number,
): string {
    const browseHtml = Object.entries(grouped).map(([prefix, cmds]) => {
        const items = cmds.map(cmd => {
            const label = cmd.title.includes(':') ? cmd.title.slice(cmd.title.indexOf(':') + 1).trim() : cmd.title;
            const desc  = cmd.description ? `<span class="browse-desc">${esc(cmd.description)}</span>` : '';
            return `<div class="browse-item"><button class="browse-link" data-cmd="${esc(cmd.command)}">${esc(label)}</button>${desc}</div>`;
        }).join('');
        return `<div class="browse-group">
  <div class="browse-group-hd">${esc(prefix.replace(/:$/, ''))}</div>
  <div class="browse-items">${items}</div>
</div>`;
    }).join('');

    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';">
<style>
*{box-sizing:border-box;margin:0;padding:0}
@keyframes cvs-flash-anim{0%{outline:2px solid var(--vscode-focusBorder);outline-offset:0}60%{outline:2px solid var(--vscode-focusBorder);outline-offset:0}100%{outline:2px solid transparent;outline-offset:0}}
.cvs-flash{animation:cvs-flash-anim 0.5s ease-out}
body{font-family:var(--vscode-font-family);font-size:13px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);padding:16px 20px}
h1{font-size:14px;font-weight:700;margin-bottom:12px;color:var(--vscode-editor-foreground)}
#filter-wrap{position:sticky;top:0;background:var(--vscode-editor-background);padding:0 0 10px;z-index:10}
#filter{width:100%;padding:5px 10px;border:1px solid var(--vscode-input-border);background:var(--vscode-input-background);color:var(--vscode-input-foreground);border-radius:4px;font-size:12px;outline:none}
#filter:focus{border-color:var(--vscode-focusBorder)}
#total{font-size:11px;color:var(--vscode-descriptionForeground);margin-top:4px}
.browse-group{margin-bottom:16px}
.browse-group-hd{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--vscode-descriptionForeground);margin-bottom:6px;border-bottom:1px solid var(--vscode-panel-border);padding-bottom:3px}
.browse-items{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:4px 12px}
.browse-item{display:flex;flex-direction:column;gap:2px}
.browse-link{background:none;border:none;color:var(--vscode-textLink-foreground);cursor:pointer;text-align:left;padding:2px 0;font-size:12px;font-family:inherit;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.browse-link:hover{text-decoration:underline;color:var(--vscode-textLink-activeForeground)}
.browse-desc{font-size:10px;color:var(--vscode-descriptionForeground);line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hidden{display:none}
</style>
</head><body>
<div id="filter-wrap">
  <input id="filter" type="text" placeholder="Filter commands… (e.g. FileList, Audit)" autocomplete="off" spellcheck="false">
  <div id="total">${totalCmds} commands registered</div>
</div>
<div id="browse-body">${browseHtml}</div>
<script>
(function(){
'use strict';
const vscode = acquireVsCodeApi();
document.getElementById('browse-body').addEventListener('click', function(e) {
    var btn = e.target.closest('.browse-link');
    if (btn && btn.dataset.cmd) {
        vscode.postMessage({ type: 'run', cmd: btn.dataset.cmd });
    }
});
var filterEl = document.getElementById('filter');
filterEl.addEventListener('input', function() {
    var q = filterEl.value.trim().toLowerCase();
    document.querySelectorAll('.browse-group').forEach(function(grp) {
        var any = false;
        grp.querySelectorAll('.browse-item').forEach(function(item) {
            var text = item.textContent.toLowerCase();
            var show = !q || text.includes(q);
            item.classList.toggle('hidden', !show);
            if (show) { any = true; }
        });
        grp.classList.toggle('hidden', !any);
    });
});
window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'flash') {
        document.body.classList.remove('cvs-flash');
        void document.body.offsetWidth;
        document.body.classList.add('cvs-flash');
    }
});
})();
</script>
</body></html>`;
}

export function buildGroupedCommands(registered: Set<string>): Record<string, Array<{title:string;command:string;description?:string}>> {
  const pkgPath = path.join(__dirname, '../package.json');
  let commands: Array<{title:string; command:string; description?:string}> = [];
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    commands = pkg.contributes?.commands ?? [];
  } catch { commands = []; }

  // The Home page should only show commands that are currently registered.
  const visible = commands.filter(cmd => registered.has(cmd.command));
  const grouped: Record<string, typeof visible> = {};
  for (const cmd of visible) {
    if (!cmd.title || typeof cmd.title !== 'string') { continue; }
    const match  = cmd.title.match(/^([\w\s\-]+:)/);
    const prefix = match ? match[1].trim() : 'Other';
    if (!grouped[prefix]) { grouped[prefix] = []; }
    grouped[prefix].push(cmd);
  }

  return grouped;
}

function _startDcPoller(panel: vscode.WebviewPanel): () => void {
  const DC_PORT = 5000;
  let lastStatus: 'up' | 'down' | null = null;

  const check = () => {
    if (!panel.visible) { return; }
    const socket = net.createConnection({ port: DC_PORT, host: '127.0.0.1' });
    socket.setTimeout(800);
    const done = (status: 'up' | 'down') => {
      socket.destroy();
      if (status !== lastStatus) {
        lastStatus = status;
        void panel.webview.postMessage({ type: 'dcStatus', status });
      }
    };
    socket.once('connect',  () => done('up'));
    socket.once('error',    () => done('down'));
    socket.once('timeout',  () => done('down'));
  };

  check(); // immediate first check
  const id = setInterval(check, 12000);
  return () => clearInterval(id);
}

/** Mirrors _startDcPoller, but against the CURRENT workspace's own dev-server port (.claude/launch.json, default 4000) instead of the DiskCleanUp backend's fixed port 5000. */
function _startDevServerPoller(panel: vscode.WebviewPanel, port: number): () => void {
  let lastStatus: 'up' | 'down' | null = null;

  const check = () => {
    if (!panel.visible) { return; }
    const socket = net.createConnection({ port, host: '127.0.0.1' });
    socket.setTimeout(800);
    const done = (status: 'up' | 'down') => {
      socket.destroy();
      if (status !== lastStatus) {
        lastStatus = status;
        void panel.webview.postMessage({ type: 'devServerStatus', status });
      }
    };
    socket.once('connect',  () => done('up'));
    socket.once('error',    () => done('down'));
    socket.once('timeout',  () => done('down'));
  };

  check(); // immediate first check
  const id = setInterval(check, 8000);
  return () => clearInterval(id);
}

function _startMetricsSampler(panel: vscode.WebviewPanel): () => void {
  let prevCpu  = process.cpuUsage();
  let prevTime = process.hrtime.bigint();
  const numCpus = Math.max(1, os.cpus().length);

  const id = setInterval(() => {
    const nowTime   = process.hrtime.bigint();
    const nowCpu    = process.cpuUsage();
    const elapsedUs = Number(nowTime - prevTime) / 1000;
    const cpuUs     = (nowCpu.user - prevCpu.user) + (nowCpu.system - prevCpu.system);
    const cpuPct    = Math.min(100, Math.round(cpuUs / elapsedUs * 100 / numCpus));
    prevCpu  = nowCpu;
    prevTime = nowTime;

    const mem        = process.memoryUsage();
    const memPct     = Math.round(mem.heapUsed / mem.heapTotal * 100);
    const heapUsedMb  = Math.round(mem.heapUsed  / 1048576);
    const heapTotalMb = Math.round(mem.heapTotal / 1048576);

    if (panel.visible) {
      void panel.webview.postMessage({ type: 'metrics', cpuPct, memPct, heapUsedMb, heapTotalMb });
    }
  }, 3000);

  return () => clearInterval(id);
}

/** Move the Home panel to position 1 (leftmost) in its tab group. */
export function ensureHomeIsLeftmost(): void {
  if (!homePanel) { return; }
  homePanel.reveal(vscode.ViewColumn.One);
  setTimeout(() => void vscode.commands.executeCommand('workbench.action.moveEditorFirst'), 50);
}

function showHomePage(context: vscode.ExtensionContext): void {
  if (homePanel) {
    homePanel.reveal(vscode.ViewColumn.One);
    homePanel.webview.postMessage({ type: 'flash' });
    setTimeout(() => void vscode.commands.executeCommand('workbench.action.moveEditorFirst'), 50);
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    'cvsHome',
    'CieloVista Tools \u2014 Home',
    vscode.ViewColumn.One,
    { enableScripts: true }
  );
  homePanel = panel;
  setTimeout(() => void vscode.commands.executeCommand('workbench.action.moveEditorFirst'), 50);

  const wsFolder = vscode.workspace.workspaceFolders?.[0];
  const wsName   = normalizeWorkspaceDisplayName(wsFolder?.name ?? 'No Workspace');
  const wsPath   = wsFolder?.uri.fsPath ?? '';

  startMcpServer();

  const render = async (): Promise<void> => {
    const history    = getHistory();
    const recents    = getDisplayProjects();
    const mcpRunning = getMcpServerStatus() === 'up';
    const registered = new Set(await vscode.commands.getCommands(false));
    const grouped    = buildGroupedCommands(registered);
    let cvtPaths: Set<string>;
    try { cvtPaths = registryPathSet(loadRegistry()); }
    catch { cvtPaths = new Set(); }
    // Detect npm start script in workspace package.json
    let hasStartScript = false;
    if (wsPath) {
      try {
        const pkgRaw = fs.readFileSync(path.join(wsPath, 'package.json'), 'utf8');
        const pkg = JSON.parse(pkgRaw);
        hasStartScript = !!(pkg?.scripts?.start);
      } catch { /* no package.json or parse error */ }
    }
    panel.webview.html = buildDashboardHtml(wsName, wsPath, mcpRunning, history, recents, grouped, cvtPaths, registered, hasStartScript);
  };

  void render();
  setTimeout(() => { void render(); }, 1500);

  const devServerConfig = getDevServerConfig(wsPath);

  const mcpStatusHandler = (status: 'up' | 'down') => {
    panel.webview.postMessage({ type: 'mcpStatus', status });
  };
  onMcpServerStatusChange(mcpStatusHandler);
  const stopMetrics = _startMetricsSampler(panel);
  const stopDcPoller = _startDcPoller(panel);
  const stopDevServerPoller = _startDevServerPoller(panel, devServerConfig.port);
  panel.onDidDispose(() => {
    if (homePanel === panel) {
      homePanel = undefined;
    }
    stopDevServerPoller();
    offMcpServerStatusChange(mcpStatusHandler);
    stopMetrics();
    stopDcPoller();
  }, null, context.subscriptions);

  panel.webview.onDidReceiveMessage(async msg => {
    if (!msg?.type) { return; }
    if (msg.type === 'npmStart') {
      const terminal = vscode.window.createTerminal({ name: `npm start — ${wsName}`, cwd: wsPath });
      terminal.show();
      terminal.sendText('npm start');
      return;
    }
    if (msg.type === 'devServerAction') {
      // The single "Start" button: if the workspace's own dev server is
      // already up, just open it (to its default landing page); otherwise
      // launch it the same way npmStart does.
      const up = await isPortOpen(devServerConfig.port);
      if (up) {
        await vscode.env.openExternal(vscode.Uri.parse(`http://127.0.0.1:${devServerConfig.port}/${devServerConfig.landingPage}`));
      } else {
        const terminal = vscode.window.createTerminal({ name: `npm start — ${wsName}`, cwd: wsPath });
        terminal.show();
        terminal.sendText('npm start');
      }
      return;
    }
    if (msg.type === 'npmRestart') {
      // POST /api/restart to the running DC service, then fall back to terminal restart
      try {
        await fetch('http://127.0.0.1:5000/api/restart', { method: 'POST' });
      } catch {
        // Service already down or no /api/restart — do a terminal restart
        const terminal = vscode.window.createTerminal({ name: `npm restart — ${wsName}`, cwd: wsPath });
        terminal.show();
        terminal.sendText('npm restart');
      }
      return;
    }
    if (msg.type === 'runCommand' && msg.command) {
      const previewMode = Boolean(msg.previewMode);
      if (msg.command === '__openIssues__') {
        showGithubIssues(vscode.ViewColumn.Two, wsPath);
        return;
      }
      const OPEN_DIRECT = [
        'cvs.commands.showAll',
        'cvs.catalog.open',
        'cvs.catalog.viewArchived',
        'cvs.npm.tree',
        'cvs.claude.processMonitor',
        'cvs.catalog.view',
        'cvs.tools.home',
        'cvs.mcp.viewer.open',
        'cvs.tools.fileList',
        'workbench.action.reloadWindow',
      ];
      if (previewMode) {
        // For preview clicks, do not route through runWithOutput.
        if (msg.command === 'cvs.consolidate.log') {
          const registry = loadRegistry();
          const globalDocs = registry?.globalDocsPath;
          if (globalDocs) {
            const logPath = path.join(globalDocs, 'consolidation-log.md');
            if (fs.existsSync(logPath)) {
              openDocPreview(logPath, '📚 Recent Runs', 'cvs.tools.home');
              return;
            }
          }
        }

        if (OPEN_DIRECT.includes(msg.command)) {
          await vscode.commands.executeCommand('workbench.action.focusSecondEditorGroup');
          await vscode.commands.executeCommand(msg.command);
        } else {
          await vscode.commands.executeCommand(msg.command);
        }

        const active = vscode.window.activeTextEditor;
        if (active) {
          await vscode.window.showTextDocument(active.document, {
            preview: true,
            preserveFocus: true,
            viewColumn: vscode.ViewColumn.Beside,
          });
        }
      } else if (OPEN_DIRECT.includes(msg.command)) {
        // Focus column 2 first so commands that respect the active column open beside the Home panel
        void vscode.commands.executeCommand('workbench.action.focusSecondEditorGroup').then(() =>
          vscode.commands.executeCommand(msg.command)
        );
      } else {
        // Reveal home page in column 1 first so ViewColumn.Beside in runWithOutput lands in column 2
        panel.reveal(vscode.ViewColumn.One, false);
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
    if (msg.type === 'addPinnedProject') {
      const picked = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Pin to Recent Projects',
        title: 'Pick a folder to add to CVT Recent Projects',
      });
      if (picked && picked.length > 0) {
        const fsPath = picked[0].fsPath;
        const name   = path.basename(fsPath) || fsPath;
        await addPinnedProject(fsPath, name);
        void render();
      }
    }
    if (msg.type === 'removeProject' && msg.path) {
      await removeFromDisplay(String(msg.path));
      void render();
    }
    if (msg.type === 'cvtRegistryAdd' && msg.path) {
      try {
        addToRegistry(String(msg.path), msg.name ? String(msg.name) : undefined);
        void render();
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Couldn't add to CVT registry: ${m}`);
      }
    }
    if (msg.type === 'cvtRegistryRemove' && msg.path) {
      try {
        const removed = removeFromRegistry(String(msg.path));
        if (removed === 0) {
          vscode.window.showWarningMessage('That path wasn\'t in the CVT registry.');
        }
        void render();
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Couldn't remove from CVT registry: ${m}`);
      }
    }
    if (msg.type === 'startMcp') {
      startMcpServer();
    }
    if (msg.type === 'startDiskCleanUp') {
      await vscode.commands.executeCommand('cvs.launch.diskcleanup.start');
    }
  });
}

// ─── HTML ─────────────────────────────────────────────────────────────────────

export function buildDashboardHtml(
    wsName:    string,
    wsPath:    string,
    mcpRunning: boolean,
    history:   ReturnType<typeof getHistory>,
    recents:   ReturnType<typeof getDisplayProjects>,
    grouped:   Record<string, Array<{title:string;command:string;description?:string}>>,
  cvtPaths:  Set<string>,
  registered: Set<string>,
  hasStartScript: boolean = false
): string {

    // ── Quick Launch buttons ──────────────────────────────────────────────────
    const quickLaunch = [
      { icon: '\uD83D\uDCCB', label: 'Issue Viewer',    desc: 'Live GitHub issues for CieloVista Tools', cmd: '__openIssues__',                      primary: true },
      { icon: '\u26a1', label: 'Guided Launcher', desc: 'Search & run all 81 commands', cmd: 'cvs.commands.showAll',        primary: false  },
        { icon: '\uD83D\uDCDA', label: 'Doc Catalog',     desc: 'Browse project documentation',    cmd: 'cvs.catalog.open',           primary: false },
        { icon: '\uD83D\uDCE6', label: 'NPM Scripts',     desc: 'All workspace scripts \u2014 grouped by package.json, click to run', cmd: 'cvs.npm.tree', primary: false },
      { icon: '\uD83D\uDCE4', label: 'Last Cmd to Chat', desc: 'Send the latest terminal command to Copilot Chat', cmd: 'cvs.terminal.pasteLastCommandToChat', primary: false },
        { icon: '\uD83D\uDD0D', label: 'Run Audit',       desc: 'Daily health check',              cmd: 'cvs.audit.runDaily',          primary: false },
      { icon: '\uD83D\uDD0C', label: 'MCP Viewer',      desc: 'Live viewer for the 4 catalog MCP endpoints', cmd: 'cvs.mcp.viewer.open', primary: false },
      { icon: '\uD83D\uDCC2', label: 'File List',       desc: 'Sortable file browser with name, date, size',  cmd: 'cvs.tools.fileList',  primary: false },
    ];

    const quickHtml = quickLaunch
        .filter(q => q.cmd === '__openIssues__' || registered.has(q.cmd))
        .map(q => `
<button class="ql-btn${q.primary ? ' ql-primary' : ''}" data-cmd="${esc(q.cmd)}">
  <span class="ql-icon">${q.icon}</span>
  <span class="ql-text">
    <span class="ql-label">${esc(q.label)}</span>
    <span class="ql-desc">${esc(q.desc)}</span>
  </span>
</button>`).join('');

    // ── Command history ───────────────────────────────────────────────────────
    const _previewCmds = new Set(CATALOG.filter(c => c.action === 'read').map(c => c.id));
    const histHtml = history.length === 0
        ? `<div class="empty-state">No commands run yet in this workspace.<br>Use the Guided Launcher to run your first command.</div>`
        : history.slice(0, 10).map(h => {
            const ago    = formatAgo(h.timestamp);
            const icon   = h.ok ? '\u2705' : '\u274c';
            const cls    = h.ok ? 'hist-ok' : 'hist-err';
            const isPreview = _previewCmds.has(h.id);
            const btnLabel  = isPreview ? 'Preview' : 'Run';
            const btnTitle  = isPreview ? `Preview ${esc(h.title)}` : `Re-run ${esc(h.title)}`;
            return `<div class="hist-row">
  <span class="hist-icon ${cls}">${icon}</span>
  <span class="hist-title" data-tip="${esc(h.title)}" title="${esc(h.title)}">${esc(h.title)}</span>
  <span class="hist-elapsed">${h.elapsed}ms</span>
  <span class="hist-ago">${esc(ago)}</span>
  <button class="hist-rerun" data-cmd="${esc(h.id)}" data-preview="${isPreview ? 'true' : 'false'}" title="${btnTitle}">${btnLabel}</button>
</div>`;
        }).join('');

    // ── Recent projects ───────────────────────────────────────────────────────
    const recHtml = recents.length === 0
        ? `<div class="empty-state">No recent projects yet. Use the Edit button to pin any folder, or open CVT in other workspaces to build your list.</div>`
        : recents.map(r => {
            const isCurrent   = r.fsPath === wsPath;
            const inCvt       = cvtPaths.has(r.fsPath.toLowerCase());
            const pinnedBadge = r.pinned ? '<span class="rec-badge rec-badge-pinned" title="Pinned manually via Edit">pinned</span>' : '';
            const cvtBadge    = inCvt ? '<span class="rec-badge rec-badge-cvt" title="Included in the CVT project registry">in CVT</span>' : '';
            // CVT toggle — visible only in edit mode (CSS). Label + dataset flip
            // depending on current membership.
            const cvtBtn = inCvt
                ? `<button class="rec-cvt rec-cvt-remove" data-path="${esc(r.fsPath)}" data-name="${esc(r.name)}" title="Remove this folder from the CVT project registry">\u2212 CVT</button>`
                : `<button class="rec-cvt rec-cvt-add"    data-path="${esc(r.fsPath)}" data-name="${esc(r.name)}" title="Add this folder to the CVT project registry (project-registry.json)">+ CVT</button>`;
            return `<div class="rec-card${isCurrent ? ' rec-current' : ''}" data-path="${esc(r.fsPath)}" title="${esc(r.fsPath)}">
  <button class="rec-remove" data-path="${esc(r.fsPath)}" title="Remove from CVT Recent Projects" aria-label="Remove">\u00d7</button>
  <div class="rec-top">
    <span class="rec-name">${esc(r.name)}</span>
    <div class="rec-actions">
      ${pinnedBadge}
      ${cvtBadge}
      ${isCurrent ? '<span class="rec-badge">current</span>' : ''}
      ${cvtBtn}
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

    // Flat list for home search — every command with its group label
    const allCmdsJson = JSON.stringify(
        Object.entries(grouped).flatMap(([prefix, cmds]) =>
            cmds.map(cmd => ({
                label: cmd.title.includes(':') ? cmd.title.slice(cmd.title.indexOf(':') + 1).trim() : cmd.title,
                group: prefix.replace(/:$/, ''),
                desc:  cmd.description ?? '',
                cmd:   cmd.command,
            }))
        )
    );

    // ── CSS ───────────────────────────────────────────────────────────────────
    const css = `
*{box-sizing:border-box;margin:0;padding:0}
@keyframes cvs-flash-anim{0%{outline:2px solid var(--vscode-focusBorder);outline-offset:0}60%{outline:2px solid var(--vscode-focusBorder);outline-offset:0}100%{outline:2px solid transparent;outline-offset:0}}
.cvs-flash{animation:cvs-flash-anim 0.5s ease-out}
body{font-family:var(--vscode-font-family);font-size:13px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);min-height:100vh}

/* Header */
#hd{display:flex;align-items:center;gap:12px;padding:14px 20px;background:var(--vscode-sideBar-background);border-bottom:1px solid var(--vscode-panel-border);flex-wrap:wrap}
#ws-meta{flex:1 1 260px;min-width:220px}
#ws-name{font-size:1.2em;font-weight:800;flex:1}
#ws-path{font-family:var(--vscode-editor-font-family,monospace);font-size:10px;color:var(--vscode-descriptionForeground);margin-top:2px;background:transparent;border:none;padding:0;cursor:pointer;text-align:left;text-decoration:underline dotted;text-underline-offset:2px}#ws-path:hover{color:var(--vscode-textLink-activeForeground);text-decoration:underline}
.mcp-badge{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;padding:3px 12px;border-radius:20px;border:1px solid;flex-shrink:0}
.mcp-on{color:#3fb950;border-color:#3fb950;background:rgba(63,185,80,.1)}
.mcp-off{color:#f85149;border-color:#f85149;background:rgba(248,81,73,.1);cursor:pointer}
.mcp-off:hover{background:rgba(248,81,73,.2);border-color:#ff6e67}
.mcp-dot{width:8px;height:8px;border-radius:50%}
.dc-badge{cursor:pointer}
.dc-on{color:#3fb950;border-color:#3fb950;background:rgba(63,185,80,.1)}
.dc-off{color:#f85149;border-color:#f85149;background:rgba(248,81,73,.1)}
.dc-off:hover{background:rgba(248,81,73,.2);border-color:#ff6e67}
.dc-unknown{color:#888;border-color:#555;background:transparent}
.dc-on .mcp-dot{background:#3fb950;box-shadow:0 0 5px #3fb950}
.dc-off .mcp-dot{background:#f85149}
.dc-unknown .mcp-dot{background:#555}
#metrics-gauge{display:flex;align-items:center;gap:10px;flex-shrink:0}
.mg-item{display:flex;align-items:center;gap:5px;font-size:10px;color:var(--vscode-descriptionForeground)}
.mg-label{font-weight:600;min-width:28px}
.mg-bar-wrap{width:48px;height:5px;border-radius:3px;background:rgba(255,255,255,.1);overflow:hidden}
.mg-bar{height:100%;border-radius:3px;transition:width .4s}
.mg-bar-mem{background:#58a6ff}
.mg-bar-cpu{background:#3fb950}
.mg-val{min-width:60px;text-align:right}
.mcp-on .mcp-dot{background:#3fb950;box-shadow:0 0 5px #3fb950}
.mcp-off .mcp-dot{background:#f85149}
#btn-configure,#btn-reload{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;padding:5px 12px;border-radius:4px;cursor:pointer;font-size:12px;flex-shrink:0}
#btn-configure:hover,#btn-reload:hover{background:var(--vscode-button-secondaryHoverBackground)}
.btn-hidden{display:none!important}
#btn-npm-start{background:#1a3a1a;color:#3fb950;border:1px solid #3fb950;padding:5px 14px;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600;flex-shrink:0}
#btn-npm-start:hover{background:#3fb950;color:#000}
.devserver-badge{cursor:default}

/* Layout */
#body{display:grid;grid-template-columns:minmax(16rem,.9fr) minmax(0,1.6fr);grid-template-rows:auto auto auto;gap:16px;padding:16px 20px;width:100%;box-sizing:border-box}
.panel{background:var(--vscode-textCodeBlock-background);border:1px solid var(--vscode-panel-border);border-radius:6px;padding:14px 16px;min-width:0}
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
#panel-recents{grid-column:2;min-width:0;overflow-x:hidden}
.rec-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(28ch,100%),1fr));gap:6px;width:100%}
.rec-card{padding:8px 10px;border-radius:4px;border:1px solid var(--vscode-panel-border);cursor:pointer;transition:border-color .12s;min-width:0;overflow:hidden}
.rec-card:last-child{margin-bottom:0}
.rec-card:hover{border-color:var(--vscode-focusBorder);background:var(--vscode-list-hoverBackground)}
.rec-current{border-color:var(--vscode-focusBorder);opacity:.7;cursor:default}
.rec-top{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px;min-width:0}
.rec-name{font-weight:700;font-size:13px;display:flex;align-items:center;gap:6px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rec-actions{display:flex;align-items:center;gap:6px;min-width:0;flex-shrink:0}
.rec-badge{font-size:9px;background:var(--vscode-focusBorder);color:#fff;border-radius:3px;padding:1px 5px}
.rec-chat{background:#3fb950;color:#fff;border:none;border-radius:3px;padding:2px 6px;cursor:pointer;font-size:10px;font-weight:600}
.rec-chat:hover{background:#31a442}
.rec-path{display:block;width:100%;min-width:0;max-width:100%;font-family:var(--vscode-editor-font-family,monospace);font-size:10px;color:var(--vscode-descriptionForeground);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* Recent-projects Edit mode */
.panel-hd-split{display:flex;align-items:center;justify-content:space-between;gap:8px}
.panel-hd-btn{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:1px solid var(--vscode-panel-border);border-radius:3px;padding:2px 10px;cursor:pointer;font-size:10px;font-weight:600;text-transform:none;letter-spacing:0}
.panel-hd-btn:hover{background:var(--vscode-button-secondaryHoverBackground);border-color:var(--vscode-focusBorder)}
.panel-hd-btn.active{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border-color:var(--vscode-button-background)}
.rec-card{position:relative}
.rec-remove{display:none;position:absolute;top:50%;left:-6px;transform:translateY(-50%);width:22px;height:22px;border-radius:50%;border:1px solid var(--vscode-panel-border);background:var(--vscode-editor-background);color:#f85149;font-size:14px;line-height:1;cursor:pointer;padding:0;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,.3);z-index:2}
.rec-remove:hover{background:#f85149;color:#fff;border-color:#f85149}
#panel-recents.edit-mode .rec-remove{display:block}
#panel-recents.edit-mode .rec-card{cursor:default;padding-left:18px}
#panel-recents.edit-mode .rec-card:hover{border-color:var(--vscode-panel-border);background:transparent}
.rec-badge-pinned{background:#a37; color:#fff}
.rec-badge-cvt{background:#2d7a46;color:#fff}
/* CVT include/exclude toggle — visible only in edit mode */
.rec-cvt{display:none;background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:1px solid var(--vscode-panel-border);border-radius:3px;padding:2px 8px;cursor:pointer;font-size:10px;font-weight:600;white-space:nowrap}
.rec-cvt:hover{background:var(--vscode-button-secondaryHoverBackground);border-color:var(--vscode-focusBorder)}
.rec-cvt-add{color:#3fb950;border-color:rgba(63,185,80,.4)}
.rec-cvt-add:hover{background:rgba(63,185,80,.15);color:#56c76a;border-color:#3fb950}
.rec-cvt-remove{color:#f85149;border-color:rgba(248,81,73,.4)}
.rec-cvt-remove:hover{background:rgba(248,81,73,.15);color:#ff6e67;border-color:#f85149}
#panel-recents.edit-mode .rec-cvt{display:inline-block}
.rec-add-tile{display:none;width:100%;margin-top:8px;padding:8px 10px;border-radius:4px;border:1px dashed var(--vscode-panel-border);background:transparent;color:var(--vscode-descriptionForeground);cursor:pointer;font-family:inherit;font-size:12px;font-weight:600;text-align:center;transition:border-color .12s,color .12s,background .12s}
.rec-add-tile:hover{border-color:var(--vscode-focusBorder);color:var(--vscode-editor-foreground);background:var(--vscode-list-hoverBackground)}
#panel-recents.edit-mode .rec-add-tile{display:block}

/* Browse All */
#panel-browse{grid-column:1/-1}
#browse-toggle{display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--vscode-descriptionForeground)}
#browse-toggle:hover{color:var(--vscode-editor-foreground)}
#browse-arrow{font-size:10px;transition:transform .15s}
#browse-arrow.open{transform:rotate(90deg)}
#browse-body{display:none;margin-top:12px;columns:3;column-gap:20px}
#browse-body.open{display:block}
#browse-search-wrap{margin-top:8px;display:none}
#browse-search-wrap.open{display:block}
#browse-search{width:100%;padding:5px 10px;border:1px solid var(--vscode-panel-border);border-radius:4px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);font-family:inherit;font-size:12px;outline:none;box-sizing:border-box}
#browse-search:focus{border-color:var(--vscode-focusBorder)}
#browse-search::placeholder{color:var(--vscode-input-placeholderForeground)}
#browse-no-match{display:none;font-size:12px;color:var(--vscode-descriptionForeground);padding:8px 0}
.browse-group{break-inside:avoid;margin-bottom:14px}
.browse-group-hd{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--vscode-descriptionForeground);margin-bottom:5px;border-bottom:1px solid var(--vscode-panel-border);padding-bottom:3px}
.browse-item{display:flex;align-items:baseline;gap:6px;margin-bottom:3px;flex-wrap:wrap}
.browse-link{background:none;border:none;color:var(--vscode-textLink-foreground);cursor:pointer;font-size:12px;font-family:inherit;padding:0;text-align:left}
.browse-link:hover{text-decoration:underline}
.browse-desc{font-size:10px;color:var(--vscode-descriptionForeground)}

/* Home search bar */
#home-search-wrap{padding:10px 20px 0;background:var(--vscode-sideBar-background);border-bottom:1px solid var(--vscode-panel-border)}
#home-search{width:100%;padding:7px 12px;border:1px solid var(--vscode-panel-border);border-radius:4px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);font-family:inherit;font-size:13px;outline:none;box-sizing:border-box}
#home-search:focus{border-color:var(--vscode-focusBorder)}
#home-search::placeholder{color:var(--vscode-input-placeholderForeground)}
#home-results{position:relative;z-index:200}
#home-results-list{display:none;position:absolute;left:20px;right:20px;top:0;background:var(--vscode-editorWidget-background);border:1px solid var(--vscode-focusBorder);border-radius:0 0 6px 6px;box-shadow:0 6px 24px rgba(0,0,0,.45);max-height:340px;overflow-y:auto}
.hr-item{display:flex;align-items:baseline;gap:8px;padding:7px 14px;cursor:pointer;font-size:12px;border-bottom:1px solid var(--vscode-panel-border)}
.hr-item:last-child{border-bottom:none}
.hr-item:hover,.hr-item.active{background:var(--vscode-list-hoverBackground)}
.hr-label{font-weight:600;color:var(--vscode-editor-foreground);flex-shrink:0}
.hr-group{font-size:10px;color:var(--vscode-descriptionForeground);flex-shrink:0}
.hr-desc{font-size:10px;color:var(--vscode-descriptionForeground);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
#home-results-none{display:none;padding:10px 14px;font-size:12px;color:var(--vscode-descriptionForeground)}

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

@media (max-width: 1200px){
  #body{grid-template-columns:minmax(14rem,.95fr) minmax(0,1.35fr)}
}

@media (max-width: 940px){
  #body{grid-template-columns:1fr}
  #panel-history,#panel-recents,#panel-browse{grid-column:1}
}
`;

    // ── JS ────────────────────────────────────────────────────────────────────
    const js = `
(function(){
var ALL_CMDS = ${allCmdsJson};

// Home search
var homeSearch   = document.getElementById('home-search');
var resultsList  = document.getElementById('home-results-list');
var resultsNone  = document.getElementById('home-results-none');
var activeIdx    = -1;

function renderResults(q) {
  q = q.toLowerCase().trim();
  resultsList.querySelectorAll('.hr-item').forEach(function(el) { el.remove(); });
  resultsNone.style.display = 'none';
  if (!q) { resultsList.style.display = 'none'; activeIdx = -1; return; }
  var matches = ALL_CMDS.filter(function(c) {
    return c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q);
  }).slice(0, 18);
  if (matches.length === 0) {
    resultsNone.style.display = 'block';
    resultsList.style.display = 'block';
    activeIdx = -1;
    return;
  }
  matches.forEach(function(c, i) {
    var div = document.createElement('div');
    div.className = 'hr-item';
    div.dataset.cmd = c.cmd;
    div.dataset.idx = i;
    div.innerHTML = '<span class="hr-label">' + esc(c.label) + '</span>'
      + '<span class="hr-group">' + esc(c.group) + '</span>'
      + (c.desc ? '<span class="hr-desc">' + esc(c.desc) + '</span>' : '');
    div.addEventListener('mousedown', function(e) {
      e.preventDefault();
      runSearchResult(c.cmd);
    });
    resultsList.insertBefore(div, resultsNone);
  });
  resultsList.style.display = 'block';
  activeIdx = -1;
}

function setActive(idx) {
  var items = resultsList.querySelectorAll('.hr-item');
  items.forEach(function(el, i) { el.classList.toggle('active', i === idx); });
  activeIdx = idx;
}

function runSearchResult(cmd) {
  homeSearch.value = '';
  resultsList.style.display = 'none';
  activeIdx = -1;
  vsc.postMessage({ type:'runCommand', command:cmd });
}

function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

homeSearch.addEventListener('input', function() { renderResults(homeSearch.value); });
homeSearch.addEventListener('blur',  function() { setTimeout(function(){ resultsList.style.display='none'; activeIdx=-1; },150); });
homeSearch.addEventListener('focus', function() { if (homeSearch.value.trim()) renderResults(homeSearch.value); });
homeSearch.addEventListener('keydown', function(e) {
  var items = resultsList.querySelectorAll('.hr-item');
  if (!items.length) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); setActive(Math.min(activeIdx+1, items.length-1)); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(activeIdx-1, 0)); }
  else if (e.key === 'Enter') {
    e.preventDefault();
    if (activeIdx >= 0 && items[activeIdx]) { runSearchResult(items[activeIdx].dataset.cmd); }
    else if (items.length > 0) { runSearchResult(items[0].dataset.cmd); }
  }
  else if (e.key === 'Escape') { resultsList.style.display='none'; homeSearch.value=''; activeIdx=-1; }
});

// Live MCP badge updates pushed from the extension host.
function updateBadgeInteractivity(badge) {
  var isOff = badge.classList.contains('mcp-off');
  badge.title = isOff ? 'Click to start MCP server' : 'MCP server is running';
}
window.addEventListener('message', function(e) {
  var msg = e.data;
  if (!msg) { return; }
  if (msg.type === 'mcpStatus') {
    var badge = document.getElementById('mcp-badge');
    if (!badge) { return; }
    badge.className = 'mcp-badge ' + (msg.status === 'up' ? 'mcp-on' : 'mcp-off');
    var lbl = badge.querySelector('.mcp-label');
    if (lbl) { lbl.textContent = 'MCP ' + (msg.status === 'up' ? 'Running' : 'Stopped'); }
    updateBadgeInteractivity(badge);
  } else if (msg.type === 'dcStatus') {
    var dcBadge = document.getElementById('dc-badge');
    if (!dcBadge) { return; }
    var up = msg.status === 'up';
    dcBadge.className = 'mcp-badge dc-badge ' + (up ? 'dc-on' : 'dc-off');
    dcBadge.title = up ? 'DiskCleanUp backend is running — click to open dashboard' : 'DiskCleanUp backend is stopped — click to start';
    var dcLbl = dcBadge.querySelector('.mcp-label');
    if (dcLbl) { dcLbl.textContent = 'DiskCleanUp ' + (up ? 'Running' : 'Stopped'); }
  } else if (msg.type === 'devServerStatus') {
    var devBadge = document.getElementById('devserver-badge');
    if (!devBadge) { return; }
    var devUp = msg.status === 'up';
    devBadge.className = 'mcp-badge devserver-badge ' + (devUp ? 'mcp-on' : 'mcp-off');
    devBadge.title = devUp ? "This project's dev server is running — click Start to open it" : "This project's dev server is stopped — click Start to launch it";
    var devLbl = devBadge.querySelector('.mcp-label');
    if (devLbl) { devLbl.textContent = 'Dev Server ' + (devUp ? 'Running' : 'Stopped'); }
  } else if (msg.type === 'metrics') {
    var memBar = document.getElementById('mg-mem-bar');
    var memVal = document.getElementById('mg-mem-val');
    var cpuBar = document.getElementById('mg-cpu-bar');
    var cpuVal = document.getElementById('mg-cpu-val');
    if (memBar) { memBar.style.width = msg.memPct + '%'; }
    if (memVal) { memVal.textContent = msg.memPct + '%'; }
    if (cpuBar) { cpuBar.style.width = msg.cpuPct + '%'; }
    if (cpuVal) { cpuVal.textContent = msg.cpuPct + '%'; }
  } else if (msg.type === 'flash') {
    document.body.classList.remove('cvs-flash');
    void document.body.offsetWidth;
    document.body.classList.add('cvs-flash');
  }
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

// DiskCleanUp badge click — start when stopped, open dashboard when running
var dcBadge = document.getElementById('dc-badge');
if (dcBadge) {
  dcBadge.addEventListener('click', function() {
    vsc.postMessage({ type: 'startDiskCleanUp' });
  });
}

// Quick launch
document.querySelectorAll('.ql-btn').forEach(function(b){
  b.addEventListener('click',function(){ vsc.postMessage({ type:'runCommand', command:b.dataset.cmd }); });
});

// History re-run
document.querySelectorAll('.hist-rerun').forEach(function(b){
  b.addEventListener('click',function(){
    vsc.postMessage({
      type:'runCommand',
      command:b.dataset.cmd,
      previewMode:b.dataset.preview === 'true'
    });
  });
});

// Recent project click - skip current AND skip when in edit mode
document.querySelectorAll('.rec-card:not(.rec-current)').forEach(function(c){
  c.addEventListener('click',function(e){
    // In edit mode, card body clicks do nothing - use × to remove, Send Path stays active via its own stopPropagation.
    if (document.getElementById('panel-recents').classList.contains('edit-mode')) { return; }
    // Ignore clicks on interactive children (Send Path, ×, badges).
    if (e.target.closest('button,.rec-badge')) { return; }
    vsc.postMessage({ type:'openFolder', path:c.dataset.path });
  });
});

// Edit-mode toggle + remove + add-folder wiring for the Recent Projects panel.
var recPanel     = document.getElementById('panel-recents');
var editToggle   = document.getElementById('rec-edit-toggle');
var addTile      = document.getElementById('rec-add-tile');
if (editToggle && recPanel) {
  editToggle.addEventListener('click', function(){
    var nowEditing = recPanel.classList.toggle('edit-mode');
    editToggle.classList.toggle('active', nowEditing);
    editToggle.textContent = nowEditing ? 'Done' : 'Edit';
  });
}
document.querySelectorAll('.rec-remove').forEach(function(b){
  b.addEventListener('click', function(e){
    e.preventDefault();
    e.stopPropagation();
    var p = b.dataset.path;
    if (!p) { return; }
    vsc.postMessage({ type:'removeProject', path:p });
  });
});
// CVT registry toggle (visible only in edit mode).
// rec-cvt-add posts cvtRegistryAdd; rec-cvt-remove posts cvtRegistryRemove.
// Extension re-renders after the mutation so the button label flips automatically.
document.querySelectorAll('.rec-cvt').forEach(function(b){
  b.addEventListener('click', function(e){
    e.preventDefault();
    e.stopPropagation();
    var p    = b.dataset.path;
    var name = b.dataset.name;
    if (!p) { return; }
    var adding = b.classList.contains('rec-cvt-add');
    vsc.postMessage({
      type: adding ? 'cvtRegistryAdd' : 'cvtRegistryRemove',
      path: p,
      name: name
    });
  });
});
if (addTile) {
  addTile.addEventListener('click', function(e){
    e.preventDefault();
    e.stopPropagation();
    vsc.postMessage({ type:'addPinnedProject' });
  });
}

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

// Workspace path — click to open folder as CWD
var wsPathBtn = document.getElementById('ws-path');
if (wsPathBtn) {
  wsPathBtn.addEventListener('click', function() {
    var p = wsPathBtn.dataset ? wsPathBtn.dataset.path : '';
    if (p) { vsc.postMessage({ type:'openFolder', path:p }); }
  });
}

// Browse All toggle
var browseOpenPanel = document.getElementById('browse-open-panel');
if (browseOpenPanel) {
  browseOpenPanel.addEventListener('click', function(e) {
    e.stopPropagation();
    vsc.postMessage({ type: 'runCommand', command: 'cvs.commands.browseAll' });
  });
}

var browseToggle = document.getElementById('browse-toggle');
var browseBody   = document.getElementById('browse-body');
var browseArrow  = document.getElementById('browse-arrow');
browseToggle.addEventListener('click',function(){
  var open = browseBody.classList.toggle('open');
  browseArrow.classList.toggle('open', open);
  var swrap = document.getElementById('browse-search-wrap');
  if (swrap) { swrap.classList.toggle('open', open); }
  if (open) { var si = document.getElementById('browse-search'); if (si) { si.focus(); } }
});

// Browse All search/filter
var browseSearch  = document.getElementById('browse-search');
var browseNoMatch = document.getElementById('browse-no-match');
if (browseSearch) {
  browseSearch.addEventListener('input', function() {
    var q = browseSearch.value.toLowerCase().trim();
    var anyVis = false;
    document.querySelectorAll('.browse-group').forEach(function(grp) {
      var grpVis = false;
      grp.querySelectorAll('.browse-item').forEach(function(item) {
        var lbl  = item.querySelector('.browse-link')  ? item.querySelector('.browse-link').textContent.toLowerCase()  : '';
        var desc = item.querySelector('.browse-desc') ? item.querySelector('.browse-desc').textContent.toLowerCase() : '';
        var show = !q || lbl.includes(q) || desc.includes(q);
        item.style.display = show ? '' : 'none';
        if (show) { grpVis = true; anyVis = true; }
      });
      grp.style.display = grpVis ? '' : 'none';
    });
    if (browseNoMatch) { browseNoMatch.style.display = anyVis || !q ? 'none' : 'block'; }
  });
}

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
var btnStart = document.getElementById('btn-npm-start');
if (btnStart) {
  btnStart.addEventListener('click', function() {
    vsc.postMessage({ type: 'devServerAction' });
  });
}
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
    ${wsPath ? `<button id="ws-path" data-action="open-folder" data-path="${esc(wsPath)}" title="Change current working directory">${esc(wsPath)}</button>` : ''}
  </div>
  <div id="mcp-badge" class="mcp-badge ${mcpRunning ? 'mcp-on' : 'mcp-off'}">
    <span class="mcp-dot"></span>
    <span class="mcp-label">MCP ${mcpRunning ? 'Running' : 'Stopped'}</span>
  </div>
  <div id="dc-badge" class="mcp-badge dc-badge dc-unknown" title="Checking DiskCleanUp backend…">
    <span class="mcp-dot"></span>
    <span class="mcp-label">DiskCleanUp …</span>
  </div>
  ${hasStartScript ? `<div id="devserver-badge" class="mcp-badge devserver-badge mcp-off" title="Checking this project's dev server…">
    <span class="mcp-dot"></span>
    <span class="mcp-label">Dev Server …</span>
  </div>` : ''}
  <div id="metrics-gauge">
    <div class="mg-item">
      <span class="mg-label">RAM</span>
      <div class="mg-bar-wrap"><div id="mg-mem-bar" class="mg-bar mg-bar-mem" style="width:0%"></div></div>
      <span id="mg-mem-val" class="mg-val">\u2014</span>
    </div>
    <div class="mg-item">
      <span class="mg-label">CPU</span>
      <div class="mg-bar-wrap"><div id="mg-cpu-bar" class="mg-bar mg-bar-cpu" style="width:0%"></div></div>
      <span id="mg-cpu-val" class="mg-val">\u2014</span>
    </div>
  </div>
  <button id="btn-reload" title="Reload VS Code window">\uD83D\uDD04 Reload Window</button>
  <button id="btn-configure">\u2699\ufe0f Configure</button>
  ${hasStartScript ? `<button id="btn-npm-start" title="If this project's dev server is already running, opens it. Otherwise runs 'npm start' in a new terminal.">\u25B6 Start</button>` : ''}
</div>

<div id="home-search-wrap">
  <input id="home-search" type="text" placeholder="Search commands and plugins… (e.g. ErrorLog Viewer)" autocomplete="off" spellcheck="false">
</div>
<div id="home-results">
  <div id="home-results-list">
    <div id="home-results-none">No commands match.</div>
  </div>
</div>

<div id="body">

  <div id="quick-launch">${quickHtml}</div>

  <div class="panel" id="panel-history">
    <div class="panel-hd">\uD83D\uDD52 Recent Runs</div>
    ${histHtml}
  </div>

  <div class="panel" id="panel-recents">
    <div class="panel-hd panel-hd-split">
      <span>\uD83D\uDCC1 Recent Projects</span>
      <button id="rec-edit-toggle" class="panel-hd-btn" title="Add or remove folders">Edit</button>
    </div>
    ${recHtml}
    <button id="rec-add-tile" class="rec-add-tile" title="Pick any folder to pin to this list">+ Add Folder…</button>
  </div>

  <div class="panel" id="panel-browse">
    <div id="browse-toggle">
      <span id="browse-arrow">\u25b6</span>
      Browse All Commands
      <span style="font-weight:400;text-transform:none;letter-spacing:0;margin-left:4px">(${totalCmds})</span>
      <button id="browse-open-panel" data-cmd="cvs.commands.browseAll" style="margin-left:auto;font-size:10px;padding:1px 8px;border:1px solid var(--vscode-button-border,#444);border-radius:3px;background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);cursor:pointer" title="Open Browse All Commands in its own panel">Open in Panel \u2197</button>
    </div>
      <div id="browse-search-wrap">
        <input id="browse-search" type="text" placeholder="Filter commands\u2026" autocomplete="off" spellcheck="false">
      </div>
    <div id="browse-body">${browseHtml}</div>
      <div id="browse-no-match">No commands match your filter.</div>
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
