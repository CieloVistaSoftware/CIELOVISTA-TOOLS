// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * terminal-set-folder.ts
 * Right-click a folder in the Explorer and immediately cd the active
 * terminal to that folder.
 *
 * Commands registered:
 *   cvs.terminal.setFolder  — Terminal: Set Working Directory (from Explorer context menu)
 *
 * Menu contributions:
 *   explorer/context  (when the selected item is a folder)
 */
import * as vscode from 'vscode';
import { cdToFolderFromUri } from '../shared/terminal-utils';
import { log } from '../shared/output-channel';

const FEATURE = 'terminal-set-folder';

export function activate(context: vscode.ExtensionContext): void {
    log(FEATURE, 'Activating');
    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.terminal.setFolder', (uri?: vscode.Uri) => {
            return cdToFolderFromUri(uri);
        })
    );
}

export function deactivate(): void { /* nothing to clean up */ }
