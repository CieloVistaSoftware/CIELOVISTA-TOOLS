// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * npm-command-launcher.ts
 *
 * Shows all workspace npm scripts grouped as project cards.
 * Uses the shared PROJECT_CARD_SHELL_HTML + ProjectCardData[].
 * TypeScript never generates HTML — it only sends JSON.
 *
 * Commands:
 *   cvs.npm.showAndRunScripts
 *   cvs.npm.addScriptDescription
 */

import * as vscode from 'vscode';
import * as path   from 'path';
import * as fs     from 'fs';
import { log, logError } from '../shared/output-channel';
import { PROJECT_CARD_SHELL_HTML } from '../shared/project-card-shell';
import { buildCardFromPackageDir  } from '../shared/project-card-builder';
import type { ProjectCardData }     from '../shared/project-card-types';
import { loadRegistry, saveRegistry, REGISTRY_PATH } from '../shared/registry';
import { getMcpServerStatus, onMcpServerStatusChange, offMcpServerStatusChange } from './mcp-server-status';
import { isPortOpen } from '../shared/port-check';

const FEATURE                 = 'npm-command-launcher';
const SHOW_AND_RUN_COMMAND    = 'cvs.npm.showAndRunScripts';
const ADD_DESCRIPTION_COMMAND = 'cvs.npm.addScriptDescription';

let _statusBar: vscode.StatusBarItem | undefined;
let _panel:     vscode.WebviewPanel  | undefined;

// key = cardId::scriptName
const _runningTerminals = new Map<string, vscode.Terminal>();

function normalizeFsPath(value: string): string {
    return path.normalize(value).replace(/[\\/]+$/, '').toLowerCase();
}

function resolveCurrentProjectPath(cards: ProjectCardData[]): string {
    if (!cards.length) { return ''; }

    const pickBestMatch = (candidatePath?: string): string | undefined => {
        if (!candidatePath) { return undefined; }
        const normalizedCandidate = normalizeFsPath(candidatePath);
        let best: ProjectCardData | undefined;
        for (const card of cards) {
            const normalizedRoot = normalizeFsPath(card.rootPath);
            if (normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(normalizedRoot + path.sep)) {
                if (!best || normalizedRoot.length > normalizeFsPath(best.rootPath).length) {
                    best = card;
                }
            }
        }
        return best?.rootPath;
    };

    const activeUri = vscode.window.activeTextEditor?.document?.uri;
    if (activeUri?.scheme === 'file') {
        const activeMatch = pickBestMatch(activeUri.fsPath);
        if (activeMatch) { return activeMatch; }
    }

    const firstWorkspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const workspaceMatch = pickBestMatch(firstWorkspacePath);
    if (workspaceMatch) { return workspaceMatch; }

    return cards[0].rootPath;
}

function postRegistryToPanel(): void {
    if (!_panel) { return; }
    const registry = loadRegistry();
    const projects = (registry?.projects ?? []).map(project => ({
        ...project,
        exists: fs.existsSync(project.path),
    }));
    void _panel.webview.postMessage({ type: 'cfg-registry', projects });
}

async function scanFolderForRegistry(folderPath: string): Promise<Array<{ name: string; path: string; alreadyAdded: boolean; typeHint: string }>> {
    const registry = loadRegistry();
    const registeredSet = new Set((registry?.projects ?? []).map(project => project.path.toLowerCase()));
    const skipDirs = new Set(['.git', 'node_modules', 'out', 'dist', '.vscode', 'bin', 'obj']);
    const results: Array<{ name: string; path: string; alreadyAdded: boolean; typeHint: string }> = [];
    const entries = fs.readdirSync(folderPath, { withFileTypes: true });

    for (const entry of entries) {
        if (!entry.isDirectory()) { continue; }
        if (entry.name.startsWith('.') || skipDirs.has(entry.name)) { continue; }

        const fullPath = path.join(folderPath, entry.name);
        const alreadyAdded = registeredSet.has(fullPath.toLowerCase());
        let typeHint = 'app';

        try {
            const pkgFile = path.join(fullPath, 'package.json');
            if (fs.existsSync(pkgFile)) {
                const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8')) as { engines?: { vscode?: string } };
                typeHint = pkg.engines?.vscode ? 'vscode-extension' : 'app';
            } else {
                const subItems = fs.readdirSync(fullPath);
                if (subItems.some(item => /\.sln[x]?$/i.test(item)) || subItems.some(item => /\.csproj$/i.test(item))) {
                    typeHint = 'dotnet-service';
                }
            }
        } catch {
            // Keep default app hint.
        }

        results.push({ name: entry.name, path: fullPath, alreadyAdded, typeHint });
    }

    results.sort((left, right) => left.name.localeCompare(right.name));
    return results;
}

// ─── Collect scripts ──────────────────────────────────────────────────────────

async function collectCards(): Promise<ProjectCardData[]> {
    const byDir = new Map<string, Record<string, string>>();
    const seen  = new Set<string>();

    for (const wsFolder of vscode.workspace.workspaceFolders ?? []) {
        const pkgPath = path.join(wsFolder.uri.fsPath, 'package.json');
        if (!fs.existsSync(pkgPath)) { continue; }
        const dir = wsFolder.uri.fsPath;
        if (seen.has(dir)) { continue; }
        seen.add(dir);
        try {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { scripts?: Record<string, string> };
            const scr = pkg.scripts ?? {};
            if (Object.keys(scr).length > 0) { byDir.set(dir, scr); }
        } catch (err) {
            logError(`Failed to parse root package.json: ${pkgPath}`, err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
        }
    }

    const files = await vscode.workspace.findFiles('**/package.json', '{**/node_modules/**,**/.claude/**}');

    for (const file of files) {
        const dir = path.dirname(file.fsPath);
        if (seen.has(dir)) { continue; }
        seen.add(dir);
        try {
            const doc  = await vscode.workspace.openTextDocument(file);
            const pkg  = JSON.parse(doc.getText()) as { scripts?: Record<string, string> };
            const scr  = pkg.scripts ?? {};
            if (Object.keys(scr).length > 0) { byDir.set(dir, scr); }
        } catch (err) {
            logError(`Failed to parse: ${file.fsPath}`, err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
        }
    }

    if (byDir.size === 0) {
        const registry = loadRegistry();
        if (registry?.projects) {
            for (const project of registry.projects) {
                if (!fs.existsSync(project.path)) { continue; }
                const pkgPath = path.join(project.path, 'package.json');
                if (!fs.existsSync(pkgPath)) { continue; }
                try {
                    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { scripts?: Record<string, string> };
                    const scr = pkg.scripts ?? {};
                    if (Object.keys(scr).length > 0) { byDir.set(project.path, scr); }
                } catch (err) {
                    logError(`Failed to parse: ${pkgPath}`, err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
                }
            }
        }
    }

    if (byDir.size === 0) {
        const fallbackDirs = [path.resolve(__dirname, '../'), process.cwd()];
        for (const dir of fallbackDirs) {
            if (!dir || byDir.has(dir)) { continue; }
            const pkgPath = path.join(dir, 'package.json');
            if (!fs.existsSync(pkgPath)) { continue; }
            try {
                const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { scripts?: Record<string, string> };
                const scr = pkg.scripts ?? {};
                if (Object.keys(scr).length > 0) { byDir.set(dir, scr); }
            } catch (err) {
                logError(`Failed to parse: ${pkgPath}`, err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
            }
        }
    }

    let idx = 0;
    const cards: ProjectCardData[] = [];
    for (const [dir, scripts] of byDir) {
        idx++;
        const card = buildCardFromPackageDir(path.basename(dir), dir, scripts, idx * 100);
        if (card.name === 'mcp-server') {
            card.mcpStatusDot = getMcpServerStatus();
        }
        cards.push(card);
    }

    cards.sort((left, right) => {
        const byName = left.name.localeCompare(right.name);
        if (byName !== 0) { return byName; }
        return left.rootPath.localeCompare(right.rootPath);
    });

    log(FEATURE, `collectCards: ${cards.length} projects found`);
    return cards;
}

// ─── Port status polling + exponential backoff auto-restart ──────────────────

let _portPollTimer: ReturnType<typeof setInterval> | undefined;
let _latestCards: ProjectCardData[] = [];

// Tracks per-card retry state: name → { attempt, timer, stopped }
const _retryState = new Map<string, { attempt: number; timer: ReturnType<typeof setTimeout> | undefined; stopped: boolean }>();

function stopRetry(name: string): void {
    const s = _retryState.get(name);
    if (s) { s.stopped = true; if (s.timer) { clearTimeout(s.timer); s.timer = undefined; } }
    _retryState.delete(name);
}

function scheduleRestart(card: ProjectCardData, dir: string): void {
    stopRetry(card.name);
    const state = { attempt: 0, timer: undefined as ReturnType<typeof setTimeout> | undefined, stopped: false };
    _retryState.set(card.name, state);

    const tryStart = async () => {
        if (state.stopped || !_panel) { return; }
        const open = await isPortOpen(card.port!, 600);
        if (open || state.stopped) { stopRetry(card.name); return; }
        if (state.attempt >= 10) {
            log(FEATURE, `${card.name}: port ${card.port} still down after 10 retries — giving up`);
            stopRetry(card.name);
            return;
        }
        state.attempt++;
        const delayMs = Math.min(Math.pow(2, state.attempt) * 1000, 60000);
        log(FEATURE, `${card.name}: port ${card.port} down — restart attempt ${state.attempt}/10, retrying in ${delayMs / 1000}s`);

        const term = vscode.window.createTerminal({ name: `restart: ${card.name} (${state.attempt})`, cwd: dir });
        term.sendText('npm run start');
        term.show(true);

        state.timer = setTimeout(tryStart, delayMs + 3000);
    };

    state.timer = setTimeout(tryStart, 2000);
}

async function pushPortStatuses(cards: ProjectCardData[]): Promise<void> {
    if (!_panel) { return; }
    const portCards = cards.filter(c => c.port !== undefined);
    await Promise.all(portCards.map(async c => {
        const wasOpen = c.portStatus === 'open';
        const open = await isPortOpen(c.port!, 600);
        const newStatus: 'open' | 'closed' = open ? 'open' : 'closed';
        if (newStatus !== c.portStatus) {
            c.portStatus = newStatus;
            _panel?.webview.postMessage({ type: 'port-status', name: c.name, port: c.port, status: newStatus });
        }
        // Port just went down — trigger backoff restart if start script exists
        if (wasOpen && !open && c.scripts?.some(s => s.name === 'start' || s.name === 'dev') && !_retryState.has(c.name)) {
            scheduleRestart(c, c.rootPath);
        }
        // Port came back up — cancel any pending retry
        if (!wasOpen && open) { stopRetry(c.name); }
    }));
}

// ─── Panel ────────────────────────────────────────────────────────────────────

async function openPanel(): Promise<void> {
    log(FEATURE, `openPanel called — existing panel: ${!!_panel}`);
    const cards = await collectCards();
    if (!cards.length) {
        vscode.window.showWarningMessage('No npm scripts found in workspace.');
        return;
    }

    _latestCards = cards;
    const currentProjectPath = resolveCurrentProjectPath(_latestCards);
    const sendInit = () => {
        _panel?.webview.postMessage({
            type: 'init',
            title: 'package.json Scripts' + (_latestCards.length === 1 ? '  ·  ' + _latestCards[0].name : ''),
            cards: _latestCards,
            currentProjectPath,
        });
    };

    if (_panel) {
        sendInit();
        _panel.reveal(vscode.ViewColumn.One, false);
        return;
    }

    // Track whether the webview's 'ready' handshake arrived.
    // The fallback timeout below posts init if it never does.
    let _readyReceived = false;

    _panel = vscode.window.createWebviewPanel(
        'npmScripts', 'package.json',
        { viewColumn: vscode.ViewColumn.One, preserveFocus: false },
        { enableScripts: true, retainContextWhenHidden: true }
    );

    // Live MCP status dot — push updates to the webview whenever status changes
    const mcpStatusListener = (status: 'up' | 'down') => {
        _panel?.webview.postMessage({ type: 'mcp-dot', name: 'mcp-server', status });
    };
    onMcpServerStatusChange(mcpStatusListener);

    _panel.onDidDispose(() => {
        offMcpServerStatusChange(mcpStatusListener);
        if (_portPollTimer) { clearInterval(_portPollTimer); _portPollTimer = undefined; }
        _retryState.forEach((_, name) => stopRetry(name));
        _runningTerminals.forEach(term => term.dispose());
        _runningTerminals.clear();
        _panel = undefined;
    });

    _panel.webview.onDidReceiveMessage(async msg => {
        switch (msg.command) {
            case 'run': {
                const { id, script, dir } = msg as { id: string; script: string; dir: string; folder: string };
                const jobKey = `${id}::${script}`;

                const sendCard = (type: string, payload: object) =>
                    _panel?.webview.postMessage({ type, id, script, ...payload });

                sendCard('status', { state: 'running' });

                const term = vscode.window.createTerminal({
                    name: `npm: ${script}`,
                    cwd: dir,
                    location: { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
                });
                term.show(true);
                term.sendText(`npm run ${script}`);
                _runningTerminals.set(jobKey, term);

                const disposable = vscode.window.onDidCloseTerminal(closed => {
                    if (closed !== term) { return; }
                    disposable.dispose();
                    _runningTerminals.delete(jobKey);
                    const code = closed.exitStatus?.code;
                    const killed = closed.exitStatus?.reason === vscode.TerminalExitReason.User || code === undefined;
                    const state = killed ? 'stopped' : code === 0 ? 'ok' : 'error';
                    sendCard('status', { state, code: code ?? 1 });
                    log(FEATURE, `${script} exited ${killed ? 'killed' : code}`);
                });
                break;
            }
            case 'stop': {
                const jobKey = `${msg.id}::${msg.script}`;
                const term = _runningTerminals.get(jobKey);
                if (term) { term.dispose(); _runningTerminals.delete(jobKey); }
                // Cancel any pending backoff retry for this card
                const cardNameForStop = (msg.id as string || '').split('::')[1] ?? '';
                if (cardNameForStop) { stopRetry(cardNameForStop); }
                break;
            }
            case 'stop-current': {
                _runningTerminals.forEach(term => term.dispose());
                _runningTerminals.clear();
                _retryState.forEach((_, name) => stopRetry(name));
                break;
            }
            case 'open-browser': {
                if (msg.url) {
                    vscode.env.openExternal(vscode.Uri.parse(msg.url as string));
                }
                break;
            }
            case 'open-folder': {
                if (msg.path) {
                    vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(msg.path), { forceNewWindow: true });
                }
                break;
            }
            case 'open-claude': {
                if (msg.path && fs.existsSync(msg.path)) {
                    vscode.workspace.openTextDocument(msg.path).then(doc =>
                        vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside)
                    );
                }
                break;
            }
            case 'create-claude': {
                if (msg.path) {
                    const dest    = path.join(msg.path, 'CLAUDE.md');
                    const name    = path.basename(msg.path);
                    const today   = new Date().toISOString().slice(0, 10);
                    const content = `# CLAUDE.md — ${name}\n\n> Created: ${today}\n\n## Project Overview\n\n**Path:** ${msg.path}\n\n## Session Start Checklist\n\n- [ ] Read CLAUDE.md\n- [ ] Check CURRENT-STATUS.md\n- [ ] Review last session via recent_chats\n`;
                    fs.writeFileSync(dest, content, 'utf8');
                    vscode.workspace.openTextDocument(dest).then(doc =>
                        vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside)
                    );
                }
                break;
            }
            case 'create-tests': {
                const projectPath = msg.path as string | undefined;
                const projectName = msg.name as string | undefined;
                if (!projectPath) { break; }
                vscode.commands.executeCommand('cvs.audit.testCoverage').then(() => {
                    void vscode.window.showInformationMessage(`Opening Test Coverage Dashboard for ${projectName || path.basename(projectPath)}.`);
                }, () => {
                    void vscode.window.showInformationMessage(`Run "Audit: Test Coverage Dashboard" to generate tests for ${projectName || path.basename(projectPath)}.`);
                });
                break;
            }
            case 'get-registry':
                postRegistryToPanel();
                break;
            case 'ready': {
                _readyReceived = true;
                const folderSuffix2 = _latestCards.length === 1 ? '  ·  ' + _latestCards[0].name : '';
                const currentProjectPath2 = resolveCurrentProjectPath(_latestCards);
                void _panel?.webview.postMessage({
                    type: 'init',
                    title: 'package.json Scripts' + folderSuffix2,
                    cards: _latestCards,
                    currentProjectPath: currentProjectPath2,
                });
                void pushPortStatuses(_latestCards);
                if (_portPollTimer) { clearInterval(_portPollTimer); }
                _portPollTimer = setInterval(() => { void pushPortStatuses(_latestCards); }, 5000);
                break;
            }
            case 'browse-for-scan': {
                const current = msg.current as string | undefined;
                vscode.window.showOpenDialog({
                    canSelectFolders: true, canSelectFiles: false, canSelectMany: false,
                    openLabel: 'Select folder to scan for projects',
                    defaultUri: current ? vscode.Uri.file(current) : undefined,
                }).then(result => {
                    if (result?.[0]) { void _panel?.webview.postMessage({ command: 'set-scan-path', value: result[0].fsPath }); }
                });
                break;
            }
            case 'cfg-scan-folder': {
                const folderPath = msg.path as string | undefined;
                if (!folderPath || !fs.existsSync(folderPath)) {
                    void _panel?.webview.postMessage({ type: 'cfg-scan-results', error: `Path not found: ${folderPath || ''}`, results: [] });
                    break;
                }
                scanFolderForRegistry(folderPath).then(results => {
                    void _panel?.webview.postMessage({ type: 'cfg-scan-results', results, error: null });
                }).catch(error => {
                    void _panel?.webview.postMessage({ type: 'cfg-scan-results', error: String(error), results: [] });
                });
                break;
            }
            case 'cfg-remove-project': {
                const removePath = msg.path as string | undefined;
                if (!removePath) { break; }
                const registry = loadRegistry();
                if (!registry) { break; }
                const targetPath = normalizeFsPath(removePath);
                const beforeCount = registry.projects.length;
                registry.projects = registry.projects.filter(project => normalizeFsPath(project.path) !== targetPath);
                const removed = registry.projects.length < beforeCount;
                if (removed) {
                    saveRegistry(registry);
                }
                void _panel?.webview.postMessage({ type: 'cfg-remove-result', path: removePath, removed });
                postRegistryToPanel();
                break;
            }
            case 'cfg-add-project': {
                const addPath = msg.path as string | undefined;
                const name = msg.name as string | undefined;
                const type = msg.type as string | undefined;
                if (!addPath || !name) { break; }
                const registry = loadRegistry();
                if (!registry) { break; }
                const normalizedAddPath = normalizeFsPath(addPath);
                if (!registry.projects.some(project => normalizeFsPath(project.path) === normalizedAddPath)) {
                    registry.projects.push({ name, path: addPath, type: type || 'app', description: '' });
                    saveRegistry(registry);
                }
                postRegistryToPanel();
                break;
            }
        }
    });

    // Keep init payload handshake-driven via the webview's 'ready' message.
    // This avoids timing races where a fixed-delay postMessage can be missed.
    _panel.webview.html = PROJECT_CARD_SHELL_HTML;

    // Fallback: if the webview never sends 'ready', push init after a delay.
    setTimeout(() => {
        if (!_readyReceived && _panel && _latestCards.length) {
            void _panel.webview.postMessage({
                type: 'init',
                title: 'package.json Scripts' + (_latestCards.length === 1 ? '  ·  ' + _latestCards[0].name : ''),
                cards: _latestCards,
                currentProjectPath: resolveCurrentProjectPath(_latestCards),
            });
            void pushPortStatuses(_latestCards);
            if (_portPollTimer) { clearInterval(_portPollTimer); }
            _portPollTimer = setInterval(() => { void pushPortStatuses(_latestCards); }, 5000);
        }
    }, 1500);

    log(FEATURE, `Opened with ${cards.length} project cards`);
}

// ─── Activation ───────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
    _statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 95);
    _statusBar.text    = '$(package) package.json';
    _statusBar.tooltip = 'package.json Scripts: Show and Run';
    _statusBar.command = SHOW_AND_RUN_COMMAND;
    _statusBar.show();
    context.subscriptions.push(_statusBar);
    context.subscriptions.push(
        vscode.commands.registerCommand(SHOW_AND_RUN_COMMAND, openPanel),
        vscode.commands.registerCommand(ADD_DESCRIPTION_COMMAND, openPanel),
    );
    log(FEATURE, 'activated');
}

export function deactivate(): void {
    _runningTerminals.forEach(term => term.dispose());
    _runningTerminals.clear();
    if (_panel)     { _panel.dispose();     _panel = undefined; }
    if (_statusBar) { _statusBar.dispose(); _statusBar = undefined; }
}
