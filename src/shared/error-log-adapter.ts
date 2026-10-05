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
 *   - collapses repeats of one error (by id) into a single entry with a count
 *   - returns the unified list oldest-first (the viewer reverses it)
 *
 * Same export names as error-log.ts so the viewer needs minimal changes.
 */

import * as fs   from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { getErrors as getLegacyErrors, getLogPath as getLegacyLogPath, clearErrors as clearLegacyErrors, ensureLogFile as ensureLegacyLogFile } from './error-log';
import type { ErrorEntry as LegacyErrorEntry, ErrorType } from './error-log';
import type { ErrorEntry as UtilsErrorEntry } from './error-log-utils';
import { dataDir } from './data-dir';

/**
 * The viewer's entry shape: the legacy fields plus what the utils log tracks.
 *
 * `id` is a string that is unique across both logs: `legacy_<n>` for a legacy
 * entry, the utils `err_<hex>` id unchanged. A numeric id could collide
 * between the two logs, so filing one error as an issue marked another.
 */
export interface ErrorEntry extends Omit<LegacyErrorEntry, 'id'> {
    id:        string;
    /** How many times this error was seen. */
    count:     number;
    /** True once a fix was recorded (bg-health marks bugs it no longer sees). */
    solved:    boolean;
    solution?: string;
}

/** An entry counts as active until it is solved or filed as an issue. */
export function isActiveError(e: ErrorEntry): boolean {
    return !e.solved && !e.githubIssueNumber;
}

const LEGACY_ID_PREFIX = 'legacy_';

const DATA_UTILS_LOG_PATH      = path.join(dataDir(path.join(__dirname, '..', 'data')), 'cielovista-errors.json');

function getWorkspaceUtilsLogPaths(): string[] {
    const roots = (vscode.workspace.workspaceFolders ?? []).map(wf => wf.uri.fsPath);
    // Keep process.cwd fallback for no-workspace and older extension host flows.
    roots.push(process.cwd());
    return [...new Set(roots.map(root => path.join(root, '.vscode', 'logs', 'cielovista-errors.json')))];
}

function getUtilsLogPaths(): string[] {
    const paths = [...getWorkspaceUtilsLogPaths(), DATA_UTILS_LOG_PATH];
    return [...new Set(paths)];
}

function countArrayEntries(p: string): number {
    if (!fs.existsSync(p)) { return 0; }
    try {
        const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
        return Array.isArray(parsed) ? parsed.length : 0;
    } catch {
        return 0;
    }
}

function countLegacyEntries(): number {
    return readLegacyLog().length;
}

function isRecord(x: unknown): x is Record<string, unknown> {
    return typeof x === 'object' && x !== null && !Array.isArray(x);
}

// ─── Read the legacy log file ─────────────────────────────────────────────────

/** Legacy entries, skipping anything that isn't an entry object. */
function readLegacyLog(): LegacyErrorEntry[] {
    const raw: unknown = getLegacyErrors();
    return Array.isArray(raw) ? raw.filter(isRecord) as unknown as LegacyErrorEntry[] : [];
}

// ─── Read the utils-style log file ────────────────────────────────────────────

function readUtilsLog(): UtilsErrorEntry[] {
    const out: UtilsErrorEntry[] = [];
    for (const logFile of getUtilsLogPaths()) {
        if (!fs.existsSync(logFile)) { continue; }
        try {
            const parsed = JSON.parse(fs.readFileSync(logFile, 'utf8'));
            if (Array.isArray(parsed)) { out.push(...(parsed.filter(isRecord) as unknown as UtilsErrorEntry[])); }
        } catch {
            // best-effort read; ignore malformed files
        }
    }
    return out;
}

// ─── Translate both shapes -> viewer-shape ────────────────────────────────────

function inferType(message: string): ErrorType {
    if (!message || typeof message !== 'string') { return 'APP_ERROR'; }
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

function withCount(message: string, count: number): string {
    return count > 1 ? `${message} (×${count})` : message;
}

/** Newest-wins pick of two copies of the same entry, keeping any filed issue. */
function newerOf<T extends { githubIssueNumber?: number; githubIssueUrl?: string }>(
    a: T, b: T, stamp: (e: T) => string,
): T {
    const [newer, older] = stamp(b) > stamp(a) ? [b, a] : [a, b];
    if (newer.githubIssueNumber || !older.githubIssueNumber) { return newer; }
    return { ...newer, githubIssueNumber: older.githubIssueNumber, githubIssueUrl: older.githubIssueUrl };
}

/**
 * The legacy log appends every occurrence, so one recurring error filled the
 * viewer with identical cards. Collapse them by id into one entry with a count.
 */
function collapseLegacy(entries: LegacyErrorEntry[]): ErrorEntry[] {
    const groups = new Map<number, { entry: LegacyErrorEntry; count: number }>();
    for (const e of entries) {
        const g = groups.get(e.id);
        if (!g) { groups.set(e.id, { entry: e, count: 1 }); continue; }
        g.count++;
        g.entry = newerOf(g.entry, e, x => String(x.timestamp ?? ''));
    }
    return [...groups.values()].map(({ entry, count }) => ({
        ...entry,
        id:        `${LEGACY_ID_PREFIX}${entry.id}`,
        timestamp: String(entry.timestamp ?? ''),
        message:   withCount(String(entry.message ?? ''), count),
        count,
        solved:    false,
    }));
}

/**
 * The same utils id can sit in more than one log file (the workspace log and
 * the extension's data log). Keep one entry per id: the most recent copy.
 */
function collapseUtils(entries: UtilsErrorEntry[]): UtilsErrorEntry[] {
    const byId = new Map<string, UtilsErrorEntry>();
    for (const u of entries) {
        const key  = String(u.id || createFallbackId(u));
        const prev = byId.get(key);
        byId.set(key, prev ? newerOf(prev, u, x => String(x.lastOccurred || x.timestamp || '')) : u);
    }
    return [...byId.values()];
}

function createFallbackId(u: UtilsErrorEntry): string {
    return `err_${String(u.message ?? '')}|${String(u.timestamp ?? '')}`;
}

/**
 * Convert a utils-style entry into the viewer's expected shape.
 * Some fields don't exist in the utils log and are filled with sensible
 * defaults so the existing HTML renderer doesn't blow up.
 */
function adapt(u: UtilsErrorEntry): ErrorEntry {
    const message = String(u.message ?? '');
    const stack   = String(u.stacktrace ?? '');
    const count   = Number(u.count) || 1;
    const { filename, lineno, colno } = parseStackTop(stack);
    return {
        id:               String(u.id || createFallbackId(u)),
        timestamp:        String(u.lastOccurred || u.timestamp || ''),
        type:             inferType(message),
        prefix:           `[${u.context || 'unknown'}]`,
        context:          u.context || '',
        command:          '',
        message:          withCount(message, count),
        stack,
        filename,
        lineno,
        colno,
        raw:              message,
        count,
        solved:           u.solved === true,
        solution:         u.solution,
        githubIssueNumber: u.githubIssueNumber,
        githubIssueUrl:    u.githubIssueUrl,
    };
}

// ─── Merged getErrors ─────────────────────────────────────────────────────────

/**
 * Returns errors from BOTH log files, normalized to the viewer's expected
 * shape, one entry per distinct error, sorted by timestamp ascending (the
 * viewer reverses for display).
 */
export function getErrors(): ErrorEntry[] {
    const out = [...collapseLegacy(readLegacyLog()), ...collapseUtils(readUtilsLog()).map(adapt)];
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
    const legacyCount = countLegacyEntries();

    const utilsWithCounts = getUtilsLogPaths().map(p => {
        return { path: p, count: countArrayEntries(p) };
    });

    const bestUtils = utilsWithCounts.sort((a, b) => b.count - a.count)[0];
    if (bestUtils && bestUtils.count > 0 && legacyCount === 0) {
        return bestUtils.path;
    }
    return getLegacyLogPath();
}

/**
 * Human-readable source summary for the viewer footer.
 * Example: "legacy: 0 | workspace: 29 | data: 32"
 */
export function getLogSourceSummary(): string {
    const legacy = countLegacyEntries();
    const workspace = getWorkspaceUtilsLogPaths().reduce((sum, p) => sum + countArrayEntries(p), 0);
    const data = countArrayEntries(DATA_UTILS_LOG_PATH);
    return `legacy: ${legacy} | workspace: ${workspace} | data: ${data}`;
}

/**
 * Clears BOTH log files. The user clicked "Clear" expecting all displayed
 * errors to vanish; if we only cleared one file, the next render would
 * still show the others.
 */
export async function clearErrors(): Promise<void> {
    await clearLegacyErrors();
    for (const p of getUtilsLogPaths()) {
        if (!fs.existsSync(p)) { continue; }
        try { fs.writeFileSync(p, '[]', 'utf8'); }
        catch { /* best-effort; not fatal */ }
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
 * `id` is a viewer id from getErrors(). A `legacy_<n>` id patches every
 * legacy occurrence of that error (they collapse into one card, so patching
 * only the first left the card unfiled on reload). Any other id patches the
 * utils entry with that id in every utils log file.
 */
export function patchEntry(id: string, issueNumber: number, issueUrl: string): void {
    if (id.startsWith(LEGACY_ID_PREFIX)) {
        patchLegacy(Number(id.slice(LEGACY_ID_PREFIX.length)), issueNumber, issueUrl);
        return;
    }
    for (const p of getUtilsLogPaths()) {
        if (!fs.existsSync(p)) { continue; }
        try {
            const entries: unknown = JSON.parse(fs.readFileSync(p, 'utf8'));
            if (!Array.isArray(entries)) { continue; }
            let changed = false;
            for (const u of entries) {
                if (isRecord(u) && u.id === id) {
                    u.githubIssueNumber = issueNumber;
                    u.githubIssueUrl    = issueUrl;
                    changed = true;
                }
            }
            if (changed) { fs.writeFileSync(p, JSON.stringify(entries, null, 2), 'utf8'); }
        } catch { /* best-effort */ }
    }
}

function patchLegacy(numericId: number, issueNumber: number, issueUrl: string): void {
    const legacyPath = getLegacyLogPath();
    if (!fs.existsSync(legacyPath)) { return; }
    try {
        const log = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
        if (!Array.isArray(log?.errors)) { return; }
        let changed = false;
        for (const e of log.errors) {
            if (isRecord(e) && e.id === numericId) {
                e.githubIssueNumber = issueNumber;
                e.githubIssueUrl    = issueUrl;
                changed = true;
            }
        }
        if (changed) { fs.writeFileSync(legacyPath, JSON.stringify(log, null, 2), 'utf8'); }
    } catch { /* best-effort */ }
}
