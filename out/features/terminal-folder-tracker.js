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
 * terminal-folder-tracker.ts
 * Monitors terminal sendText calls for `cd` commands and persists the
 * last known directory to AppData. A command lets you jump back to it
 * at any time, even after VS Code restarts.
 *
 * Commands registered:
 *   cvs.terminal.jumpToLastFolder  — cd terminal to last tracked directory
 */
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const terminal_utils_1 = require("../shared/terminal-utils");
const output_channel_1 = require("../shared/output-channel");
const FEATURE = 'terminal-folder-tracker';
const STATE_FILE = path.join((0, terminal_utils_1.getAppDataPath)(), 'cielovista-last-folder.txt');
// ─── Persistence helpers ─────────────────────────────────────────────────────
function saveLastFolder(folderPath) {
    try {
        fs.writeFileSync(STATE_FILE, folderPath, 'utf8');
        (0, output_channel_1.log)(FEATURE, `Saved last folder: ${folderPath}`);
    }
    catch (err) {
        (0, output_channel_1.logError)(FEATURE, 'Failed to save last folder', err);
    }
}
function readLastFolder() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            return fs.readFileSync(STATE_FILE, 'utf8').trim() || undefined;
        }
    }
    catch { /* ignore */ }
    return undefined;
}
// ─── Terminal hook ────────────────────────────────────────────────────────────
function hookTerminal(terminal) {
    const original = terminal.sendText.bind(terminal);
    terminal.sendText = (text, addNewLine) => {
        const match = text.match(/^cd\s+"?([^"\r\n]+)"?\s*$/);
        if (match) {
            const dir = match[1].trim();
            if (fs.existsSync(dir)) {
                saveLastFolder(dir);
            }
        }
        return original(text, addNewLine);
    };
}
// ─── Activate ────────────────────────────────────────────────────────────────
function activate(context) {
    (0, output_channel_1.log)(FEATURE, 'Activating');
    // Hook all terminals that open after activation
    context.subscriptions.push(vscode.window.onDidOpenTerminal(hookTerminal));
    context.subscriptions.push(vscode.commands.registerCommand('cvs.terminal.jumpToLastFolder', () => {
        const last = readLastFolder();
        if (!last) {
            vscode.window.showWarningMessage('No last folder recorded yet.');
            return;
        }
        const terminal = (0, terminal_utils_1.getActiveOrCreateTerminal)();
        terminal.show();
        terminal.sendText(`cd "${last}"`);
        vscode.window.showInformationMessage(`Jumped to: ${last}`);
        (0, output_channel_1.log)(FEATURE, `Jumped to last folder: ${last}`);
    }));
}
function deactivate() { }
//# sourceMappingURL=terminal-folder-tracker.js.map