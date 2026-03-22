// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

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
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { log, logError } from '../shared/output-channel';
import { getActiveOrCreateTerminal } from '../shared/terminal-utils';

const FEATURE = 'html-template-downloader';

/** Base URL for the CieloVistaSoftware HTML templates repo. */
const REPO_RAW_BASE = 'https://raw.githubusercontent.com/CieloVistaSoftware/htmltemplates/main';

/** Known templates available for download. */
const TEMPLATES: Array<{ label: string; file: string; description: string }> = [
    { label: 'Starter Page',         file: 'starter.html',        description: 'Minimal HTML5 boilerplate' },
    { label: 'Dashboard',            file: 'dashboard.html',      description: 'Admin dashboard layout' },
    { label: 'Landing Page',         file: 'landing.html',        description: 'Marketing landing page' },
    { label: 'Component Playground', file: 'playground.html',     description: 'WB component test page' },
];

// ─── Download helper ─────────────────────────────────────────────────────────

function fetchUrl(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
        https.get(url, res => {
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode} for ${url}`));
                return;
            }
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end',  ()    => resolve(data));
        }).on('error', reject);
    });
}

async function downloadTemplate(): Promise<void> {
    const choice = await vscode.window.showQuickPick(
        TEMPLATES.map(t => ({ label: t.label, description: t.description, detail: t.file })),
        { placeHolder: 'Select a template to download' }
    );
    if (!choice) { return; }

    const template = TEMPLATES.find(t => t.label === choice.label);
    if (!template) { return; }

    // Determine save location
    const folders = vscode.workspace.workspaceFolders;
    const defaultDir = folders?.[0]?.uri.fsPath ?? require('os').homedir();

    const saveUri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(path.join(defaultDir, template.file)),
        filters: { 'HTML Files': ['html'] },
        saveLabel: 'Save Template',
    });
    if (!saveUri) { return; }

    try {
        await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: `Downloading ${template.label}…` },
            async () => {
                const url     = `${REPO_RAW_BASE}/${template.file}`;
                const content = await fetchUrl(url);
                fs.writeFileSync(saveUri.fsPath, content, 'utf8');
                log(FEATURE, `Downloaded ${url} → ${saveUri.fsPath}`);

                // Open the file after download
                const doc = await vscode.workspace.openTextDocument(saveUri);
                await vscode.window.showTextDocument(doc);
                // Show a result webview instead of notification
                require('../shared/show-result-webview').showResultWebview(
                    'HTML Template Downloaded',
                    `Downloaded ${template.label}`,
                    0,
                    `Template <b>${template.label}</b> saved as <b>${path.basename(saveUri.fsPath)}</b>.`
                );
            }
        );
    } catch (err) {
        logError(FEATURE, 'Template download failed', err);
        require('../shared/show-result-webview').showResultWebview(
            'Download Failed',
            `Download ${template.label}`,
            0,
            `Download failed: <b>${err}</b>`
        );
    }
}

// ─── Open clipboard path in Explorer ─────────────────────────────────────────

async function openClipboardPath(): Promise<void> {
    try {
        const text = (await vscode.env.clipboard.readText()).trim();
        if (!text || !fs.existsSync(text)) {
            vscode.window.showWarningMessage(`Clipboard does not contain a valid path: "${text}"`);
            return;
        }
        const terminal = getActiveOrCreateTerminal();
        terminal.show();
        // Use explorer.exe on Windows; xdg-open on Linux; open on macOS
        const cmd = process.platform === 'win32'
            ? `explorer "${text}"`
            : process.platform === 'darwin'
                ? `open "${text}"`
                : `xdg-open "${text}"`;
        terminal.sendText(cmd);
        log(FEATURE, `Opened path in Explorer: ${text}`);
    } catch (err) {
        logError(FEATURE, 'openClipboardPath failed', err);
    }
}

// ─── Activate ────────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
    log(FEATURE, 'Activating');

    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.htmlTemplates.download',          downloadTemplate),
        vscode.commands.registerCommand('cvs.htmlTemplates.openClipboardPath', openClipboardPath),
    );
}

export function deactivate(): void { /* nothing to clean up */ }
