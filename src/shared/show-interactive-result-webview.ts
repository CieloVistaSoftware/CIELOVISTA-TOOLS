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
import { sendToCopilotChat } from '../features/terminal-copy-output';

export interface InteractiveResultOptions {
  title: string;           // Title for the webview panel
  action: string;          // Action performed (e.g., command name)
  output: string;          // Output/result to display (plain text or HTML)
  durationMs?: number;     // Optional duration in milliseconds
  onRerun?: () => void;    // Optional callback for rerun action
  onOpenLog?: () => void;  // Optional callback for open log action
  failed?: boolean;        // If true, shows "Send to Chat" button for error reporting
  viewType?: string;       // Unique key for panel isolation — callers with different viewTypes get separate panels
}

// ─── Per-viewType panel management ────────────────────────────────────────
// Each unique viewType gets its own panel so different callers (e.g. daily-audit
// vs launcher refresh) never overwrite each other's output. The map is keyed by
// viewType; each entry holds the panel and the most recent options for that panel
// (needed so message handlers always reference the latest callbacks).
const DEFAULT_VIEW_TYPE = 'interactiveResultWebview';

interface PanelEntry {
  panel: vscode.WebviewPanel;
  activeOptions: InteractiveResultOptions;
}

const _panels = new Map<string, PanelEntry>();

/**
 * Opens an interactive result webview with output and action buttons.
 *
 * Each unique `viewType` gets its own panel, so callers with different viewTypes
 * (e.g. 'dailyAuditResults' vs 'interactiveResultWebview') never overwrite each
 * other's content. Within the same viewType, the panel is reused if already open.
 *
 * @param opts InteractiveResultOptions
 */
export function showInteractiveResultWebview(opts: InteractiveResultOptions) {
  const viewType = opts.viewType ?? DEFAULT_VIEW_TYPE;

  // Update or create the entry for this viewType
  const existing = _panels.get(viewType);
  if (existing) {
    // Panel is alive — update its options so message handlers use fresh callbacks
    existing.activeOptions = opts;
  }

  if (!existing) {
    // No panel for this viewType — create one and register it
    const panel = vscode.window.createWebviewPanel(
      viewType,
      opts.title,
      vscode.ViewColumn.Beside,
      { enableScripts: true }
    );

    const entry: PanelEntry = { panel, activeOptions: opts };
    _panels.set(viewType, entry);

    // Message handler always reads from entry.activeOptions so it picks up
    // the latest callbacks even after the panel is reused with new options.
    panel.webview.onDidReceiveMessage(async (msg) => {
      const active = _panels.get(viewType)?.activeOptions;
      if (!active) { return; }

      if (msg.type === 'copy') {
        await vscode.env.clipboard.writeText(msg.text);
        vscode.window.showInformationMessage('Output copied to clipboard.');
      } else if (msg.type === 'copy-to-chat') {
        // Send output to Copilot Chat. Multiple strategies are attempted.
        // If direct insertion fails, the content is placed on clipboard with
        // a notification to press Ctrl+V in the chat input.
        try {
          const sentDirectly = await sendToCopilotChat(msg.text);
          if (sentDirectly) {
            vscode.window.showInformationMessage('Output sent to Copilot Chat.');
          } else {
            vscode.window.showInformationMessage('Output on clipboard — press Ctrl+V in Copilot Chat.');
          }
        } catch {
          vscode.window.showErrorMessage('Failed to send to chat — check output channel for details.');
        }
      } else if (msg.type === 'rerun' && active.onRerun) {
        active.onRerun();
      } else if (msg.type === 'openLog' && active.onOpenLog) {
        active.onOpenLog();
      } else if (msg.type === 'close') {
        panel.dispose();
      }
    });

    // Remove from map when disposed so next call creates a fresh panel
    panel.onDidDispose(() => {
      _panels.delete(viewType);
    });
  }

  const entry = _panels.get(viewType)!;
  entry.panel.title = opts.title;

  // Escape HTML for output if not already HTML
  const outputHtml = opts.output.includes('<') ? opts.output : `<pre>${escapeHtml(opts.output)}</pre>`;

  // Build the HTML for the webview
  entry.panel.webview.html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body {
            font-family: var(--vscode-font-family);
            margin: 2em;
            color: var(--vscode-editor-foreground);
            background: var(--vscode-editor-background);
          }
          .action { font-size: 1.2em; margin-bottom: 0.5em; }
          .duration { color: var(--vscode-descriptionForeground); margin-bottom: 1em; }
          .output {
            background: var(--vscode-textCodeBlock-background);
            border: 1px solid var(--vscode-panel-border);
            padding: 1em;
            border-radius: 6px;
            max-height: 400px;
            overflow: auto;
          }
          .buttons { margin-top: 1.5em; display: flex; gap: 12px; }
          button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            padding: 7px 18px;
            font-size: 1em;
            cursor: pointer;
          }
          button:hover { background: var(--vscode-button-hoverBackground); }
          #chatBtn {
            background: var(--vscode-testing-iconFailed, var(--vscode-errorForeground));
            color: var(--vscode-button-foreground);
          }
        </style>
      </head>
      <body>
        <div class="action"><b>Action:</b> ${escapeHtml(opts.action)}</div>
        ${opts.durationMs ? `<div class="duration"><b>Duration:</b> ${opts.durationMs} ms</div>` : ''}
        <div class="output" id="output">${outputHtml}</div>
        <div class="buttons">
          <button id="copyBtn">Copy Output</button>
          ${opts.failed ? '<button id="chatBtn">📤 Send to Chat</button>' : ''}
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
          ${opts.failed ? "document.getElementById('chatBtn').onclick = () => { const text = document.getElementById('output').innerText; vscode.postMessage({ type: 'copy-to-chat', text }); };" : ''}
          ${opts.onRerun ? "document.getElementById('rerunBtn').onclick = () => vscode.postMessage({ type: 'rerun' });" : ''}
          ${opts.onOpenLog ? "document.getElementById('logBtn').onclick = () => vscode.postMessage({ type: 'openLog' });" : ''}
          document.getElementById('closeBtn').onclick = () => vscode.postMessage({ type: 'close' });
        </script>
      </body>
    </html>
  `;

  // Reveal the panel. preserveFocus=true keeps focus in the editor/launcher.
  entry.panel.reveal(vscode.ViewColumn.Beside, true);
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
// FILE REMOVED BY REQUEST
