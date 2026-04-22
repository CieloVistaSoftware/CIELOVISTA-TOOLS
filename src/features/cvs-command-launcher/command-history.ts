// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * command-history.ts
 *
 * Persists the last N command runs per workspace to globalState.
 * Mirrors VS Code's own "recently used" pattern.
 *
 * Shape stored in globalState under key 'cvsCommandHistory':
 *   Record<wsKey, HistoryEntry[]>   (most recent first, max MAX_PER_WS entries)
 *
 * wsKey = workspace root fsPath, or '__global__' when no folder is open.
 */

import * as vscode from 'vscode';

export interface HistoryEntry {
    id:        string;   // catalog command id
    title:     string;   // catalog command title
    wsPath:    string;   // workspace path at time of run
    wsName:    string;   // workspace folder name at time of run
    timestamp: number;   // Date.now()
    ok:        boolean;  // true = success, false = error
    elapsed:   number;   // ms
}

const STORAGE_KEY  = 'cvsCommandHistory';
const MAX_PER_WS   = 10;

let _context: vscode.ExtensionContext | undefined;

export function initHistory(context: vscode.ExtensionContext): void {
    _context = context;
}

function wsKey(): string {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '__global__';
}

function readAll(): Record<string, HistoryEntry[]> {
    return (_context?.globalState.get<Record<string, HistoryEntry[]>>(STORAGE_KEY)) ?? {};
}

export function recordRun(entry: Omit<HistoryEntry, 'wsPath' | 'wsName' | 'timestamp'>): void {
    if (!_context) { return; }
    const key  = wsKey();
    const all  = readAll();
    const list = all[key] ?? [];

    const full: HistoryEntry = {
        ...entry,
        wsPath:    key,
        wsName:    vscode.workspace.workspaceFolders?.[0]?.name ?? '',
        timestamp: Date.now(),
    };

    // Most recent first, dedupe by id (keep latest run only)
    const deduped = [full, ...list.filter(e => e.id !== entry.id)].slice(0, MAX_PER_WS);
    all[key] = deduped;
    void _context.globalState.update(STORAGE_KEY, all);
}

export function getHistory(wsPath?: string): HistoryEntry[] {
    const key = wsPath ?? wsKey();
    return readAll()[key] ?? [];
}

export function clearHistory(wsPath?: string): void {
    if (!_context) { return; }
    const key = wsPath ?? wsKey();
    const all = readAll();
    delete all[key];
    void _context.globalState.update(STORAGE_KEY, all);
}
