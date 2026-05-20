// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * command-logger.ts
 *
 * Shared utility for logging command executions.
 */
import * as vscode from 'vscode';
import { log } from './output-channel';

export function registerCommandWithLogging(commandId: string, handler: (...args: any[]) => any): vscode.Disposable {
    return vscode.commands.registerCommand(commandId, (...args: any[]) => {
        log('command-logger', `Command executed: ${commandId}`);
        return handler(...args);
    });
}
