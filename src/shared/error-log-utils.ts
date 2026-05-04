// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * error-log-utils.ts
 * Persistent error tracking to a JSON file in the workspace.
 *
 * Errors are stored with a unique ID (hash of the message).
 * When the same error recurs, its count is incremented.
 * A solution string can be attached once a fix is known.
 *
 * Rule: any feature that wants to track errors over time imports from here.
 * Nobody rolls their own error-to-JSON mechanism.
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { log } from './output-channel';

const FEATURE = 'error-log-utils';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ErrorEntry {
    /** Hash-based unique ID derived from the error message. */
    id: string;
    /** ISO timestamp of first occurrence. */
    timestamp: string;
    /** ISO timestamp of most recent occurrence. */
    lastOccurred: string;
    /** How many times this error has been seen. */
    count: number;
    /** Error message text. */
    message: string;
    /** Stack trace (mandatory). */
    stacktrace: string;
    /** Feature/function name where the error occurred. */
    context: string;
    /** Whether a known fix has been recorded. */
    solved: boolean;
    /** Short description of the fix (when solved = true). */
    solution?: string;
    /** GitHub issue number filed from the error log viewer. */
    githubIssueNumber?: number;
    /** GitHub issue URL filed from the error log viewer. */
    githubIssueUrl?: string;
}

// ─── File path helper ─────────────────────────────────────────────────────────

// Fixed path inside the extension's own data/ directory — workspace-independent
// so errors logged in any open project are always visible in the viewer.
const LOG_FILE_PATH = path.join(__dirname, '..', '..', 'data', 'cielovista-errors.json');

function getLogFilePath(): string {
    const dir = path.dirname(LOG_FILE_PATH);
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
    return LOG_FILE_PATH;
}

function readLog(logFile: string): ErrorEntry[] {
    if (!fs.existsSync(logFile)) { return []; }
    try { return JSON.parse(fs.readFileSync(logFile, 'utf8')); }
    catch { return []; }
}

function writeLog(logFile: string, entries: ErrorEntry[]): void {
    fs.writeFileSync(logFile, JSON.stringify(entries, null, 2), 'utf8');
}

// ─── ID generation ────────────────────────────────────────────────────────────

/**
 * Creates a deterministic short ID from an error message string.
 * Same message always produces the same ID, enabling deduplication.
 */
export function createErrorId(message: string): string {
    let hash = 0;
    for (let i = 0; i < message.length; i++) {
        hash = ((hash << 5) - hash) + message.charCodeAt(i);
        hash |= 0; // to 32-bit int
    }
    return 'err_' + Math.abs(hash).toString(16);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Logs an error to the workspace JSON log.
 * All parameters are mandatory.
 *
 * @param message     The error message (string)
 * @param stacktrace  The full stack trace (string)
 * @param context     Short name of the calling feature/module (string)
 * @returns           The solution string if one exists, otherwise undefined
 */
export function logError(message: string, stacktrace: string, context: string): string | undefined {
    const logFile = getLogFilePath();
    if (!logFile) { return undefined; }

    const id      = createErrorId(message);
    const now     = new Date().toISOString();

    const entries = readLog(logFile);
    const idx     = entries.findIndex(e => e.id === id);

    if (idx >= 0) {
        entries[idx].count++;
        entries[idx].lastOccurred = now;
        if (!entries[idx].stacktrace) { entries[idx].stacktrace = stacktrace; }
        writeLog(logFile, entries);
        log(FEATURE, `Known error #${id} (×${entries[idx].count}): ${message}\n${stacktrace}`);
        return entries[idx].solved ? entries[idx].solution : undefined;
    }

    entries.push({ id, timestamp: now, lastOccurred: now, count: 1, message, stacktrace, context, solved: false });
    writeLog(logFile, entries);
    log(FEATURE, `New error #${id} in [${context}]: ${message}\n${stacktrace}`);
    return undefined;
}

/**
 * Marks all errors whose message contains the given substring as solved
 * and records the provided solution.
 *
 * @param messageSubstring  Part of the error message that identifies it
 * @param solution          Brief description of how to fix it
 * @returns                 true if at least one error was updated
 */
export function markErrorSolved(messageSubstring: string, solution: string): boolean {
    const logFile = getLogFilePath();
    if (!logFile) { return false; }

    const entries = readLog(logFile);
    let updated = false;

    for (const entry of entries) {
        if (entry.message.includes(messageSubstring)) {
            entry.solved   = true;
            entry.solution = solution;
            updated = true;
        }
    }

    if (updated) {
        writeLog(logFile, entries);
        log(FEATURE, `Marked errors matching "${messageSubstring}" as solved`);
    }
    return updated;
}

/**
 * Returns all logged errors.
 * Useful for a diagnostics panel or status report.
 */
export function getAllErrors(): ErrorEntry[] {
    const logFile = getLogFilePath();
    return logFile ? readLog(logFile) : [];
}
