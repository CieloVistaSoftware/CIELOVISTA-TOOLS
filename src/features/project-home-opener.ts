// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
// FILE REMOVED BY REQUEST
/**
 * project-home-opener.ts
 *
 * Purpose:
 * Provide a single global command that reopens the CieloVista home project
 * from any workspace or from no-folder mode.
 *
 * Design goals:
 * - One command users can run anywhere: `cvs.project.openHome`
 * - No hardcoded machine-specific root paths in source code
 * - Clear and actionable error messaging when configuration is missing/invalid
 * - Configuration editable from VS Code Settings UI (no TypeScript edits)
 *
 * Command registered:
 *   cvs.project.openHome — opens configured CieloVista home project folder
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { openFolderInVSCode } from '../shared/terminal-utils';
import { log, logError } from '../shared/output-channel';

const FEATURE = 'project-home-opener';
const CFG_ROOT = 'cielovistaTools';
const CFG_KEY_HOME_PATH = 'homeProjectPath';
const OPEN_HOME_COMMAND = 'cvs.project.openHome';

/**
 * Reads the configured home project path from user/workspace settings.
 *
 * Returns:
 * - Trimmed absolute/relative path string if configured
 * - Empty string when unset
 */
function getConfiguredHomePath(): string {
    const raw = vscode.workspace.getConfiguration(CFG_ROOT).get<string>(CFG_KEY_HOME_PATH, '');
    return raw.trim();
}

/**
 * Resolves a configured path into an absolute filesystem path.
 *
 * Resolution rules:
 * - If path is absolute, use as-is
 * - If relative and a workspace is open, resolve relative to first workspace folder
 * - If relative and no workspace is open, return empty to force actionable error
 */
function resolveHomePath(configuredPath: string): string {
    if (!configuredPath) {
        return '';
    }

    if (path.isAbsolute(configuredPath)) {
        return configuredPath;
    }

    const base = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!base) {
        return '';
    }

    return path.resolve(base, configuredPath);
}

/**
 * Validates that the resolved path exists and points to a directory.
 *
 * Returns a string error message when invalid, otherwise null.
 */
function validateHomePath(targetPath: string): string | null {
    if (!targetPath) {
        return 'CieloVista home project path is not configured. Set "CieloVista Tools: Home Project Path" in Settings.';
    }

    if (!fs.existsSync(targetPath)) {
        return `Configured CieloVista home project path does not exist: ${targetPath}`;
    }

    try {
        const stat = fs.statSync(targetPath);
        if (!stat.isDirectory()) {
            return `Configured CieloVista home project path is not a folder: ${targetPath}`;
        }
    } catch (error) {
        logError(`Unable to inspect configured path: ${targetPath}`, error instanceof Error ? error.stack || String(error) : String(error), FEATURE);
        return `Could not validate configured CieloVista home project path: ${targetPath}`;
    }

    return null;
}

/**
 * Opens the configured CieloVista home project folder in the current window.
 *
 * Error behavior required by user request:
 * - If root folder cannot be resolved/opened, send an explicit message indicating the issue.
 */
async function openConfiguredHomeProject(): Promise<void> {
    const configured = getConfiguredHomePath();
    const resolved = resolveHomePath(configured);
    const validationError = validateHomePath(resolved);

    if (validationError) {
        vscode.window.showErrorMessage(validationError);
        return;
    }

    try {
        log(FEATURE, `Opening home project: ${resolved}`);
        await openFolderInVSCode(vscode.Uri.file(resolved));
    } catch (error) {
        logError(`Failed to open home project: ${resolved}`, error instanceof Error ? error.stack || String(error) : String(error), FEATURE);
        vscode.window.showErrorMessage(`Failed to open Project: Open Home: ${resolved}`);
    }
}

/**
 * Activates project home opener command.
 */
export function activate(context: vscode.ExtensionContext): void {
    log(FEATURE, 'Activating');

    context.subscriptions.push(
        vscode.commands.registerCommand(OPEN_HOME_COMMAND, openConfiguredHomeProject)
    );
}

/**
 * Feature has no persistent timers/UI disposables beyond command subscription.
 */
export function deactivate(): void {
    // No manual cleanup required.
}
