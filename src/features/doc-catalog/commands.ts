// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import { log } from '../../shared/output-channel';
import { loadRegistry } from './registry';
import { scanForCards, resetCardCounter } from './scanner';
import { buildProjectDeweyMap, lookupDewey } from './categories';
import { loadProjectInfo } from './projects';
import { buildCatalogHtml, buildCatalogInitPayload } from './html';
import { openDocPreview } from '../../shared/doc-preview';
import { mdToHtml } from '../../shared/md-renderer';
import { getNonce } from '../../shared/webview-utils';
import { loadArchivedPaths, loadArchiveEntries, archiveDoc, restoreDoc } from './archive';
import type { CatalogCard } from './types';

const FEATURE = 'doc-catalog';

let _catalogPanel: vscode.WebviewPanel | undefined;
let _cachedCards: CatalogCard[] | undefined;

type RegistryEntry = { name: string; path: string; type: string; description: string };
let _pendingInitCards: CatalogCard[] = [];
let _pendingInitProjectInfos: ReturnType<typeof loadProjectInfo>[] = [];
let _pendingInitRegistryEntries: RegistryEntry[] = [];

export function getCatalogPanel(): vscode.WebviewPanel | undefined { return _catalogPanel; }
export function clearCachedCards(): void { _cachedCards = undefined; }

function isCurrentWorkspacePath(folderPath: string): boolean {
    const target = path.resolve(folderPath).toLowerCase();
    const folders = vscode.workspace.workspaceFolders ?? [];
    return folders.some((wf) => path.resolve(wf.uri.fsPath).toLowerCase() === target);
}

async function openProjectFolderSmart(folderPath: string): Promise<void> {
    const target = path.resolve(folderPath);
    if (isCurrentWorkspacePath(target)) {
        await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(target));
        return;
    }
    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(target), false);
}

function sendCatalogInit(
    panel: vscode.WebviewPanel,
    cards: CatalogCard[],
    projectInfos: ReturnType<typeof loadProjectInfo>[],
    registryEntries: Array<{ name: string; path: string; type: string; description: string }>
): void {
    const payload = buildCatalogInitPayload(cards, projectInfos, new Date().toLocaleString(), registryEntries);
    void panel.webview.postMessage({ command: 'init', ...payload });
}

export async function buildCatalog(forceRebuild = false): Promise<CatalogCard[] | undefined> {
    if (_cachedCards && !forceRebuild) { return _cachedCards; }
    const registry = loadRegistry();
    if (!registry) { return undefined; }
    resetCardCounter();
    return vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Building doc catalog\u2026', cancellable: false },
        async (progress) => {
            const deweyMap = buildProjectDeweyMap(registry.projects.map(p => p.name));
            const archivedPaths = loadArchivedPaths();
            const cards: CatalogCard[] = scanForCards(
                registry.globalDocsPath, 'global', registry.globalDocsPath,
                lookupDewey(deweyMap, 'global').num, 3, archivedPaths
            );
            for (const project of registry.projects) {
                progress.report({ message: `Scanning ${project.name}\u2026` });
                if (fs.existsSync(project.path)) {
                    const dewey = lookupDewey(deweyMap, project.name);
                    cards.push(...scanForCards(project.path, project.name, project.path, dewey.num, 3, archivedPaths));
                }
            }
            cards.sort((a, b) => {
                if (a.categoryNum !== b.categoryNum) { return a.categoryNum - b.categoryNum; }
                if (a.projectName !== b.projectName) { return a.projectName.localeCompare(b.projectName); }
                return a.fileName.localeCompare(b.fileName);
            });
            _cachedCards = cards;
            log(FEATURE, `Catalog built: ${cards.length} cards`);
            return cards;
        }
    ) as unknown as CatalogCard[];
}

// ---------------------------------------------------------------------------
// rebuildCatalog
// ---------------------------------------------------------------------------
let _rebuildPanel: vscode.WebviewPanel | undefined;

function _rbEsc(s: string): string {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function buildRebuildSummaryHtml(
    cards: CatalogCard[],
    elapsedMs: number,
    projectCounts: Array<{ name: string; count: number; dewey: string }>,
    rebuiltAt: string
): string {
    const nonce = getNonce();
    const totalDocs     = cards.length;
    const totalProjects = projectCounts.length;
    const elapsedSec    = (elapsedMs / 1000).toFixed(2);
    const projectRows   = projectCounts.map(p =>
        `<tr><td class="rb-dw">${_rbEsc(p.dewey)}</td><td class="rb-nm">${_rbEsc(p.name)}</td><td class="rb-ct">${p.count}</td></tr>`
    ).join('');
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';"><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);font-size:13px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);padding:20px 24px}
.rb-title{font-size:1.35em;font-weight:800;margin-bottom:4px}.rb-title span{color:var(--vscode-button-background)}
.rb-meta{font-size:11px;color:var(--vscode-descriptionForeground);margin-bottom:18px}
.rb-ok{display:flex;align-items:center;gap:8px;padding:10px 14px;background:rgba(63,185,80,0.08);border:1px solid rgba(63,185,80,0.25);border-radius:4px;margin-bottom:18px;font-size:12px;font-weight:600;color:#3fb950}
.rb-ok::before{content:"";display:inline-block;width:8px;height:8px;border-radius:50%;background:#3fb950;flex-shrink:0}
.rb-stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-bottom:18px}
.rb-stat{background:var(--vscode-textCodeBlock-background);border:1px solid var(--vscode-panel-border);border-radius:4px;padding:10px 14px}
.rb-stat-n{font-size:1.75em;font-weight:800;color:var(--vscode-button-background);line-height:1}
.rb-stat-l{font-size:11px;color:var(--vscode-descriptionForeground);margin-top:3px}
.rb-tbl{margin-bottom:18px;max-height:320px;overflow-y:auto;border:1px solid var(--vscode-panel-border);border-radius:4px}
table{width:100%;border-collapse:collapse}
thead th{position:sticky;top:0;background:var(--vscode-textCodeBlock-background);padding:6px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--vscode-descriptionForeground);border-bottom:1px solid var(--vscode-panel-border)}
tbody tr{border-bottom:1px solid var(--vscode-panel-border)}tbody tr:last-child{border-bottom:none}tbody tr:hover{background:var(--vscode-list-hoverBackground)}
.rb-dw{padding:5px 10px;font-family:monospace;font-size:9px;font-weight:700;color:var(--vscode-textLink-foreground);width:70px}
.rb-nm{padding:5px 10px;font-weight:500;font-size:12px}
.rb-ct{padding:5px 10px;text-align:right;font-family:monospace;font-size:12px;color:var(--vscode-descriptionForeground);width:55px}
.rb-btns{display:flex;gap:8px;flex-wrap:wrap}
.btn-p{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;padding:7px 18px;border-radius:3px;cursor:pointer;font-size:13px;font-weight:600}
.btn-p:hover{background:var(--vscode-button-hoverBackground)}
.btn-s{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;padding:7px 18px;border-radius:3px;cursor:pointer;font-size:13px;font-weight:600}
.btn-s:hover{background:var(--vscode-button-secondaryHoverBackground)}
</style></head><body>
<div class="rb-title">&#128201; Doc Catalog <span>Rebuilt</span></div>
<div class="rb-meta">Completed at ${_rbEsc(rebuiltAt)}</div>
<div class="rb-ok">Full rescan complete &mdash; catalog is up to date</div>
<div class="rb-stats">
  <div class="rb-stat"><div class="rb-stat-n">${totalDocs}</div><div class="rb-stat-l">Total docs</div></div>
  <div class="rb-stat"><div class="rb-stat-n">${totalProjects}</div><div class="rb-stat-l">Projects scanned</div></div>
  <div class="rb-stat"><div class="rb-stat-n">${elapsedSec}s</div><div class="rb-stat-l">Time to rebuild</div></div>
</div>
<div class="rb-tbl"><table>
  <thead><tr><th>Dewey</th><th>Project</th><th style="text-align:right">Docs</th></tr></thead>
  <tbody>${projectRows}</tbody>
</table></div>
<div class="rb-btns">
  <button class="btn-p" id="btn-open">&#128218; Open Doc Catalog</button>
  <button class="btn-s" id="btn-again">&#8635; Rebuild Again</button>
</div>
<script nonce="${nonce}">(function(){
var vs=acquireVsCodeApi();
document.getElementById('btn-open').addEventListener('click',function(){vs.postMessage({command:'open-catalog'});});
document.getElementById('btn-again').addEventListener('click',function(){vs.postMessage({command:'rebuild-again'});});
})();</script></body></html>`;
}

export async function rebuildCatalog(): Promise<void> {
    clearCachedCards();
    const registry = loadRegistry();
    if (!registry) { vscode.window.showWarningMessage('No registry found.'); return; }
    const startMs = Date.now();
    const cards   = await buildCatalog(true);
    const elapsed = Date.now() - startMs;
    if (!cards?.length) { vscode.window.showWarningMessage('Rebuild found no docs.'); return; }
    const projectMap = new Map<string, { count: number; dewey: string }>();
    for (const card of cards) {
        const existing = projectMap.get(card.projectName);
        const dewey    = String(card.categoryNum).padStart(3, '0');
        if (existing) { existing.count++; }
        else          { projectMap.set(card.projectName, { count: 1, dewey }); }
    }
    const projectCounts = [...projectMap.entries()]
        .sort((a, b) => Number(a[1].dewey) - Number(b[1].dewey))
        .map(([name, { count, dewey }]) => ({ name, count, dewey }));
    const html  = buildRebuildSummaryHtml(cards, elapsed, projectCounts, new Date().toLocaleTimeString());
    const title = '\u{1F4CA} Catalog Rebuilt';
    if (_rebuildPanel) {
        _rebuildPanel.title        = title;
        _rebuildPanel.webview.html = html;
        _rebuildPanel.reveal(vscode.ViewColumn.Beside, true);
    } else {
        _rebuildPanel = vscode.window.createWebviewPanel(
            'catalogRebuild', title,
            { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
            { enableScripts: true, retainContextWhenHidden: false }
        );
        _rebuildPanel.webview.html = html;
        _rebuildPanel.onDidDispose(() => { _rebuildPanel = undefined; });
    }
    _rebuildPanel.webview.onDidReceiveMessage(async msg => {
        if (msg.command === 'open-catalog')  { await openCatalog(false); }
        if (msg.command === 'rebuild-again') { await rebuildCatalog(); }
    });
    log(FEATURE, `Catalog rebuilt: ${cards.length} cards in ${elapsed}ms`);
}

// ---------------------------------------------------------------------------
// attachMessageHandler
// ---------------------------------------------------------------------------
function attachMessageHandler(panel: vscode.WebviewPanel): void {
    panel.webview.onDidReceiveMessage(async msg => {
        switch (msg.command) {
            case 'ready':
                sendCatalogInit(panel, _pendingInitCards, _pendingInitProjectInfos, _pendingInitRegistryEntries);
                break;
            case 'openProjectFolder':
                if (msg.data) { await openProjectFolderSmart(msg.data as string); }
                break;
            case 'open-npm-scripts':
                await vscode.commands.executeCommand('cvs.npm.showAndRunScripts');
                break;
            case 'preview':
                if (msg.data) { openDocPreview(msg.data, '\u{1F4DA} Doc Catalog', 'cvs.catalog.open'); }
                break;
            case 'open':
                if (msg.data && fs.existsSync(msg.data)) {
                    const doc = await vscode.workspace.openTextDocument(msg.data);
                    await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.Beside });
                }
                break;
            case 'run': {
                const projPath = msg.projPath as string;
                const script   = msg.script   as string;
                if (!projPath || !script) { break; }
                const command  = script === 'dotnet:build' ? 'dotnet build' : `npm run ${script}`;
                const terminal = vscode.window.createTerminal({ name: `${path.basename(projPath)} \u2014 ${script}`, cwd: projPath });
                terminal.show();
                terminal.sendText(command);
                log(FEATURE, `Running: ${script} in ${projPath}`);
                break;
            }
            case 'openFolder':
                if (msg.data) { await openProjectFolderSmart(msg.data as string); }
                break;
            case 'openClaude': {
                const claudePath = path.join(msg.data, 'CLAUDE.md');
                if (fs.existsSync(claudePath)) {
                    const doc = await vscode.workspace.openTextDocument(claudePath);
                    await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.Beside });
                } else {
                    vscode.window.showWarningMessage(`No CLAUDE.md found in ${msg.data}`);
                }
                break;
            }
            case 'create-tests': {
                const projPath = msg.data as string;
                const projName = msg.projName as string;
                if (!projPath) { break; }
                try {
                    await vscode.commands.executeCommand('cvs.audit.testCoverage');
                    vscode.window.showInformationMessage(`Opening Test Coverage Dashboard for ${projName} \u2014 use "\u{1F916} Generate Tests" on the project row.`, 'Open Dashboard');
                } catch {
                    vscode.window.showInformationMessage(`To generate tests for ${projName}: run "Audit: Test Coverage Dashboard" and click "\u{1F916} Generate Tests".`, 'Open Test Coverage')
                        .then(c => { if (c === 'Open Test Coverage') { vscode.commands.executeCommand('cvs.audit.testCoverage'); } });
                }
                break;
            }
            case 'createClaude': {
                const projPath   = msg.data as string;
                const claudeDest = path.join(projPath, 'CLAUDE.md');
                const projName   = path.basename(projPath);
                const pkgPath    = path.join(projPath, 'package.json');
                let scripts = '', projType = 'project';
                try {
                    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
                    projType  = pkg.description ?? projType;
                    const keys = Object.keys(pkg.scripts ?? {}).slice(0, 6);
                    if (keys.length) { scripts = '\n## Build & Run\n\n' + keys.map(k => `- \`npm run ${k}\``).join('\n') + '\n'; }
                } catch { /* no package.json */ }
                const today    = new Date().toISOString().slice(0, 10);
                const template = `# CLAUDE.md \u2014 ${projName}\n\n> Created: ${today}\n\n## Project Overview\n\n**Name:** ${projName}\n**Path:** ${projPath}\n**Type:** ${projType}\n${scripts}\n## Architecture Notes\n\n<!-- Add key decisions here -->\n\n## Session Start Checklist\n\n- [ ] Read CLAUDE.md\n- [ ] Check CURRENT-STATUS.md\n- [ ] Review last session via recent_chats\n`;
                fs.writeFileSync(claudeDest, template, 'utf8');
                log(FEATURE, `Created CLAUDE.md for ${projName}`);
                const doc = await vscode.workspace.openTextDocument(claudeDest);
                await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
                _cachedCards = undefined;
                vscode.window.showInformationMessage(`Created CLAUDE.md for ${projName} \u2014 catalog will refresh on next open.`);
                break;
            }
            case 'wb-demo': {
                // Ensure the wb-core demo server is running, then open the harness in the browser.
                // The harness at http://localhost:3000/wb-harness.html?md=<path>&name=<name>
                // fetches the markdown file, extracts HTML blocks, and runs WB.init live.
                const demoPort = 3000;
                const mdPath   = msg.data as string;
                const compName = (msg.name as string) || path.basename(mdPath, '.md');
                const harnessUrl = `http://localhost:${demoPort}/wb-harness.html?md=${encodeURIComponent(mdPath)}&name=${encodeURIComponent(compName)}`;

                // Check if the demo server is already up; if not, start it
                const net = require('net') as typeof import('net');
                const checkPort = (port: number): Promise<boolean> => new Promise(resolve => {
                    const sock = new net.Socket();
                    sock.setTimeout(500);
                    sock.once('connect', () => { sock.destroy(); resolve(true); });
                    sock.once('error',   () => { sock.destroy(); resolve(false); });
                    sock.once('timeout', () => { sock.destroy(); resolve(false); });
                    sock.connect(port, '127.0.0.1');
                });

                const serverUp = await checkPort(demoPort);
                if (!serverUp) {
                    // Start the demo server as a background process
                    const cp = require('child_process') as typeof import('child_process');
                    const wbCorePath = 'C:\\dev\\wb-core';
                    cp.spawn('node', ['demo-server.js'], {
                        cwd: wbCorePath,
                        detached: true,
                        stdio: 'ignore',
                    }).unref();
                    // Give it a moment to start
                    await new Promise(r => setTimeout(r, 1200));
                }

                await vscode.env.openExternal(vscode.Uri.parse(harnessUrl));
                log(FEATURE, `Demo opened: ${harnessUrl}`);
                break;
            }
            case 'rebuild-catalog': {
                clearCachedCards();
                await openCatalog(true);
                break;
            }
            case 'archive-doc': {
                const filePath   = msg.data as string;
                const docTitle   = msg.title as string;
                const projName   = msg.project as string;
                if (!filePath) { break; }
                archiveDoc(filePath, docTitle, projName);
                clearCachedCards();
                log(FEATURE, `Archived: ${filePath}`);
                // Remove card from webview without full reload
                void panel.webview.postMessage({ command: 'remove-card', filePath });
                break;
            }
            case 'copy-paths': {
                const paths = msg.paths as string[];
                if (!paths?.length) { break; }
                await vscode.env.clipboard.writeText(paths.join('\n'));
                vscode.window.showInformationMessage(`Copied ${paths.length} path${paths.length === 1 ? '' : 's'} to clipboard.`);
                log(FEATURE, `Clipboard: copied ${paths.length} path(s)`);
                break;
            }
        }
    });
}


export async function openCatalog(forceRebuild = false): Promise<void> {
    const registry     = loadRegistry();
    const projectInfos = registry ? registry.projects.filter(p => fs.existsSync(p.path)).map(loadProjectInfo) : [];
    const cards = await buildCatalog(forceRebuild);
    if (!cards?.length) { vscode.window.showWarningMessage('No docs found to catalog.'); return; }
    const html = buildCatalogHtml(cards, projectInfos, new Date().toLocaleString(), registry?.projects ?? []);
    _pendingInitCards           = cards;
    _pendingInitProjectInfos    = projectInfos;
    _pendingInitRegistryEntries = registry?.projects ?? [];
    const hadPanel = Boolean(_catalogPanel);
    if (_catalogPanel) {
        _catalogPanel.webview.html = html;
        _catalogPanel.reveal(vscode.ViewColumn.Beside);
    } else {
        _catalogPanel = vscode.window.createWebviewPanel('docCatalog', '\u{1F4DA} Doc Catalog', vscode.ViewColumn.Beside,
            { enableScripts: true, retainContextWhenHidden: true });
        _catalogPanel.webview.html = html;
        _catalogPanel.onDidDispose(() => { _catalogPanel = undefined; });
        attachMessageHandler(_catalogPanel);
    }
    if (hadPanel) {
        log(FEATURE, 'Catalog revealed');
    } else {
        log(FEATURE, 'Catalog opened');
    }
}

// ---------------------------------------------------------------------------
// viewSpecificDoc — opens in the system browser via a local HTTP server.
// No webview, no CSP, no document.write() bootstrap — just a real browser.
// ---------------------------------------------------------------------------
let _viewServer: http.Server | undefined;
let _viewServerPort: number | undefined;
let _viewDocPanel: vscode.WebviewPanel | undefined;

function showViewDocPanel(port: number): void {
        // Open the documentation server directly in the default browser.
        // All links work natively without webview/CSP constraints.
        const serverUrl = `http://127.0.0.1:${port}`;
        vscode.env.openExternal(vscode.Uri.parse(serverUrl));
        log(FEATURE, `View a Doc server running at ${serverUrl}`);
}

/** Call from extension deactivate to shut down the server cleanly. */
export function disposeViewServer(): void {
    _viewDocPanel?.dispose();
    _viewDocPanel = undefined;
    if (_viewServer) { _viewServer.close(); _viewServer = undefined; _viewServerPort = undefined; }
}

function _escV(s: string): string {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function rewriteDocLinks(html: string, filePath: string, port: number, backQ = ''): string {
    const dir = path.dirname(filePath);
    return html.replace(/href="([^"]*)"/g, (match, href) => {
        if (!href || href.startsWith('#') || /^(https?|vscode|mailto|data|ftp):/i.test(href)) {
            return match;
        }
        const resolved = path.resolve(dir, href);
        const qParam   = backQ ? `&q=${encodeURIComponent(backQ)}` : '';
        return `href="http://127.0.0.1:${port}/doc?path=${encodeURIComponent(resolved)}${qParam}"`;
    });
}

function buildDocPageHtml(filePath: string, rendered: string, port: number, backQ = ''): string {
    const fileName = path.basename(filePath);
    const dirParts = path.dirname(filePath).split(/[\\/]/).filter(Boolean);
    const breadcrumb = dirParts.map((seg, i) => `<span class="seg">${seg}</span><span class="sep">/</span>`).join('') + `<span class="seg cur">${fileName}</span>`;
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${fileName}</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><polygon points='50,5 61,35 95,35 68,57 79,91 50,70 21,91 32,57 5,35 39,35' fill='%230078d4'/></svg>">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#d4d4d4;background:#1e1e1e;display:flex;flex-direction:column;min-height:100vh}
#bar{display:flex;align-items:center;gap:10px;padding:8px 16px;background:#252526;border-bottom:1px solid #404040;flex-shrink:0}
#back{background:#2d2d2d;color:#9cdcfe;border:1px solid #555;border-radius:3px;padding:4px 12px;cursor:pointer;font-size:12px;text-decoration:none;white-space:nowrap}
#back:hover{background:#3c3c3c;border-color:#0078d4}
#copy-path{background:#2d2d2d;color:#858585;border:1px solid #555;border-radius:3px;padding:4px 10px;cursor:pointer;font-size:12px;white-space:nowrap}
#copy-path:hover{background:#3c3c3c;border-color:#0078d4;color:#d4d4d4}
#copy-path.copied{color:#3fb950;border-color:#3fb950;background:#2d2d2d}
#path{font-family:monospace;font-size:10px;color:#858585;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
.seg{color:#858585}.sep{color:#555;margin:0 2px}.cur{color:#d4d4d4;font-weight:700}
#content{flex:1;padding:24px 40px 64px;max-width:900px;width:100%;margin:0 auto}
h1,h2,h3,h4{margin:1.1em 0 .45em;line-height:1.3;font-weight:700}
h1{font-size:1.8em;border-bottom:2px solid #0078d4;padding-bottom:8px}
h2{font-size:1.3em;border-bottom:1px solid #404040;padding-bottom:4px}
h3{font-size:1.1em}h4{font-size:.95em;color:#858585}
p{margin:.55em 0;line-height:1.75}
blockquote{border-left:4px solid #0078d4;padding:6px 14px;margin:10px 0;background:#252526;border-radius:0 4px 4px 0;font-style:italic}
code{font-family:'Cascadia Code','Fira Code',Consolas,monospace;font-size:.87em;background:#2d2d2d;padding:1px 6px;border-radius:3px;border:1px solid #404040;color:#ce9178}
pre{background:#1f1f1f;border:1px solid #404040;border-radius:5px;padding:14px 16px;overflow-x:auto;margin:12px 0}
pre code{background:none;padding:0;font-size:12px;line-height:1.6;border:none;color:#d4d4d4}
li{margin:4px 0 4px 22px;line-height:1.65}ul,ol{margin:6px 0}
table{border-collapse:collapse;width:100%;margin:12px 0;font-size:13px}
td,th{border:1px solid #404040;padding:7px 12px;text-align:left}
th{background:#252526;font-weight:700;font-size:12px}
tr:nth-child(even) td{background:rgba(255,255,255,.03)}
hr{border:none;border-top:1px solid #404040;margin:18px 0}
a{color:#4ec9b0}a:hover{text-decoration:underline}
strong{font-weight:700}em{font-style:italic}del{opacity:.6;text-decoration:line-through}
img{max-width:100%;height:auto}
</style>
</head>
<body>
<div id="bar">
  <a id="back" href="http://127.0.0.1:${port}${backQ ? '?q=' + encodeURIComponent(backQ) : ''}">&#8592; View a Doc</a>
  <button id="copy-path" title="Copy file path to clipboard">&#128203; Copy Path</button>
  <div id="path">${breadcrumb}</div>
</div>
<div id="content">${rendered}</div>
<script>document.addEventListener('DOMContentLoaded',function(){if(window.hljs){hljs.highlightAll();}});
document.getElementById('copy-path').addEventListener('click',function(){
  var fp=${JSON.stringify(filePath)};
  navigator.clipboard.writeText(fp).then(function(){
    var btn=document.getElementById('copy-path');
    btn.textContent='\u2713 Copied';
    btn.classList.add('copied');
    setTimeout(function(){btn.innerHTML='&#128203; Copy Path';btn.classList.remove('copied');},2000);
  });
});
</script>
</body>
</html>`;
}

function buildViewDocBrowserHtml(cards: CatalogCard[], port: number): string {
    const byProject = new Map<string, CatalogCard[]>();
    for (const card of cards) {
        if (!byProject.has(card.projectName)) { byProject.set(card.projectName, []); }
        byProject.get(card.projectName)!.push(card);
    }
    const sortedProjects = [...byProject.entries()].sort((a, b) => {
        const numA = a[1][0]?.categoryNum ?? 999;
        const numB = b[1][0]?.categoryNum ?? 999;
        return numA - numB || a[0].localeCompare(b[0]);
    });
    const totalDocs     = cards.length;
    const totalProjects = sortedProjects.length;

    const PRIORITY = ['CLAUDE.MD','README.MD','CURRENT-STATUS.MD','CURRENT STATUS','TODO','CHANGELOG','ARCHITECTURE','STANDARDS','LAWS','SESSION'];
    const getPriority = (fileName: string) => {
        const upper = fileName.toUpperCase();
        const idx   = PRIORITY.findIndex(p => upper.includes(p));
        return idx === -1 ? 999 : idx;
    };

    // Index panel: one entry per doc link (no table rows — flat list grouped by project)
    const indexHtml = sortedProjects.map(([projName, projCards]) => {
        const sortedCards = [...projCards].sort((a, b) => {
            const pa = getPriority(a.fileName), pb = getPriority(b.fileName);
            if (pa !== pb) { return pa - pb; }
            return a.title.localeCompare(b.title);
        });
        const deweyBase   = String(projCards[0]?.categoryNum ?? 0).padStart(3, '0');
        const projectPath = projCards[0]?.projectPath || '';
        const links = sortedCards.map(c => {
            const pri = getPriority(c.fileName) < 999 ? ' pri' : '';
            return `<a class="doc-link${pri}" href="#" data-path="${_escV(c.filePath)}" title="${_escV(c.filePath)}">${_escV(c.title)}</a>`;
        }).join('');
        const folderBtn = projectPath
            ? `<button class="folder-btn" data-folder="${_escV(projectPath)}" title="Open project in VS Code">&#128194;</button>`
            : '';
        return `<div class="proj-group" data-proj="${_escV(projName)}">
  <div class="proj-hd"><span class="dw">${_escV(deweyBase)}</span><span class="fn">${_escV(projName)}</span>${folderBtn}<span class="cnt">${sortedCards.length}</span></div>
  <div class="proj-links">${links}</div>
</div>`;
    }).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>View a Doc</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><polygon points='50,5 61,35 95,35 68,57 79,91 50,70 21,91 32,57 5,35 39,35' fill='%230078d4'/></svg>">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;overflow:hidden}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;color:#d4d4d4;background:#1e1e1e;display:flex;flex-direction:column}

/* \u2500\u2500 Top bar \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
#topbar{display:flex;align-items:center;gap:10px;padding:7px 12px;background:#252526;border-bottom:1px solid #404040;flex-shrink:0;height:40px}
#topbar h1{font-size:.9em;font-weight:700;color:#d4d4d4;white-space:nowrap}
#search{flex:1;padding:4px 8px;background:#3c3c3c;color:#d4d4d4;border:1px solid #555;border-radius:3px;font-size:12px;font-family:inherit;outline:none}
#search:focus{border-color:#0078d4}
#stat{font-size:10px;color:#858585;white-space:nowrap}
#proj-filter{padding:3px 6px;background:#3c3c3c;color:#d4d4d4;border:1px solid #555;border-radius:3px;font-size:11px;font-family:inherit;outline:none;cursor:pointer;max-width:140px}
#proj-filter:focus{border-color:#0078d4}
#proj-filter option{background:#252526}

/* \u2500\u2500 Split layout \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
#split{display:flex;flex:1;overflow:hidden}

/* \u2500\u2500 Index panel (12vw) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
#index{width:12vw;min-width:140px;max-width:240px;background:#252526;border-right:1px solid #404040;overflow-y:auto;flex-shrink:0;display:flex;flex-direction:column}
.proj-group{}
.proj-hd{display:flex;align-items:center;gap:4px;padding:6px 8px 4px;background:#1e1e1e;border-bottom:1px solid #333;position:sticky;top:0;z-index:1}
.dw{font-family:monospace;font-size:8px;font-weight:700;background:#0078d4;color:#fff;border-radius:2px;padding:1px 4px;flex-shrink:0}
.fn{font-weight:700;font-size:10px;color:#9cdcfe;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.folder-btn{background:none;border:none;cursor:pointer;font-size:11px;padding:0 2px;opacity:.6}
.folder-btn:hover{opacity:1}
.cnt{font-size:9px;background:#1b6ac9;color:#fff;border-radius:8px;padding:0 4px;flex-shrink:0}
.proj-links{display:flex;flex-direction:column;padding:2px 0 6px}
.doc-link{display:block;padding:3px 10px 3px 16px;color:#a0c4c4;text-decoration:none;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-left:2px solid transparent;transition:all .1s}
.doc-link:hover{background:#2a2d2e;color:#9cdcfe;border-left-color:#0078d4}
.doc-link.pri{color:#d4d4d4;font-weight:600}
.doc-link.active{background:rgba(63,185,80,.12)!important;border-left-color:#3fb950!important;color:#3fb950!important;font-weight:700}
.doc-link.hi{background:#ffe066!important;color:#1a1a00!important;font-weight:700}
.index-searching .doc-link:not(.hi){display:none}
.index-searching .proj-hd{display:none}
.index-searching .proj-group:not(:has(.doc-link.hi)){display:none}

/* \u2500\u2500 Resize handle \u2500\u2500 */
#resize-handle{width:5px;background:#404040;cursor:col-resize;flex-shrink:0;transition:background .12s}
#resize-handle:hover,#resize-handle.dragging{background:#0078d4}

/* \u2500\u2500 Doc viewer (88vw iframe) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
#viewer{flex:1;display:flex;flex-direction:column;overflow:hidden}
#viewer-bar{display:flex;align-items:center;gap:8px;padding:6px 12px;background:#1e1e1e;border-bottom:1px solid #333;flex-shrink:0;height:34px}
#viewer-path{font-family:monospace;font-size:10px;color:#858585;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#btn-copy-path{background:#2d2d2d;color:#858585;border:1px solid #444;border-radius:3px;padding:2px 8px;cursor:pointer;font-size:10px;white-space:nowrap}
#btn-copy-path:hover{border-color:#0078d4;color:#d4d4d4}
#doc-frame{flex:1;border:none;background:#1e1e1e;}
#welcome{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#555;font-size:13px;gap:8px;}
#welcome svg{opacity:.25}

/* \u2500\u2500 Empty state \u2500\u2500 */
#idx-empty{padding:20px 10px;text-align:center;color:#555;font-size:11px;display:none}
#idx-empty.show{display:block}

/* \u2500\u2500 Toast \u2500\u2500 */
#toast{position:fixed;bottom:14px;right:14px;background:#2d333b;color:#cae8ff;border:1px solid #58a6ff;border-radius:4px;padding:5px 12px;font-size:11px;z-index:999;opacity:0;transition:opacity .2s;pointer-events:none}
#toast.show{opacity:1}
</style>
</head>
<body>

<div id="topbar">
  <h1>&#128196; View a Doc</h1>
  <input id="search" type="text" placeholder="Search..." autocomplete="off">
  <select id="proj-filter"><option value="">All Projects</option>${sortedProjects.map(([n]) => `<option value="${_escV(n)}">${_escV(n)}</option>`).join('')}</select>
  <span id="stat">${totalDocs} docs</span>
</div>

<div id="split">

  <!-- 12vw index -->
  <div id="index">
    ${indexHtml}
    <div id="idx-empty">No matches</div>
  </div>

  <div id="resize-handle" title="Drag to resize"></div>

  <!-- 88vw viewer -->
  <div id="viewer">
    <div id="viewer-bar">
      <span id="viewer-path">Select a document from the index</span>
      <button id="btn-copy-path" style="display:none" title="Copy file path">&#128203; Copy Path</button>
    </div>
    <div id="welcome">
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none"><rect x="6" y="4" width="28" height="32" rx="3" stroke="#888" stroke-width="2"/><line x1="11" y1="12" x2="29" y2="12" stroke="#888" stroke-width="1.5"/><line x1="11" y1="17" x2="29" y2="17" stroke="#888" stroke-width="1.5"/><line x1="11" y1="22" x2="22" y2="22" stroke="#888" stroke-width="1.5"/></svg>
      <span>Select a document from the index</span>
    </div>
    <iframe id="doc-frame" style="display:none" sandbox="allow-scripts allow-same-origin"></iframe>
  </div>

</div>

<div id="toast"></div>

<script>
(function(){
var BASE='http://127.0.0.1:${port}';
var searchEl  = document.getElementById('search');
var statEl    = document.getElementById('stat');
var idxEl     = document.getElementById('index');
var idxEmpty  = document.getElementById('idx-empty');
var frame     = document.getElementById('doc-frame');
var welcome   = document.getElementById('welcome');
var viewerPath= document.getElementById('viewer-path');
var btnCopy   = document.getElementById('btn-copy-path');
var TOTAL     = ${totalDocs};
var _currentPath = '';


// \u2500\u2500 Project filter \u2500\u2500
var projFilterEl = document.getElementById('proj-filter');
var _projFilter = (localStorage.getItem('view-a-doc-proj') || '');
projFilterEl.value = _projFilter;

function applyProjFilter() {
  _projFilter = projFilterEl.value;
  localStorage.setItem('view-a-doc-proj', _projFilter);
  idxEl.querySelectorAll('.proj-group').forEach(function(g) {
    var show = !_projFilter || g.dataset.proj === _projFilter;
    g.style.display = show ? '' : 'none';
  });
  var visLinks = idxEl.querySelectorAll('.proj-group:not([style*="display: none"]) .doc-link').length
                + idxEl.querySelectorAll('.proj-group:not([style*="display:none"]) .doc-link').length;
  // Count unique visible links
  var cnt = 0;
  idxEl.querySelectorAll('.proj-group').forEach(function(g){
    if(!_projFilter || g.dataset.proj===_projFilter) cnt += g.querySelectorAll('.doc-link').length;
  });
  statEl.textContent = _projFilter ? (cnt + ' docs \u2014 ' + _projFilter) : (TOTAL + ' docs');
}
projFilterEl.addEventListener('change', applyProjFilter);
applyProjFilter();

// \u2500\u2500 Search \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function applySearch() {
  var q = searchEl.value.toLowerCase().trim();
  idxEl.classList.toggle('index-searching', q.length > 0);
  idxEl.querySelectorAll('.doc-link').forEach(function(lnk) {
    lnk.classList.toggle('hi', q.length > 0 && lnk.textContent.toLowerCase().includes(q));
  });
  var visible = idxEl.querySelectorAll('.doc-link' + (q ? '.hi' : '')).length;
  idxEmpty.classList.toggle('show', visible === 0);
  statEl.textContent = q ? (visible + ' matching') : (TOTAL + ' docs');
}
searchEl.addEventListener('input', applySearch);

// \u2500\u2500 Open a doc in the iframe \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function openDoc(docPath, linkEl) {
  _currentPath = docPath;

  // Mark active link
  idxEl.querySelectorAll('.doc-link.active').forEach(function(l){ l.classList.remove('active'); });
  if (linkEl) { linkEl.classList.add('active'); scrollIntoViewIfNeeded(linkEl); }

  // Update viewer bar
  viewerPath.textContent = docPath;
  btnCopy.style.display = '';

  // Load in iframe
  var docUrl = BASE + '/doc?path=' + encodeURIComponent(docPath);
  frame.src = docUrl;
  frame.style.display = 'block';
  welcome.style.display = 'none';
}

function scrollIntoViewIfNeeded(el) {
  var rect = el.getBoundingClientRect();
  var pRect = document.getElementById('index').getBoundingClientRect();
  if (rect.top < pRect.top || rect.bottom > pRect.bottom) {
    el.scrollIntoView({ block: 'nearest' });
  }
}

// \u2500\u2500 Click handling \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
document.addEventListener('click', function(e) {
  var lnk = e.target.closest('.doc-link');
  if (lnk) { e.preventDefault(); openDoc(lnk.dataset.path, lnk); return; }
  var btn = e.target.closest('.folder-btn');
  if (btn) { e.preventDefault(); fetch(BASE + '/openfolder?path=' + encodeURIComponent(btn.dataset.folder)).catch(function(){}); return; }
});

// \u2500\u2500 Copy path \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
btnCopy.addEventListener('click', function() {
  if (!_currentPath) { return; }
  navigator.clipboard.writeText(_currentPath).then(function() {
    btnCopy.textContent = '\u2713 Copied';
    setTimeout(function() { btnCopy.innerHTML = '&#128203; Copy Path'; }, 1800);
  });
});

// \u2500\u2500 Toast \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function toast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(function() { t.classList.remove('show'); }, 1800);
}

// Ctrl+A copies all visible paths
document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
    e.preventDefault();
    var paths = [];
    idxEl.querySelectorAll('.doc-link:not([style*="display:none"])').forEach(function(l) { paths.push(l.dataset.path); });
    navigator.clipboard && navigator.clipboard.writeText(paths.join('\\r\\n')).then(function() { toast(paths.length + ' paths copied'); });
  }
});


// \u2500\u2500 Resize handle \u2500\u2500
var handle = document.getElementById('resize-handle');
var indexEl2 = document.getElementById('index');
var isDragging = false;
handle.addEventListener('mousedown', function(e) {
  isDragging = true;
  handle.classList.add('dragging');
  document.body.style.userSelect = 'none';
  document.body.style.cursor = 'col-resize';
  e.preventDefault();
});
document.addEventListener('mousemove', function(e) {
  if (!isDragging) return;
  var splitRect = document.getElementById('split').getBoundingClientRect();
  var newW = Math.max(100, Math.min(e.clientX - splitRect.left, splitRect.width - 200));
  indexEl2.style.width = newW + 'px';
  indexEl2.style.minWidth = newW + 'px';
  indexEl2.style.maxWidth = newW + 'px';
});
document.addEventListener('mouseup', function() {
  if (isDragging) {
    isDragging = false;
    handle.classList.remove('dragging');
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  }
});

searchEl.focus();
})();
</script>
</body>
</html>`;
}

export async function viewSpecificDoc(): Promise<void> {
    const cards = await buildCatalog();
    if (!cards?.length) { return; }

    // If server is already running, just reveal the webview host in the next group
    if (_viewServer && _viewServerPort) {
        showViewDocPanel(_viewServerPort);
        return;
    }

    // Start a fresh server
    _viewServer = http.createServer((req, res) => {
        const url = new URL(req.url || '/', 'http://localhost');

        // CORS so browser fetch() works
        res.setHeader('Access-Control-Allow-Origin', '*');

        if (url.pathname === '/favicon.ico') {
            res.writeHead(204); res.end(); return;
        }

        if (url.pathname === '/') {
            const port = (_viewServer!.address() as { port: number }).port;
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(buildViewDocBrowserHtml(cards!, port));

        } else if (url.pathname === '/doc') {
            const filePath = decodeURIComponent(url.searchParams.get('path') || '');
            const backQ    = url.searchParams.get('q') || '';
            if (!filePath || !fs.existsSync(filePath)) {
                res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('File not found'); return;
            }
            const rawMd  = fs.readFileSync(filePath, 'utf8');
            const port = (_viewServer!.address() as { port: number }).port;
            const rendered = rewriteDocLinks(mdToHtml(rawMd), filePath, port, backQ);
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(buildDocPageHtml(filePath, rendered, port, backQ));

        } else if (url.pathname === '/openfolder') {
            const folderPath = decodeURIComponent(url.searchParams.get('path') || '');
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('OK');
            if (folderPath) {
                void openProjectFolderSmart(folderPath);
            }

        } else {
            res.writeHead(404); res.end('Not found');
        }
    });

    _viewServer.on('error', err => {
        log(FEATURE, `View Doc server error: ${err.message}`);
        _viewServer = undefined; _viewServerPort = undefined;
    });

    _viewServer.listen(0, '127.0.0.1', async () => {
        const addr = _viewServer!.address() as { port: number };
        _viewServerPort = addr.port;
        showViewDocPanel(_viewServerPort);
        log(FEATURE, `View Doc browser server on port ${_viewServerPort} — ${cards!.length} docs`);
    });
}

// ---------------------------------------------------------------------------
// deserializeCatalogPanel
// ---------------------------------------------------------------------------
export function deserializeCatalogPanel(panel: vscode.WebviewPanel): void {
    _catalogPanel = panel;
    _catalogPanel.webview.options = { enableScripts: true };
    buildCatalog(true).then(cards => {
        if (!cards?.length) { return; }
        const registry     = loadRegistry();
        const projectInfos = registry ? registry.projects.filter(p => fs.existsSync(p.path)).map(loadProjectInfo) : [];
        _pendingInitCards           = cards;
        _pendingInitProjectInfos    = projectInfos;
        _pendingInitRegistryEntries = registry?.projects ?? [];
        _catalogPanel!.webview.html = buildCatalogHtml(cards, projectInfos, new Date().toLocaleString(), registry?.projects ?? []);
    });
    _catalogPanel.onDidDispose(() => { _catalogPanel = undefined; });
    attachMessageHandler(_catalogPanel);
    log(FEATURE, 'Doc Catalog panel restored after reload');
}

// ---------------------------------------------------------------------------
// viewArchivedCatalog — shows a simple webview listing archived docs.
// Each row has a Restore button that removes the entry and refreshes.
// ---------------------------------------------------------------------------

let _archivedPanel: vscode.WebviewPanel | undefined;

function buildArchivedHtml(): string {
    const nonce   = getNonce();
    const entries = loadArchiveEntries();
    const rows = entries.length === 0
        ? '<tr><td colspan="4" style="padding:20px;text-align:center;color:var(--vscode-descriptionForeground)">No archived documents</td></tr>'
        : entries.map(e => `<tr>
            <td class="ac-proj">${_rbEsc(e.projectName)}</td>
            <td class="ac-title">${_rbEsc(e.title)}</td>
            <td class="ac-path" title="${_rbEsc(e.filePath)}">${_rbEsc(path.basename(e.filePath))}</td>
            <td class="ac-date">${_rbEsc(e.archivedAt)}</td>
            <td><button class="btn-restore" data-path="${_rbEsc(e.filePath)}">&#8629; Restore</button></td>
          </tr>`).join('');
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);font-size:13px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);padding:20px 24px}
h2{font-size:1.1em;font-weight:700;margin-bottom:4px}
.sub{font-size:11px;color:var(--vscode-descriptionForeground);margin-bottom:18px}
.tbl-wrap{border:1px solid var(--vscode-panel-border);border-radius:4px;overflow:auto;max-height:520px}
table{width:100%;border-collapse:collapse}
thead th{position:sticky;top:0;background:var(--vscode-textCodeBlock-background);padding:6px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--vscode-descriptionForeground);border-bottom:1px solid var(--vscode-panel-border)}
tbody tr{border-bottom:1px solid var(--vscode-panel-border)}tbody tr:last-child{border-bottom:none}tbody tr:hover{background:var(--vscode-list-hoverBackground)}
.ac-proj{padding:5px 10px;font-size:10px;font-weight:700;color:var(--vscode-textLink-foreground);text-transform:uppercase;white-space:nowrap}
.ac-title{padding:5px 10px;font-weight:500}
.ac-path{padding:5px 10px;font-family:monospace;font-size:10px;color:var(--vscode-descriptionForeground)}
.ac-date{padding:5px 10px;font-size:10px;color:var(--vscode-descriptionForeground);white-space:nowrap}
td:last-child{padding:4px 10px}
.btn-restore{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;padding:3px 10px;border-radius:3px;cursor:pointer;font-size:11px}
.btn-restore:hover{background:var(--vscode-button-secondaryHoverBackground)}
</style></head><body>
<h2>&#128190; Archived Documents</h2>
<div class="sub">Archived docs are excluded from the Doc Catalog. Restore to make them visible again.</div>
<div class="tbl-wrap"><table>
  <thead><tr><th>Project</th><th>Title</th><th>File</th><th>Archived</th><th></th></tr></thead>
  <tbody>${rows}</tbody>
</table></div>
<script nonce="${nonce}">(function(){
var vs = acquireVsCodeApi();
document.addEventListener('click', function(e) {
    var btn = e.target.closest('.btn-restore');
    if (!btn) { return; }
    vs.postMessage({ command: 'restore-doc', data: btn.dataset.path });
    btn.closest('tr').remove();
    var tbody = document.querySelector('tbody');
    if (!tbody.querySelector('tr')) {
        tbody.innerHTML = '<tr><td colspan="5" style="padding:20px;text-align:center;color:var(--vscode-descriptionForeground)">No archived documents</td></tr>';
    }
});
})();</script></body></html>`;
}

export function viewArchivedCatalog(): void {
    const html  = buildArchivedHtml();
    const title = '\u{1F4BE} Archived Docs';
    if (_archivedPanel) {
        _archivedPanel.webview.html = html;
        _archivedPanel.reveal(vscode.ViewColumn.Beside, true);
    } else {
        _archivedPanel = vscode.window.createWebviewPanel(
            'catalogArchived', title,
            { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
            { enableScripts: true, retainContextWhenHidden: false }
        );
        _archivedPanel.webview.html = html;
        _archivedPanel.onDidDispose(() => { _archivedPanel = undefined; });
    }
    _archivedPanel.webview.onDidReceiveMessage(async msg => {
        if (msg.command === 'restore-doc' && msg.data) {
            restoreDoc(msg.data as string);
            clearCachedCards();
            log(FEATURE, `Restored: ${msg.data as string}`);
            // Refresh the archived panel HTML after restore
            if (_archivedPanel) { _archivedPanel.webview.html = buildArchivedHtml(); }
            // If catalog is open, prompt refresh
            if (_catalogPanel) { await openCatalog(true); }
        }
    });
    log(FEATURE, `Archived docs panel opened (${loadArchiveEntries().length} entries)`);
}
