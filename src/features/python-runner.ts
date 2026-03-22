// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

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
import * as vscode from 'vscode';
import * as path from 'path';
import { getActiveOrCreateTerminal } from '../shared/terminal-utils';
import { log, logError } from '../shared/output-channel';

const FEATURE = 'python-runner';

/** Returns the Python executable path from VS Code Python extension settings,
 *  falling back to the bare 'python' command. */
function getPythonExecutable(): string {
    return vscode.workspace
        .getConfiguration('python')
        .get<string>('defaultInterpreterPath', 'python');
}

export function activate(context: vscode.ExtensionContext): void {
    log(FEATURE, 'Activating');

    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.python.runFile', (uri?: vscode.Uri) => {
            try {
                // URI comes from Explorer context menu click
                // Fall back to the currently open file if invoked from command palette
                const target = uri ?? vscode.window.activeTextEditor?.document.uri;

                if (!target?.fsPath.endsWith('.py')) {
                    vscode.window.showErrorMessage('Please select a Python (.py) file.');
                    return;
                }

                const python   = getPythonExecutable();
                const fileName = path.basename(target.fsPath);
                const terminal = getActiveOrCreateTerminal(`Run: ${fileName}`);
                terminal.show();
                terminal.sendText(`${python} "${target.fsPath}"`);
                log(FEATURE, `Running ${target.fsPath} with ${python}`);
            } catch (err) {
                logError(FEATURE, 'runFile failed', err);
                vscode.window.showErrorMessage(`Failed to run Python file: ${err}`);
            }
        })
    );
}

export function deactivate(): void { /* nothing to clean up */ }
