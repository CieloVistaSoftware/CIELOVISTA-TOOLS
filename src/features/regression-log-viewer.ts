// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * regression-log-viewer.ts
 *
 * Webview panel showing data/regressions.json — the structured companion to
 * docs/REGRESSION-LOG.md.  Each entry shows severity, status, the linked
 * GitHub issue (if any), and buttons to file an issue or mark as fixed.
 *
 * Command: cvs.tools.regressionLog
 */

import * as vscode from 'vscode';
import * as fs     from 'fs';
import * as path   from 'path';
import { fileRegressionAsIssue } from '../shared/github-issue-filer';
import type { RegressionEntry }  from '../shared/github-issue-filer';
import { log } from '../shared/output-channel';

const FEATURE    = 'regression-log-viewer';
const DATA_PATH  = path.join(__dirname, '..', '..', 'data', 'regressions.json');

let _panel: vscode.WebviewPanel | undefined;

// ─── JSON helpers ─────────────────────────────────────────────────────────────

function readEntries(): RegressionEntry[] {
    try {
        if (!fs.existsSync(DATA_PATH)) { return []; }
        const parsed = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function writeEntries(entries: RegressionEntry[]): void {
    fs.writeFileSync(DATA_PATH, JSON.stringify(entries, null, 2), 'utf8');
}

function patchEntry(regId: string, patch: Partial<RegressionEntry>): void {
    const entries = readEntries();
    const idx = entries.findIndex(e => e.regId === regId);
    if (idx === -1) { return; }
    Object.assign(entries[idx], patch);
    writeEntries(entries);
}

// ─── HTML builder ─────────────────────────────────────────────────────────────

function esc(s: string): string {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function severityColor(s: string): string {
    const m: Record<string, string> = {
        critical: '#f48771',
        high:     '#e9a93a',
        medium:   '#cca700',
        low:      '#58a6ff',
    };
    return m[s.toLowerCase()] ?? '#888';
}

function statusColor(s: string): string {
    return s === 'fixed' ? '#3fb950' : '#e9a93a';
}

function buildHtml(entries: RegressionEntry[]): string {
    const sorted = [...entries].reverse(); // newest first

    const openCount   = entries.filter(e => e.status !== 'fixed').length;
    const fixedCount  = entries.filter(e => e.status === 'fixed').length;

    const rows = sorted.length === 0
        ? `<div class="empty">✅ No regressions on record.</div>`
        : sorted.map(e => {
            const sevColor  = severityColor(e.severity);
            const statColor = statusColor(e.status);

            const issueBtn = e.githubIssueNumber
                ? `<button class="btn-issue btn-filed" data-action="open-issue" data-url="${esc(e.githubIssueUrl ?? '')}" title="Filed as ${esc(e.githubIssueNumber.toString())} — click to open">✅ #${e.githubIssueNumber}</button>`
                : `<button class="btn-issue" data-action="file-as-issue" data-reg-id="${esc(e.regId)}" title="File a GitHub issue for this regression">⚡ File as Issue</button>`;

            const fixBtn = e.status !== 'fixed'
                ? `<button class="btn-fix" data-action="mark-fixed" data-reg-id="${esc(e.regId)}" title="Record this regression as fixed">🔧 Mark Fixed</button>`
                : (e.fixedDate ? `<span class="fixed-date">Fixed ${esc(e.fixedDate)}${e.releaseVersion ? ' · v' + esc(e.releaseVersion) : ''}</span>` : '');

            return `<div class="entry ${e.status === 'fixed' ? 'entry-fixed' : 'entry-open'}" data-reg-id="${esc(e.regId)}">
  <div class="entry-header">
    <span class="entry-reg-id">${esc(e.regId)}</span>
    <span class="entry-sev" style="color:${sevColor};border-color:${sevColor}">${esc(e.severity.toUpperCase())}</span>
    <span class="entry-status" style="color:${statColor};border-color:${statColor}">${esc(e.status.toUpperCase())}</span>
    <span class="entry-date">${esc(e.date)}</span>
    <div class="entry-actions">
      ${issueBtn}
      ${fixBtn}
    </div>
  </div>
  <div class="entry-title">${esc(e.title)}</div>
  <div class="entry-desc">${esc(e.description)}</div>
  ${e.rule ? `<details class="entry-rule"><summary>Rule established</summary><div class="rule-body">${esc(e.rule)}</div></details>` : ''}
</div>`;
        }).join('');

    const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);font-size:13px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background)}
.toolbar{position:sticky;top:0;z-index:10;background:var(--vscode-editor-background);border-bottom:1px solid var(--vscode-panel-border);padding:10px 16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.toolbar h2{font-size:1.05em;font-weight:700;flex:1}
.pill{display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600;border:1px solid}
.pill-open{border-color:#e9a93a;color:#e9a93a}
.pill-fixed{border-color:#3fb950;color:#3fb950}
.btn-toolbar{border:none;padding:5px 14px;border-radius:3px;cursor:pointer;font-size:12px;font-weight:600;background:var(--vscode-button-background);color:var(--vscode-button-foreground)}
.btn-toolbar:hover{background:var(--vscode-button-hoverBackground)}
.content{padding:12px 16px 40px}
.empty{padding:40px;text-align:center;color:var(--vscode-descriptionForeground)}
.entry{background:var(--vscode-textCodeBlock-background);border:1px solid var(--vscode-panel-border);border-radius:4px;padding:10px 12px;margin-bottom:8px}
.entry-open{border-left:4px solid #e9a93a}
.entry-fixed{border-left:4px solid #3fb950;opacity:.85}
.entry-header{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px}
.entry-reg-id{font-weight:700;font-size:12px;font-family:var(--vscode-editor-font-family);color:var(--vscode-editor-foreground)}
.entry-sev,.entry-status{font-size:10px;font-weight:700;padding:1px 6px;border-radius:3px;border:1px solid currentColor}
.entry-date{font-size:10px;color:var(--vscode-descriptionForeground);margin-left:auto}
.entry-actions{display:flex;gap:6px;align-items:center}
.btn-issue,.btn-fix{border:1px solid transparent;border-radius:3px;padding:2px 9px;cursor:pointer;font-size:10px;font-weight:600;font-family:inherit;white-space:nowrap;background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}
.btn-issue:hover,.btn-fix:hover{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border-color:var(--vscode-focusBorder)}
.btn-issue:disabled,.btn-fix:disabled{opacity:.5;cursor:wait}
.btn-filed{background:transparent;color:#3fb950;border-color:#3fb950;cursor:pointer}
.btn-filed:hover{background:#3fb95022}
.fixed-date{font-size:10px;color:#3fb950;font-style:italic}
.entry-title{font-size:13px;font-weight:600;margin-bottom:4px;color:var(--vscode-editor-foreground)}
.entry-desc{font-size:12px;color:var(--vscode-descriptionForeground);line-height:1.5;word-break:break-word}
.entry-rule{margin-top:8px;font-size:11px}
.entry-rule summary{cursor:pointer;color:var(--vscode-descriptionForeground);user-select:none}
.rule-body{margin-top:6px;padding:6px 10px;background:var(--vscode-editor-background);border-radius:3px;color:var(--vscode-editor-foreground);line-height:1.5;white-space:pre-wrap}
.meta{font-size:11px;color:var(--vscode-descriptionForeground);padding:8px 16px;border-top:1px solid var(--vscode-panel-border);margin-top:8px}
`;

    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><style>${CSS}</style></head><body>
<div class="toolbar">
  <h2>🔁 Regression Log</h2>
  ${openCount > 0  ? `<span class="pill pill-open">⚠️ ${openCount} open</span>` : ''}
  ${fixedCount > 0 ? `<span class="pill pill-fixed">✅ ${fixedCount} fixed</span>` : ''}
  <button class="btn-toolbar" data-action="open-markdown" title="Open REGRESSION-LOG.md">📄 Open Markdown</button>
</div>
<div class="content">${rows}</div>
<div class="meta">Source: <code>data/regressions.json</code> · Narrative: <code>docs/REGRESSION-LOG.md</code></div>
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
      vscode.postMessage({ command: 'file-as-issue', regId: btn.dataset.regId });
      return;
    }
    if (action === 'open-issue') {
      vscode.postMessage({ command: 'open-issue', url: btn.dataset.url });
      return;
    }
    if (action === 'mark-fixed') {
      btn.disabled = true;
      vscode.postMessage({ command: 'mark-fixed', regId: btn.dataset.regId });
      return;
    }
    if (action === 'open-markdown') {
      vscode.postMessage({ command: 'open-markdown' });
      return;
    }
  });

  window.addEventListener('message', function(ev) {
    var m = ev.data || {};
    if (m.type === 'file-as-issue-result') {
      var btn = document.querySelector('[data-action="file-as-issue"][data-reg-id="' + m.regId + '"]');
      if (!btn) { return; }
      if (m.ok) {
        btn.classList.add('btn-filed');
        btn.removeAttribute('disabled');
        btn.dataset.action = 'open-issue';
        btn.dataset.url    = m.url || '';
        btn.textContent    = '✅ #' + m.number;
        btn.title          = 'Filed as issue #' + m.number + ' — click to open';
      } else {
        btn.disabled = false;
        btn.textContent = '⚡ File as Issue';
      }
    }
    if (m.type === 'mark-fixed-result') {
      var btn2 = document.querySelector('[data-action="mark-fixed"][data-reg-id="' + m.regId + '"]');
      if (btn2 && btn2.parentNode) {
        var span = document.createElement('span');
        span.className = 'fixed-date';
        span.textContent = 'Fixed ' + m.fixedDate + (m.releaseVersion ? ' · v' + m.releaseVersion : '');
        btn2.parentNode.replaceChild(span, btn2);
        // Also dim the card
        var card = document.querySelector('.entry[data-reg-id="' + m.regId + '"]');
        if (card) { card.classList.replace('entry-open','entry-fixed'); }
      }
    }
  });
})();
</script>
</body></html>`;
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export async function openRegressionLogViewer(): Promise<void> {
    const entries = readEntries();
    const html    = buildHtml(entries);

    if (_panel) {
        _panel.webview.html = html;
        _panel.reveal();
        return;
    }

    _panel = vscode.window.createWebviewPanel(
        'regressionLog', '🔁 Regression Log', vscode.ViewColumn.One,
        { enableScripts: true, retainContextWhenHidden: true }
    );
    _panel.webview.html = html;
    _panel.onDidDispose(() => { _panel = undefined; });

    _panel.webview.onDidReceiveMessage(async msg => {

        if (msg.command === 'open-markdown') {
            const mdPath = path.join(__dirname, '..', '..', 'docs', 'REGRESSION-LOG.md');
            if (fs.existsSync(mdPath)) {
                const doc = await vscode.workspace.openTextDocument(mdPath);
                await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
            }
            return;
        }

        if (msg.command === 'open-issue' && msg.url) {
            void vscode.env.openExternal(vscode.Uri.parse(msg.url));
            return;
        }

        if (msg.command === 'file-as-issue' && msg.regId) {
            const entry = readEntries().find(e => e.regId === msg.regId);
            if (!entry) {
                _panel!.webview.postMessage({ type: 'file-as-issue-result', regId: msg.regId, ok: false });
                return;
            }
            log(FEATURE, `file-as-issue: filing for ${entry.regId}`);
            const result = await fileRegressionAsIssue(entry);
            if (result.ok && result.issueNumber && result.issueUrl) {
                patchEntry(entry.regId, { githubIssueNumber: result.issueNumber, githubIssueUrl: result.issueUrl });
            }
            _panel!.webview.postMessage({
                type:   'file-as-issue-result',
                regId:  msg.regId,
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
            return;
        }

        if (msg.command === 'mark-fixed' && msg.regId) {
            const releaseInput = await vscode.window.showInputBox({
                prompt:      `Release version for ${msg.regId} (optional — press Enter to skip)`,
                placeHolder: 'e.g. 1.0.1',
            });
            if (releaseInput === undefined) {
                // User pressed Escape — re-enable button
                _panel!.webview.postMessage({ type: 'mark-fixed-canceled', regId: msg.regId });
                return;
            }
            const fixedDate = new Date().toISOString().slice(0, 10);
            const patch: Partial<RegressionEntry> = {
                status:    'fixed',
                fixedDate,
                releaseVersion: releaseInput.trim() || null,
            };
            patchEntry(msg.regId, patch);
            log(FEATURE, `mark-fixed: ${msg.regId} fixed on ${fixedDate}`);
            _panel!.webview.postMessage({
                type:           'mark-fixed-result',
                regId:          msg.regId,
                fixedDate,
                releaseVersion: releaseInput.trim() || null,
            });
            return;
        }
    });

    log(FEATURE, `Regression log viewer opened — ${entries.length} entries`);
}

export function activate(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.tools.regressionLog', openRegressionLogViewer)
    );
}

export function deactivate(): void {
    _panel?.dispose();
}
