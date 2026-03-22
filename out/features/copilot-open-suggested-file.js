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
 * copilot-open-suggested-file.ts
 * When Copilot suggests opening a file (e.g. "see utils.ts"), this command
 * detects the suggestion and opens the file automatically.
 *
 * Currently implemented as a command the user can invoke after seeing a
 * suggestion.  Future enhancement: hook into chat response events when the
 * VS Code API exposes them.
 *
 * Commands registered:
 *   cvs.copilot.openSuggestedFile  — open the file path Copilot mentioned
 */
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const terminal_utils_1 = require("../shared/terminal-utils");
const output_channel_1 = require("../shared/output-channel");
const FEATURE = 'copilot-open-suggested-file';
/** Extracts a file path from a string using common patterns Copilot uses. */
function extractFilePath(text) {
    // Match quoted paths: "src/utils.ts" or 'components/Button.tsx'
    const quoted = text.match(/["']([^"']+\.[a-zA-Z]{1,6})["']/);
    if (quoted) {
        return quoted[1];
    }
    // Match plain paths with common extensions
    const plain = text.match(/\b([\w./\\-]+\.(ts|tsx|js|jsx|css|html|json|md|cs|py))\b/);
    if (plain) {
        return plain[1];
    }
    return undefined;
}
/** Resolves a relative path against all workspace folders. */
function resolveInWorkspace(filePath) {
    const folders = vscode.workspace.workspaceFolders ?? [];
    for (const folder of folders) {
        const full = require('path').join(folder.uri.fsPath, filePath);
        if (fs.existsSync(full)) {
            return full;
        }
    }
    // If already absolute and exists
    if (fs.existsSync(filePath)) {
        return filePath;
    }
    return undefined;
}
function activate(context) {
    (0, output_channel_1.log)(FEATURE, 'Activating');
    context.subscriptions.push(vscode.commands.registerCommand('cvs.copilot.openSuggestedFile', async () => {
        try {
            // Ask the user to paste or type the path/text Copilot mentioned
            const input = await vscode.window.showInputBox({
                placeHolder: 'Paste the file path or Copilot message containing a file path',
                prompt: 'CieloVista will extract and open the file path',
            });
            if (!input?.trim()) {
                return;
            }
            const extracted = extractFilePath(input.trim());
            if (!extracted) {
                vscode.window.showWarningMessage(`No recognisable file path found in: "${input}"`);
                return;
            }
            const resolved = resolveInWorkspace(extracted);
            if (!resolved) {
                vscode.window.showWarningMessage(`File not found in workspace: "${extracted}"`);
                return;
            }
            await (0, terminal_utils_1.openFileAtLine)(resolved);
            (0, output_channel_1.log)(FEATURE, `Opened suggested file: ${resolved}`);
        }
        catch (err) {
            (0, output_channel_1.logError)(FEATURE, 'openSuggestedFile failed', err);
            vscode.window.showErrorMessage(`Failed to open file: ${err}`);
        }
    }));
}
function deactivate() { }
//# sourceMappingURL=copilot-open-suggested-file.js.map