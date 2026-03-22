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
const vscode = __importStar(require("vscode"));
const output_channel_1 = require("../../shared/output-channel");
const runner_1 = require("../daily-audit/runner");
const catalog_1 = require("./catalog");
const html_1 = require("./html");
const help_1 = require("./help");
const result_viewer_1 = require("../../shared/result-viewer");
const mcp_server_status_1 = require("../mcp-server-status");
const FEATURE = 'cvs-command-launcher';
const LAUNCHER_COMMAND_ID = 'cvs.commands.showAll';
const QUICKRUN_COMMAND_ID = 'cvs.commands.quickRun';
let _statusBar;
let _panel;
// ─── Message handler ──────────────────────────────────────────────────────────
function attachMessageHandler(panel) {
    panel.webview.onDidReceiveMessage(async (msg) => {
        if (msg.command === 'help' && msg.doc) {
            (0, help_1.openHelpPanel)(msg.doc, panel);
            return;
        }
        if (msg.command === 'back') {
            panel.reveal();
            return;
        }
        if (msg.command === 'openFolder' && msg.path) {
            const terminal = vscode.window.createTerminal({ name: 'CieloVista', cwd: msg.path });
            terminal.sendText(`cd "${msg.path}"`);
            terminal.show();
            return;
        }
        if (msg.command !== 'run' || !msg.id) {
            return;
        }
        const entry = catalog_1.CATALOG.find(c => c.id === msg.id);
        const title = entry?.title ?? msg.id;
        const startMs = Date.now();
        // Special handling for MCP server card
        if (msg.id === 'cvs.mcp.startServer') {
            // Toggle server state
            if ((0, mcp_server_status_1.getMcpServerStatus)() === 'up') {
                (0, mcp_server_status_1.stopMcpServer)();
            }
            else {
                (0, mcp_server_status_1.startMcpServer)();
            }
            // UI feedback: status will be sent by event below
            return;
        }
        try {
            (0, output_channel_1.log)(FEATURE, `Executing: ${msg.id}`);
            await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Running: ${title}`, cancellable: false }, async () => { await vscode.commands.executeCommand(msg.id); });
            const elapsed = Date.now() - startMs;
            if (entry?.action !== 'read') {
                panel.reveal(vscode.ViewColumn.One, true);
            }
            panel.webview.postMessage({ type: 'done', title, nextAction: entry?.nextAction ?? null });
            (0, result_viewer_1.showCommandResult)({
                rc: 0,
                commandId: msg.id,
                title,
                summary: `Completed in ${elapsed}ms`,
            });
        }
        catch (err) {
            const elapsed = Date.now() - startMs;
            (0, output_channel_1.logError)(FEATURE, `Failed to execute ${msg.id}`, err);
            vscode.window.showErrorMessage(`Could not run: ${msg.id}`);
            if (entry?.action !== 'read') {
                panel.reveal(vscode.ViewColumn.One, true);
            }
            panel.webview.postMessage({ type: 'error', title, message: String(err) });
            (0, result_viewer_1.showCommandResult)({
                rc: 1,
                commandId: msg.id,
                title,
                summary: `Failed after ${elapsed}ms`,
                details: String(err),
            });
        }
    });
}
// ─── Commands ─────────────────────────────────────────────────────────────────
async function showLauncherPanel() {
    const wsPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const html = (0, html_1.buildLauncherHtml)((0, runner_1.loadLastReport)(), wsPath);
    if (_panel) {
        _panel.webview.html = html;
        _panel.reveal(vscode.ViewColumn.One, true);
        return;
    }
    _panel = vscode.window.createWebviewPanel('cvsLauncher', '⚡ CieloVista Tools', vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true });
    _panel.webview.html = html;
    _panel.onDidDispose(() => { _panel = undefined; });
    attachMessageHandler(_panel);
}
function refreshLauncherPanel() {
    if (!_panel) {
        return;
    }
    const wsPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    _panel.webview.html = (0, html_1.buildLauncherHtml)((0, runner_1.loadLastReport)(), wsPath);
}
async function showQuickPick() {
    const items = catalog_1.CATALOG.map(c => ({
        label: `${c.groupIcon} ${c.title}`, description: c.group, detail: c.description, id: c.id,
    })).sort((a, b) => a.label.localeCompare(b.label));
    const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Search CieloVista commands…', matchOnDescription: true, matchOnDetail: true,
    });
    if (!picked) {
        return;
    }
    const startMs = Date.now();
    try {
        await vscode.commands.executeCommand(picked.id);
        (0, result_viewer_1.showCommandResult)({
            rc: 0,
            commandId: picked.id,
            title: picked.label.replace(/^\S+\s/, ''),
            summary: `Quick-run completed in ${Date.now() - startMs}ms`,
        });
    }
    catch (err) {
        vscode.window.showErrorMessage(`Could not run: ${picked.id}`);
        (0, result_viewer_1.showCommandResult)({
            rc: 1,
            commandId: picked.id,
            title: picked.label.replace(/^\S+\s/, ''),
            summary: `Quick-run failed`,
            details: String(err),
        });
    }
}
// ─── Activate / Deactivate ────────────────────────────────────────────────────
function activate(context) {
    // MCP server status event → update webview in real time
    (0, mcp_server_status_1.onMcpServerStatusChange)((status) => {
        if (_panel) {
            _panel.webview.postMessage({ type: 'mcp-status', status });
        }
    });
    (0, output_channel_1.log)(FEATURE, 'Activating');
    context.subscriptions.push(vscode.commands.registerCommand(LAUNCHER_COMMAND_ID, showLauncherPanel), vscode.commands.registerCommand(QUICKRUN_COMMAND_ID, showQuickPick), 
    // Internal command: called by daily-audit after a run to refresh audit dots
    // without creating a circular import dependency.
    vscode.commands.registerCommand('cvs.launcher.refresh', refreshLauncherPanel));
    // Register MCP server start/stop command for catalog integrity
    context.subscriptions.push(vscode.commands.registerCommand('cvs.mcp.startServer', async () => {
        if ((0, mcp_server_status_1.getMcpServerStatus)() === 'up') {
            (0, mcp_server_status_1.stopMcpServer)();
        }
        else {
            (0, mcp_server_status_1.startMcpServer)();
        }
    }));
    _statusBar = vscode.window.createStatusBarItem('cielovista.cvsCmds', vscode.StatusBarAlignment.Left, 100);
    _statusBar.name = 'CieloVista CVS Commands';
    _statusBar.text = '$(list-selection) CVS Cmds';
    _statusBar.tooltip = 'Open CieloVista Tools — guided search & launcher';
    _statusBar.command = LAUNCHER_COMMAND_ID;
    _statusBar.show();
    context.subscriptions.push(_statusBar);
    vscode.window.registerWebviewPanelSerializer('cvsLauncher', {
        async deserializeWebviewPanel(panel) {
            _panel = panel;
            _panel.webview.options = { enableScripts: true };
            const wsPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            _panel.webview.html = (0, html_1.buildLauncherHtml)((0, runner_1.loadLastReport)(), wsPath);
            _panel.onDidDispose(() => { _panel = undefined; });
            attachMessageHandler(_panel);
            (0, output_channel_1.log)(FEATURE, 'Panel restored after reload');
        }
    });
}
function deactivate() {
    help_1._helpPanel?.dispose();
    _panel?.dispose();
    _panel = undefined;
    _statusBar?.dispose();
    _statusBar = undefined;
}
//# sourceMappingURL=index.js.map