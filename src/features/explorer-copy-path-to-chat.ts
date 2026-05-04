// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * explorer-copy-path-to-chat.ts
 *
 * Right-click a file in Explorer and prefill GitHub Copilot Chat
 * with that file's absolute path.
 */
import * as vscode from 'vscode';
import { log, logError } from '../shared/output-channel';
import { sendToCopilotChat } from './terminal-copy-output';

const FEATURE: string = 'explorer-copy-path-to-chat';

export function activate(context: vscode.ExtensionContext): void {
    log(FEATURE, 'Activating');

    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.explorer.copyPathToCopilotChat', async (uri?: vscode.Uri) => {
            try {
                if (!uri) {
                    vscode.window.showWarningMessage('No file selected. Right-click a file in Explorer and try again.');
                    return;
                }

                const fsPath: string = uri.fsPath;
                if (!fsPath) {
                    vscode.window.showWarningMessage('Selected resource has no local file path.');
                    return;
                }

                const inserted: boolean = await sendToCopilotChat(fsPath);
                if (inserted) {
                    vscode.window.showInformationMessage('File path added to Copilot chat input.');
                } else {
                    vscode.window.showWarningMessage('Could not insert into Copilot chat. Path copied to clipboard; press Ctrl+V in chat.');
                }

                log(FEATURE, `Sent path to chat: ${fsPath}`);
            } catch (err) {
                const message: string = err instanceof Error ? err.message : String(err);
                logError('Failed to send Explorer path to Copilot chat', err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
                vscode.window.showErrorMessage(`Failed to send file path to Copilot chat: ${message}`);
            }
        })
    );
}

export function deactivate(): void {
    // Nothing to dispose; registration is tracked via context subscriptions.
}
