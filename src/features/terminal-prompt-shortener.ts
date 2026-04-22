// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
// FILE REMOVED BY REQUEST
/**
 * terminal-prompt-shortener.ts
 * Toggles the PowerShell prompt between its full path form and a
 * shortened single-character form.  Useful when deep paths eat your
 * entire input line.
 *
 * Commands registered:
 *   cvs.terminal.togglePromptLength  — switch short ↔ full prompt
 */
import * as vscode from 'vscode';
import { getActiveOrCreateTerminal } from '../shared/terminal-utils';
import { log } from '../shared/output-channel';

const FEATURE = 'terminal-prompt-shortener';

/** PowerShell snippet to set a minimal `>` prompt. */
const SHORT_PROMPT = `function prompt { '> ' }`;

/** PowerShell snippet that restores the default path-based prompt. */
const FULL_PROMPT  = `function prompt { "PS $($executionContext.SessionState.Path.CurrentLocation)$('>' * ($nestedPromptLevel + 1)) " }`;

let _isShort = false;

export function activate(context: vscode.ExtensionContext): void {
    log(FEATURE, 'Activating');

    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.terminal.togglePromptLength', () => {
            _isShort = !_isShort;
            const terminal = getActiveOrCreateTerminal();
            terminal.show();
            terminal.sendText(_isShort ? SHORT_PROMPT : FULL_PROMPT);
            vscode.window.showInformationMessage(
                `Terminal prompt: ${_isShort ? 'SHORT (>)' : 'FULL (path)'}`
            );
            log(FEATURE, `Prompt toggled to ${_isShort ? 'short' : 'full'}`);
        })
    );
}

export function deactivate(): void { /* nothing to clean up */ }
