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
exports.getActiveOrCreateTerminal = getActiveOrCreateTerminal;
exports.cdToFolder = cdToFolder;
exports.cdToFolderFromUri = cdToFolderFromUri;
exports.openFolderInVSCode = openFolderInVSCode;
exports.openFolderInNewWindow = openFolderInNewWindow;
exports.openFileAtLine = openFileAtLine;
exports.getAppDataPath = getAppDataPath;
/**
 * terminal-utils.ts
 * Shared terminal and file-system navigation helpers.
 *
 * Rule: if more than one feature needs terminal or folder operations,
 * the function lives here. Features import from here — they never
 * copy-paste the same logic themselves.
 */
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const output_channel_1 = require("./output-channel");
const FEATURE = 'terminal-utils';
// ─── Terminal helpers ────────────────────────────────────────────────────────
/**
 * Returns the currently active terminal, or creates a new one named
 * 'CieloVista' if none is open.
 *
 * @param name  Optional terminal name override (default: 'CieloVista')
 */
function getActiveOrCreateTerminal(name = 'CieloVista') {
    return vscode.window.activeTerminal ?? vscode.window.createTerminal(name);
}
/**
 * Changes the working directory of the active (or newly created) terminal.
 *
 * @param folderPath  Absolute path to cd into
 * @param reveal      If true (default), makes the terminal visible
 */
function cdToFolder(folderPath, reveal = true) {
    const terminal = getActiveOrCreateTerminal();
    if (reveal) {
        terminal.show();
    }
    terminal.sendText(`cd "${folderPath}"`);
    (0, output_channel_1.log)(FEATURE, `cd → ${folderPath}`);
}
/**
 * Prompts the user to pick a folder if none is provided, then cds the
 * terminal to that folder.
 *
 * @param uri  Explorer URI from a context-menu invocation (may be undefined)
 */
async function cdToFolderFromUri(uri) {
    try {
        let target = uri;
        if (!target) {
            // No URI from context menu — try active editor's directory first
            if (vscode.window.activeTextEditor?.document.uri.scheme === 'file') {
                const dir = path.dirname(vscode.window.activeTextEditor.document.uri.fsPath);
                target = vscode.Uri.file(dir);
            }
            else {
                // Fall back to folder picker
                const picked = await vscode.window.showOpenDialog({
                    canSelectFiles: false,
                    canSelectFolders: true,
                    canSelectMany: false,
                    openLabel: 'Set as Terminal Working Directory',
                });
                if (picked?.[0]) {
                    target = picked[0];
                }
            }
        }
        if (!target?.fsPath) {
            vscode.window.showErrorMessage('No folder selected.');
            return;
        }
        cdToFolder(target.fsPath);
        vscode.window.showInformationMessage(`Terminal → ${vscode.workspace.asRelativePath(target)}`);
    }
    catch (err) {
        (0, output_channel_1.logError)(FEATURE, 'cdToFolderFromUri failed', err);
        vscode.window.showErrorMessage(`Failed to set terminal directory: ${err}`);
    }
}
// ─── Folder / file open helpers ──────────────────────────────────────────────
/**
 * Opens a folder in VS Code (replaces the current workspace).
 * After this call VS Code reloads, so no code after it will run.
 *
 * @param uri  Folder URI.  If omitted a folder picker is shown.
 */
async function openFolderInVSCode(uri) {
    try {
        let target = uri;
        if (!target) {
            const picked = await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: 'Open Folder in VS Code',
            });
            if (!picked?.[0]) {
                return;
            }
            target = picked[0];
        }
        await vscode.commands.executeCommand('vscode.openFolder', target);
    }
    catch (err) {
        (0, output_channel_1.logError)(FEATURE, 'openFolderInVSCode failed', err);
        vscode.window.showErrorMessage(`Failed to open folder: ${err}`);
    }
}
/**
 * Opens a folder in a NEW VS Code window.
 *
 * @param uri  Folder URI (required)
 */
async function openFolderInNewWindow(uri) {
    await vscode.commands.executeCommand('vscode.openFolder', uri, true);
}
/**
 * Opens a file in the editor at a specific line.
 *
 * @param filePath  Absolute path to the file
 * @param line      1-based line number (optional)
 */
async function openFileAtLine(filePath, line) {
    try {
        const uri = vscode.Uri.file(filePath);
        const doc = await vscode.workspace.openTextDocument(uri);
        const range = line !== undefined
            ? new vscode.Range(line - 1, 0, line - 1, 0)
            : undefined;
        await vscode.window.showTextDocument(doc, { selection: range, preview: false });
    }
    catch (err) {
        (0, output_channel_1.logError)(FEATURE, `openFileAtLine failed for ${filePath}`, err);
        vscode.window.showErrorMessage(`Failed to open file: ${err}`);
    }
}
// ─── AppData path helper ─────────────────────────────────────────────────────
/**
 * Returns the user's AppData (or HOME) directory.
 * Used for persisting per-user state files outside any workspace.
 */
function getAppDataPath() {
    return process.env.APPDATA ?? process.env.HOME ?? process.env.USERPROFILE ?? __dirname;
}
//# sourceMappingURL=terminal-utils.js.map