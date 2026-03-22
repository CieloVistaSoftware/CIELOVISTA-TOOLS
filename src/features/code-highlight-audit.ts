// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * code-highlight-audit.ts
 *
 * Scans all registered project docs for fenced code blocks that are missing
 * a language specifier (```without a language tag). Shows results in a
 * webview panel with:
 *   - File path and project
 *   - Line number of each untagged block
 *   - Preview of the first line of code
 *   - Quick-fix button to open the file at that line
 *   - Bulk summary: X files, Y blocks need tagging
 */

import * as vscode from 'vscode';
import * as fs     from 'fs';
import * as path   from 'path';
import { log, logError } from '../shared/output-channel';
import { loadRegistry }  from '../shared/registry';

const FEATURE = 'code-highlight-audit';

interface UntaggedBlock {
    filePath:    string;
    project:     string;
    lineNumber:  number;   // 1-based line of the opening ```
    preview:     string;   // first line of code inside the block
}

// Known language hints from first-line content
const LANG_HINTS: Array<[RegExp, string]> = [
    [/^\s*<(!DOCTYPE|html|head|body|div|span|p|a |ul|ol|li|table|form|input|button|script|style|link|meta|nav|section|article|aside|header|footer)/i, 'html'],
    [/^\s*(import |export |const |let |var |function |class |interface |type |enum |async |await |=>)/, 'typescript'],
    [/^\s*(def |class |import |from |if __name__|print\(|@)/, 'python'],
    [/^\s*(\$|[A-Z][a-zA-Z-]+:|(Get|Set|New|Remove|Invoke|Start|Stop)-[A-Z])/, 'powershell'],
    [/^\s*(\{|\[|\"|true|false|null|\d)/, 'json'],
    [/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|WITH)\b/i, 'sql'],
    [/^\s*(@import|@mixin|@include|@media|@keyframes|[.#][\w-]+\s*\{|:root\s*\{)/, 'css'],
    [/^\s*(using |namespace |public |private |protected |class |static |void |int |string |bool )/, 'csharp'],
    [/^\s*(---|\- |\* |#+ )/, 'yaml'],
    [/^\s*<\?xml/, 'xml'],
];

function guessLanguage(firstLine: string): string {
    for (const [re, lang] of LANG_HINTS) {
        if (re.test(firstLine)) { return lang; }
    }
    return '';
}

function scanFile(filePath: string, project: string): UntaggedBlock[] {
    const results: UntaggedBlock[] = [];
    let content: string;
    try { content = fs.readFileSync(filePath, 'utf8'); } catch { return results; }

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Match opening ``` with no language (just whitespace after)
        if (/^```\s*$/.test(line.trim()) && line.trim() === '```') {
            const preview = (lines[i + 1] ?? '').trim().slice(0, 80);
            results.push({
                filePath,
                project,
                lineNumber: i + 1,
                preview,
            });
        }
    }
    return results;
}

function esc(s: string): string {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function buildHtml(blocks: UntaggedBlock[], scannedFiles: number): string {
    const byProject = new Map<string, UntaggedBlock[]>();
    for (const b of blocks) {
        if (!byProject.has(b.project)) { byProject.set(b.project, []); }
        byProject.get(b.project)!.push(b);
    }

    const totalBlocks = blocks.length;
    const totalFiles  = new Set(blocks.map(b => b.filePath)).size;

    const rows = [...byProject.entries()].map(([proj, pBlocks]) => {
        const fileMap = new Map<string, UntaggedBlock[]>();
        for (const b of pBlocks) {
            if (!fileMap.has(b.filePath)) { fileMap.set(b.filePath, []); }
            fileMap.get(b.filePath)!.push(b);
        }

        const fileRows = [...fileMap.entries()].map(([fp, fBlocks]) => {
            const relPath = path.relative(path.dirname(fp), fp) || path.basename(fp);
            const blockRows = fBlocks.map(b => {
                const guess = guessLanguage(b.preview);
                return `<tr class="block-row">
  <td class="ln-cell">L${b.lineNumber}</td>
  <td class="preview-cell"><code>${esc(b.preview || '(empty block)')}</code></td>
  <td class="guess-cell">${guess ? `<span class="lang-hint">${esc(guess)}</span>` : '<span class="no-hint">?</span>'}</td>
  <td class="act-cell">
    <button class="fix-btn" data-action="open" data-path="${esc(fp)}" data-line="${b.lineNumber}">&#128396; Open</button>
  </td>
</tr>`;
            }).join('');

            return `<tbody class="file-group">
  <tr class="file-row">
    <td colspan="4" class="file-cell">
      <span class="file-name">${esc(path.basename(fp))}</span>
      <span class="file-rel">${esc(fp)}</span>
      <span class="file-count">${fBlocks.length} block${fBlocks.length > 1 ? 's' : ''}</span>
    </td>
  </tr>
  ${blockRows}
</tbody>`;
        }).join('');

        return `<tr class="proj-row">
  <td colspan="4" class="proj-cell">&#128193; ${esc(proj)} <span class="proj-count">${pBlocks.length}</span></td>
</tr>
${fileRows}`;
    }).join('');

    const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);font-size:13px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background)}
#toolbar{position:sticky;top:0;z-index:10;background:var(--vscode-editor-background);border-bottom:1px solid var(--vscode-panel-border);padding:10px 16px;display:flex;align-items:center;gap:12px}
#toolbar h1{font-size:1.05em;font-weight:700;flex-shrink:0}
#search{flex:1;padding:6px 10px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);border-radius:3px;font-size:13px}
#search:focus{outline:1px solid var(--vscode-focusBorder)}
#stat{font-size:11px;color:var(--vscode-descriptionForeground);white-space:nowrap}
.rescan-btn{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;padding:4px 12px;border-radius:3px;cursor:pointer;font-size:12px}
.rescan-btn:hover{background:var(--vscode-button-secondaryHoverBackground)}
#content{padding:12px 16px 40px}
.summary{padding:8px 12px;background:var(--vscode-textCodeBlock-background);border:1px solid var(--vscode-panel-border);border-radius:4px;margin-bottom:12px;font-size:12px;line-height:1.7}
.summary strong{font-weight:700}
table{width:100%;border-collapse:collapse}
.proj-row td{background:var(--vscode-editor-background);padding:10px 12px 4px;font-weight:700;font-size:12px;border-top:2px solid var(--vscode-focusBorder);color:var(--vscode-descriptionForeground)}
.proj-count{background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);border-radius:10px;padding:1px 7px;font-size:10px;font-weight:400;margin-left:8px}
.file-row td{background:var(--vscode-textCodeBlock-background);padding:5px 12px;border-bottom:1px solid var(--vscode-panel-border)}
.file-name{font-weight:700;font-size:12px;margin-right:10px}
.file-rel{font-family:var(--vscode-editor-font-family,monospace);font-size:10px;color:var(--vscode-descriptionForeground);opacity:0.8}
.file-count{float:right;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);border-radius:10px;padding:1px 6px;font-size:10px}
.block-row td{padding:4px 12px;border-bottom:1px solid rgba(127,127,127,0.1)}
.block-row:hover td{background:var(--vscode-list-hoverBackground)}
.block-row.hidden{display:none}
.ln-cell{font-family:var(--vscode-editor-font-family,monospace);font-size:10px;color:var(--vscode-descriptionForeground);width:40px;white-space:nowrap}
.preview-cell{font-size:11px;max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.preview-cell code{font-family:var(--vscode-editor-font-family,monospace);font-size:10px;background:none;border:none;padding:0;color:var(--vscode-editor-foreground);opacity:0.9}
.guess-cell{width:90px}
.lang-hint{background:rgba(63,185,80,0.12);color:#3fb950;border:1px solid rgba(63,185,80,0.3);border-radius:3px;padding:1px 6px;font-size:10px;font-family:var(--vscode-editor-font-family,monospace)}
.no-hint{color:var(--vscode-descriptionForeground);font-size:10px;opacity:0.5}
.act-cell{width:70px;text-align:right}
.fix-btn{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;padding:2px 8px;border-radius:3px;cursor:pointer;font-size:10px;white-space:nowrap}
.fix-btn:hover{background:var(--vscode-button-hoverBackground)}
#empty{padding:40px;text-align:center;color:var(--vscode-descriptionForeground);display:none}
#empty.visible{display:block}
`;

    const JS = `
(function(){
'use strict';
const vscode = acquireVsCodeApi();
const searchEl = document.getElementById('search');
searchEl.addEventListener('input', function() {
  var q = searchEl.value.toLowerCase().trim();
  document.querySelectorAll('.block-row').forEach(function(row) {
    var text = row.textContent.toLowerCase();
    row.classList.toggle('hidden', !!q && !text.includes(q));
  });
  // Hide file groups with no visible blocks
  document.querySelectorAll('.file-group').forEach(function(g) {
    var anyVisible = g.querySelector('.block-row:not(.hidden)');
    g.style.display = anyVisible ? '' : 'none';
  });
});

document.addEventListener('click', function(e) {
  var btn = e.target.closest('[data-action]');
  if (!btn) return;
  if (btn.dataset.action === 'open') {
    vscode.postMessage({ command: 'open', path: btn.dataset.path, line: parseInt(btn.dataset.line || '1', 10) });
  }
  if (btn.dataset.action === 'rescan') {
    vscode.postMessage({ command: 'rescan' });
  }
});
})();`;

    const zeroMsg = totalBlocks === 0
        ? `<div id="empty" class="visible">&#10003; All ${scannedFiles} scanned docs have language-tagged code blocks. Nothing to fix!</div>`
        : '';

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${CSS}</style></head><body>
<div id="toolbar">
  <h1>&#127775; Code Highlight Audit</h1>
  <input id="search" type="text" placeholder="Filter by file, project, or preview\u2026" autocomplete="off">
  <span id="stat">${totalBlocks} untagged block${totalBlocks !== 1 ? 's' : ''} in ${totalFiles} file${totalFiles !== 1 ? 's' : ''} &mdash; ${scannedFiles} files scanned</span>
  <button class="rescan-btn" data-action="rescan">&#8635; Rescan</button>
</div>
<div id="content">
  <div class="summary">
    <strong>${scannedFiles}</strong> markdown files scanned across all projects.
    Found <strong>${totalBlocks}</strong> fenced code block${totalBlocks !== 1 ? 's' : ''} without a language tag in
    <strong>${totalFiles}</strong> file${totalFiles !== 1 ? 's' : ''}.
    Green hints show the guessed language from the block content.
    Click <strong>Open</strong> to jump directly to that line.
  </div>
  ${zeroMsg}
  <table>
    ${totalBlocks > 0 ? rows : ''}
  </table>
</div>
<script>${JS}</script>
</body></html>`;
}

async function runAudit(): Promise<{ blocks: UntaggedBlock[]; scannedFiles: number }> {
    const registry = loadRegistry();
    if (!registry) { return { blocks: [], scannedFiles: 0 }; }

    const blocks: UntaggedBlock[] = [];
    let scannedFiles = 0;

    // Scan global docs
    const globalFiles = fs.existsSync(registry.globalDocsPath)
        ? fs.readdirSync(registry.globalDocsPath).filter(f => f.endsWith('.md')).map(f => path.join(registry.globalDocsPath, f))
        : [];

    for (const fp of globalFiles) {
        blocks.push(...scanFile(fp, 'global'));
        scannedFiles++;
    }

    // Scan all registered projects recursively
    for (const project of registry.projects) {
        if (!fs.existsSync(project.path)) { continue; }
        const mdFiles = findMarkdownFiles(project.path);
        for (const fp of mdFiles) {
            blocks.push(...scanFile(fp, project.name));
            scannedFiles++;
        }
    }

    return { blocks, scannedFiles };
}

function findMarkdownFiles(dir: string, depth = 0): string[] {
    if (depth > 4) { return []; }
    const results: string[] = [];
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return results; }

    for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === '.git') { continue; }
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...findMarkdownFiles(full, depth + 1));
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
            results.push(full);
        }
    }
    return results;
}

let _panel: vscode.WebviewPanel | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.audit.codeHighlight', showPanel)
    );
}

async function showPanel(): Promise<void> {
    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Scanning docs for untagged code blocks…', cancellable: false },
        async () => {
            const { blocks, scannedFiles } = await runAudit();
            const html = buildHtml(blocks, scannedFiles);

            if (_panel) {
                _panel.webview.html = html;
                _panel.reveal();
            } else {
                _panel = vscode.window.createWebviewPanel(
                    'codeHighlightAudit', '✨ Code Highlight Audit', vscode.ViewColumn.One,
                    { enableScripts: true, retainContextWhenHidden: true }
                );
                _panel.webview.html = html;
                _panel.onDidDispose(() => { _panel = undefined; });
            }

            _panel.webview.onDidReceiveMessage(async msg => {
                if (msg.command === 'open' && msg.path) {
                    try {
                        const doc  = await vscode.workspace.openTextDocument(msg.path);
                        const ed   = await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
                        const line = Math.max(0, (msg.line ?? 1) - 1);
                        const pos  = new vscode.Position(line, 0);
                        ed.selection = new vscode.Selection(pos, pos);
                        ed.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
                    } catch (e) {
                        logError(FEATURE, 'Failed to open file', e);
                    }
                }
                if (msg.command === 'rescan') {
                    await showPanel();
                }
            });

            log(FEATURE, `Code highlight audit: ${blocks.length} untagged blocks in ${scannedFiles} files`);
        }
    );
}

export function deactivate(): void {
    _panel?.dispose();
    _panel = undefined;
}
