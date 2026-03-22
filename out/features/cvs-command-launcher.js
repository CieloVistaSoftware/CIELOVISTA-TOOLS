"use strict";
// This is a stub for the missing cvs-command-launcher.ts file.
// It will allow us to add persistent card click state logic for the launcher webview.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const DATA_FILE = path.join(__dirname, '../../data/last-card-click.json');
function activate(context) {
    context.subscriptions.push(vscode.commands.registerCommand('cvs.commands.showAll', () => {
        showLauncherPanel();
    }));
}
function showLauncherPanel() {
    const panel = vscode.window.createWebviewPanel('cvsLauncher', 'CieloVista Tools', vscode.ViewColumn.One, { enableScripts: true });
    // Load last card click state
    let lastState = '';
    try {
        lastState = fs.readFileSync(DATA_FILE, 'utf8');
    }
    catch { }
    panel.webview.html = getLauncherHtml(lastState);
    panel.webview.onDidReceiveMessage(msg => {
        if (msg.type === 'cardClick') {
            // Save the last card click state
            fs.writeFileSync(DATA_FILE, JSON.stringify(msg, null, 2), 'utf8');
        }
    });
}
function getLauncherHtml(lastState) {
    return `<!DOCTYPE html>
  <html><body>
    <h1>CieloVista Tools Launcher</h1>
    <div id="last-state">${lastState ? `<pre>${lastState}</pre>` : 'No card click yet.'}</div>
    <button onclick="clickCard('example')">Simulate Card Click</button>
    <script>
      function clickCard(id) {
        const msg = { type: 'cardClick', cardId: id, timestamp: new Date().toISOString() };
        vscode.postMessage(msg);
        document.getElementById('last-state').innerHTML = '<pre>' + JSON.stringify(msg, null, 2) + '</pre>';
      }
      const vscode = acquireVsCodeApi();
    </script>
  </body></html>`;
}
function deactivate() { }
//# sourceMappingURL=cvs-command-launcher.js.map