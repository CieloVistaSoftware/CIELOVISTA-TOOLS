// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

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
    const ts = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
    getChannel().appendLine(`[${ts}] [${feature}] ${message}`);
}

/**
 * Write an error line to the channel and optionally show it.
 * @param feature     Short name of the calling feature
 * @param message     Human-readable description
 * @param error       The caught error object (optional)
 * @param showPanel   If true, brings the Output panel into view
 */
export function logError(feature: string, message: string, error?: unknown, showPanel = false): void {
    // Import lazily to avoid circular dependency at module load time
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { logError: persistError } = require('./error-log') as { logError: (prefix: string, err: unknown, opts: object) => void };
        persistError(`[${feature}]`, error ?? new Error(message), { context: message });
    } catch {
        // Fallback: just write to output channel if error-log module isn't ready
        const detail = error instanceof Error ? error.message : String(error ?? '');
        log(feature, `ERROR: ${message}${detail ? ' — ' + detail : ''}`);
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
