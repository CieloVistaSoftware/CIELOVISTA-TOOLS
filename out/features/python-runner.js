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
 * python-runner.ts
 * Right-click any .py file in the Explorer and run it in the terminal.
 * Uses the Python interpreter configured in VS Code settings, or falls
 * back to the system `python` command.
 *
 * Commands registered:
 *   cvs.python.runFile  — run selected .py file in terminal
 *
 * Menu contributions:
 *   explorer/context  (when resourceExtname == .py)
 */
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const terminal_utils_1 = require("../shared/terminal-utils");
const output_channel_1 = require("../shared/output-channel");
const FEATURE = 'python-runner';
/** Returns the Python executable path from VS Code Python extension settings,
 *  falling back to the bare 'python' command. */
function getPythonExecutable() {
    return vscode.workspace
        .getConfiguration('python')
        .get('defaultInterpreterPath', 'python');
}
function activate(context) {
    (0, output_channel_1.log)(FEATURE, 'Activating');
    context.subscriptions.push(vscode.commands.registerCommand('cvs.python.runFile', (uri) => {
        try {
            // URI comes from Explorer context menu click
            // Fall back to the currently open file if invoked from command palette
            const target = uri ?? vscode.window.activeTextEditor?.document.uri;
            if (!target?.fsPath.endsWith('.py')) {
                vscode.window.showErrorMessage('Please select a Python (.py) file.');
                return;
            }
            const python = getPythonExecutable();
            const fileName = path.basename(target.fsPath);
            const terminal = (0, terminal_utils_1.getActiveOrCreateTerminal)(`Run: ${fileName}`);
            terminal.show();
            terminal.sendText(`${python} "${target.fsPath}"`);
            (0, output_channel_1.log)(FEATURE, `Running ${target.fsPath} with ${python}`);
        }
        catch (err) {
            (0, output_channel_1.logError)(FEATURE, 'runFile failed', err);
            vscode.window.showErrorMessage(`Failed to run Python file: ${err}`);
        }
    }));
}
function deactivate() { }
//# sourceMappingURL=python-runner.js.map