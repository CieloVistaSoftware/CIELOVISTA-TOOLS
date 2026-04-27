// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * error-log-adapter.ts
 *
 * Bridge between two parallel error-logging systems.
 *
 * Background: shared/error-log.ts and shared/error-log-utils.ts each define
 * their own ErrorEntry shape and write to different files. Most callers
 * migrated to error-log-utils.ts (writes to .vscode/logs/cielovista-errors.json),
 * but error-log-viewer.ts still reads from error-log.ts (data/tools-errors.json).
 * Result: the viewer says "no errors" while real errors pile up unseen
 * elsewhere on disk. (Issue #1.)
 *
 * Until the full consolidation tracked in #15 lands, this adapter:
 *   - reads BOTH log files
 *   - normalizes utils-style entries into the viewer's expected shape
 *   - merges and de-duplicates by message+timestamp
 *   - returns the unified list newest-first
 *
 * Same export names as error-log.ts so the viewer needs minimal changes.
 */

import * as fs   from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { getErrors as getLegacyErrors, getLogPath as getLegacyLogPath, clearErrors as clearLegacyErrors, ensureLogFile as ensureLegacyLogFile } from './error-log';
import type { ErrorEntry as LegacyErrorEntry, ErrorType } from './error-log';
import type { ErrorEntry as UtilsErrorEntry } from './error-log-utils';

// Re-export the legacy shape so the viewer's existing HTML keeps working.
export type { ErrorEntry } from './error-log';

// ─── Read the utils-style log file ────────────────────────────────────────────

function readUtilsLog(): UtilsErrorEntry[] {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) { return []; }
    const logFile = path.join(folders[0].uri.fsPath, '.vscode', 'logs', 'cielovista-errors.json');
    if (!fs.existsSync(logFile)) { return []; }
    try {
        const parsed = JSON.parse(fs.readFileSync(logFile, 'utf8'));
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

// ─── Translate utils-shape -> viewer-shape ────────────────────────────────────

function inferType(message: string): ErrorType {
    const m = message.toLowerCase();
    if (m.includes('json') || m.includes('unexpected token') || m.includes('not valid json')) { return 'JSON_PARSE_ERROR'; }
    if (m.includes('enoent') || m.includes('no such file') || m.includes('eacces'))           { return 'FILE_IO_ERROR'; }
    if (m.includes('fetch') || m.includes('network') || m.includes('econnrefused'))           { return 'NETWORK_ERROR'; }
    if (m.includes('api') || m.includes('anthropic') || m.includes('openai'))                 { return 'AI_ERROR'; }
    return 'APP_ERROR';
}

function parseStackTop(stack: string): { filename: string; lineno: number; colno: number } {
    if (!stack) { return { filename: '', lineno: 0, colno: 0 }; }
    const match = stack.match(/(?:at\s+(?:\S+\s+)?)\(?(.+?):(\d+):(\d+)\)?/);
    return match
        ? { filename: path.basename(match[1]), lineno: parseInt(match[2], 10), colno: parseInt(match[3], 10) }
        : { filename: '', lineno: 0, colno: 0 };
}

/**
 * Convert a utils-style entry into the viewer's expected shape.
 * Some fields don't exist in the utils log and are filled with sensible
 * defaults so the existing HTML renderer doesn't blow up.
 */
function adapt(u: UtilsErrorEntry): LegacyErrorEntry {
    const { filename, lineno, colno } = parseStackTop(u.stacktrace || '');
    return {
        id:               Number.parseInt((u.id || 'err_0').replace(/^err_/, ''), 16) || 0,
        timestamp:        u.lastOccurred || u.timestamp,
        type:             inferType(u.message),
        prefix:           `[${u.context || 'unknown'}]`,
        context:          u.context || '',
        command:          '',
        message:          u.count > 1 ? `${u.message} (×${u.count})` : u.message,
        stack:            u.stacktrace || '',
        filename,
        lineno,
        colno,
        raw:              u.message,
        githubIssueNumber: u.githubIssueNumber,
        githubIssueUrl:    u.githubIssueUrl,
    };
}

// ─── Merged getErrors ─────────────────────────────────────────────────────────

/**
 * Returns errors from BOTH log files, normalized to the viewer's expected
 * shape, sorted by timestamp ascending (the viewer reverses for display).
 * De-dupes by message+timestamp pair so an error logged through both APIs
 * doesn't appear twice.
 */
export function getErrors(): LegacyErrorEntry[] {
    const legacy = getLegacyErrors();
    const utils  = readUtilsLog().map(adapt);

    const seen = new Set<string>();
    const out: LegacyErrorEntry[] = [];
    for (const e of [...legacy, ...utils]) {
        const key = `${e.message}|${e.timestamp}`;
        if (seen.has(key)) { continue; }
        seen.add(key);
        out.push(e);
    }
    out.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    return out;
}

// ─── Pass-throughs for the viewer's "Open JSON" + "Clear" buttons ────────────

/**
 * Returns the path to the file the viewer's "Open JSON" button opens.
 * Picks the file with content if exactly one has entries; otherwise
 * defaults to the legacy path (matches old viewer behavior).
 */
export function getLogPath(): string {
    const utilsCount  = readUtilsLog().length;
    const legacyCount = getLegacyErrors().length;
    if (utilsCount > 0 && legacyCount === 0) {
        const folders = vscode.workspace.workspaceFolders;
        if (folders?.length) {
            return path.join(folders[0].uri.fsPath, '.vscode', 'logs', 'cielovista-errors.json');
        }
    }
    return getLegacyLogPath();
}

/**
 * Clears BOTH log files. The user clicked "Clear" expecting all displayed
 * errors to vanish; if we only cleared one file, the next render would
 * still show the others.
 */
export async function clearErrors(): Promise<void> {
    await clearLegacyErrors();
    const folders = vscode.workspace.workspaceFolders;
    if (folders?.length) {
        const utilsLog = path.join(folders[0].uri.fsPath, '.vscode', 'logs', 'cielovista-errors.json');
        if (fs.existsSync(utilsLog)) {
            try { fs.writeFileSync(utilsLog, '[]', 'utf8'); }
            catch { /* best-effort; not fatal */ }
        }
    }
}

/** Pass-through. The legacy file is always the "primary" so we ensure it exists. */
export function ensureLogFile(): void { ensureLegacyLogFile(); }

// ─── Patch an entry with its filed GitHub issue number ────────────────────────

/**
 * After a GitHub issue is filed from the error log viewer, write the issue
 * number and URL back into the on-disk entry so the viewer renders
 * "✅ Filed #N" on subsequent reopens.
 *
 * Searches both the utils log and the legacy log for an entry whose
 * numeric id matches `id`, then patches and writes the file.
 */
export function patchEntry(id: string | number, issueNumber: number, issueUrl: string): void {
    const numericId = typeof id === 'string' ? Number(id) : id;

    // ── utils log (cielovista-errors.json) ──────────────────────────────────
    const folders = vscode.workspace.workspaceFolders;
    if (folders?.length) {
        const utilsPath = path.join(folders[0].uri.fsPath, '.vscode', 'logs', 'cielovista-errors.json');
        if (fs.existsSync(utilsPath)) {
            try {
                const entries: UtilsErrorEntry[] = JSON.parse(fs.readFileSync(utilsPath, 'utf8'));
                const idx = entries.findIndex(
                    u => (Number.parseInt((u.id || 'err_0').replace(/^err_/, ''), 16) || 0) === numericId
                );
                if (idx !== -1) {
                    entries[idx].githubIssueNumber = issueNumber;
                    entries[idx].githubIssueUrl    = issueUrl;
                    fs.writeFileSync(utilsPath, JSON.stringify(entries, null, 2), 'utf8');
                }
            } catch { /* best-effort */ }
        }
    }

    // ── legacy log (data/tools-errors.json) ─────────────────────────────────
    const legacyPath = getLegacyLogPath();
    if (fs.existsSync(legacyPath)) {
        try {
            const log = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
            if (Array.isArray(log.errors)) {
                const idx = log.errors.findIndex((e: LegacyErrorEntry) => e.id === numericId);
                if (idx !== -1) {
                    log.errors[idx].githubIssueNumber = issueNumber;
                    log.errors[idx].githubIssueUrl    = issueUrl;
                    fs.writeFileSync(legacyPath, JSON.stringify(log, null, 2), 'utf8');
                }
            }
        } catch { /* best-effort */ }
    }
}
