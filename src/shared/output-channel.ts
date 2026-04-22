// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
// FILE REMOVED BY REQUEST
/**
 * output-channel.ts
 * ONE shared OutputChannel for the entire CieloVista Tools extension.
 *
 * Rule: every feature writes here. Nobody creates their own OutputChannel.
 * This keeps all extension output consolidated under one panel in VS Code.
 */
import * as vscode from 'vscode';
import type { ErrorType } from './error-log';

let _channel: vscode.OutputChannel | undefined;

/**
 * Returns the single shared output channel, creating it on first call.
 * All features call this — never instantiate OutputChannel directly.
 */
export function getChannel(): vscode.OutputChannel {
    if (!_channel) {
        _channel = vscode.window.createOutputChannel('CieloVista Tools');
    }
    return _channel;
}

/**
 * Write a log line prefixed with the feature name and timestamp.
 * @param feature  Short name, e.g. 'copilot-rules-enforcer'
 * @param message  The message to log
 */
export function log(feature: string, message: string): void {
    const now = new Date();
    const ts = now.toLocaleTimeString('en-US', { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3, '0');
    getChannel().appendLine(`[${ts}] [${feature}] ${message}`);
}

/**
 * Write an error line to the channel and optionally show it.
 * @param feature     Short name of the calling feature
 * @param message     Human-readable description
 * @param error       The caught error object (optional)
 * @param showPanel   If true, brings the Output panel into view
 */

/**
 * Write an error line to the channel and persist it using error-log-utils.
 * @param message     Human-readable error message
 * @param stacktrace  Full stack trace string
 * @param context     Short name of the calling feature/module
 * @param showPanel   If true, brings the Output panel into view
 */
export function logError(message: string, stacktrace: string, context: string, showPanel = false): void {
    try {
        // Import lazily to avoid circular dependency at module load time
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { logError: persistError } = require('./error-log-utils') as { logError: (message: string, stacktrace: string, context: string) => void };
        persistError(message, stacktrace, context);
    } catch {
        // Fallback: just write to output channel if error-log-utils module isn't ready
        log(context, `ERROR: ${message}\n${stacktrace}`);
    }
    if (showPanel) { getChannel().show(true); }
}

/**
 * Dispose the channel. Called from the root extension deactivate().
 */
export function disposeChannel(): void {
    _channel?.dispose();
    _channel = undefined;
}
