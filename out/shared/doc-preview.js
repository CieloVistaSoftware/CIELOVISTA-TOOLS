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
exports.esc = esc;
exports.mdToHtml = mdToHtml;
exports.openDocPreview = openDocPreview;
exports.disposeDocPreview = disposeDocPreview;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
let _previewPanel;
let _history = [];
let _currentFilePath;
let _currentTitle;
let _currentSourceCmdId;
function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
// Pure Node markdown renderer — no CDN, no npm imports.
function mdToHtml(md) {
    let html = md;
    html = html.replace(/^```(\w*)\n([\s\S]*?)^```/gm, (_m, lang, code) => {
        const cls = lang ? ` class="language-${esc(lang)}"` : '';
        return `<pre><code${cls}>${esc(code.replace(/\n$/, ''))}</code></pre>`;
    });
    html = html.replace(/^(\|.+\|\n)((?:\|[-: ]+)+\|\n)((?:\|.+\|\n?)*)/gm, (_m, header, _sep, body) => {
        const parseRow = (row) => row.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
        const hCells = parseRow(header).map(c => `<th>${c}</th>`).join('');
        const bRows = body.trim().split('\n').filter(Boolean).map((r) => '<tr>' + parseRow(r).map(c => `<td>${c}</td>`).join('') + '</tr>').join('');
        return `<table><thead><tr>${hCells}</tr></thead><tbody>${bRows}</tbody></table>`;
    });
    html = html.replace(/^(#{1,6})\s+(.+)$/gm, (_m, hashes, text) => `<h${hashes.length}>${text}</h${hashes.length}>`);
    html = html.replace(/^>\s?(.+)$/gm, (_m, text) => `<blockquote>${text}</blockquote>`);
    html = html.replace(/^(?:[*\-+]\s.+\n?)+/gm, block => `<ul>${block.trim().split('\n').map(l => `<li>${l.replace(/^[*\-+]\s/, '')}</li>`).join('')}</ul>`);
    html = html.replace(/^(?:\d+\.\s.+\n?)+/gm, block => `<ol>${block.trim().split('\n').map(l => `<li>${l.replace(/^\d+\.\s/, '')}</li>`).join('')}</ol>`);
    html = html.replace(/^[-*_]{3,}\s*$/gm, '<hr>');
    html = html.replace(/`([^`\n]+)`/g, (_m, code) => `<code>${esc(code)}</code>`);
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
    html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2">');
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    html = html.replace(/^(?!<[a-z]|\s*$)(.+)$/gm, '<p>$1</p>');
    html = html.replace(/\n{3,}/g, '\n\n');
    return html;
}
// ── Breadcrumb ────────────────────────────────────────────────────────────────
function buildBreadcrumbHtml(history, currentTitle) {
    const crumbs = [...history, { label: currentTitle, filePath: null }];
    return crumbs.map((c, i) => {
        const isLast = i === crumbs.length - 1;
        const sep = i > 0 ? '<span class="bc-sep">›</span>' : '';
        if (isLast) {
            return `${sep}<span class="bc-item bc-current">${esc(c.label)}</span>`;
        }
        if (c.filePath) {
            return `${sep}<button class="bc-item bc-link" data-path="${esc(c.filePath)}">${esc(c.label)}</button>`;
        }
        return `${sep}<button class="bc-item bc-source" data-idx="${i}">${esc(c.label)}</button>`;
    }).join('');
}
// ── Folder path bar ───────────────────────────────────────────────────────────
function buildFolderPathHtml(filePath) {
    const dir = path.dirname(filePath);
    const sep = dir.includes('\\') ? '\\' : '/';
    const parts = dir.split(sep).filter(Boolean);
    return parts.map((seg, i) => {
        const fullPath = (dir.startsWith('\\\\') ? '\\\\' : '') + parts.slice(0, i + 1).join(sep);
        const isLast = i === parts.length - 1;
        const sepHtml = i > 0 ? `<span class="fp-sep">${esc(sep)}</span>` : '';
        if (isLast) {
            return `${sepHtml}<span class="fp-seg fp-current">${esc(seg)}</span>`;
        }
        return `${sepHtml}<button class="fp-seg fp-link" data-action="open-folder" data-path="${esc(fullPath)}">${esc(seg)}</button>`;
    }).join('');
}
// ── Preview HTML ──────────────────────────────────────────────────────────────
function buildPreviewHtml(title, filePath, renderedHtml, history) {
    const jsPath = filePath.replace(/\\/g, '\\\\');
    const jsDir = path.dirname(filePath).replace(/\\/g, '\\\\');
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
`;
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><style>${CSS}</style></head><body>
<div id="topbar">
  <div id="topbar-row1">
    <span id="topbar-title">&#128196; ${esc(title)}</span>
    <button class="btn-action" id="btn-vscode">&#128195; Open in VS Code</button>
    <button class="btn-action" id="btn-terminal">&#8250;_ Terminal</button>
    <button class="btn-action" id="btn-explorer">&#128193; Explorer</button>
    <button class="btn-action" id="btn-edit">&#9998; Editor</button>
  </div>
  <div id="breadcrumb">${bcHtml}</div>
  <div id="folder-bar"><div id="folder-path">${fpHtml}</div></div>
</div>
<div id="content">${renderedHtml}</div>
<script>
(function(){
  const vscode = acquireVsCodeApi();
  document.getElementById('btn-edit').addEventListener('click',     () => vscode.postMessage({ command: 'open',           path: '${jsPath}' }));
  document.getElementById('btn-vscode').addEventListener('click',   () => vscode.postMessage({ command: 'open-in-vscode', dir:  '${jsDir}' }));
  document.getElementById('btn-terminal').addEventListener('click', () => vscode.postMessage({ command: 'open-terminal',  dir:  '${jsDir}' }));
  document.getElementById('btn-explorer').addEventListener('click', () => vscode.postMessage({ command: 'reveal-explorer',path: '${jsPath}' }));
  document.getElementById('breadcrumb').addEventListener('click', e => {
    const link = e.target.closest('.bc-link');
    if (link?.dataset.path) { vscode.postMessage({ command: 'navigate', path: link.dataset.path }); return; }
    const src = e.target.closest('.bc-source');
    if (src) { vscode.postMessage({ command: 'navigate-source', idx: parseInt(src.dataset.idx || '0', 10) }); }
  });
  document.getElementById('folder-bar').addEventListener('click', e => {
    const seg = e.target.closest('[data-action="open-folder"]');
    if (seg?.dataset.path) { vscode.postMessage({ command: 'open-folder-full', dir: seg.dataset.path }); }
  });
})();
</script>
</body></html>`;
}
// ── Public API ────────────────────────────────────────────────────────────────
function openDocPreview(filePath, sourceLabel = undefined, sourceCmdId = undefined) {
    if (!fs.existsSync(filePath)) {
        vscode.window.showWarningMessage(`File not found: ${filePath}`);
        return;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const fileName = path.basename(filePath);
    const title = (content.match(/^#\s+(.+)$/m)?.[1] ?? fileName.replace(/\.md$/i, '')).trim();
    const rendered = mdToHtml(content);
    if (!_previewPanel) {
        _history = [];
    }
    if (sourceLabel && (_history.length === 0 || _history[0].label !== sourceLabel)) {
        _history = [{ label: sourceLabel, filePath: null }];
    }
    const existingIdx = _history.findIndex(c => c.filePath === filePath);
    if (existingIdx !== -1) {
        _history = _history.slice(0, existingIdx);
    }
    else if (_previewPanel && _history.length > 0 && _currentFilePath && _currentFilePath !== filePath) {
        _history.push({ label: _currentTitle ?? path.basename(_currentFilePath), filePath: _currentFilePath });
    }
    _currentFilePath = filePath;
    _currentTitle = title;
    _currentSourceCmdId = sourceCmdId ?? _currentSourceCmdId;
    const html = buildPreviewHtml(title, filePath, rendered, _history);
    if (_previewPanel) {
        _previewPanel.title = `📄 ${title}`;
        _previewPanel.webview.html = html;
        _previewPanel.reveal(vscode.ViewColumn.Beside, true);
        return;
    }
    _previewPanel = vscode.window.createWebviewPanel('docPreview', `📄 ${title}`, vscode.ViewColumn.Beside, { enableScripts: true, retainContextWhenHidden: true });
    _previewPanel.webview.html = html;
    _previewPanel.onDidDispose(() => {
        _previewPanel = _currentFilePath = _currentTitle = _currentSourceCmdId = undefined;
        _history = [];
    });
    _previewPanel.webview.onDidReceiveMessage(async (msg) => {
        switch (msg.command) {
            case 'open':
                if (msg.path) {
                    const doc = await vscode.workspace.openTextDocument(msg.path);
                    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
                }
                break;
            case 'open-in-vscode': {
                if (!msg.dir) {
                    break;
                }
                const markers = ['package.json', '.git', '.sln', '.csproj', 'CLAUDE.md'];
                let root = msg.dir, cand = msg.dir;
                for (let i = 0; i < 8; i++) {
                    const parent = path.dirname(cand);
                    if (parent === cand) {
                        break;
                    }
                    let files = [];
                    try {
                        files = fs.readdirSync(cand);
                    }
                    catch { /* skip */ }
                    if (markers.some(m => files.includes(m))) {
                        root = cand;
                        break;
                    }
                    cand = parent;
                }
                await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(root), { forceNewWindow: true });
                break;
            }
            case 'open-folder-full': {
                if (!msg.dir) {
                    break;
                }
                const folderUri = vscode.Uri.file(msg.dir);
                const inWS = vscode.workspace.workspaceFolders?.some(wf => msg.dir.toLowerCase().startsWith(wf.uri.fsPath.toLowerCase()));
                if (inWS) {
                    await vscode.commands.executeCommand('revealInExplorer', folderUri);
                }
                else {
                    await vscode.commands.executeCommand('revealFileInOS', folderUri);
                    const choice = await vscode.window.showInformationMessage(`Add «${path.basename(msg.dir)}» to workspace?`, 'Add', 'Dismiss');
                    if (choice === 'Add') {
                        vscode.workspace.updateWorkspaceFolders(vscode.workspace.workspaceFolders?.length ?? 0, 0, { uri: folderUri, name: path.basename(msg.dir) });
                    }
                }
                vscode.window.createTerminal({ name: path.basename(msg.dir), cwd: msg.dir }).show(true);
                break;
            }
            case 'open-terminal':
                if (msg.dir) {
                    vscode.window.createTerminal({ name: path.basename(msg.dir), cwd: msg.dir }).show();
                }
                break;
            case 'reveal-explorer':
                if (msg.path) {
                    await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(msg.path));
                }
                break;
            case 'navigate':
                if (msg.path) {
                    openDocPreview(msg.path);
                }
                break;
            case 'navigate-source':
                _history = [];
                _currentFilePath = _currentTitle = undefined;
                if (_currentSourceCmdId) {
                    await vscode.commands.executeCommand(_currentSourceCmdId);
                }
                break;
        }
    });
}
function disposeDocPreview() {
    _previewPanel?.dispose();
    _previewPanel = _currentFilePath = _currentTitle = _currentSourceCmdId = undefined;
    _history = [];
}
//# sourceMappingURL=doc-preview.js.map