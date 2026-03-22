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
exports.FEATURE_REGISTRY = void 0;
exports.isFeatureEnabled = isFeatureEnabled;
exports.activate = activate;
exports.deactivate = deactivate;
/**
 * feature-toggle.ts
 * Provides a QuickPick UI for enabling/disabling individual CieloVista
 * features at runtime. Each feature's enabled state is persisted in
 * VS Code user/workspace settings under `cielovistaTools.features.<key>`.
 *
 * When a feature is toggled, the setting is updated and VS Code shows a
 * prompt to reload the window so the change takes effect (features are
 * only activated once at startup).
 *
 * Commands registered:
 *   cvs.features.configure  — open the feature toggle QuickPick
 */
const vscode = __importStar(require("vscode"));
const webview_utils_1 = require("../shared/webview-utils");
// In-depth explanations for each feature (expand as needed)
const FEATURE_EXPLANATIONS = {
    copilotRulesEnforcer: 'Injects custom rules into GitHub Copilot at startup, enforcing CieloVista coding standards and best practices automatically in your workspace.',
    copilotOpenSuggested: 'Enables the "Open Suggested File" command, allowing you to quickly open files referenced by Copilot in chat or code suggestions.',
    terminalCopyOutput: 'Adds a command to copy the output of the last terminal command to your clipboard for easy sharing or documentation.',
    terminalSetFolder: 'Lets you right-click a folder in the Explorer and instantly set the terminal working directory to that folder.',
    terminalFolderTracker: 'Tracks the last folder you cd into in the terminal, so you can quickly jump back to it with a single command.',
    terminalPromptShortener: 'Toggles the PowerShell prompt between full path and a short ">" for a cleaner terminal experience.',
    cssClassHover: 'Shows inline definitions for CSS classes when you hover over them in HTML, JSX, or TSX files.',
    pythonRunner: 'Adds a right-click command to run any .py file in the terminal using the configured Python interpreter.',
    htmlTemplateDownloader: 'Lets you download and insert HTML templates from GitHub directly into your project.',
    openaiChat: 'Enables OpenAI-powered features: explain code, refactor, generate docstrings, and chat with AI.',
    cvsCommandLauncher: 'Shows a status bar launcher for all CieloVista commands, making them easily accessible.',
    projectHomeOpener: 'Lets you open the configured CieloVista home project folder with a single command.',
    npmCommandLauncher: 'Adds a status bar launcher for npm scripts, so you can run them without opening a terminal.',
    mcpServerScaffolder: 'Scaffold a new Model Context Protocol (MCP) server project with all required files.',
    openFolderAsRoot: 'Right-click any folder and open it as the new workspace root in VS Code.',
};
const FEATURE = 'feature-toggle';
// ─── Feature registry ─────────────────────────────────────────────────────
/**
 * Complete list of features that can be toggled. The key must match the setting
 * name under `cielovistaTools.features.*` in package.json, and the activation
 * guard in extension.ts must reference the same key.
 */
exports.FEATURE_REGISTRY = [
    { key: 'copilotRulesEnforcer', label: 'Copilot Rules Enforcer', description: 'Inject custom rules into Copilot on startup' },
    { key: 'copilotOpenSuggested', label: 'Copilot Open Suggested File', description: 'Open file paths that Copilot mentions' },
    { key: 'terminalCopyOutput', label: 'Terminal Copy Output', description: 'Copy terminal output since last command' },
    { key: 'terminalSetFolder', label: 'Terminal Set Folder', description: 'cd terminal from Explorer context menu' },
    { key: 'terminalFolderTracker', label: 'Terminal Folder Tracker', description: 'Track last cd, jump back to it' },
    { key: 'terminalPromptShortener', label: 'Terminal Prompt Shortener', description: 'Toggle short/full PowerShell prompt' },
    { key: 'cssClassHover', label: 'CSS Class Hover', description: 'Hover to see CSS class definition inline' },
    { key: 'pythonRunner', label: 'Python Runner', description: 'Right-click .py → run in terminal' },
    { key: 'htmlTemplateDownloader', label: 'HTML Template: Download', description: 'Download HTML templates from GitHub' },
    { key: 'openaiChat', label: 'OpenAI Chat', description: 'OpenAI explain / refactor / docstring / chat' },
    { key: 'cvsCommandLauncher', label: 'CVS Command Launcher', description: 'Status bar launcher for all CieloVista commands' },
    { key: 'projectHomeOpener', label: 'Project Home Opener', description: 'Open configured CieloVista home project' },
    { key: 'npmCommandLauncher', label: 'NPM Command Launcher', description: 'Status bar launcher for npm scripts' },
    { key: 'mcpServerScaffolder', label: 'MCP Server Scaffolder', description: 'Scaffold a new MCP server project' },
    { key: 'openFolderAsRoot', label: 'Explorer: Open Folder as Root', description: 'Right-click folder → open as workspace root' },
];
// ─── Settings helpers ─────────────────────────────────────────────────────
/**
 * Reads the enabled state for a feature from VS Code settings.
 * Defaults to true so all features are active unless explicitly disabled.
 *
 * @param key  The feature key, e.g. 'copilotRulesEnforcer'
 * @returns    true if the feature is enabled (or if the setting doesn't exist yet)
 */
function isFeatureEnabled(key) {
    const config = vscode.workspace.getConfiguration('cielovistaTools.features');
    return config.get(key, true);
}
/**
 * Writes the enabled state for a feature into the user-level VS Code settings.
 * Uses ConfigurationTarget.Global so the preference applies everywhere.
 *
 * @param key      The feature key
 * @param enabled  Whether the feature should be active
 */
async function setFeatureEnabled(key, enabled) {
    const config = vscode.workspace.getConfiguration('cielovistaTools.features');
    await config.update(key, enabled, vscode.ConfigurationTarget.Global);
}
// ─── QuickPick command ────────────────────────────────────────────────────
/**
 * Shows a multi-select QuickPick listing every feature. Features that are
 * currently enabled appear pre-selected (picked). When the user confirms
 * the selection, any changed settings are written and a reload prompt is shown.
 */
// ─── Activate / Deactivate ────────────────────────────────────────────────
function activate(context) {
    context.subscriptions.push(vscode.commands.registerCommand('cvs.features.configure', async () => {
        const panel = vscode.window.createWebviewPanel('cvsFeaturesConfigure', 'Configure Enabled Features', vscode.ViewColumn.One, { enableScripts: true });
        panel.webview.html = getFeatureToggleHtml(context);
        // Handle messages from the webview
        panel.webview.onDidReceiveMessage(async (msg) => {
            if (msg.type === 'getStates') {
                // Read current enabled/disabled state for each feature
                const config = vscode.workspace.getConfiguration('cielovistaTools.features');
                const states = {};
                for (const f of exports.FEATURE_REGISTRY) {
                    states[f.key] = config.get(f.key, true);
                }
                panel.webview.postMessage({ type: 'states', states });
            }
            else if (msg.type === 'toggle') {
                // Update the setting for the toggled feature
                const config = vscode.workspace.getConfiguration('cielovistaTools.features');
                await config.update(msg.key, msg.enabled, vscode.ConfigurationTarget.Global);
                require('../shared/show-result-webview').showResultWebview('Feature Toggled', `Toggle Feature: ${exports.FEATURE_REGISTRY.find(f => f.key === msg.key)?.label || msg.key}`, 0, `${exports.FEATURE_REGISTRY.find(f => f.key === msg.key)?.label || msg.key} is now <b>${msg.enabled ? 'enabled' : 'disabled'}</b>. Reload window to apply changes.`);
            }
        });
    }));
}
function deactivate() { }
function getFeatureToggleHtml(context) {
    return `
    <html>
    <head>
      <style>${webview_utils_1.CVS_CSS}</style>
      <style>
        .feature-card { border: 1px solid var(--vscode-editorWidget-border); border-radius: 6px; margin-bottom: 16px; padding: 16px; background: var(--vscode-editorWidget-background); }
        .feature-title { font-size: 1.1em; font-weight: bold; margin-bottom: 4px; }
        .feature-toggle { float: right; }
        .feature-desc { color: var(--vscode-descriptionForeground); margin-bottom: 6px; }
        .feature-expl { font-size: 12px; color: var(--vscode-editor-foreground); margin-bottom: 0; }
      </style>
    </head>
    <body>
      <div class="cvs-toolbar"><span>Configure Enabled Features</span></div>
      <div style="margin-top:16px;">
        ${exports.FEATURE_REGISTRY.map(f => `
          <div class="feature-card">
            <div class="feature-title">
              ${f.label}
              <input type="checkbox" class="feature-toggle" id="toggle-${f.key}" data-key="${f.key}">
            </div>
            <div class="feature-desc">${f.description}</div>
            <div class="feature-expl">${FEATURE_EXPLANATIONS[f.key] || ''}</div>
          </div>
        `).join('')}
      </div>
      <script>
        // Request current states from extension
        window.addEventListener('DOMContentLoaded', () => {
          const vscode = acquireVsCodeApi();
          vscode.postMessage({ type: 'getStates' });
        });
        // Listen for state updates
        window.addEventListener('message', event => {
          if (event.data.type === 'states') {
            for (const [key, enabled] of Object.entries(event.data.states)) {
              const el = document.getElementById('toggle-' + key);
              if (el) el.checked = enabled;
            }
          }
        });
        // Handle toggle changes
        document.addEventListener('change', e => {
          if (e.target && e.target.classList.contains('feature-toggle')) {
            const key = e.target.getAttribute('data-key');
            const enabled = e.target.checked;
            const vscode = acquireVsCodeApi();
            vscode.postMessage({ type: 'toggle', key, enabled });
          }
        });
      </script>
    </body>
    </html>
    `;
}
//# sourceMappingURL=feature-toggle.js.map