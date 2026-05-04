// This is a stub for the missing cvs-command-launcher.ts file.
// It will allow us to add persistent card click state logic for the launcher webview.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

const DATA_FILE = path.join(__dirname, '../../data/last-card-click.json');

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('cvs.commands.showAll', () => {
      showLauncherPanel();
    })
  );
}

function showLauncherPanel() {
  const panel = vscode.window.createWebviewPanel(
    'cvsLauncher',
    'CieloVista Tools',
    vscode.ViewColumn.One,
    { enableScripts: true }
  );

  // Load last card click state
  let lastState = '';
  try {
    lastState = fs.readFileSync(DATA_FILE, 'utf8');
  } catch {}

  panel.webview.html = getLauncherHtml(lastState);

  panel.webview.onDidReceiveMessage(msg => {
    if (msg.type === 'cardClick') {
      // Save the last card click state
      fs.writeFileSync(DATA_FILE, JSON.stringify(msg, null, 2), 'utf8');
    }
  });
}

function getLauncherHtml(lastState: string) {
  return `<!DOCTYPE html>
  <html><body>
    <h1>CieloVista Tools Launcher</h1>
    <div id="last-state">${lastState ? `<pre>${lastState}</pre>` : 'No card click yet.'}</div>
    <button id="sim-card-btn">Simulate Card Click</button>
    <script>
      const vscode = acquireVsCodeApi();
      function clickCard(id) {
        const msg = { type: 'cardClick', cardId: id, timestamp: new Date().toISOString() };
        vscode.postMessage(msg);
        document.getElementById('last-state').innerHTML = '<pre>' + JSON.stringify(msg, null, 2) + '</pre>';
      }
      document.getElementById('sim-card-btn').addEventListener('click', function() { clickCard('example'); });
    </script>
  </body></html>`;
}

export function deactivate() {}
