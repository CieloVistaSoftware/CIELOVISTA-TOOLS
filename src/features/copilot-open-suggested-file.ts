// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
// FILE REMOVED BY REQUEST
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
import * as vscode from 'vscode';
import * as fs from 'fs';
import { openFileAtLine } from '../shared/terminal-utils';
import { log, logError } from '../shared/output-channel';

const FEATURE = 'copilot-open-suggested-file';

/** Extracts a file path from a string using common patterns Copilot uses. */
function extractFilePath(text: string): string | undefined {
    // Match quoted paths: "src/utils.ts" or 'components/Button.tsx'
    const quoted = text.match(/["']([^"']+\.[a-zA-Z]{1,6})["']/);
    if (quoted) { return quoted[1]; }

    // Match plain paths with common extensions
    const plain = text.match(/\b([\w./\\-]+\.(ts|tsx|js|jsx|css|html|json|md|cs|py))\b/);
    if (plain) { return plain[1]; }

    return undefined;
}

/** Resolves a relative path against all workspace folders. */
function resolveInWorkspace(filePath: string): string | undefined {
    const folders = vscode.workspace.workspaceFolders ?? [];
    for (const folder of folders) {
        const full = require('path').join(folder.uri.fsPath, filePath);
        if (fs.existsSync(full)) { return full; }
    }
    // If already absolute and exists
    if (fs.existsSync(filePath)) { return filePath; }
    return undefined;
}

export function activate(context: vscode.ExtensionContext): void {
    log(FEATURE, 'Activating');

    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.copilot.openSuggestedFile', async () => {
            try {
                // Ask the user to paste or type the path/text Copilot mentioned
                const input = await vscode.window.showInputBox({
                    placeHolder: 'Paste the file path or Copilot message containing a file path',
                    prompt: 'CieloVista will extract and open the file path',
                });
                if (!input?.trim()) { return; }

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

                await openFileAtLine(resolved);
                log(FEATURE, `Opened suggested file: ${resolved}`);
            } catch (err) {
                logError('openSuggestedFile failed', err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
                vscode.window.showErrorMessage(`Failed to open file: ${err}`);
            }
        })
    );
}

export function deactivate(): void { /* nothing to clean up */ }
