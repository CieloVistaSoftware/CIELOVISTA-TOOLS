import * as vscode from 'vscode';

/**
 * Opens a simple result webview showing action, duration, and result summary.
 * @param title Title for the webview panel
 * @param action Action performed (string)
 * @param durationMs Duration in milliseconds
 * @param result Summary/result string (can be HTML)
 */
export function showResultWebview(title: string, action: string, durationMs: number, result: string) {
  const panel = vscode.window.createWebviewPanel(
    'resultWebview',
    title,
    vscode.ViewColumn.Beside,
    { enableScripts: false }
  );
  panel.webview.html = `
    <html>
      <head>
        <style>
          body { font-family: sans-serif; margin: 2em; }
          .action { font-size: 1.2em; margin-bottom: 0.5em; }
          .duration { color: #888; margin-bottom: 1em; }
          .result { background: #f6f8fa; padding: 1em; border-radius: 6px; }
        </style>
      </head>
      <body>
        <div class="action"><b>Action:</b> ${action}</div>
        <div class="duration"><b>Duration:</b> ${durationMs} ms</div>
        <div class="result">${result}</div>
      </body>
    </html>
  `;
}
