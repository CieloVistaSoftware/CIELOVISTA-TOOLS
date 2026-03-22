"use strict";
// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
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
exports._helpPanel = void 0;
exports.openHelpPanel = openHelpPanel;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const output_channel_1 = require("../../shared/output-channel");
const help_panel_1 = require("../../shared/help-panel");
const catalog_1 = require("./catalog");
const FEATURE = 'cvs-command-launcher';
function openHelpPanel(docPath, launcherPanel) {
    if (!fs.existsSync(docPath)) {
        vscode.window.showWarningMessage(`Help doc not found: ${docPath}`);
        return;
    }
    const markdown = fs.readFileSync(docPath, 'utf8');
    const cmdIds = (0, help_panel_1.extractCommandIds)(markdown);
    const cmdEntries = cmdIds
        .map(id => catalog_1.CATALOG.find(c => c.id === id))
        .filter((c) => !!c)
        .map(c => ({ id: c.id, title: c.title, description: c.description, dewey: c.dewey }));
    const h1Match = markdown.match(/^#\s+(.+)$/m);
    const featureName = h1Match ? h1Match[1].replace(/^feature:\s*/i, '') : path.basename(docPath, '.README.md');
    const html = (0, help_panel_1.buildHelpPanelHtml)(markdown, cmdEntries, featureName);
    if (exports._helpPanel) {
        exports._helpPanel.webview.html = html;
        exports._helpPanel.reveal(vscode.ViewColumn.Beside);
        return;
    }
    exports._helpPanel = vscode.window.createWebviewPanel('cvsHelp', `📄 ${featureName}`, vscode.ViewColumn.Beside, { enableScripts: true, retainContextWhenHidden: false });
    exports._helpPanel.webview.html = html;
    exports._helpPanel.onDidDispose(() => { exports._helpPanel = undefined; });
    exports._helpPanel.webview.onDidReceiveMessage(async (msg) => {
        if (msg.command === 'back') {
            exports._helpPanel?.dispose();
            launcherPanel.reveal();
            return;
        }
        if (msg.command !== 'run' || !msg.id) {
            return;
        }
        const entry = catalog_1.CATALOG.find(c => c.id === msg.id);
        const title = entry?.title ?? msg.id;
        try {
            (0, output_channel_1.log)(FEATURE, `Help panel executing: ${msg.id}`);
            await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Running: ${title}`, cancellable: false }, async () => { await vscode.commands.executeCommand(msg.id); });
            exports._helpPanel?.webview.postMessage({ type: 'done', title });
        }
        catch (err) {
            (0, output_channel_1.logError)(FEATURE, `Failed to execute ${msg.id}`, err);
            exports._helpPanel?.webview.postMessage({ type: 'error', title, message: String(err) });
        }
    });
}
//# sourceMappingURL=help.js.map