// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * terminal-folder-tracker.ts
 * Monitors terminal sendText calls for `cd` commands and persists the
 * last known directory to AppData. A command lets you jump back to it
 * at any time, even after VS Code restarts.
 *
 * Commands registered:
 *   cvs.terminal.jumpToLastFolder  — cd terminal to last tracked directory
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getActiveOrCreateTerminal, getAppDataPath } from '../shared/terminal-utils';
import { log, logError } from '../shared/output-channel';

const FEATURE   = 'terminal-folder-tracker';
const STATE_FILE = path.join(getAppDataPath(), 'cielovista-last-folder.txt');

// ─── Persistence helpers ─────────────────────────────────────────────────────

function saveLastFolder(folderPath: string): void {
    try {
        fs.writeFileSync(STATE_FILE, folderPath, 'utf8');
        log(FEATURE, `Saved last folder: ${folderPath}`);
    } catch (err) {
        logError(FEATURE, 'Failed to save last folder', err);
    }
}

function readLastFolder(): string | undefined {
    try {
        if (fs.existsSync(STATE_FILE)) { return fs.readFileSync(STATE_FILE, 'utf8').trim() || undefined; }
    } catch { /* ignore */ }
    return undefined;
}

// ─── Terminal hook ────────────────────────────────────────────────────────────

function hookTerminal(terminal: vscode.Terminal): void {
    const original = terminal.sendText.bind(terminal);
    terminal.sendText = (text: string, addNewLine?: boolean) => {
        const match = text.match(/^cd\s+"?([^"\r\n]+)"?\s*$/);
        if (match) {
            const dir = match[1].trim();
            if (fs.existsSync(dir)) { saveLastFolder(dir); }
        }
        return original(text, addNewLine);
    };
}

// ─── Activate ────────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
    log(FEATURE, 'Activating');

    // Hook all terminals that open after activation
    context.subscriptions.push(
        vscode.window.onDidOpenTerminal(hookTerminal)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.terminal.jumpToLastFolder', () => {
            const last = readLastFolder();
            if (!last) {
                vscode.window.showWarningMessage('No last folder recorded yet.');
                return;
            }
            const terminal = getActiveOrCreateTerminal();
            terminal.show();
            terminal.sendText(`cd "${last}"`);
            vscode.window.showInformationMessage(`Jumped to: ${last}`);
            log(FEATURE, `Jumped to last folder: ${last}`);
        })
    );
}

export function deactivate(): void { /* nothing to clean up */ }
