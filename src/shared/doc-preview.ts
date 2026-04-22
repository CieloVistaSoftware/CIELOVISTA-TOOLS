// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.


import * as vscode from 'vscode';
import * as fs     from 'fs';
import * as path   from 'path';
import { mdToHtml } from './md-renderer';
import { getNonce } from './webview-utils';

let _previewPanel: vscode.WebviewPanel | undefined;

interface Crumb { label: string; filePath: string | null; }
let _history: Crumb[] = [];
let _currentFilePath:    string | undefined;
let _currentTitle:       string | undefined;
let _currentSourceCmdId: string | undefined;

export function esc(s: string): string {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Markdown rendering now handled by md-renderer.ts (markdown-it + highlight.js)

// ── Breadcrumb ────────────────────────────────────────────────────────────────
// â”€â”€ Breadcrumb â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Only show the current document name â€” no history trail
function buildBreadcrumbHtml(history: Crumb[], currentTitle: string): string {
    return `<span class="bc-item bc-current">${esc(currentTitle)}</span>`;
}

// ── Folder path bar ───────────────────────────────────────────────────────────
function buildFolderPathHtml(filePath: string): string {
    const dir   = path.dirname(filePath);
    const sep   = dir.includes('\\') ? '\\' : '/';
    const parts = dir.split(sep).filter(Boolean);
    return parts.map((seg, i) => {
        const fullPath = (dir.startsWith('\\\\') ? '\\\\' : '') + parts.slice(0, i + 1).join(sep);
        const isLast   = i === parts.length - 1;
        const sepHtml  = i > 0 ? `<span class="fp-sep">${esc(sep)}</span>` : '';
        if (isLast) { return `${sepHtml}<span class="fp-seg fp-current">${esc(seg)}</span>`; }
        return `${sepHtml}<button class="fp-seg fp-link" data-action="open-folder" data-path="${esc(fullPath)}">${esc(seg)}</button>`;
    }).join('');
}

// ── Preview HTML ──────────────────────────────────────────────────────────────
function buildPreviewHtml(title: string, filePath: string, renderedHtml: string, history: Crumb[]): string {
    const nonce = getNonce();
    const jsPath = filePath.replace(/\\/g, '\\\\');
    const jsDir  = path.dirname(filePath).replace(/\\/g, '\\\\');
    const bcHtml = buildBreadcrumbHtml(history, title);
    const fpHtml = buildFolderPathHtml(filePath);

    const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);font-size:14px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);display:flex;flex-direction:column;height:100vh;overflow:hidden}
#topbar{display:flex;flex-direction:column;gap:4px;padding:8px 16px 6px;background:var(--vscode-editor-background);border-bottom:1px solid var(--vscode-panel-border);flex-shrink:0}
#topbar-row1{display:flex;align-items:center;gap:8px}
#topbar-title{font-weight:700;font-size:1.0em;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.btn-action{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;padding:3px 10px;border-radius:3px;cursor:pointer;font-size:11px;white-space:nowrap;flex-shrink:0}
.btn-action:hover{background:var(--vscode-button-secondaryHoverBackground)}
#breadcrumb{display:flex;align-items:center;flex-wrap:wrap;gap:2px;font-size:11px;padding:0 1px}
.bc-sep{color:var(--vscode-descriptionForeground);margin:0 3px}
.bc-item{font-size:11px;padding:1px 6px;border-radius:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px}
.bc-link,.bc-source{background:transparent;border:1px solid transparent;color:var(--vscode-textLink-foreground);cursor:pointer;font-family:inherit}
.bc-link:hover,.bc-source:hover{border-color:var(--vscode-panel-border);text-decoration:underline}
.bc-current{background:rgba(63,185,80,0.12);color:#3fb950;border:1px solid rgba(63,185,80,0.4);font-weight:700}
#folder-bar{display:flex;align-items:center;gap:6px;padding:3px 1px 1px;border-top:1px solid var(--vscode-panel-border);margin-top:2px}
#folder-path{display:flex;align-items:center;flex:1;overflow:hidden;font-family:var(--vscode-editor-font-family,monospace);font-size:10px;white-space:nowrap;gap:0}
.fp-sep{color:rgba(255,255,255,0.25);margin:0 1px;flex-shrink:0}
.fp-seg{font-size:10px;padding:0 2px;border-radius:2px;white-space:nowrap}
.fp-link{background:transparent;border:none;color:rgba(255,255,255,0.55);cursor:pointer;font-family:inherit;font-size:inherit}
.fp-link:hover{color:#fff;text-decoration:underline}
.fp-current{color:#fff;font-weight:700}
#content{flex:1;overflow-y:auto;padding:24px 32px 48px;max-width:900px;width:100%}
h1,h2,h3,h4{margin:1.1em 0 0.45em;line-height:1.3;font-weight:700}
h1{font-size:1.8em;border-bottom:2px solid var(--vscode-focusBorder);padding-bottom:8px}
h2{font-size:1.3em;border-bottom:1px solid var(--vscode-panel-border);padding-bottom:4px}
h3{font-size:1.1em} h4{font-size:0.95em;color:var(--vscode-descriptionForeground)}
p{margin:0.55em 0;line-height:1.75}
blockquote{border-left:4px solid var(--vscode-focusBorder);padding:6px 14px;margin:10px 0;background:var(--vscode-textCodeBlock-background);border-radius:0 4px 4px 0;font-style:italic}
code{font-family:var(--vscode-editor-font-family);font-size:0.87em;background:var(--vscode-textCodeBlock-background);padding:1px 6px;border-radius:3px;border:1px solid var(--vscode-panel-border)}
pre{background:var(--vscode-textCodeBlock-background);border:1px solid var(--vscode-panel-border);border-radius:5px;padding:14px 16px;overflow-x:auto;margin:12px 0}
pre code{background:none;padding:0;font-size:12px;line-height:1.6;border:none}
li{margin:4px 0 4px 22px;line-height:1.65} ul,ol{margin:6px 0}
table{border-collapse:collapse;width:100%;margin:12px 0;font-size:13px}
td,th{border:1px solid var(--vscode-panel-border);padding:7px 12px;text-align:left}
th{background:var(--vscode-textCodeBlock-background);font-weight:700;font-size:12px}
tr:nth-child(even) td{background:rgba(127,127,127,0.05)}
hr{border:none;border-top:1px solid var(--vscode-panel-border);margin:18px 0}
a{color:var(--vscode-textLink-foreground)} a:hover{text-decoration:underline}
strong{font-weight:700} em{font-style:italic} del{opacity:0.6;text-decoration:line-through}
img{max-width:100%;height:auto}
/* ── highlight.js — github-dark theme (inline, no CDN needed) ── */
.hljs{color:#adbac7;background:#22272e}.hljs-doctag,.hljs-keyword,.hljs-meta .hljs-keyword,.hljs-template-tag,.hljs-template-variable,.hljs-type,.hljs-variable.language_{color:#f47067}.hljs-title,.hljs-title.class_,.hljs-title.class_.inherited__,.hljs-title.function_{color:#dcbdfb}.hljs-attr,.hljs-attribute,.hljs-literal,.hljs-meta,.hljs-number,.hljs-operator,.hljs-selector-attr,.hljs-selector-class,.hljs-selector-id,.hljs-variable{color:#6cb6ff}.hljs-meta .hljs-string,.hljs-regexp,.hljs-string{color:#96d0ff}.hljs-built_in,.hljs-symbol{color:#f69d50}.hljs-code,.hljs-comment,.hljs-formula{color:#768390}.hljs-name,.hljs-quote,.hljs-selector-pseudo,.hljs-selector-tag{color:#8ddb8c}.hljs-subst{color:#adbac7}.hljs-section{color:#316dca;font-weight:700}.hljs-bullet{color:#eac55f}.hljs-emphasis{color:#adbac7;font-style:italic}.hljs-strong{color:#adbac7;font-weight:700}.hljs-addition{color:#b4f1b4;background-color:#1b4721}.hljs-deletion{color:#ffd8d3;background-color:#78191b}
`;

    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>${CSS}</style></head><body>
<div id="topbar">
  <div id="topbar-row1">
    <span id="topbar-title">&#128196; ${esc(title)}</span>
    <button class="btn-action" id="btn-vscode">&#128195; Open in VS Code</button>
    <button class="btn-action" id="btn-terminal">&#8250;_ Change Working Directory</button>
    <button class="btn-action" id="btn-explorer">&#128193; Explorer</button>
    <button class="btn-action" id="btn-edit">&#9998; Edit</button>
  </div>
  <div id="breadcrumb">${bcHtml}</div>
  <div id="folder-bar"><div id="folder-path">${fpHtml}</div></div>
</div>
<div id="content">${renderedHtml}</div>
<script nonce="${nonce}">
let _pendingScrollY = 0;
(function(){
    const vscode = acquireVsCodeApi();
    function safeAddListener(id, event, handler) {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener(event, handler);
        } else {
            console.error('DocPreview: Button not found:', id);
        }
    }
    safeAddListener('btn-edit', 'click',     () => vscode.postMessage({ command: 'open',           path: '${jsPath}' }));
    safeAddListener('btn-vscode', 'click',   () => vscode.postMessage({ command: 'open-in-vscode', dir:  '${jsDir}' }));
    safeAddListener('btn-terminal', 'click', () => vscode.postMessage({ command: 'open-terminal',  dir:  '${jsDir}' }));
    safeAddListener('btn-explorer', 'click', () => vscode.postMessage({ command: 'reveal-explorer',path: '${jsPath}' }));
    const bc = document.getElementById('breadcrumb');
    if (bc) {
        bc.addEventListener('click', e => {
            const link = e.target.closest('.bc-link');
            if (link && link.dataset.path) { vscode.postMessage({ command: 'navigate', path: link.dataset.path }); return; }
            const src = e.target.closest('.bc-source');
            if (src) { vscode.postMessage({ command: 'navigate-source', idx: parseInt(src.dataset.idx || '0', 10) }); }
        });
    }
    const fb = document.getElementById('folder-bar');
    if (fb) {
        fb.addEventListener('click', e => {
            const seg = e.target.closest('.fp-link');
            if (seg && seg.dataset.path) { vscode.postMessage({ command: 'open-folder-full', dir: seg.dataset.path }); }
        });
    }
    // Intercept all <a> clicks in the content area and always navigate via VS Code
    const content = document.getElementById('content');
    if (content) {
        content.addEventListener('click', function(e) {
            let el = e.target;
            while (el && el !== this) {
                if (el.tagName && el.tagName.toLowerCase() === 'a' && el.getAttribute('href')) {
                    e.preventDefault();
                    vscode.postMessage({ command: 'open', path: el.getAttribute('href'), scrollY: window.scrollY });
                    return;
                }
                el = el.parentNode;
            }
        });
    }
    // (syntax highlighting handled server-side by md-renderer.ts)
    // Listen for scroll restore message
    window.addEventListener('message', event => {
        if (event.data && typeof event.data.scrollY === 'number') {
            window.scrollTo(0, event.data.scrollY);
        }
    });
    // If scrollY was passed in URL hash, restore it
    if (window.location.hash.startsWith('#scroll=')) {
        const y = parseInt(window.location.hash.replace('#scroll=', ''), 10);
        if (!isNaN(y)) window.scrollTo(0, y);
    }
})();
</script>
</body>
</html>`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function openDocPreview(
    filePath:    string,
    sourceLabel: string | undefined = undefined,
    sourceCmdId: string | undefined = undefined
): void {
    if (!fs.existsSync(filePath)) { vscode.window.showWarningMessage(`File not found: ${filePath}`); return; }

    const content  = fs.readFileSync(filePath, 'utf8');
    const fileName = path.basename(filePath);
    const title    = (content.match(/^#\s+(.+)$/m)?.[1] ?? fileName.replace(/\.md$/i, '')).trim();
    const rendered = mdToHtml(content);

    if (!_previewPanel) { _history = []; }

    if (sourceLabel && (_history.length === 0 || _history[0].label !== sourceLabel)) {
        _history = [{ label: sourceLabel, filePath: null }];
    }

    const existingIdx = _history.findIndex(c => c.filePath === filePath);
    if (existingIdx !== -1) {
        _history = _history.slice(0, existingIdx);
    } else if (_previewPanel && _history.length > 0 && _currentFilePath && _currentFilePath !== filePath) {
        _history.push({ label: _currentTitle ?? path.basename(_currentFilePath), filePath: _currentFilePath });
    }

    _currentFilePath    = filePath;
    _currentTitle       = title;
    _currentSourceCmdId = sourceCmdId ?? _currentSourceCmdId;


    if (_previewPanel) {
        _previewPanel.title            = `\u{1F4C4} ${title}`;
        _previewPanel.webview.html     = buildPreviewHtml(title, filePath, rendered, _history);
        // preserveFocus=true keeps the catalog panel active so it doesn't scroll
        _previewPanel.reveal(vscode.ViewColumn.Beside, true);
        return;
    }

    _previewPanel = vscode.window.createWebviewPanel(
        'docPreview', `📄 ${title}`,
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
        { enableScripts: true, retainContextWhenHidden: true }
    );
    _previewPanel.webview.html = buildPreviewHtml(title, filePath, rendered, _history);
    _previewPanel.onDidDispose(() => {
        _previewPanel = _currentFilePath = _currentTitle = _currentSourceCmdId = undefined;
        _history = [];
    });

    _previewPanel.webview.onDidReceiveMessage(async msg => {
        switch (msg.command) {
            case 'open': {
                if (!msg.path) { break; }
                const rawTarget = String(msg.path).trim();

                // Pass through external links to the OS/browser.
                if (/^(https?:|mailto:|vscode:)/i.test(rawTarget)) {
                    await vscode.env.openExternal(vscode.Uri.parse(rawTarget));
                    break;
                }

                // Resolve local file targets (relative markdown links, file:// links,
                // URL-encoded spaces, optional query/hash fragments).
                let target = rawTarget;
                if (/^file:/i.test(target)) {
                    target = vscode.Uri.parse(target).fsPath;
                }

                const queryIdx = target.indexOf('?');
                if (queryIdx !== -1) { target = target.slice(0, queryIdx); }
                const hashIdx = target.indexOf('#');
                if (hashIdx !== -1) { target = target.slice(0, hashIdx); }

                try { target = decodeURIComponent(target); } catch { /* keep raw value */ }

                if (!path.isAbsolute(target) && _currentFilePath) {
                    target = path.resolve(path.dirname(_currentFilePath), target);
                }
                target = path.normalize(target);

                if (!fs.existsSync(target)) {
                    vscode.window.showWarningMessage(`File not found: ${target}`);
                    break;
                }
                // .md files open in the doc preview (navigate in place)
                // .html files open rendered in the system browser
                if (target.toLowerCase().endsWith('.md')) {
                    openDocPreview(target, _currentSourceCmdId ? undefined : _currentTitle, _currentSourceCmdId);
                } else if (target.toLowerCase().endsWith('.html')) {
                    await vscode.env.openExternal(vscode.Uri.file(target));
                } else {
                    const doc = await vscode.workspace.openTextDocument(target);
                    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
                }
                break;
            }
            case 'open-in-vscode': {
                if (!msg.dir) { break; }
                const markers = ['package.json', '.git', '.sln', '.csproj', 'CLAUDE.md'];
                let root = msg.dir as string, cand = msg.dir as string;
                for (let i = 0; i < 8; i++) {
                    const parent = path.dirname(cand);
                    if (parent === cand) { break; }
                    let files: string[] = [];
                    try { files = fs.readdirSync(cand); } catch { /* skip */ }
                    if (markers.some(m => files.includes(m))) { root = cand; break; }
                    cand = parent;
                }
                await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(root), { forceNewWindow: true });
                break;
            }
            case 'open-folder-full': {
                if (!msg.dir) { break; }
                const folderUri = vscode.Uri.file(msg.dir);
                const inWS = vscode.workspace.workspaceFolders?.some(wf => (msg.dir as string).toLowerCase().startsWith(wf.uri.fsPath.toLowerCase()));
                if (inWS) { await vscode.commands.executeCommand('revealInExplorer', folderUri); }
                else {
                    await vscode.commands.executeCommand('revealFileInOS', folderUri);
                    const choice = await vscode.window.showInformationMessage(`Add «${path.basename(msg.dir)}» to workspace?`, 'Add', 'Dismiss');
                    if (choice === 'Add') { vscode.workspace.updateWorkspaceFolders(vscode.workspace.workspaceFolders?.length ?? 0, 0, { uri: folderUri, name: path.basename(msg.dir) }); }
                }
                vscode.window.createTerminal({ name: path.basename(msg.dir), cwd: msg.dir }).show(true);
                break;
            }
            case 'open-terminal':
                if (msg.dir) { vscode.window.createTerminal({ name: path.basename(msg.dir), cwd: msg.dir }).show(); }
                break;
            case 'reveal-explorer': {
                if (!msg.path) { break; }
                const revUri = vscode.Uri.file(msg.path);
                const inWorkspace = vscode.workspace.workspaceFolders?.some(
                    wf => (msg.path as string).toLowerCase().startsWith(wf.uri.fsPath.toLowerCase())
                );
                if (inWorkspace) {
                    await vscode.commands.executeCommand('revealInExplorer', revUri);
                } else {
                    await vscode.commands.executeCommand('revealFileInOS', revUri);
                }
                break;
            }
            case 'navigate':
                if (msg.path) { openDocPreview(msg.path); }
                break;
            case 'navigate-source':
                _history = [];
                _currentFilePath = _currentTitle = undefined;
                if (_currentSourceCmdId) { await vscode.commands.executeCommand(_currentSourceCmdId); }
                break;
        }
    });
}

export function disposeDocPreview(): void {
    _previewPanel?.dispose();
    _previewPanel = _currentFilePath = _currentTitle = _currentSourceCmdId = undefined;
    _history = [];
}
// FILE REMOVED BY REQUEST
