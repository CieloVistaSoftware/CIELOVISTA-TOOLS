// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * npm-scripts-tree.ts
 *
 * NPM Scripts Tree panel — TypeScript is data-only.
 * All UI (CSS, JS, HTML) lives in npm-scripts-tree.html — edit that file directly,
 * no TypeScript compile needed for UI changes.
 *
 * Flow:
 *   1. openPanel() scans workspace package.json files and opens the webview
 *   2. Webview sends { type:'ready' } — host posts { type:'init', entries:[...] }
 *   3. Webview sends { type:'run', dir, script } — host opens a terminal
 *   4. Webview sends { type:'refresh' } — host rescans and posts a fresh init
 *
 * Command: cvs.npm.tree
 */

import * as vscode from 'vscode';
import * as path   from 'path';
import * as fs     from 'fs';
import { log, logError } from '../shared/output-channel';

const FEATURE = 'npm-scripts-tree';
const COMMAND  = 'cvs.npm.tree';

let _panel: vscode.WebviewPanel | undefined;

interface ScriptEntry { name: string; cmd: string; }
interface PkgEntry    { label: string; relPath: string; absDir: string; scripts: ScriptEntry[]; }

// ─── Data collection ──────────────────────────────────────────────────────────

async function collectEntries(): Promise<PkgEntry[]> {
    const wsRoot  = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
    const seen    = new Set<string>();
    const entries: PkgEntry[] = [];

    const addDir = (absDir: string) => {
        const lower = absDir.toLowerCase();
        if (seen.has(lower)) { return; }
        seen.add(lower);
        const pkgFile = path.join(absDir, 'package.json');
        if (!fs.existsSync(pkgFile)) { return; }
        try {
            const pkg     = JSON.parse(fs.readFileSync(pkgFile, 'utf8')) as { scripts?: Record<string, string> };
            const scripts = Object.entries(pkg.scripts ?? {}).map(([name, cmd]) => ({ name, cmd }));
            if (!scripts.length) { return; }
            const relPath = wsRoot
                ? path.relative(wsRoot, pkgFile).replace(/\\/g, '/')
                : pkgFile;
            entries.push({ label: path.basename(absDir), relPath, absDir, scripts });
        } catch (err) {
            logError(
                `npm-scripts-tree: failed to parse ${pkgFile}`,
                err instanceof Error ? (err.stack ?? String(err)) : String(err),
                FEATURE
            );
        }
    };

    // Workspace roots first
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
        addDir(folder.uri.fsPath);
    }

    // Sub-packages via findFiles
    try {
        const files = await vscode.workspace.findFiles(
            '**/package.json',
            '{**/node_modules/**,**/.claude/**,**/out/**,**/dist/**}'
        );
        for (const f of files) { addDir(path.dirname(f.fsPath)); }
    } catch { /* workspace not ready */ }

    // Workspace root first, then alpha
    entries.sort((a, b) => {
        const aRoot = a.absDir.toLowerCase() === wsRoot.toLowerCase();
        const bRoot = b.absDir.toLowerCase() === wsRoot.toLowerCase();
        if (aRoot && !bRoot) { return -1; }
        if (!aRoot && bRoot) { return  1; }
        return a.label.localeCompare(b.label);
    });

    log(FEATURE, `found ${entries.length} package.json files`);
    return entries;
}

// ─── HTML shell ───────────────────────────────────────────────────────────────

function getShellHtml(): string {
    const htmlPath = path.join(__dirname, 'npm-scripts-tree.html');
    if (fs.existsSync(htmlPath)) {
        return fs.readFileSync(htmlPath, 'utf8');
    }
    return `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2em;color:#f85149">
        <h2>&#9888; npm-scripts-tree.html missing</h2>
        <p>Expected: <code>${htmlPath}</code></p>
        <p>Run <code>npm run compile</code> and reload.</p>
    </body></html>`;
}

// ─── Panel ────────────────────────────────────────────────────────────────────

async function openPanel(): Promise<void> {
    if (_panel) {
        _panel.reveal(vscode.ViewColumn.One, false);
        return;
    }

    _panel = vscode.window.createWebviewPanel(
        'npmScriptsTree', 'NPM Scripts',
        { viewColumn: vscode.ViewColumn.One, preserveFocus: false },
        { enableScripts: true, retainContextWhenHidden: true }
    );

    _panel.webview.html = getShellHtml();

    _panel.webview.onDidReceiveMessage(async (msg: { type: string; dir?: string; script?: string }) => {
        switch (msg.type) {
            case 'ready': {
                const entries = await collectEntries();
                void _panel?.webview.postMessage({ type: 'init', entries });
                break;
            }
            case 'refresh': {
                const fresh = await collectEntries();
                void _panel?.webview.postMessage({ type: 'init', entries: fresh });
                break;
            }
            case 'run': {
                if (!msg.dir || !msg.script) { break; }
                const term = vscode.window.createTerminal({
                    name: `npm: ${msg.script}`,
                    cwd:  msg.dir,
                    location: { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
                });
                term.show(true);
                term.sendText(`npm run ${msg.script}`);
                log(FEATURE, `run: ${msg.script} in ${msg.dir}`);
                break;
            }
        }
    });

    _panel.onDidDispose(() => { _panel = undefined; });
}

// ─── Activation ───────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMAND, openPanel)
    );
    log(FEATURE, 'activated');
}

export function deactivate(): void {
    _panel?.dispose();
    _panel = undefined;
}
