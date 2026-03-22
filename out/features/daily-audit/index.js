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
 * daily-audit/index.ts — activate/deactivate only.
 * Registers cvs.audit.runDaily command.
 */
const vscode = __importStar(require("vscode"));
const output_channel_1 = require("../../shared/output-channel");
const runner_1 = require("./runner");
const FEATURE = 'daily-audit';
function activate(context) {
    (0, output_channel_1.log)(FEATURE, 'Activating');
    context.subscriptions.push(vscode.commands.registerCommand('cvs.audit.runDaily', async () => {
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: '🔍 Running daily audit…', cancellable: false }, async (progress) => {
            progress.report({ message: 'Checking marketplace, README, CLAUDE.md, changelog…' });
            const result = await (0, runner_1.runDailyAudit)();
            const r = result.report.summary;
            if (result.written) {
                (0, output_channel_1.log)(FEATURE, `Audit complete — ${r.red} red, ${r.yellow} yellow, ${r.green} green`);
                const msg = r.red > 0
                    ? `🔴 Audit complete — ${r.red} issue${r.red > 1 ? 's' : ''} need attention`
                    : r.yellow > 0
                        ? `🟡 Audit complete — ${r.yellow} item${r.yellow > 1 ? 's' : ''} worth reviewing`
                        : `🟢 Audit complete — all ${r.green} checks passed`;
                // Refresh the launcher panel in place so audit dots update immediately.
                // Uses executeCommand to avoid a circular import with cvs-command-launcher.
                vscode.commands.executeCommand('cvs.launcher.refresh');
                vscode.window.showInformationMessage(msg, 'Open Launcher').then(c => {
                    if (c === 'Open Launcher') {
                        vscode.commands.executeCommand('cvs.commands.showAll');
                    }
                });
            }
            else {
                vscode.window.showErrorMessage(`Audit failed: ${result.error}`);
            }
        });
    }));
}
function deactivate() { }
//# sourceMappingURL=index.js.map