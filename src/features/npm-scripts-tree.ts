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
import { registerLaunchedTerminal } from '../shared/terminal-utils';
import { loadRegistry } from '../shared/registry';

const FEATURE = 'npm-scripts-tree';
const COMMAND  = 'cvs.npm.tree';

let _panel: vscode.WebviewPanel | undefined;

// Map from terminal → { dir, script } for exit-status tracking
const _termMap = new Map<vscode.Terminal, { dir: string; script: string }>();

interface ScriptEntry { name: string; cmd: string; }
interface PkgEntry    { label: string; relPath: string; absDir: string; scripts: ScriptEntry[]; }

// ─── Registered projects ──────────────────────────────────────────────────────

interface RegistryProject { name: string; path: string; }

function getRegisteredProjects(): RegistryProject[] {
    try {
        const reg = loadRegistry();
        if (!reg?.projects) { return []; }
        return Object.values(reg.projects as Record<string, { name?: string; path?: string; localPath?: string }>)
            .filter(p => p && (p.path || p.localPath))
            .map(p => ({ name: p.name ?? path.basename(p.path ?? p.localPath ?? ''), path: p.path ?? p.localPath ?? '' }))
            .filter(p => p.path && fs.existsSync(p.path));
    } catch { return []; }
}

// ─── Data collection ──────────────────────────────────────────────────────────

async function collectEntries(explicitRoot?: string): Promise<PkgEntry[]> {
    const wsRoot  = explicitRoot ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
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
            '{**/node_modules/**,**/.claude/**,**/out/**,**/dist/**,**/.vscode-test/**}'
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

    _panel.webview.onDidReceiveMessage(async (msg: { type: string; dir?: string; script?: string; projectPath?: string }) => {
        switch (msg.type) {
            case 'ready': {
                const wsRoot  = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
                const entries = await collectEntries(wsRoot);
                const projects = getRegisteredProjects();
                void _panel?.webview.postMessage({ type: 'init', entries, projects, currentPath: wsRoot });
                break;
            }
            case 'refresh': {
                const wsRoot  = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
                const fresh   = await collectEntries(wsRoot);
                const projects = getRegisteredProjects();
                void _panel?.webview.postMessage({ type: 'init', entries: fresh, projects, currentPath: wsRoot });
                break;
            }
            case 'switchProject': {
                if (!msg.projectPath) { break; }
                const entries = await collectEntries(msg.projectPath);
                void _panel?.webview.postMessage({ type: 'init', entries, currentPath: msg.projectPath });
                log(FEATURE, `switchProject: ${msg.projectPath}`);
                break;
            }
            case 'create-issue': {
                if (!msg.script || !msg.dir) { break; }
                const title = `[npm] \`npm run ${msg.script}\` failed`;
                const body = [
                    '## npm script failure',
                    '',
                    `**Script:** \`${msg.script}\``,
                    `**Project:** \`${msg.dir}\``,
                    `**Time:** ${new Date().toISOString()}`,
                    '',
                    'Running the script above exited with a non-zero exit code.',
                    'Please check the terminal output for the full error message.',
                    '',
                    '---',
                    '*Filed from CVT NPM Scripts viewer*',
                ].join('\n');
                const isDiskCleanup = msg.dir.toLowerCase().includes('diskcleanup');
                const repo = isDiskCleanup
                    ? 'CieloVistaSoftware/DiskCleanUp'
                    : 'CieloVistaSoftware/cielovista-tools';
                const params = new URLSearchParams({ title, body, labels: 'type:bug,status:triage' });
                void vscode.env.openExternal(vscode.Uri.parse(
                    `https://github.com/${repo}/issues/new?${params.toString()}`
                ));
                log(FEATURE, `create-issue: ${msg.script} in ${msg.dir}`);
                break;
            }
            case 'run': {
                if (!msg.dir || !msg.script) { break; }

                // Reuse existing terminal if one is still open for this script + dir
                let term: vscode.Terminal | undefined;
                for (const [t, info] of _termMap) {
                    if (info.dir === msg.dir && info.script === msg.script) { term = t; break; }
                }

                if (term) {
                    // Already open — bring it to view without moving it or stealing focus
                    term.show(true);
                } else {
                    term = vscode.window.createTerminal({
                        name: `npm: ${msg.script}`,
                        cwd:  msg.dir,
                        location: { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
                    });
                    _termMap.set(term, { dir: msg.dir, script: msg.script });
                    registerLaunchedTerminal(`npm: ${msg.script}`, {
                        script:  msg.script,
                        command: `npm run ${msg.script}`,
                        cwd:     msg.dir,
                        project: path.basename(msg.dir),
                    });
                }

                term.sendText(`npm run ${msg.script}`);
                // Re-reveal the webview panel so it keeps focus after the terminal opens
                _panel?.reveal(vscode.ViewColumn.One, false);
                // Tell the webview this script is now running
                void _panel?.webview.postMessage({
                    type: 'run-state', dir: msg.dir, script: msg.script, state: 'running',
                });
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
        vscode.commands.registerCommand(COMMAND, openPanel),

        // Track terminal exit codes → send run-state back to webview
        vscode.window.onDidCloseTerminal(terminal => {
            const info = _termMap.get(terminal);
            if (!info) { return; }
            _termMap.delete(terminal);
            const code = terminal.exitStatus?.code;
            // code===undefined means the terminal was closed manually (signal kill / user X)
            // treat as ok so the button doesn't flash red when the user closes the tab
            const state: 'ok' | 'error' = (code === undefined || code === 0) ? 'ok' : 'error';
            void _panel?.webview.postMessage({
                type: 'run-state', dir: info.dir, script: info.script, state,
            });
            log(FEATURE, `exit: ${info.script} code=${code ?? 'closed'} → ${state}`);
        }),
    );
    log(FEATURE, 'activated');
}

export function deactivate(): void {
    _panel?.dispose();
    _panel = undefined;
}
