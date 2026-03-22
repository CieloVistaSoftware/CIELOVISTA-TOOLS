// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * open-folder-as-root.ts
 * Right-click a folder in the Explorer and open it as the root
 * workspace folder in the current VS Code window.
 *
 * Commands registered:
 *   cvs.explorer.openFolderAsRoot  — open folder as workspace root
 *
 * Menu contributions:
 *   explorer/context  (when the selected item is a folder)
 */
import * as vscode from 'vscode';
import { log } from '../shared/output-channel';

const FEATURE = 'open-folder-as-root';

export function activate(context: vscode.ExtensionContext): void {
    log(FEATURE, 'Activating');
    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.explorer.openFolderAsRoot', (uri?: vscode.Uri) => {
            if (!uri) {
                require('../shared/show-result-webview').showResultWebview(
                    'No Folder Selected',
                    'Open Folder as Root',
                    0,
                    'No folder was selected. Please right-click a folder in the Explorer.'
                );
                return;
            }
            // forceNewWindow: false → reuse the current window
            return vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: false });
        })
    );
}

export function deactivate(): void { /* nothing to clean up */ }
