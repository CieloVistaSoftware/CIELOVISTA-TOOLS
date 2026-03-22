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
 * project-home-opener.ts
 *
 * Purpose:
 * Provide a single global command that reopens the CieloVista home project
 * from any workspace or from no-folder mode.
 *
 * Design goals:
 * - One command users can run anywhere: `cvs.project.openHome`
 * - No hardcoded machine-specific root paths in source code
 * - Clear and actionable error messaging when configuration is missing/invalid
 * - Configuration editable from VS Code Settings UI (no TypeScript edits)
 *
 * Command registered:
 *   cvs.project.openHome — opens configured CieloVista home project folder
 */
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const terminal_utils_1 = require("../shared/terminal-utils");
const output_channel_1 = require("../shared/output-channel");
const FEATURE = 'project-home-opener';
const CFG_ROOT = 'cielovistaTools';
const CFG_KEY_HOME_PATH = 'homeProjectPath';
const OPEN_HOME_COMMAND = 'cvs.project.openHome';
/**
 * Reads the configured home project path from user/workspace settings.
 *
 * Returns:
 * - Trimmed absolute/relative path string if configured
 * - Empty string when unset
 */
function getConfiguredHomePath() {
    const raw = vscode.workspace.getConfiguration(CFG_ROOT).get(CFG_KEY_HOME_PATH, '');
    return raw.trim();
}
/**
 * Resolves a configured path into an absolute filesystem path.
 *
 * Resolution rules:
 * - If path is absolute, use as-is
 * - If relative and a workspace is open, resolve relative to first workspace folder
 * - If relative and no workspace is open, return empty to force actionable error
 */
function resolveHomePath(configuredPath) {
    if (!configuredPath) {
        return '';
    }
    if (path.isAbsolute(configuredPath)) {
        return configuredPath;
    }
    const base = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!base) {
        return '';
    }
    return path.resolve(base, configuredPath);
}
/**
 * Validates that the resolved path exists and points to a directory.
 *
 * Returns a string error message when invalid, otherwise null.
 */
function validateHomePath(targetPath) {
    if (!targetPath) {
        return 'CieloVista home project path is not configured. Set "CieloVista Tools: Home Project Path" in Settings.';
    }
    if (!fs.existsSync(targetPath)) {
        return `Configured CieloVista home project path does not exist: ${targetPath}`;
    }
    try {
        const stat = fs.statSync(targetPath);
        if (!stat.isDirectory()) {
            return `Configured CieloVista home project path is not a folder: ${targetPath}`;
        }
    }
    catch (error) {
        (0, output_channel_1.logError)(FEATURE, `Unable to inspect configured path: ${targetPath}`, error);
        return `Could not validate configured CieloVista home project path: ${targetPath}`;
    }
    return null;
}
/**
 * Opens the configured CieloVista home project folder in the current window.
 *
 * Error behavior required by user request:
 * - If root folder cannot be resolved/opened, send an explicit message indicating the issue.
 */
async function openConfiguredHomeProject() {
    const configured = getConfiguredHomePath();
    const resolved = resolveHomePath(configured);
    const validationError = validateHomePath(resolved);
    if (validationError) {
        vscode.window.showErrorMessage(validationError);
        return;
    }
    try {
        (0, output_channel_1.log)(FEATURE, `Opening home project: ${resolved}`);
        await (0, terminal_utils_1.openFolderInVSCode)(vscode.Uri.file(resolved));
    }
    catch (error) {
        (0, output_channel_1.logError)(FEATURE, `Failed to open home project: ${resolved}`, error);
        vscode.window.showErrorMessage(`Failed to open Project: Open Home: ${resolved}`);
    }
}
/**
 * Activates project home opener command.
 */
function activate(context) {
    (0, output_channel_1.log)(FEATURE, 'Activating');
    context.subscriptions.push(vscode.commands.registerCommand(OPEN_HOME_COMMAND, openConfiguredHomeProject));
}
/**
 * Feature has no persistent timers/UI disposables beyond command subscription.
 */
function deactivate() {
    // No manual cleanup required.
}
//# sourceMappingURL=project-home-opener.js.map