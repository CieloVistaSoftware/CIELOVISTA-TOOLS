// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
import * as vscode from 'vscode';

/**
 * show-result-webview.ts
 *
 * Opens a result webview showing action, duration, and result summary.
 * Panels are keyed by title — calling with the same title REUSES the
 * existing panel (appending the new entry) instead of opening a new tab.
 * Fix for #518: "Feature Toggled" was opening a new tab on every toggle.
 */

interface ResultEntry {
    action:     string;
    durationMs: number;
    result:     string;
    timestamp:  string;
}

// One panel per title — reuse on repeat calls
const _panels = new Map<string, vscode.WebviewPanel>();
const _entries = new Map<string, ResultEntry[]>();

function classifyResult(result: string): 'pass' | 'fail' | 'neutral' {
    const isFailure = /\b(fail|error|exception|not ok|\d+ failed|\[chromium\].*failed|expect\(received\))/i.test(result);
    const isPass    = /\b(success|completed|done|all tests passed|✔|✅|script completed|exit code 0|build succeeded)/i.test(result) && !isFailure;
    return isFailure ? 'fail' : isPass ? 'pass' : 'neutral';
}

function buildHtml(title: string, entries: ResultEntry[]): string {
    const rows = [...entries].reverse().map(e => {
        const cls = classifyResult(e.result);
        const dot = cls === 'fail'
            ? `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#c00;box-shadow:0 0 5px #c00;margin-right:8px;flex-shrink:0" title="Failed"></span>`
            : cls === 'pass'
            ? `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#0c4;box-shadow:0 0 5px #0c4;margin-right:8px;flex-shrink:0" title="Passed"></span>`
            : `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#666;margin-right:8px;flex-shrink:0"></span>`;
        return `<div class="entry">
  <div class="entry-header">${dot}<span class="action">${e.action}</span><span class="ts">${e.timestamp}</span></div>
  <div class="duration">Duration: ${e.durationMs} ms</div>
  <div class="result">${e.result}</div>
</div>`;
    }).join('');

    return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family,sans-serif);font-size:13px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);padding:14px 18px}
h1{font-size:1em;font-weight:700;margin-bottom:12px;color:var(--vscode-editor-foreground);border-bottom:1px solid var(--vscode-panel-border);padding-bottom:8px}
.entry{background:var(--vscode-textCodeBlock-background);border:1px solid var(--vscode-panel-border);border-radius:5px;padding:10px 12px;margin-bottom:10px}
.entry-header{display:flex;align-items:center;margin-bottom:5px}
.action{font-weight:600;flex:1}
.ts{font-size:10px;color:var(--vscode-descriptionForeground);margin-left:8px;white-space:nowrap}
.duration{font-size:11px;color:var(--vscode-descriptionForeground);margin-bottom:6px}
.result{font-size:12px;line-height:1.5;padding:8px;border-radius:4px;background:var(--vscode-editor-background);border:1px solid var(--vscode-panel-border)}
</style>
</head><body>
<h1>${title}</h1>
${rows || '<div style="color:var(--vscode-descriptionForeground);padding:20px 0">No entries yet.</div>'}
</body></html>`;
}

/**
 * Opens (or reuses) a result webview panel.
 * Panels are keyed by title — same title = same panel, new entry appended.
 *
 * @param title      Webview panel title (used as the reuse key)
 * @param action     Action performed
 * @param durationMs Duration in milliseconds
 * @param result     Summary/result string (can contain HTML)
 */
export function showResultWebview(
    title: string,
    action: string,
    durationMs: number,
    result: string,
): void {
    const entry: ResultEntry = {
        action,
        durationMs,
        result,
        timestamp: new Date().toLocaleTimeString(),
    };

    // Append to history
    if (!_entries.has(title)) { _entries.set(title, []); }
    _entries.get(title)!.push(entry);

    const existing = _panels.get(title);
    if (existing) {
        // Panel still alive — reveal and update
        existing.reveal(undefined, true);
        existing.webview.html = buildHtml(title, _entries.get(title)!);
        return;
    }

    // Create a new panel
    const panel = vscode.window.createWebviewPanel(
        'resultWebview',
        title,
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
        { enableScripts: false, retainContextWhenHidden: true },
    );
    _panels.set(title, panel);
    panel.webview.html = buildHtml(title, _entries.get(title)!);

    panel.onDidDispose(() => {
        _panels.delete(title);
        // Keep _entries so if it's re-opened history is preserved within session
    });
}
