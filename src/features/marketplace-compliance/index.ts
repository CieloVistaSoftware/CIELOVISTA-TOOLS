// Copyright (c) 2025 CieloVista Software. All rights reserved.
/**
 * marketplace-compliance — activate/deactivate only.
 * Split into: types, registry, png-generator, file-generators, checker, fixer, html, commands
 */
import * as vscode from 'vscode';
import { log } from '../../shared/output-channel';
import { runScan, fixAll, fixOneInteractive } from './commands';

export function activate(context: vscode.ExtensionContext): void {
    log('marketplace-compliance', 'Activating');
    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.marketplace.scan',   runScan),
        vscode.commands.registerCommand('cvs.marketplace.fixAll', fixAll),
        vscode.commands.registerCommand('cvs.marketplace.fixOne', fixOneInteractive),
    );
}

export function deactivate(): void {}
