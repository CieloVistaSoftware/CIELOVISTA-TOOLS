"use strict";
// Copyright (c) 2026 CieloVista Software. All rights reserved.
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
 * script-runner.ts
 * -----------------------------------------------------------------------------
 * Registers a command to pick and run any .js script from the scripts/ folder.
 * Runs the script using Node.js, captures stdout/stderr, and displays the output
 * in an interactive result webview (copy/rerun/close options).
 *
 * Command: cvs.scripts.runScript
 */
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const child_process_1 = require("child_process");
const show_interactive_result_webview_1 = require("../shared/show-interactive-result-webview");
const FEATURE = 'script-runner';
function activate(context) {
    context.subscriptions.push(vscode.commands.registerCommand('cvs.scripts.runScript', async () => {
        // Find all .js scripts in scripts/
        const scriptsDir = path.join(context.extensionPath, 'scripts');
        if (!fs.existsSync(scriptsDir)) {
            vscode.window.showWarningMessage('No scripts/ directory found.');
            return;
        }
        const files = fs.readdirSync(scriptsDir).filter(f => f.endsWith('.js'));
        if (!files.length) {
            vscode.window.showWarningMessage('No .js scripts found in scripts/.');
            return;
        }
        // Prompt user to pick a script
        const picked = await vscode.window.showQuickPick(files, { placeHolder: 'Select a script to run' });
        if (!picked)
            return;
        const scriptPath = path.join(scriptsDir, picked);
        // Run the script with Node.js
        const start = Date.now();
        (0, child_process_1.exec)(`node "${scriptPath}"`, { cwd: scriptsDir }, (err, stdout, stderr) => {
            const duration = Date.now() - start;
            let output = '';
            if (stdout)
                output += stdout;
            if (stderr)
                output += '\n[stderr]\n' + stderr;
            if (err)
                output += `\n[error]\n${err.message}`;
            (0, show_interactive_result_webview_1.showInteractiveResultWebview)({
                title: `Script Output: ${picked}`,
                action: `node ${picked}`,
                output,
                durationMs: duration,
                onRerun: () => {
                    vscode.commands.executeCommand('cvs.scripts.runScript');
                },
            });
        });
    }));
}
function deactivate() { }
//# sourceMappingURL=script-runner.js.map