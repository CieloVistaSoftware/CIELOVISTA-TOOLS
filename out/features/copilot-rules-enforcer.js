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
const vscode = __importStar(require("vscode"));
const output_channel_1 = require("../shared/output-channel");
const copilot_rules_utils_1 = require("../shared/copilot-rules-utils");
const webview_utils_1 = require("../shared/webview-utils");
const error_log_utils_1 = require("../shared/error-log-utils");
const FEATURE = 'copilot-rules-enforcer';
const CFG = 'cielovistaTools.copilotRulesEnforcer';
let _panel;
let _statusBar;
// ─── Helpers ──────────────────────────────────────────────────────────────────
function autoEnforceEnabled() {
    return vscode.workspace.getConfiguration(CFG).get('autoEnforce', true);
}
function updateStatusBar() {
    if (!_statusBar) {
        return;
    }
    const on = autoEnforceEnabled();
    _statusBar.text = on ? '$(check) Copilot Rules' : '$(x) Copilot Rules';
    _statusBar.tooltip = on ? 'Copilot rules active — click to view' : 'Copilot rules disabled — click to view';
    _statusBar.show();
}
function openOrRefreshPanel() {
    const rules = (0, copilot_rules_utils_1.getCurrentRules)();
    const html = (0, webview_utils_1.buildMarkdownPage)('Copilot Rules', rules, `
        const vscode = acquireVsCodeApi();
        document.getElementById('enableBtn').addEventListener('click',  () => vscode.postMessage({ command: 'enable'  }));
        document.getElementById('disableBtn').addEventListener('click', () => vscode.postMessage({ command: 'disable' }));
    `);
    if (_panel) {
        _panel.webview.html = html;
        _panel.reveal();
    }
    else {
        _panel = vscode.window.createWebviewPanel('copilotRules', 'Copilot Rules', vscode.ViewColumn.Beside, { enableScripts: true, retainContextWhenHidden: true });
        _panel.webview.html = html;
        _panel.onDidDispose(() => { _panel = undefined; });
        _panel.webview.onDidReceiveMessage(msg => {
            if (msg.command === 'enable') {
                (0, copilot_rules_utils_1.applyRules)();
                updateStatusBar();
            }
            if (msg.command === 'disable') {
                (0, copilot_rules_utils_1.removeRules)();
                updateStatusBar();
            }
        });
    }
}
// ─── Activate ────────────────────────────────────────────────────────────────
function activate(context) {
    (0, output_channel_1.log)(FEATURE, 'Activating');
    // Defensive singleton behavior so status bar entries do not duplicate.
    _statusBar?.dispose();
    _statusBar = undefined;
    _statusBar = vscode.window.createStatusBarItem('cielovista.copilotRules', vscode.StatusBarAlignment.Right, 98);
    _statusBar.name = 'CieloVista Copilot Rules';
    _statusBar.command = 'cvs.copilotRules.view';
    context.subscriptions.push(_statusBar);
    context.subscriptions.push(vscode.commands.registerCommand('cvs.copilotRules.enable', () => {
        try {
            (0, copilot_rules_utils_1.applyRules)();
        }
        catch (e) {
            (0, error_log_utils_1.logError)(e, FEATURE);
        }
        updateStatusBar();
    }), vscode.commands.registerCommand('cvs.copilotRules.disable', () => {
        try {
            (0, copilot_rules_utils_1.removeRules)();
        }
        catch (e) {
            (0, error_log_utils_1.logError)(e, FEATURE);
        }
        updateStatusBar();
    }), vscode.commands.registerCommand('cvs.copilotRules.reload', () => {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders?.length) {
            vscode.window.showWarningMessage('No workspace open.');
            return;
        }
        try {
            (0, copilot_rules_utils_1.readRulesFile)(folders[0].uri.fsPath);
            if (_panel) {
                openOrRefreshPanel();
            }
            vscode.window.showInformationMessage('Copilot rules reloaded.');
        }
        catch (e) {
            (0, error_log_utils_1.logError)(e, FEATURE);
            (0, output_channel_1.logError)(FEATURE, 'Reload failed', e);
        }
    }), vscode.commands.registerCommand('cvs.copilotRules.view', openOrRefreshPanel));
    if (autoEnforceEnabled()) {
        try {
            (0, copilot_rules_utils_1.applyRules)();
        }
        catch (e) {
            (0, error_log_utils_1.logError)(e, FEATURE);
        }
    }
    updateStatusBar();
}
function deactivate() {
    _panel?.dispose();
    _panel = undefined;
    _statusBar?.dispose();
    _statusBar = undefined;
}
//# sourceMappingURL=copilot-rules-enforcer.js.map