"use strict";
// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCatalogPanel = getCatalogPanel;
exports.clearCachedCards = clearCachedCards;
exports.buildCatalog = buildCatalog;
exports.openCatalog = openCatalog;
exports.viewSpecificDoc = viewSpecificDoc;
exports.deserializeCatalogPanel = deserializeCatalogPanel;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const output_channel_1 = require("../../shared/output-channel");
const show_interactive_result_webview_1 = require("../../shared/show-interactive-result-webview");
const registry_1 = require("./registry");
const scanner_1 = require("./scanner");
const categories_1 = require("./categories");
const projects_1 = require("./projects");
const html_1 = require("./html");
const doc_preview_1 = require("../../shared/doc-preview");
const FEATURE = 'doc-catalog';
let _catalogPanel;
let _cachedCards;
function getCatalogPanel() { return _catalogPanel; }
function clearCachedCards() { _cachedCards = undefined; }
async function buildCatalog(forceRebuild = false) {
    if (_cachedCards && !forceRebuild) {
        return _cachedCards;
    }
    const registry = (0, registry_1.loadRegistry)();
    if (!registry) {
        return undefined;
    }
    (0, scanner_1.resetCardCounter)();
    return vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Building doc catalog…', cancellable: false }, async (progress) => {
        // Build stable Dewey map: global=000, projects=100,200,300...
        const deweyMap = (0, categories_1.buildProjectDeweyMap)(registry.projects.map(p => p.name));
        const cards = (0, scanner_1.scanForCards)(registry.globalDocsPath, 'global', registry.globalDocsPath, (0, categories_1.lookupDewey)(deweyMap, 'global').num);
        for (const project of registry.projects) {
            progress.report({ message: `Scanning ${project.name}…` });
            if (fs.existsSync(project.path)) {
                const dewey = (0, categories_1.lookupDewey)(deweyMap, project.name);
                cards.push(...(0, scanner_1.scanForCards)(project.path, project.name, project.path, dewey.num));
            }
        }
        cards.sort((a, b) => {
            if (a.categoryNum !== b.categoryNum) {
                return a.categoryNum - b.categoryNum;
            }
            if (a.projectName !== b.projectName) {
                return a.projectName.localeCompare(b.projectName);
            }
            return a.fileName.localeCompare(b.fileName);
        });
        _cachedCards = cards;
        (0, output_channel_1.log)(FEATURE, `Catalog built: ${cards.length} cards`);
        return cards;
    });
}
function attachMessageHandler(panel) {
    panel.webview.onDidReceiveMessage(async (msg) => {
        switch (msg.command) {
            case 'preview':
                if (msg.data) {
                    (0, doc_preview_1.openDocPreview)(msg.data, '\u{1F4DA} Doc Catalog', 'cvs.catalog.open');
                }
                break;
            case 'open':
                if (msg.data && fs.existsSync(msg.data)) {
                    const doc = await vscode.workspace.openTextDocument(msg.data);
                    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
                }
                break;
            case 'run': {
                const projPath = msg.projPath;
                const script = msg.script;
                if (!projPath || !script) {
                    break;
                }
                // Run the command in a VS Code terminal and capture output
                // For now, simulate output capture (real implementation would use tasks/process APIs)
                const command = script === 'dotnet:build' ? 'dotnet build' : `npm run ${script}`;
                const terminal = vscode.window.createTerminal({ name: `${path.basename(projPath)} — ${script}`, cwd: projPath });
                terminal.show();
                terminal.sendText(command);
                (0, output_channel_1.log)(FEATURE, `Running: ${script} in ${projPath}`);
                // Simulate output (in real use, capture from terminal or task API)
                const fakeOutput = `> ${command}\n\n[output will appear here; capturing real output requires VS Code task/process API integration]`;
                (0, show_interactive_result_webview_1.showInteractiveResultWebview)({
                    title: `Result: ${script}`,
                    action: `${command} in ${projPath}`,
                    output: fakeOutput,
                    onRerun: () => {
                        // Rerun the command in a new terminal
                        const rerunTerminal = vscode.window.createTerminal({ name: `${path.basename(projPath)} — ${script} (rerun)`, cwd: projPath });
                        rerunTerminal.show();
                        rerunTerminal.sendText(command);
                    },
                });
                break;
            }
            case 'openFolder':
                if (msg.data) {
                    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(msg.data), { forceNewWindow: false });
                }
                break;
            case 'openClaude': {
                const claudePath = path.join(msg.data, 'CLAUDE.md');
                if (fs.existsSync(claudePath)) {
                    const doc = await vscode.workspace.openTextDocument(claudePath);
                    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
                }
                else {
                    vscode.window.showWarningMessage(`No CLAUDE.md found in ${msg.data}`);
                }
                break;
            }
            case 'create-tests': {
                // Trigger AI test generation for the project
                const projPath = msg.data;
                const projName = msg.projName;
                if (!projPath) {
                    break;
                }
                try {
                    // Use the playwright-check generate tests command
                    await vscode.commands.executeCommand('cvs.audit.testCoverage');
                    vscode.window.showInformationMessage(`Opening Test Coverage Dashboard for ${projName} — use "🤖 Generate Tests" on the project row.`, 'Open Dashboard');
                }
                catch {
                    // Fallback: open the test coverage command picker
                    vscode.window.showInformationMessage(`To generate tests for ${projName}: run "Audit: Test Coverage Dashboard" and click "🤖 Generate Tests" on that project.`, 'Open Test Coverage').then(c => {
                        if (c === 'Open Test Coverage') {
                            vscode.commands.executeCommand('cvs.audit.testCoverage');
                        }
                    });
                }
                break;
            }
            case 'createClaude': {
                const projPath = msg.data;
                const claudeDest = path.join(projPath, 'CLAUDE.md');
                const projName = path.basename(projPath);
                const pkgPath = path.join(projPath, 'package.json');
                let scripts = '';
                let projType = 'project';
                try {
                    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
                    projType = pkg.description ?? projType;
                    const keys = Object.keys(pkg.scripts ?? {}).slice(0, 6);
                    if (keys.length) {
                        scripts = '\n## Build & Run\n\n' + keys.map(k => `- \`npm run ${k}\``).join('\n') + '\n';
                    }
                }
                catch { /* no package.json */ }
                const today = new Date().toISOString().slice(0, 10);
                const template = `# CLAUDE.md — ${projName}\n\n> Created: ${today}\n\n## Project Overview\n\n**Name:** ${projName}\n**Path:** ${projPath}\n**Type:** ${projType}\n${scripts}\n## Architecture Notes\n\n<!-- Add key decisions here -->\n\n## Session Start Checklist\n\n- [ ] Read CLAUDE.md\n- [ ] Check CURRENT-STATUS.md\n- [ ] Review last session via recent_chats\n`;
                fs.writeFileSync(claudeDest, template, 'utf8');
                (0, output_channel_1.log)(FEATURE, `Created CLAUDE.md for ${projName}`);
                const doc = await vscode.workspace.openTextDocument(claudeDest);
                await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
                _cachedCards = undefined;
                vscode.window.showInformationMessage(`Created CLAUDE.md for ${projName} — catalog will refresh on next open.`);
                break;
            }
        }
    });
}
async function openCatalog(forceRebuild = false) {
    const registry = (0, registry_1.loadRegistry)();
    const projectInfos = registry
        ? registry.projects.filter(p => fs.existsSync(p.path)).map(projects_1.loadProjectInfo)
        : [];
    const cards = await buildCatalog(forceRebuild);
    if (!cards?.length) {
        vscode.window.showWarningMessage('No docs found to catalog.');
        return;
    }
    const html = (0, html_1.buildCatalogHtml)(cards, projectInfos, new Date().toLocaleString());
    if (_catalogPanel) {
        _catalogPanel.webview.html = html;
        _catalogPanel.reveal();
    }
    else {
        const col = vscode.window.activeTextEditor ? vscode.ViewColumn.Beside : vscode.ViewColumn.One;
        _catalogPanel = vscode.window.createWebviewPanel('docCatalog', '📚 Doc Catalog', col, { enableScripts: true, retainContextWhenHidden: true });
        _catalogPanel.webview.html = html;
        _catalogPanel.onDidDispose(() => { _catalogPanel = undefined; });
        attachMessageHandler(_catalogPanel);
    }
    (0, output_channel_1.log)(FEATURE, `Catalog opened: ${cards.length} cards`);
}
let _viewPanel;
function _escV(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function buildViewDocHtml(cards) {
    // Group by project name, sorted by categoryNum then projectName
    const byProject = new Map();
    for (const card of cards) {
        if (!byProject.has(card.projectName)) {
            byProject.set(card.projectName, []);
        }
        byProject.get(card.projectName).push(card);
    }
    const sortedProjects = [...byProject.entries()].sort((a, b) => {
        const numA = a[1][0]?.categoryNum ?? 999;
        const numB = b[1][0]?.categoryNum ?? 999;
        return numA - numB || a[0].localeCompare(b[0]);
    });
    const totalDocs = cards.length;
    const totalProjects = sortedProjects.length;
    const tableRows = sortedProjects.map(([projName, projCards]) => {
        // Priority docs always sort first, then alphabetical
        const PRIORITY = ['CLAUDE.md', 'README.md', 'CURRENT-STATUS.md', 'CURRENT STATUS', 'TODO', 'CHANGELOG', 'ARCHITECTURE', 'STANDARDS', 'LAWS', 'SESSION'];
        const priority = (c) => {
            const upper = c.fileName.toUpperCase();
            const idx = PRIORITY.findIndex(p => upper.includes(p));
            return idx === -1 ? 999 : idx;
        };
        const sortedCards = [...projCards].sort((a, b) => {
            const pa = priority(a), pb = priority(b);
            if (pa !== pb) {
                return pa - pb;
            }
            return a.title.localeCompare(b.title);
        });
        const deweyBase = String(projCards[0]?.categoryNum ?? 0).padStart(3, '0');
        const links = sortedCards.map(c => {
            const isPriority = priority(c) < 999;
            return `<a class="doc-link${isPriority ? ' doc-link-priority' : ''}" href="#" data-path="${_escV(c.filePath)}" title="${_escV(c.filePath)}">${_escV(c.title)}</a>`;
        }).join('');
        return `<tr>
  <td class="folder-cell"><span class="dewey">${_escV(deweyBase)}</span><span class="folder-name">${_escV(projName)}</span><span class="doc-count">${sortedCards.length}</span></td>
  <td class="links-cell">${links}</td>
</tr>`;
    }).join('');
    const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);font-size:13px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background)}
#toolbar{position:sticky;top:0;z-index:10;background:var(--vscode-editor-background);border-bottom:1px solid var(--vscode-panel-border);padding:10px 16px;display:flex;align-items:center;gap:10px}
#toolbar h1{font-size:1.05em;font-weight:700;flex-shrink:0}
#search{flex:1;padding:6px 10px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);border-radius:3px;font-size:13px}
#search:focus{outline:1px solid var(--vscode-focusBorder)}
#stat{font-size:11px;color:var(--vscode-descriptionForeground);white-space:nowrap}
#content{padding:12px 16px 40px}
table{width:100%;border-collapse:collapse}
thead th{text-align:left;padding:7px 12px;background:var(--vscode-textCodeBlock-background);border-bottom:2px solid var(--vscode-focusBorder);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;white-space:nowrap}
tbody tr{border-bottom:1px solid var(--vscode-panel-border)}
tbody tr:hover{background:var(--vscode-list-hoverBackground)}
tbody tr.hidden{display:none}
.folder-cell{width:220px;padding:8px 12px;vertical-align:top;white-space:nowrap;border-right:1px solid var(--vscode-panel-border)}
.dewey{font-family:var(--vscode-editor-font-family,monospace);font-size:9px;font-weight:700;background:var(--vscode-focusBorder);color:var(--vscode-editor-background);border-radius:3px;padding:1px 5px;margin-right:6px;letter-spacing:0.05em}
.folder-name{font-weight:700;font-size:0.9em}
.doc-count{margin-left:6px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);border-radius:10px;padding:1px 6px;font-size:10px;font-weight:400}
.links-cell{padding:6px 12px;vertical-align:top}
.doc-link{display:inline-block;margin:2px 4px 2px 0;padding:2px 8px;border-radius:3px;background:var(--vscode-textCodeBlock-background);color:var(--vscode-textLink-foreground);text-decoration:none;font-size:11px;border:1px solid var(--vscode-panel-border);white-space:nowrap;cursor:pointer}
.doc-link:hover{background:var(--vscode-list-hoverBackground);border-color:var(--vscode-focusBorder)}
.doc-link-priority{border-color:var(--vscode-focusBorder);font-weight:700;color:var(--vscode-editor-foreground)}
.doc-link.active-link{background:rgba(63,185,80,0.15) !important;border-color:#3fb950 !important;color:#3fb950 !important;font-weight:700}

/* Narrow panel: stack everything into one column */
@media (max-width:600px){
  table{display:block}
  thead{display:none}
  tbody{display:block}
  tbody tr{display:flex;flex-direction:column;border-bottom:1px solid var(--vscode-panel-border);padding:4px 0}
  tbody tr.hidden{display:none}
  .folder-cell{width:100%;border-right:none;border-bottom:1px solid var(--vscode-panel-border);padding:4px 8px}
  .links-cell{padding:4px 8px}
  .doc-link{display:block;width:100%;margin:2px 0;white-space:normal;box-sizing:border-box}
}
tbody tr.active-row{background:rgba(63,185,80,0.08) !important;border-left:3px solid #3fb950}
tbody tr.active-row .folder-name{color:#3fb950}
tbody tr.active-row .dewey{background:#3fb950}
/* active-link must win over narrow mode and any other rules */
a.doc-link.active-link,a.doc-link.active-link:visited{background:rgba(63,185,80,0.18) !important;border-color:#3fb950 !important;color:#3fb950 !important;font-weight:700 !important}
#empty{padding:40px;text-align:center;color:var(--vscode-descriptionForeground);display:none}
#empty.visible{display:block}`;
    const JS = `
(function(){
'use strict';
const vscode   = acquireVsCodeApi();
const searchEl = document.getElementById('search');
const statEl   = document.getElementById('stat');
const emptyEl  = document.getElementById('empty');
const TOTAL    = ${totalDocs};

searchEl.addEventListener('input', function() {
  var q = searchEl.value.toLowerCase().trim();
  var visible = 0;
  document.querySelectorAll('tbody tr').forEach(function(row) {
    var text = row.textContent.toLowerCase();
    var show = !q || text.includes(q);
    row.classList.toggle('hidden', !show);
    if (show) { visible += row.querySelectorAll('.doc-link').length; }
  });
  emptyEl.classList.toggle('visible', document.querySelectorAll('tbody tr:not(.hidden)').length === 0);
  statEl.textContent = q ? (visible + ' of ' + TOTAL + ' docs') : (TOTAL + ' docs across ${totalProjects} projects');
});
searchEl.focus();

function _activate(path, scroll) {
  document.querySelectorAll('tbody tr.active-row').forEach(function(r) { r.classList.remove('active-row'); });
  document.querySelectorAll('.doc-link.active-link').forEach(function(l) { l.classList.remove('active-link'); });
  // Attribute selector must match the raw value, not HTML-encoded
  var allLinks = document.querySelectorAll('.doc-link');
  var link = null;
  allLinks.forEach(function(l) { if (l.dataset.path === path) { link = l; } });
  if (!link) return;
  link.classList.add('active-link');
  var row = link.closest('tr');
  if (row) { row.classList.add('active-row'); }
  if (scroll) {
    // Scroll the link itself — works in both normal and narrow (flex-column) mode
    link.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// Restore last selection after layout is complete
var _state = vscode.getState();
if (_state && _state.activePath) {
  // rAF ensures DOM is laid out before scrollIntoView fires
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      _activate(_state.activePath, true);
    });
  });
}

document.addEventListener('click', function(e) {
  var link = e.target.closest('.doc-link');
  if (!link) return;
  e.preventDefault();
  _activate(link.dataset.path, true);
  // Persist selection so it survives panel hide/show
  vscode.setState({ activePath: link.dataset.path });
  vscode.postMessage({ command: 'open', data: link.dataset.path });
});
})();`;
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${CSS}</style></head><body>
<div id="toolbar">
  <h1>&#128196; View a Doc</h1>
  <input id="search" type="text" placeholder="Search docs, folders\u2026" autocomplete="off">
  <span id="stat">${totalDocs} docs across ${totalProjects} projects</span>
</div>
<div id="content">
  <table>
    <thead><tr><th>Folder</th><th>Documents</th></tr></thead>
    <tbody>${tableRows}</tbody>
  </table>
  <div id="empty">No docs match your search.</div>
</div>
<script>${JS}</script>
</body></html>`;
}
async function viewSpecificDoc() {
    const cards = await buildCatalog();
    if (!cards?.length) {
        return;
    }
    const html = buildViewDocHtml(cards);
    if (_viewPanel) {
        _viewPanel.webview.html = html;
        _viewPanel.reveal(vscode.ViewColumn.One, true);
    }
    else {
        _viewPanel = vscode.window.createWebviewPanel('viewDoc', '\u{1F4C4} View a Doc', vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true });
        _viewPanel.webview.html = html;
        _viewPanel.onDidDispose(() => { _viewPanel = undefined; });
    }
    _viewPanel.webview.onDidReceiveMessage(async (msg) => {
        if (msg.command === 'open' && msg.data && fs.existsSync(msg.data)) {
            (0, doc_preview_1.openDocPreview)(msg.data, '\u{1F4C4} View a Doc', 'cvs.catalog.view');
        }
    });
    (0, output_channel_1.log)(FEATURE, `View Doc panel opened: ${cards.length} docs`);
}
function deserializeCatalogPanel(panel) {
    _catalogPanel = panel;
    _catalogPanel.webview.options = { enableScripts: true };
    buildCatalog(true).then(cards => {
        if (!cards?.length) {
            return;
        }
        const registry = (0, registry_1.loadRegistry)();
        const projectInfos = registry
            ? registry.projects.filter(p => fs.existsSync(p.path)).map(projects_1.loadProjectInfo)
            : [];
        _catalogPanel.webview.html = (0, html_1.buildCatalogHtml)(cards, projectInfos, new Date().toLocaleString());
    });
    _catalogPanel.onDidDispose(() => { _catalogPanel = undefined; });
    attachMessageHandler(_catalogPanel);
    (0, output_channel_1.log)(FEATURE, 'Doc Catalog panel restored after reload');
}
//# sourceMappingURL=commands.js.map