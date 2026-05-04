// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * json-copy-to-chat.ts
 *
 * Adds an editor-context command for .json files that sends the current
 * file content into Copilot Chat in this VS Code window.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import { log, logError } from '../shared/output-channel';
import { sendToCopilotChat } from './terminal-copy-output';

const FEATURE = 'json-copy-to-chat';
const MAX_JSON_CHARS = 20000;

function resolveJsonUri(uri?: vscode.Uri): vscode.Uri | undefined {
    const candidate = uri ?? vscode.window.activeTextEditor?.document.uri;
    if (!candidate) {
        return undefined;
    }
    if (candidate.scheme !== 'file') {
        return undefined;
    }
    if (path.extname(candidate.fsPath).toLowerCase() !== '.json') {
        return undefined;
    }
    return candidate;
}

export function activate(context: vscode.ExtensionContext): void {
    log(FEATURE, 'Activating');

    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.editor.copyJsonToCopilotChat', async (uri?: vscode.Uri) => {
            try {
                const jsonUri = resolveJsonUri(uri);
                if (!jsonUri) {
                    vscode.window.showWarningMessage('Open or right-click a local .json file and try again.');
                    return;
                }

                if (!fs.existsSync(jsonUri.fsPath)) {
                    vscode.window.showWarningMessage('That JSON file no longer exists on disk.');
                    return;
                }

                const raw: string = fs.readFileSync(jsonUri.fsPath, 'utf8');
                if (!raw.trim()) {
                    vscode.window.showWarningMessage('JSON file is empty. Nothing to send to chat.');
                    return;
                }

                const truncated = raw.length > MAX_JSON_CHARS;
                const payload = truncated ? raw.slice(0, MAX_JSON_CHARS) : raw;

                const chatText = [
                    'Please review this JSON file.',
                    `Path: ${jsonUri.fsPath}`,
                    '',
                    '```json',
                    payload,
                    '```',
                    truncated ? `(Note: content truncated to first ${MAX_JSON_CHARS} characters.)` : '',
                ].filter(Boolean).join('\n');

                const inserted = await sendToCopilotChat(chatText);
                if (inserted) {
                    vscode.window.showInformationMessage('JSON file content added to Copilot Chat input.');
                } else {
                    vscode.window.showWarningMessage('Could not insert directly. JSON payload copied to clipboard; press Ctrl+V in chat.');
                }

                log(FEATURE, `Sent JSON file to chat: ${jsonUri.fsPath}`);
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                logError('Failed to send JSON file to Copilot chat', err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
                vscode.window.showErrorMessage(`Failed to send JSON file to Copilot chat: ${message}`);
            }
        })
    );
}

export function deactivate(): void {
    // Nothing to dispose; registration is tracked in context subscriptions.
}
