// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * terminal-utils.ts
 * Shared terminal and file-system navigation helpers.
 *
 * Rule: if more than one feature needs terminal or folder operations,
 * the function lives here. Features import from here — they never
 * copy-paste the same logic themselves.
 */
import * as vscode from 'vscode';
import * as path from 'path';
import { log, logError } from './output-channel';

const FEATURE = 'terminal-utils';

// ─── Terminal helpers ────────────────────────────────────────────────────────

/**
 * Returns the currently active terminal, or creates a new one named
 * 'CieloVista' if none is open.
 *
 * @param name  Optional terminal name override (default: 'CieloVista')
 */
export function getActiveOrCreateTerminal(name = 'CieloVista'): vscode.Terminal {
    return vscode.window.activeTerminal ?? vscode.window.createTerminal(name);
}

/**
 * Changes the working directory of the active (or newly created) terminal.
 *
 * @param folderPath  Absolute path to cd into
 * @param reveal      If true (default), makes the terminal visible
 */
export function cdToFolder(folderPath: string, reveal = true): void {
    const terminal = getActiveOrCreateTerminal();
    if (reveal) { terminal.show(); }
    terminal.sendText(`cd "${folderPath}"`);
    log(FEATURE, `cd → ${folderPath}`);
}

/**
 * Prompts the user to pick a folder if none is provided, then cds the
 * terminal to that folder.
 *
 * @param uri  Explorer URI from a context-menu invocation (may be undefined)
 */
export async function cdToFolderFromUri(uri?: vscode.Uri): Promise<void> {
    try {
        let target = uri;

        if (!target) {
            // No URI from context menu — try active editor's directory first
            if (vscode.window.activeTextEditor?.document.uri.scheme === 'file') {
                const dir = path.dirname(vscode.window.activeTextEditor.document.uri.fsPath);
                target = vscode.Uri.file(dir);
            } else {
                // Fall back to folder picker
                const picked = await vscode.window.showOpenDialog({
                    canSelectFiles: false,
                    canSelectFolders: true,
                    canSelectMany: false,
                    openLabel: 'Set as Terminal Working Directory',
                });
                if (picked?.[0]) { target = picked[0]; }
            }
        }

        if (!target?.fsPath) {
            vscode.window.showErrorMessage('No folder selected.');
            return;
        }

        cdToFolder(target.fsPath);
        vscode.window.showInformationMessage(
            `Terminal → ${vscode.workspace.asRelativePath(target)}`
        );
    } catch (err) {
        logError(FEATURE, 'cdToFolderFromUri failed', err);
        vscode.window.showErrorMessage(`Failed to set terminal directory: ${err}`);
    }
}

// ─── Folder / file open helpers ──────────────────────────────────────────────

/**
 * Opens a folder in VS Code (replaces the current workspace).
 * After this call VS Code reloads, so no code after it will run.
 *
 * @param uri  Folder URI.  If omitted a folder picker is shown.
 */
export async function openFolderInVSCode(uri?: vscode.Uri): Promise<void> {
    try {
        let target = uri;
        if (!target) {
            const picked = await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: 'Open Folder in VS Code',
            });
            if (!picked?.[0]) { return; }
            target = picked[0];
        }
        await vscode.commands.executeCommand('vscode.openFolder', target);
    } catch (err) {
        logError(FEATURE, 'openFolderInVSCode failed', err);
        vscode.window.showErrorMessage(`Failed to open folder: ${err}`);
    }
}

/**
 * Opens a folder in a NEW VS Code window.
 *
 * @param uri  Folder URI (required)
 */
export async function openFolderInNewWindow(uri: vscode.Uri): Promise<void> {
    await vscode.commands.executeCommand('vscode.openFolder', uri, true);
}

/**
 * Opens a file in the editor at a specific line.
 *
 * @param filePath  Absolute path to the file
 * @param line      1-based line number (optional)
 */
export async function openFileAtLine(filePath: string, line?: number): Promise<void> {
    try {
        const uri = vscode.Uri.file(filePath);
        const doc = await vscode.workspace.openTextDocument(uri);
        const range = line !== undefined
            ? new vscode.Range(line - 1, 0, line - 1, 0)
            : undefined;
        await vscode.window.showTextDocument(doc, { selection: range, preview: false });
    } catch (err) {
        logError(FEATURE, `openFileAtLine failed for ${filePath}`, err);
        vscode.window.showErrorMessage(`Failed to open file: ${err}`);
    }
}

// ─── AppData path helper ─────────────────────────────────────────────────────

/**
 * Returns the user's AppData (or HOME) directory.
 * Used for persisting per-user state files outside any workspace.
 */
export function getAppDataPath(): string {
    return process.env.APPDATA ?? process.env.HOME ?? process.env.USERPROFILE ?? __dirname;
}
