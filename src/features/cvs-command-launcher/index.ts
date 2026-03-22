// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

import * as vscode from 'vscode';
import { log, logError }       from '../../shared/output-channel';
import { loadLastReport }      from '../daily-audit/runner';
import { CATALOG }             from './catalog';
import { buildLauncherHtml }   from './html';
import { openHelpPanel, _helpPanel } from './help';
import { showCommandResult }   from '../../shared/result-viewer';
import { startMcpServer, stopMcpServer, getMcpServerStatus, onMcpServerStatusChange } from '../mcp-server-status';

const FEATURE             = 'cvs-command-launcher';
const LAUNCHER_COMMAND_ID = 'cvs.commands.showAll';
const QUICKRUN_COMMAND_ID = 'cvs.commands.quickRun';

let _statusBar: vscode.StatusBarItem | undefined;
let _panel:     vscode.WebviewPanel  | undefined;

// ─── Message handler ──────────────────────────────────────────────────────────

function attachMessageHandler(panel: vscode.WebviewPanel): void {
    panel.webview.onDidReceiveMessage(async msg => {
        if (msg.command === 'help' && msg.doc) { openHelpPanel(msg.doc, panel); return; }
        if (msg.command === 'back') { panel.reveal(); return; }
        if (msg.command === 'openFolder' && msg.path) {
            const terminal = vscode.window.createTerminal({ name: 'CieloVista', cwd: msg.path });
            terminal.sendText(`cd "${msg.path}"`);
            terminal.show();
            return;
        }
        if (msg.command !== 'run' || !msg.id) { return; }

        const entry = CATALOG.find(c => c.id === msg.id);
        const title = entry?.title ?? msg.id;
        const startMs = Date.now();

        // Special handling for MCP server card
        if (msg.id === 'cvs.mcp.startServer') {
            // Toggle server state
            if (getMcpServerStatus() === 'up') {
                stopMcpServer();
            } else {
                startMcpServer();
            }
            // UI feedback: status will be sent by event below
            return;
        }

        try {
            log(FEATURE, `Executing: ${msg.id}`);
            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: `Running: ${title}`, cancellable: false },
                async () => { await vscode.commands.executeCommand(msg.id); }
            );
            const elapsed = Date.now() - startMs;
            if (entry?.action !== 'read') { panel.reveal(vscode.ViewColumn.One, true); }
            panel.webview.postMessage({ type: 'done', title, nextAction: entry?.nextAction ?? null });

            showCommandResult({
                rc:        0,
                commandId: msg.id,
                title,
                summary:   `Completed in ${elapsed}ms`,
            });
        } catch (err) {
            const elapsed = Date.now() - startMs;
            logError(FEATURE, `Failed to execute ${msg.id}`, err);
            vscode.window.showErrorMessage(`Could not run: ${msg.id}`);
            if (entry?.action !== 'read') { panel.reveal(vscode.ViewColumn.One, true); }
            panel.webview.postMessage({ type: 'error', title, message: String(err) });

            showCommandResult({
                rc:        1,
                commandId: msg.id,
                title,
                summary:   `Failed after ${elapsed}ms`,
                details:   String(err),
            });
        }
    });
}

// ─── Commands ─────────────────────────────────────────────────────────────────

async function showLauncherPanel(): Promise<void> {
    const wsPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const html = buildLauncherHtml(loadLastReport(), wsPath);
    if (_panel) { _panel.webview.html = html; _panel.reveal(vscode.ViewColumn.One, true); return; }
    _panel = vscode.window.createWebviewPanel(
        'cvsLauncher', '⚡ CieloVista Tools', vscode.ViewColumn.One,
        { enableScripts: true, retainContextWhenHidden: true }
    );
    _panel.webview.html = html;
    _panel.onDidDispose(() => { _panel = undefined; });
    attachMessageHandler(_panel);
}

function refreshLauncherPanel(): void {
    if (!_panel) { return; }
    const wsPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    _panel.webview.html = buildLauncherHtml(loadLastReport(), wsPath);
}

async function showQuickPick(): Promise<void> {
    const items = CATALOG.map(c => ({
        label: `${c.groupIcon} ${c.title}`, description: c.group, detail: c.description, id: c.id,
    })).sort((a, b) => a.label.localeCompare(b.label));
    const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Search CieloVista commands…', matchOnDescription: true, matchOnDetail: true,
    });
    if (!picked) { return; }
    const startMs = Date.now();
    try {
        await vscode.commands.executeCommand(picked.id);
        showCommandResult({
            rc:        0,
            commandId: picked.id,
            title:     picked.label.replace(/^\S+\s/, ''),
            summary:   `Quick-run completed in ${Date.now() - startMs}ms`,
        });
    } catch (err) {
        vscode.window.showErrorMessage(`Could not run: ${picked.id}`);
        showCommandResult({
            rc:        1,
            commandId: picked.id,
            title:     picked.label.replace(/^\S+\s/, ''),
            summary:   `Quick-run failed`,
            details:   String(err),
        });
    }
}

// ─── Activate / Deactivate ────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {

        // MCP server status event → update webview in real time
        onMcpServerStatusChange((status) => {
            if (_panel) {
                _panel.webview.postMessage({ type: 'mcp-status', status });
            }
        });
    log(FEATURE, 'Activating');
    context.subscriptions.push(
        vscode.commands.registerCommand(LAUNCHER_COMMAND_ID,   showLauncherPanel),
        vscode.commands.registerCommand(QUICKRUN_COMMAND_ID,   showQuickPick),
        // Internal command: called by daily-audit after a run to refresh audit dots
        // without creating a circular import dependency.
        vscode.commands.registerCommand('cvs.launcher.refresh', refreshLauncherPanel),
    );

    // Register MCP server start/stop command for catalog integrity
    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.mcp.startServer', async () => {
            if (getMcpServerStatus() === 'up') {
                stopMcpServer();
            } else {
                startMcpServer();
            }
        })
    );

    _statusBar = vscode.window.createStatusBarItem('cielovista.cvsCmds', vscode.StatusBarAlignment.Left, 100);
    _statusBar.name    = 'CieloVista CVS Commands';
    _statusBar.text    = '$(list-selection) CVS Cmds';
    _statusBar.tooltip = 'Open CieloVista Tools — guided search & launcher';
    _statusBar.command = LAUNCHER_COMMAND_ID;
    _statusBar.show();
    context.subscriptions.push(_statusBar);

    vscode.window.registerWebviewPanelSerializer('cvsLauncher', {
        async deserializeWebviewPanel(panel: vscode.WebviewPanel) {
            _panel = panel;
            _panel.webview.options = { enableScripts: true };
            const wsPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            _panel.webview.html    = buildLauncherHtml(loadLastReport(), wsPath);
            _panel.onDidDispose(() => { _panel = undefined; });
            attachMessageHandler(_panel);
            log(FEATURE, 'Panel restored after reload');
        }
    });
}

export function deactivate(): void {
    _helpPanel?.dispose();
    _panel?.dispose();
    _panel     = undefined;
    _statusBar?.dispose();
    _statusBar = undefined;
}
