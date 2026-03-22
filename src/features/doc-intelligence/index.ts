// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/** doc-intelligence/index.ts — activate/deactivate only. */

import * as vscode from 'vscode';
import { log } from '../../shared/output-channel';
import { runIntelligence, deactivateIntelligence } from './commands';

export function activate(context: vscode.ExtensionContext): void {
    log('doc-intelligence', 'Activating');
    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.docs.intelligence', runIntelligence)
    );
}

export function deactivate(): void {
    deactivateIntelligence();
}
