// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * recent-projects.ts
 *
 * Tracks the last N workspaces the user opened CVT in, plus optional
 * manually-pinned projects and a user-excluded list.
 *
 * Storage keys (globalState):
 *   cvsRecentProjects  - auto-tracked on CVT activation, capped at MAX_RECENT
 *   cvsPinnedProjects  - user-added via the Home > Recent Projects Edit button
 *   cvsExcludedPaths   - user-removed via the same Edit button; filtered out of display
 *
 * Display rule (getDisplayProjects):
 *   pinned first (unbounded), then auto (capped), deduped by fsPath, minus excluded.
 *
 * Opening a workspace whose path is on the excluded list clears that exclusion -
 * the act of using it again signals intent to surface it.
 */

import * as vscode from 'vscode';
import * as path   from 'path';

export interface RecentProject {
    fsPath:  string;
    name:    string;
    lastUsed: number;   // Date.now()
    pinned?:  boolean;  // true only on entries surfaced from the pinned list
}

export interface PinnedProject {
    fsPath: string;
    name:   string;
    pinnedAt: number;
}

const STORAGE_KEY   = 'cvsRecentProjects';
const PINNED_KEY    = 'cvsPinnedProjects';
const EXCLUDED_KEY  = 'cvsExcludedPaths';
const MAX_RECENT    = 8;

let _context: vscode.ExtensionContext | undefined;

export function initRecentProjects(context: vscode.ExtensionContext): void {
    _context = context;
}

// --- Auto-tracked -----------------------------------------------------------

export function touchCurrentProject(): void {
    if (!_context) { return; }
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) { return; }

    const entry: RecentProject = {
        fsPath:   folder.uri.fsPath,
        name:     folder.name,
        lastUsed: Date.now(),
    };

    const list = getRecentProjects();
    const deduped = [entry, ...list.filter(p => p.fsPath !== entry.fsPath)].slice(0, MAX_RECENT);
    void _context.globalState.update(STORAGE_KEY, deduped);

    // Opening a workspace = user intent - clear any prior exclusion for this path.
    if (isExcluded(entry.fsPath)) {
        void unexcludePath(entry.fsPath);
    }
}

export function getRecentProjects(): RecentProject[] {
    return _context?.globalState.get<RecentProject[]>(STORAGE_KEY) ?? [];
}

// --- Pinned (user-added via Edit UI) ----------------------------------------

export function getPinnedProjects(): PinnedProject[] {
    return _context?.globalState.get<PinnedProject[]>(PINNED_KEY) ?? [];
}

export async function addPinnedProject(fsPath: string, name?: string): Promise<void> {
    if (!_context || !fsPath) { return; }
    const entry: PinnedProject = {
        fsPath,
        name: name || path.basename(fsPath) || fsPath,
        pinnedAt: Date.now(),
    };
    const list = getPinnedProjects();
    const deduped = [entry, ...list.filter(p => p.fsPath !== entry.fsPath)];
    await _context.globalState.update(PINNED_KEY, deduped);
    // Adding a pin implies the user wants it visible - drop any prior exclusion.
    if (isExcluded(fsPath)) {
        await unexcludePath(fsPath);
    }
}

export async function removePinnedProject(fsPath: string): Promise<void> {
    if (!_context || !fsPath) { return; }
    const list = getPinnedProjects();
    await _context.globalState.update(PINNED_KEY, list.filter(p => p.fsPath !== fsPath));
}

// --- Excluded (user-removed from display) -----------------------------------

export function getExcludedPaths(): string[] {
    return _context?.globalState.get<string[]>(EXCLUDED_KEY) ?? [];
}

export function isExcluded(fsPath: string): boolean {
    return getExcludedPaths().includes(fsPath);
}

export async function excludePath(fsPath: string): Promise<void> {
    if (!_context || !fsPath) { return; }
    const list = getExcludedPaths();
    if (list.includes(fsPath)) { return; }
    await _context.globalState.update(EXCLUDED_KEY, [...list, fsPath]);
}

export async function unexcludePath(fsPath: string): Promise<void> {
    if (!_context || !fsPath) { return; }
    const list = getExcludedPaths();
    await _context.globalState.update(EXCLUDED_KEY, list.filter(p => p !== fsPath));
}

// --- Unified display list ---------------------------------------------------

/**
 * Returns the merged, de-duplicated, filtered list the Home page should show.
 * Pinned entries first (order: most-recently pinned first), then auto-tracked,
 * minus any path on the excluded list.
 */
export function getDisplayProjects(): RecentProject[] {
    const pinned  = getPinnedProjects();
    const auto    = getRecentProjects();
    const exclude = new Set(getExcludedPaths());
    const seen    = new Set<string>();
    const out: RecentProject[] = [];

    for (const p of pinned) {
        if (exclude.has(p.fsPath) || seen.has(p.fsPath)) { continue; }
        seen.add(p.fsPath);
        out.push({ fsPath: p.fsPath, name: p.name, lastUsed: p.pinnedAt, pinned: true });
    }
    for (const r of auto) {
        if (exclude.has(r.fsPath) || seen.has(r.fsPath)) { continue; }
        seen.add(r.fsPath);
        out.push({ ...r, pinned: false });
    }
    return out;
}

/**
 * Remove a project from the display. If it's pinned, unpin it. Otherwise,
 * add to excluded so it won't re-appear from the auto-tracked list until
 * the user re-opens that workspace (at which point touchCurrentProject clears
 * the exclusion).
 */
export async function removeFromDisplay(fsPath: string): Promise<void> {
    if (!_context || !fsPath) { return; }
    const pinned = getPinnedProjects();
    if (pinned.some(p => p.fsPath === fsPath)) {
        await removePinnedProject(fsPath);
    } else {
        await excludePath(fsPath);
    }
}
