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
import { readPkgScripts, type PkgEntry } from '../shared/npm-scripts-reader';

const FEATURE = 'npm-scripts-tree';
const COMMAND  = 'cvs.npm.tree';

let _panel: vscode.WebviewPanel | undefined;

// Map from terminal → { dir, script } for exit-status tracking
const _termMap = new Map<vscode.Terminal, { dir: string; script: string }>();

// ─── Registered projects ──────────────────────────────────────────────────────

interface RegistryProject { name: string; path: string; }

function getRegisteredProjects(): RegistryProject[] {
    try {
        const reg = loadRegistry();
        if (!reg?.projects?.length) { return []; }
        return reg.projects
            .filter(p => p && p.path)
            .map(p => ({ name: p.name ?? path.basename(p.path), path: p.path }))
            .filter(p => p.path && fs.existsSync(p.path));
    } catch { return []; }
}

// ─── Data collection ──────────────────────────────────────────────────────────

/** The first workspace folder's path, or '' when no workspace is open. */
function workspaceRoot(): string {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
}

/** Read one directory's scripts into `entries`, deduped via `seen`. */
function addPkgDir(absDir: string, wsRoot: string, seen: Set<string>, entries: PkgEntry[]): void {
    const lower = absDir.toLowerCase();
    if (seen.has(lower)) { return; }
    seen.add(lower);
    const entry = readPkgScripts(absDir, wsRoot);
    if (entry) { entries.push(entry); }
}

/** All directories under the workspace that contain a package.json (excludes build/output dirs). */
async function findWorkspacePackageDirs(): Promise<string[]> {
    try {
        const files = await vscode.workspace.findFiles(
            '**/package.json',
            '{**/node_modules/**,**/.claude/**,**/out/**,**/dist/**,**/.vscode-test/**}'
        );
        return files.map(f => path.dirname(f.fsPath));
    } catch { return []; }
}

/** Sort the workspace root first, then alphabetically by label. */
function sortWorkspaceFirst(entries: PkgEntry[], wsRoot: string): void {
    const root = wsRoot.toLowerCase();
    entries.sort((a, b) => {
        const aRoot = a.absDir.toLowerCase() === root;
        const bRoot = b.absDir.toLowerCase() === root;
        if (aRoot !== bRoot) { return aRoot ? -1 : 1; }
        return a.label.localeCompare(b.label);
    });
}

/**
 * Collect npm-script entries. With an explicit root, scans only that folder
 * (project picker). Otherwise scans the whole workspace.
 */
async function collectEntries(explicitRoot?: string): Promise<PkgEntry[]> {
    const wsRoot  = explicitRoot ?? workspaceRoot();
    const seen    = new Set<string>();
    const entries: PkgEntry[] = [];

    if (explicitRoot) {
        addPkgDir(explicitRoot, wsRoot, seen, entries);
        return entries;
    }

    for (const folder of vscode.workspace.workspaceFolders ?? []) {
        addPkgDir(folder.uri.fsPath, wsRoot, seen, entries);
    }
    for (const dir of await findWorkspacePackageDirs()) {
        addPkgDir(dir, wsRoot, seen, entries);
    }

    sortWorkspaceFirst(entries, wsRoot);
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

// ─── Message handlers ─────────────────────────────────────────────────────────

/** Collect entries for `root` and post an `init` message; optionally include the project list. */
async function sendInit(panel: vscode.WebviewPanel, root: string, withProjects: boolean): Promise<void> {
    const entries  = await collectEntries(root);
    const projects = withProjects ? getRegisteredProjects() : undefined;
    void panel.webview.postMessage({ type: 'init', entries, projects, currentPath: root });
}

/** Build the GitHub new-issue URL for a failed npm script. */
function buildNpmIssueUrl(script: string, dir: string): string {
    const title = `[npm] \`npm run ${script}\` failed`;
    const body = [
        '## npm script failure', '',
        `**Script:** \`${script}\``,
        `**Project:** \`${dir}\``,
        `**Time:** ${new Date().toISOString()}`, '',
        'Running the script above exited with a non-zero exit code.',
        'Please check the terminal output for the full error message.', '',
        '---', '*Filed from CVT NPM Scripts viewer*',
    ].join('\n');
    const repo = dir.toLowerCase().includes('diskcleanup')
        ? 'CieloVistaSoftware/DiskCleanUp'
        : 'CieloVistaSoftware/cielovista-tools';
    const params = new URLSearchParams({ title, body, labels: 'type:bug,status:triage' });
    return `https://github.com/${repo}/issues/new?${params.toString()}`;
}

/** Reuse an open terminal for this script+dir, or create and register a new one. */
function acquireTerminal(dir: string, script: string): vscode.Terminal {
    for (const [t, info] of _termMap) {
        if (info.dir === dir && info.script === script) { t.show(true); return t; }
    }
    const term = vscode.window.createTerminal({
        name: `npm: ${script}`,
        cwd:  dir,
        location: { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    });
    _termMap.set(term, { dir, script });
    registerLaunchedTerminal(`npm: ${script}`, {
        script, command: `npm run ${script}`, cwd: dir, project: path.basename(dir),
    });
    return term;
}

/** Run a script in its project folder and notify the webview it is running. */
function runScript(panel: vscode.WebviewPanel, dir: string, script: string): void {
    const term = acquireTerminal(dir, script);
    term.sendText(`npm run ${script}`);
    panel.reveal(vscode.ViewColumn.One, false);
    void panel.webview.postMessage({ type: 'run-state', dir, script, state: 'running' });
    log(FEATURE, `run: ${script} in ${dir}`);
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
        if (!_panel) { return; }
        switch (msg.type) {
            case 'ready':
            case 'refresh':
                await sendInit(_panel, workspaceRoot(), true);
                break;
            case 'switchProject':
                if (msg.projectPath) {
                    await sendInit(_panel, msg.projectPath, false);
                    log(FEATURE, `switchProject: ${msg.projectPath}`);
                }
                break;
            case 'create-issue':
                if (msg.script && msg.dir) {
                    void vscode.env.openExternal(vscode.Uri.parse(buildNpmIssueUrl(msg.script, msg.dir)));
                    log(FEATURE, `create-issue: ${msg.script} in ${msg.dir}`);
                }
                break;
            case 'run':
                if (msg.dir && msg.script) { runScript(_panel, msg.dir, msg.script); }
                break;
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
