// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * error-log-viewer.ts
 *
 * VS Code webview panel showing the persistent tools error log.
 * Mirrors the wb-core error display overlay — same fields, same layout,
 * adapted for a VS Code webview instead of a browser overlay.
 *
 * Command: cvs.tools.errorLog
 */

import * as vscode from 'vscode';
import * as path   from 'path';
import { getErrors, clearErrors, getLogPath } from '../shared/error-log';
import type { ErrorEntry } from '../shared/error-log';
import { log } from '../shared/output-channel';

const FEATURE = 'error-log-viewer';
let _panel: vscode.WebviewPanel | undefined;

function esc(s: string): string {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function typeColor(type: string): string {
    const map: Record<string, string> = {
        JSON_PARSE_ERROR: '#cca700',
        FILE_IO_ERROR:    '#f48771',
        COMMAND_ERROR:    '#f48771',
        AUDIT_ERROR:      '#cca700',
        AI_ERROR:         '#bc8cff',
        NETWORK_ERROR:    '#58a6ff',
        RUNTIME_ERROR:    '#f48771',
        APP_ERROR:        '#888',
    };
    return map[type] ?? '#888';
}

function buildHtml(errors: ErrorEntry[]): string {
    const sorted = [...errors].reverse(); // newest first

    const rows = sorted.length === 0
        ? `<div style="padding:40px;text-align:center;color:var(--vscode-descriptionForeground)">✅ No errors logged — all clean.</div>`
        : sorted.map(e => {
            const time    = new Date(e.timestamp).toLocaleString();
            const color   = typeColor(e.type);
            const stackLines = e.stack
                ? e.stack.split('\n').slice(1, 6).map(l => `    ${l.trim()}`).join('\n')
                : '';

            return `<div class="entry" data-id="${e.id}">
  <div class="entry-header">
    <span class="entry-prefix">${esc(e.prefix)}</span>
    <span class="entry-type" style="color:${color}">${esc(e.type)}</span>
    ${e.context  ? `<span class="entry-ctx">in ${esc(e.context)}</span>` : ''}
    ${e.command  ? `<span class="entry-cmd">cmd: ${esc(e.command)}</span>` : ''}
    <span class="entry-time">${esc(time)}</span>
  </div>
  <div class="entry-msg">${esc(e.message)}</div>
  ${e.filename ? `<div class="entry-loc">${esc(e.filename)}:${e.lineno}:${e.colno}</div>` : ''}
  ${stackLines ? `<pre class="entry-stack">${esc(stackLines)}</pre>` : ''}
</div>`;
        }).join('');

    const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);font-size:13px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background)}
.toolbar{position:sticky;top:0;z-index:10;background:var(--vscode-editor-background);border-bottom:1px solid var(--vscode-panel-border);padding:10px 16px;display:flex;align-items:center;gap:10px}
.toolbar h2{font-size:1.05em;font-weight:700;flex:1}
.pill{display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600;border:1px solid}
.pill-err{border-color:#f48771;color:#f48771}
.pill-ok{border-color:#3fb950;color:#3fb950}
.btn{border:none;padding:5px 14px;border-radius:3px;cursor:pointer;font-size:12px;font-weight:600}
.btn-clear{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}
.btn-clear:hover{background:var(--vscode-button-secondaryHoverBackground)}
.btn-open{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}
.btn-open:hover{background:var(--vscode-button-hoverBackground)}
.content{padding:12px 16px 40px}
.entry{background:var(--vscode-textCodeBlock-background);border:1px solid var(--vscode-panel-border);border-left:4px solid #f48771;border-radius:0 4px 4px 0;padding:10px 12px;margin-bottom:8px}
.entry-header{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:5px}
.entry-prefix{font-weight:700;font-size:12px;color:#f48771}
.entry-type{font-size:10px;font-weight:700;padding:1px 6px;border-radius:3px;border:1px solid currentColor}
.entry-ctx{font-size:10px;color:var(--vscode-descriptionForeground);font-style:italic}
.entry-cmd{font-size:10px;color:#58a6ff;font-family:var(--vscode-editor-font-family)}
.entry-time{font-size:10px;color:var(--vscode-descriptionForeground);margin-left:auto}
.entry-msg{font-size:12px;line-height:1.5;color:var(--vscode-editor-foreground);word-break:break-word}
.entry-loc{font-size:10px;color:#58a6ff;font-family:var(--vscode-editor-font-family);margin-top:4px}
.entry-stack{font-family:var(--vscode-editor-font-family);font-size:10px;color:var(--vscode-descriptionForeground);margin-top:6px;background:var(--vscode-editor-background);padding:6px 8px;border-radius:3px;max-height:100px;overflow-y:auto;white-space:pre}
.meta{font-size:11px;color:var(--vscode-descriptionForeground);padding:8px 16px;border-top:1px solid var(--vscode-panel-border);margin-top:8px}
`;

    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><style>${CSS}</style></head><body>
<div class="toolbar">
  <h2>🪵 CieloVista Tools — Error Log</h2>
  ${errors.length > 0
    ? `<span class="pill pill-err">❌ ${errors.length} error${errors.length !== 1 ? 's' : ''}</span>`
    : `<span class="pill pill-ok">✅ Clean</span>`}
  <button class="btn btn-open" data-action="open-file">📄 Open JSON</button>
  ${errors.length > 0 ? `<button class="btn btn-clear" data-action="clear">🗑 Clear All</button>` : ''}
</div>
<div class="content">${rows}</div>
<div class="meta">Log file: <code>${esc(getLogPath())}</code></div>
<script>
(function(){
  const vscode = acquireVsCodeApi();
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) { return; }
    vscode.postMessage({ command: btn.dataset.action });
  });
})();
</script>
</body></html>`;
}

export async function openErrorLogViewer(): Promise<void> {
    const errors = getErrors();
    const html   = buildHtml(errors);

    if (_panel) {
        _panel.webview.html = html;
        _panel.reveal();
        return;
    }

    _panel = vscode.window.createWebviewPanel(
        'toolsErrorLog', '🪵 Tools Error Log', vscode.ViewColumn.One,
        { enableScripts: true, retainContextWhenHidden: true }
    );
    _panel.webview.html = html;
    _panel.onDidDispose(() => { _panel = undefined; });

    _panel.webview.onDidReceiveMessage(async msg => {
        if (msg.command === 'clear') {
            await clearErrors();
            _panel!.webview.html = buildHtml([]);
            require('../shared/show-result-webview').showResultWebview(
                'Error Log Cleared',
                'Clear Error Log',
                0,
                'The error log has been <b>cleared</b>.'
            );
        }
        if (msg.command === 'open-file') {
            const logPath = getLogPath();
            const doc = await vscode.workspace.openTextDocument(logPath);
            await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
        }
    });

    log(FEATURE, `Error log viewer opened — ${errors.length} entries`);
}

export function refreshErrorLogViewer(): void {
    if (!_panel) { return; }
    _panel.webview.html = buildHtml(getErrors());
}
