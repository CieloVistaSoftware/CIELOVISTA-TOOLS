"use strict";
/*
 * Copyright (c) Cielo Vista Software. All rights reserved.
 * Licensed under the CieloVista Software proprietary license.
 */
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
// Config Editor Feature — src/features/config-editor.ts
// Provides a webview-based UI for editing config.json with in-depth descriptions for each key.
// Each config key is documented with purpose, usage, and default value.
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const show_result_webview_1 = require("../shared/show-result-webview");
const CONFIG_PATH = path.join(vscode.workspace.rootPath || '', 'config.json');
// In-depth descriptions for each config key
const CONFIG_DESCRIPTIONS = {
    projectDiscovery: 'Controls how projects are discovered. "registry" uses project-registry.json. "auto-scan" scans the defaultProjectRoot for all projects. Default: "registry".',
    defaultProjectRoot: 'Root directory for project auto-discovery. Used if projectDiscovery is set to "auto-scan". Default: "./projects".',
    enableCopilotRules: 'Enable Copilot Rules Enforcer feature. Enforces codebase rules using Copilot. Default: true.',
    enableCopilotOpenSuggested: 'Enable Copilot Open Suggested File feature. Lets you open files Copilot mentions in chat. Default: true.',
    enableTerminalCopy: 'Enable Terminal Copy Output feature. Adds a command to copy terminal output. Default: true.',
    enableTerminalSetFolder: 'Enable Terminal Set Folder feature. Lets you set the terminal working directory. Default: true.',
    enableTerminalFolderTracker: 'Enable Terminal Folder Tracker feature. Tracks and displays the current terminal folder. Default: true.',
    enableCssClassHover: 'Enable CSS Class Hover feature. Shows CSS class definitions on hover in HTML/JSX/TSX. Default: true.',
    enableDocAuditor: 'Enable Doc Auditor feature. Audits documentation coverage and quality. Default: true.',
    enableDailyAudit: 'Enable Daily Audit feature. Runs daily codebase audits and reports. Default: true.',
    enableDocConsolidator: 'Enable Doc Consolidator feature. Merges and deduplicates documentation files. Default: true.',
    enableDocCatalog: 'Enable Doc Catalog feature. Shows a catalog of all documentation projects. Default: true.',
    enableProjectLauncher: 'Enable Project Launcher feature. Quickly open and launch projects. Default: true.',
    enableCvsCommandLauncher: 'Enable CVS Command Launcher feature. Run CVS commands from the command palette. Default: true.',
    enableProjectHomeOpener: 'Enable Project Home Opener feature. Opens the home page for a project. Default: true.',
    enableNpmCommandLauncher: 'Enable NPM Command Launcher feature. Run npm commands from the command palette. Default: true.',
    enableOpenFolderAsRoot: 'Enable Open Folder As Root feature. Opens a folder as the workspace root. Default: true.',
    enableTestCoverageAuditor: 'Enable Test Coverage Auditor feature. Audits and reports test coverage. Default: true.',
    auditCoverageThreshold: 'Minimum test coverage percentage required to pass audits. Default: 80.',
    docCatalogSort: 'Sort order for the documentation catalog. "alpha" sorts alphabetically, "recent" by last updated. Default: "alpha".',
    anthropicApiKey: 'API key for Anthropic Claude. Required for Claude-powered features. Default: "" (empty).',
    openaiApiKey: 'API key for OpenAI GPT models. Required for OpenAI-powered features. Default: "" (empty).',
    customCommands: 'Array of custom CVS commands. Each entry defines a command name, script, and options. Default: [].',
    notes: 'Freeform notes or help for the config file. Not used by the extension. Default: "".'
};
function activate(context) {
    context.subscriptions.push(vscode.commands.registerCommand('cvs.config.edit', async () => {
        const start = Date.now();
        // Simulate config edit action (replace with real logic later)
        await new Promise(r => setTimeout(r, 200));
        const duration = Date.now() - start;
        (0, show_result_webview_1.showResultWebview)('Config Editor', 'Opened Config Editor (stub)', duration, 'Config Editor UI coming soon!');
    }));
}
function deactivate() { }
//# sourceMappingURL=config-editor.js.map