// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * show-interactive-result-webview.ts
 * -----------------------------------------------------------------------------
 * Opens a webview panel to display the result of a command or script execution,
 * with interactive options: Copy Output, Rerun, Close, and (optionally) Open Log.
 * Designed for use by all card "run" actions (catalog, scripts, etc).
 *
 * Usage:
 *   showInteractiveResultWebview({
 *     title: 'Rebuild Doc Catalog',
 *     action: 'Rebuild Doc Catalog',
 *     output: '...terminal output...',
 *     durationMs: 210,
 *     onRerun: () => { ... },
 *     onOpenLog: () => { ... },
 *   });
 *
 * All code must have in-depth code comments explaining purpose, logic, and implementation details.
 */

import * as vscode from 'vscode';

export interface InteractiveResultOptions {
  title: string;           // Title for the webview panel
  action: string;          // Action performed (e.g., command name)
  output: string;          // Output/result to display (plain text or HTML)
  durationMs?: number;     // Optional duration in milliseconds
  onRerun?: () => void;    // Optional callback for rerun action
  onOpenLog?: () => void;  // Optional callback for open log action
}

/**
 * Opens an interactive result webview with output and action buttons.
 *
 * @param opts InteractiveResultOptions
 */
export function showInteractiveResultWebview(opts: InteractiveResultOptions) {
  // Create a new webview panel beside the current editor
  const panel = vscode.window.createWebviewPanel(
    'interactiveResultWebview',
    opts.title,
    vscode.ViewColumn.Beside,
    { enableScripts: true }
  );

  // Escape HTML for output if not already HTML
  const outputHtml = opts.output.includes('<') ? opts.output : `<pre>${escapeHtml(opts.output)}</pre>`;

  // Build the HTML for the webview
  panel.webview.html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: sans-serif; margin: 2em; }
          .action { font-size: 1.2em; margin-bottom: 0.5em; }
          .duration { color: #888; margin-bottom: 1em; }
          .output { background: #f6f8fa; padding: 1em; border-radius: 6px; max-height: 400px; overflow: auto; }
          .buttons { margin-top: 1.5em; display: flex; gap: 12px; }
          button { background: #0066cc; color: #fff; border: none; border-radius: 4px; padding: 7px 18px; font-size: 1em; cursor: pointer; }
          button:hover { background: #0050a0; }
        </style>
      </head>
      <body>
        <div class="action"><b>Action:</b> ${escapeHtml(opts.action)}</div>
        ${opts.durationMs ? `<div class="duration"><b>Duration:</b> ${opts.durationMs} ms</div>` : ''}
        <div class="output" id="output">${outputHtml}</div>
        <div class="buttons">
          <button id="copyBtn">Copy Output</button>
          ${opts.onRerun ? '<button id="rerunBtn">Rerun</button>' : ''}
          ${opts.onOpenLog ? '<button id="logBtn">Open Log</button>' : ''}
          <button id="closeBtn">Close</button>
        </div>
        <script>
          const vscode = acquireVsCodeApi();
          document.getElementById('copyBtn').onclick = () => {
            const text = document.getElementById('output').innerText;
            vscode.postMessage({ type: 'copy', text });
          };
          ${opts.onRerun ? "document.getElementById('rerunBtn').onclick = () => vscode.postMessage({ type: 'rerun' });" : ''}
          ${opts.onOpenLog ? "document.getElementById('logBtn').onclick = () => vscode.postMessage({ type: 'openLog' });" : ''}
          document.getElementById('closeBtn').onclick = () => vscode.postMessage({ type: 'close' });
        </script>
      </body>
    </html>
  `;

  // Handle messages from the webview
  panel.webview.onDidReceiveMessage(msg => {
    if (msg.type === 'copy') {
      vscode.env.clipboard.writeText(msg.text);
      vscode.window.showInformationMessage('Output copied to clipboard.');
    } else if (msg.type === 'rerun' && opts.onRerun) {
      opts.onRerun();
    } else if (msg.type === 'openLog' && opts.onOpenLog) {
      opts.onOpenLog();
    } else if (msg.type === 'close') {
      panel.dispose();
    }
  });
}

/**
 * Escapes HTML special characters in a string.
 */
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
}
