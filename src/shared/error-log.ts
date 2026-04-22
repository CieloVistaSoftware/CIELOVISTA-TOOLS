// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
// FILE REMOVED BY REQUEST
/**
 * error-log.ts
 *
 * Persistent error log for CieloVista Tools — VS Code equivalent of
 * wb-core/core/error-logger.js.
 *
 * Same interface: logError(prefix, error, options)
 * Same storage:   data/tools-errors.json (last 100 entries)
 * Same fields:    id, timestamp, type, prefix, context, message, stack,
 *                 filename, lineno, colno, command
 *
 * Differences from wb-core version:
 *   - No DOM/browser — writes to disk and VS Code Output channel
 *   - `command` field instead of `url` (the VS Code command that was running)
 *   - VS Code notification on first error in a session
 *
 * Command to view:  cvs.tools.errorLog
 * Log file:        <tools-root>/data/tools-errors.json
 */

import * as fs      from 'fs';
import * as path    from 'path';
import * as vscode  from 'vscode';
import { getChannel } from './output-channel';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ErrorType =
    | 'RUNTIME_ERROR'
    | 'JSON_PARSE_ERROR'
    | 'FILE_IO_ERROR'
    | 'COMMAND_ERROR'
    | 'AUDIT_ERROR'
    | 'AI_ERROR'
    | 'NETWORK_ERROR'
    | 'APP_ERROR';

export interface ErrorEntry {
    id:        number;       // hash of message+stack, same as wb-core
    timestamp: string;
    type:      ErrorType;
    prefix:    string;       // e.g. '[test-coverage-auditor]'
    context:   string;       // e.g. 'runAudit' — function or operation name
    command:   string;       // VS Code command ID that was running, if known
    message:   string;
    stack:     string;
    filename:  string;       // extracted from stack
    lineno:    number;
    colno:     number;
    raw:       string;       // String(error) — the full raw error
}

export interface ErrorLog {
    lastUpdated: string;
    count:       number;
    errors:      ErrorEntry[];
}

// ─── Config ───────────────────────────────────────────────────────────────────

const TOOLS_ROOT = path.join(__dirname, '..', '..');
const LOG_PATH   = path.join(TOOLS_ROOT, 'data', 'tools-errors.json');
const MAX_ERRORS = 100;

// Track whether we've shown the "errors occurred" notification this session
let _sessionNotified = false;
let _currentCommand  = '';   // set by the launcher when running a command

/** Call this before executing a command so errors can reference it. */
export function setCurrentCommand(id: string): void  { _currentCommand = id; }
export function clearCurrentCommand(): void           { _currentCommand = ''; }

// ─── Stack parser (mirrors wb-core parseStack) ────────────────────────────────

function parseStack(stack: string): { filename: string; lineno: number; colno: number } {
    if (!stack) { return { filename: '', lineno: 0, colno: 0 }; }
    // Match:  at SomeFn (C:\path\to\file.ts:42:7)  or  at C:\path\to\file.ts:42:7
    const match = stack.match(/(?:at\s+(?:\S+\s+)?)\(?(.+?):(\d+):(\d+)\)?/);
    return match
        ? { filename: path.basename(match[1]), lineno: parseInt(match[2], 10), colno: parseInt(match[3], 10) }
        : { filename: '', lineno: 0, colno: 0 };
}

// ─── Type inference (mirrors wb-core inferType) ───────────────────────────────

function inferType(error: unknown, override?: ErrorType): ErrorType {
    if (override) { return override; }
    const msg = String((error as any)?.message || error).toLowerCase();
    if (msg.includes('json') || msg.includes('unexpected token') || msg.includes('not valid json')) { return 'JSON_PARSE_ERROR'; }
    if (msg.includes('enoent') || msg.includes('no such file') || msg.includes('eacces'))           { return 'FILE_IO_ERROR'; }
    if (msg.includes('fetch') || msg.includes('network') || msg.includes('econnrefused'))           { return 'NETWORK_ERROR'; }
    if (msg.includes('api') || msg.includes('anthropic') || msg.includes('openai'))                 { return 'AI_ERROR'; }
    return 'APP_ERROR';
}

// ─── Hash (mirrors wb-core id generation) ────────────────────────────────────

function hashError(message: string, stack: string): number {
    let h = 5381;
    const s = message + (stack.split('\n')[1] || '');
    for (let i = 0; i < s.length; i++) { h = ((h << 5) + h) ^ s.charCodeAt(i); }
    return h >>> 0;
}

// ─── Load / save ──────────────────────────────────────────────────────────────

function loadLog(): ErrorLog {
    try {
        if (fs.existsSync(LOG_PATH)) {
            return JSON.parse(fs.readFileSync(LOG_PATH, 'utf8')) as ErrorLog;
        }
    } catch { /* corrupt file — start fresh */ }
    return { lastUpdated: new Date().toISOString(), count: 0, errors: [] };
}

function saveLog(log: ErrorLog): void {
    try {
        const dir = path.dirname(LOG_PATH);
        if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
        fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2), 'utf8');
    } catch (e) {
        // Can't log this or we'd recurse — just write to output channel
        getChannel().appendLine(`[error-log] Could not write log file: ${e}`);
    }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Log an error persistently.
 *
 * Same interface as wb-core logError():
 *   logError('[test-coverage-auditor]', err)
 *   logError('[test-coverage-auditor]', err, { context: 'runAudit', type: 'JSON_PARSE_ERROR' })
 *   logError('[test-coverage-auditor]', 'Script not found', { context: 'findScript' })
 *
 * Automatically extracts: filename, lineno, colno from stack trace.
 * Automatically records:  current VS Code command, timestamp.
 */
export function logError(
    prefix:  string,
    error:   unknown,
    options: { context?: string; type?: ErrorType; command?: string } = {}
): ErrorEntry {
    const isErrorObj = error instanceof Error;
    const message    = isErrorObj ? error.message : String(error);
    const stack      = isErrorObj ? (error.stack || '') : '';
    const raw        = String(error);
    const { filename, lineno, colno } = parseStack(stack);

    const entry: ErrorEntry = {
        id:        hashError(message, stack),
        timestamp: new Date().toISOString(),
        type:      inferType(error, options.type),
        prefix,
        context:   options.context  || '',
        command:   options.command  || _currentCommand,
        message,
        stack,
        filename,
        lineno,
        colno,
        raw,
    };

    // Write to VS Code output channel with full detail
    const ch = getChannel();
    const ts = entry.timestamp.slice(11, 23);
    ch.appendLine(`[${ts}] ${prefix} ERROR [${entry.type}]${entry.context ? ' in ' + entry.context : ''}${entry.command ? ' (cmd: ' + entry.command + ')' : ''}`);
    ch.appendLine(`  Message:  ${entry.message}`);
    if (entry.filename) { ch.appendLine(`  Location: ${entry.filename}:${entry.lineno}:${entry.colno}`); }
    if (entry.stack) {
        const stackLines = entry.stack.split('\n').slice(1, 5); // first 4 frames
        stackLines.forEach(l => ch.appendLine(`  ${l.trim()}`));
    }

    // Persist to disk
    const log = loadLog();
    log.errors.push(entry);
    if (log.errors.length > MAX_ERRORS) { log.errors = log.errors.slice(-MAX_ERRORS); }
    log.count       = log.errors.length;
    log.lastUpdated = entry.timestamp;
    saveLog(log);

    // Notify user once per session
    if (!_sessionNotified) {
        _sessionNotified = true;
        vscode.window.showWarningMessage(
            `CieloVista Tools: an error occurred in ${prefix}. Check the error log for details.`,
            'View Error Log'
        ).then(action => {
            if (action === 'View Error Log') {
                vscode.commands.executeCommand('cvs.tools.errorLog');
            }
        });
    }

    return entry;
}

export function getLogPath():  string    { return LOG_PATH; }
export function getErrors():   ErrorEntry[] { return loadLog().errors; }

export async function clearErrors(): Promise<void> {
    saveLog({ lastUpdated: new Date().toISOString(), count: 0, errors: [] });
    _sessionNotified = false;
}

/** @internal — exported for unit testing only */
export const _test = { parseStack, inferType, hashError, loadLog, saveLog };
