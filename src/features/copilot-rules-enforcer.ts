// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * copilot-rules-enforcer.ts
 * Injects custom Copilot instruction rules into the workspace or user settings
 * on startup and provides commands to enable, disable, reload, and view rules.
 *
 * All rules file I/O is handled by shared/copilot-rules-utils.ts.
 * This file owns only the VS Code command registrations and UI.
 *
 * Commands registered:
 *   cvs.copilotRules.enable   — apply rules (workspace or user level)
 *   cvs.copilotRules.disable  — remove rules
 *   cvs.copilotRules.reload   — re-read rules file and refresh webview
 *   cvs.copilotRules.view     — open a webview showing current rules
 */
import * as vscode from 'vscode';
import { log, logError as logErr } from '../shared/output-channel';
import { applyRules, removeRules, getCurrentRules, readRulesFile, sanitizeCopilotInstructionSettings } from '../shared/copilot-rules-utils';
import { buildMarkdownPage } from '../shared/webview-utils';
import { logError as trackError } from '../shared/error-log-utils';

const FEATURE = 'copilot-rules-enforcer';
const CFG     = 'cielovistaTools.copilotRulesEnforcer';

let _panel: vscode.WebviewPanel | undefined;
let _statusBar: vscode.StatusBarItem | undefined;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function autoEnforceEnabled(): boolean {
    return vscode.workspace.getConfiguration(CFG).get<boolean>('autoEnforce', false);
}

function updateStatusBar(): void {
    if (!_statusBar) { return; }
    const on = autoEnforceEnabled();
    _statusBar.text    = on ? '$(check) Copilot Rules' : '$(x) Copilot Rules';
    _statusBar.tooltip = on ? 'Copilot rules active — click to view' : 'Copilot rules disabled — click to view';
    _statusBar.show();
}

function openOrRefreshPanel(): void {
    const rules = getCurrentRules();
    const html  = buildMarkdownPage('Copilot Rules', rules, `
        const vscode = acquireVsCodeApi();
        document.getElementById('enableBtn').addEventListener('click',  () => vscode.postMessage({ command: 'enable'  }));
        document.getElementById('disableBtn').addEventListener('click', () => vscode.postMessage({ command: 'disable' }));
    `);

    if (_panel) {
        _panel.webview.html = html;
        _panel.reveal();
    } else {
        _panel = vscode.window.createWebviewPanel(
            'copilotRules', 'Copilot Rules', vscode.ViewColumn.Beside,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        _panel.webview.html = html;
        _panel.onDidDispose(() => { _panel = undefined; });
        _panel.webview.onDidReceiveMessage(msg => {
            if (msg.command === 'enable')  { applyRules();  updateStatusBar(); }
            if (msg.command === 'disable') { removeRules(); updateStatusBar(); }
        });
    }
}

// ─── Activate ────────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
    log(FEATURE, 'Activating');

    // Repair malformed Copilot instruction payloads that can crash chat startup.
    void sanitizeCopilotInstructionSettings();

    // Defensive singleton behavior so status bar entries do not duplicate.
    _statusBar?.dispose();
    _statusBar = undefined;

    _statusBar = vscode.window.createStatusBarItem('cielovista.copilotRules', vscode.StatusBarAlignment.Right, 98);
    _statusBar.name = 'CieloVista Copilot Rules';
    _statusBar.command = 'cvs.copilotRules.view';
    context.subscriptions.push(_statusBar);

    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.copilotRules.enable', () => {
            try { applyRules(); } catch (e) { trackError(
                e instanceof Error ? e.message : String(e),
                e instanceof Error && e.stack ? e.stack : '',
                FEATURE
            ); }
            updateStatusBar();
        }),
        vscode.commands.registerCommand('cvs.copilotRules.disable', () => {
            try { removeRules(); } catch (e) { trackError(
                e instanceof Error ? e.message : String(e),
                e instanceof Error && e.stack ? e.stack : '',
                FEATURE
            ); }
            updateStatusBar();
        }),
        vscode.commands.registerCommand('cvs.copilotRules.reload', () => {
            const folders = vscode.workspace.workspaceFolders;
            if (!folders?.length) { vscode.window.showWarningMessage('No workspace open.'); return; }
            try {
                readRulesFile(folders[0].uri.fsPath);
                if (_panel) { openOrRefreshPanel(); }
                vscode.window.showInformationMessage('Copilot rules reloaded.');
            } catch (e) {
                trackError(
                    e instanceof Error ? e.message : String(e),
                    e instanceof Error && e.stack ? e.stack : '',
                    FEATURE
                );
                logErr('Reload failed', e instanceof Error ? e.stack || String(e) : String(e), FEATURE);
            }
        }),
        vscode.commands.registerCommand('cvs.copilotRules.view', openOrRefreshPanel),
    );

    if (autoEnforceEnabled()) {
        try { applyRules(); } catch (e) { trackError(
            e instanceof Error ? e.message : String(e),
            e instanceof Error && e.stack ? e.stack : '',
            FEATURE
        ); }
    }

    updateStatusBar();
}

export function deactivate(): void {
    _panel?.dispose();
    _panel = undefined;
    _statusBar?.dispose();
    _statusBar = undefined;
}
