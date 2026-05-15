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
        vscode.commands.registerCommand('cvs.explorer.openFolderAsRoot', async (uri?: vscode.Uri) => {
            let folderUri = uri;
            if (!folderUri) {
                // Context menu may not pass the URI on some VS Code versions — fall back to a picker.
                const picked = await vscode.window.showOpenDialog({
                    canSelectFiles:   false,
                    canSelectFolders: true,
                    canSelectMany:    false,
                    openLabel:        'Open as Root',
                    title:            'Select a folder to open as workspace root',
                });
                if (!picked || picked.length === 0) { return; }
                folderUri = picked[0];
            }
            log(FEATURE, `Opening folder as root: ${folderUri.fsPath}`);
            // forceNewWindow: false → reuse the current window
            return vscode.commands.executeCommand('vscode.openFolder', folderUri, { forceNewWindow: false });
        })
    );
}

export function deactivate(): void { /* nothing to clean up */ }
