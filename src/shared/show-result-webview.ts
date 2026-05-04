import * as vscode from 'vscode';

/**
 * Opens a simple result webview showing action, duration, and result summary.
 * @param title Title for the webview panel
 * @param action Action performed (string)
 * @param durationMs Duration in milliseconds
 * @param result Summary/result string (can be HTML)
 */
export function showResultWebview(title: string, action: string, durationMs: number, result: string) {
  // Detect test failure or pass by looking for common patterns in the result
  const isFailure = /\b(fail|error|exception|not ok|\d+ failed|\[chromium\].*failed|expect\(received\))/i.test(result);
  const isPass = /\b(success|completed|done|all tests passed|\u2714|\u2705|script completed|exit code 0|build succeeded)/i.test(result) && !isFailure;
  let indicator = '';
  if (isFailure) {
    indicator = '<div style="position:absolute;top:18px;right:32px;width:18px;height:18px;background:#c00;border-radius:50%;box-shadow:0 0 8px #c00;z-index:10;" title="Script Failed"></div>';
  } else if (isPass) {
    indicator = '<div style="position:absolute;top:18px;right:32px;width:18px;height:18px;background:#0c4;border-radius:50%;box-shadow:0 0 8px #0c4;z-index:10;" title="Script Passed"></div>';
  }
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
          body { font-family: sans-serif; margin: 2em; position:relative; }
          .action { font-size: 1.2em; margin-bottom: 0.5em; }
          .duration { color: #888; margin-bottom: 1em; }
          .result { background: #f6f8fa; padding: 1em; border-radius: 6px; }
        </style>
      </head>
      <body>
        ${indicator}
        <div class="action"><b>Action:</b> ${action}</div>
        <div class="duration"><b>Duration:</b> ${durationMs} ms</div>
        <div class="result">${result}</div>
      </body>
    </html>
  `;
}
