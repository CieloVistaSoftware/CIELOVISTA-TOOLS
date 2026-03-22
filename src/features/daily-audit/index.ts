// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * daily-audit/index.ts — activate/deactivate only.
 * Registers cvs.audit.runDaily command.
 */
import * as vscode from 'vscode';
import { log } from '../../shared/output-channel';
import { runDailyAudit } from './runner';

const FEATURE = 'daily-audit';

export function activate(context: vscode.ExtensionContext): void {
    log(FEATURE, 'Activating');

    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.audit.runDaily', async () => {
            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: '🔍 Running daily audit…', cancellable: false },
                async (progress) => {
                    progress.report({ message: 'Checking marketplace, README, CLAUDE.md, changelog…' });
                    const result = await runDailyAudit();
                    const r = result.report.summary;

                    if (result.written) {
                        log(FEATURE, `Audit complete — ${r.red} red, ${r.yellow} yellow, ${r.green} green`);
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
                    } else {
                        vscode.window.showErrorMessage(`Audit failed: ${result.error}`);
                    }
                }
            );
        })
    );
}

export function deactivate(): void {}
