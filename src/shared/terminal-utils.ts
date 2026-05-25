// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

// component: term

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
        logError('cdToFolderFromUri failed', err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
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
        logError('openFolderInVSCode failed', err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
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
        logError(`openFileAtLine failed for ${filePath}`, err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
        vscode.window.showErrorMessage(`Failed to open file: ${err}`);
    }
}

// ── Extension-launched terminal registry ─────────────────────────────────────

export interface LaunchedTerminalInfo {
    /** Short display name for the script/command (e.g. "test:mcpHealth") */
    script:  string;
    /** Full command string sent to the terminal */
    command: string;
    /** Working directory */
    cwd:     string;
    /** Project or context name for display in bug reports */
    project: string;
}

const _launchedTerminals = new Map<string, LaunchedTerminalInfo>();

/** Register a terminal the extension launched so bg-health-runner can monitor its exit code. */
export function registerLaunchedTerminal(name: string, info: LaunchedTerminalInfo): void {
    _launchedTerminals.set(name, info);
}

/** Returns registry info for the given terminal name, or undefined if not extension-launched. */
export function getLaunchedTerminal(name: string): LaunchedTerminalInfo | undefined {
    return _launchedTerminals.get(name);
}

/** Remove a terminal from the registry (call after exit is handled). */
export function clearLaunchedTerminal(name: string): void {
    _launchedTerminals.delete(name);
}

// ─── AppData path helper ─────────────────────────────────────────────────────

/**
 * Returns the user's AppData (or HOME) directory.
 * Used for persisting per-user state files outside any workspace.
 */
export function getAppDataPath(): string {
    return process.env.APPDATA ?? process.env.HOME ?? process.env.USERPROFILE ?? __dirname;
}
