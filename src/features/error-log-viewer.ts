// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
// FILE REMOVED BY REQUEST
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
import { getErrors, clearErrors, getLogPath, ensureLogFile, patchEntry } from '../shared/error-log-adapter';
import type { ErrorEntry } from '../shared/error-log-adapter';
import { fileErrorAsIssue } from '../shared/github-issue-filer';
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
    ${e.githubIssueNumber
        ? `<button class="btn-file-issue btn-filed" data-action="open-issue" data-url="${esc(e.githubIssueUrl ?? '')}" title="Filed as issue #${e.githubIssueNumber} — click to open">✅ Filed #${e.githubIssueNumber}</button>`
        : `<button class="btn-file-issue" data-action="file-as-issue" data-id="${e.id}" title="Open a GitHub issue on cielovista-tools with this error pre-filled">⚡ File as Issue</button>`}
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
.btn-file-issue{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:1px solid transparent;border-radius:3px;padding:2px 9px;cursor:pointer;font-size:10px;font-weight:600;font-family:inherit;white-space:nowrap}
.btn-file-issue:hover{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border-color:var(--vscode-focusBorder)}
.btn-file-issue:disabled{opacity:.5;cursor:wait}
.btn-filed{background:transparent;color:#3fb950;border-color:#3fb950;cursor:pointer}
.btn-filed:hover{background:#3fb95022;color:#3fb950;border-color:#3fb950}
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
    var action = btn.dataset.action;
    if (action === 'file-as-issue') {
      btn.disabled = true;
      btn.textContent = '⏳ Filing…';
      vscode.postMessage({ command: action, id: btn.dataset.id });
      return;
    }
    if (action === 'open-issue') {
      vscode.postMessage({ command: action, url: btn.dataset.url });
      return;
    }
    vscode.postMessage({ command: action });
  });
  // Re-enable a button when the extension reports back (success or fail)
  window.addEventListener('message', function(ev) {
    var m = ev.data || {};
    if (m.type === 'file-as-issue-result') {
      var btn = document.querySelector('.btn-file-issue[data-id="' + m.id + '"]');
      if (btn) {
        if (m.ok) {
          btn.classList.add('btn-filed');
          btn.removeAttribute('disabled');
          btn.dataset.action = 'open-issue';
          btn.dataset.url    = m.url || '';
          btn.textContent    = '✅ Filed #' + m.number;
          btn.title          = 'Filed as issue #' + m.number + ' — click to open';
        } else {
          btn.disabled = false;
          btn.textContent = '⚡ File as Issue';
        }
      }
    }
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
            log(FEATURE, 'Error log cleared by user');
            void vscode.window.showInformationMessage('Tools Error Log cleared.');
        }
        if (msg.command === 'open-file') {
            // Make sure the file exists before opening - otherwise the user gets
            // a confusing "file not found" error on a fresh install where no
            // errors have been logged yet.
            ensureLogFile();
            const logPath = getLogPath();
            const doc = await vscode.workspace.openTextDocument(logPath);
            await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
        }
        if (msg.command === 'open-issue' && msg.url) {
            void vscode.env.openExternal(vscode.Uri.parse(msg.url));
        }
        if (msg.command === 'file-as-issue' && msg.id !== undefined) {
            // Phase 1 of issue #23: file the selected error as a GitHub
            // issue on cielovista-tools. Routing-by-symbol-index is Phase 2.
            const all   = getErrors();
            // The viewer keeps id as a number for legacy entries and a hex
            // string-derived number for utils entries. Match loosely.
            const entry = all.find(e => String(e.id) === String(msg.id));
            if (!entry) {
                log(FEATURE, `file-as-issue: no entry found for id=${msg.id}`);
                _panel!.webview.postMessage({ type: 'file-as-issue-result', id: msg.id, ok: false });
                void vscode.window.showErrorMessage(`Couldn't find that error entry — try reloading the viewer.`);
                return;
            }
            log(FEATURE, `file-as-issue: posting issue for entry #${entry.id}`);
            const result = await fileErrorAsIssue(entry);
            if (result.ok && result.issueNumber && result.issueUrl) {
                patchEntry(entry.id, result.issueNumber, result.issueUrl);
            }
            _panel!.webview.postMessage({
                type:   'file-as-issue-result',
                id:     msg.id,
                ok:     result.ok,
                url:    result.issueUrl,
                number: result.issueNumber,
            });
            if (result.ok && result.issueUrl) {
                const action = await vscode.window.showInformationMessage(
                    `Filed as issue #${result.issueNumber}.`,
                    'Open in browser'
                );
                if (action === 'Open in browser') {
                    void vscode.env.openExternal(vscode.Uri.parse(result.issueUrl));
                }
            } else {
                void vscode.window.showErrorMessage(`Couldn't file as issue: ${result.error ?? 'unknown error'}`);
            }
        }
    });

    log(FEATURE, `Error log viewer opened — ${errors.length} entries`);
}

export function refreshErrorLogViewer(): void {
    if (!_panel) { return; }
    _panel.webview.html = buildHtml(getErrors());
}
