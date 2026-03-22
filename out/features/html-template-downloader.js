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
exports.activate = activate;
exports.deactivate = deactivate;
/**
 * html-template-downloader.ts
 * Downloads HTML templates from the CieloVistaSoftware GitHub repository
 * and saves them into the current workspace.  Also provides a utility
 * command to open a path currently on the clipboard in Windows Explorer.
 *
 * Commands registered:
 *   cvs.htmlTemplates.download          — pick and download a template
 *   cvs.htmlTemplates.openClipboardPath — HTML Template: Open Clipboard Path
 */
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const https = __importStar(require("https"));
const output_channel_1 = require("../shared/output-channel");
const terminal_utils_1 = require("../shared/terminal-utils");
const FEATURE = 'html-template-downloader';
/** Base URL for the CieloVistaSoftware HTML templates repo. */
const REPO_RAW_BASE = 'https://raw.githubusercontent.com/CieloVistaSoftware/htmltemplates/main';
/** Known templates available for download. */
const TEMPLATES = [
    { label: 'Starter Page', file: 'starter.html', description: 'Minimal HTML5 boilerplate' },
    { label: 'Dashboard', file: 'dashboard.html', description: 'Admin dashboard layout' },
    { label: 'Landing Page', file: 'landing.html', description: 'Marketing landing page' },
    { label: 'Component Playground', file: 'playground.html', description: 'WB component test page' },
];
// ─── Download helper ─────────────────────────────────────────────────────────
function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        https.get(url, res => {
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode} for ${url}`));
                return;
            }
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}
async function downloadTemplate() {
    const choice = await vscode.window.showQuickPick(TEMPLATES.map(t => ({ label: t.label, description: t.description, detail: t.file })), { placeHolder: 'Select a template to download' });
    if (!choice) {
        return;
    }
    const template = TEMPLATES.find(t => t.label === choice.label);
    if (!template) {
        return;
    }
    // Determine save location
    const folders = vscode.workspace.workspaceFolders;
    const defaultDir = folders?.[0]?.uri.fsPath ?? require('os').homedir();
    const saveUri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(path.join(defaultDir, template.file)),
        filters: { 'HTML Files': ['html'] },
        saveLabel: 'Save Template',
    });
    if (!saveUri) {
        return;
    }
    try {
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Downloading ${template.label}…` }, async () => {
            const url = `${REPO_RAW_BASE}/${template.file}`;
            const content = await fetchUrl(url);
            fs.writeFileSync(saveUri.fsPath, content, 'utf8');
            (0, output_channel_1.log)(FEATURE, `Downloaded ${url} → ${saveUri.fsPath}`);
            // Open the file after download
            const doc = await vscode.workspace.openTextDocument(saveUri);
            await vscode.window.showTextDocument(doc);
            // Show a result webview instead of notification
            require('../shared/show-result-webview').showResultWebview('HTML Template Downloaded', `Downloaded ${template.label}`, 0, `Template <b>${template.label}</b> saved as <b>${path.basename(saveUri.fsPath)}</b>.`);
        });
    }
    catch (err) {
        (0, output_channel_1.logError)(FEATURE, 'Template download failed', err);
        require('../shared/show-result-webview').showResultWebview('Download Failed', `Download ${template.label}`, 0, `Download failed: <b>${err}</b>`);
    }
}
// ─── Open clipboard path in Explorer ─────────────────────────────────────────
async function openClipboardPath() {
    try {
        const text = (await vscode.env.clipboard.readText()).trim();
        if (!text || !fs.existsSync(text)) {
            vscode.window.showWarningMessage(`Clipboard does not contain a valid path: "${text}"`);
            return;
        }
        const terminal = (0, terminal_utils_1.getActiveOrCreateTerminal)();
        terminal.show();
        // Use explorer.exe on Windows; xdg-open on Linux; open on macOS
        const cmd = process.platform === 'win32'
            ? `explorer "${text}"`
            : process.platform === 'darwin'
                ? `open "${text}"`
                : `xdg-open "${text}"`;
        terminal.sendText(cmd);
        (0, output_channel_1.log)(FEATURE, `Opened path in Explorer: ${text}`);
    }
    catch (err) {
        (0, output_channel_1.logError)(FEATURE, 'openClipboardPath failed', err);
    }
}
// ─── Activate ────────────────────────────────────────────────────────────────
function activate(context) {
    (0, output_channel_1.log)(FEATURE, 'Activating');
    context.subscriptions.push(vscode.commands.registerCommand('cvs.htmlTemplates.download', downloadTemplate), vscode.commands.registerCommand('cvs.htmlTemplates.openClipboardPath', openClipboardPath));
}
function deactivate() { }
//# sourceMappingURL=html-template-downloader.js.map