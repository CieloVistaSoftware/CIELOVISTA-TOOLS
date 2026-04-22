// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * recent-projects.ts
 *
 * Tracks the last N workspaces the user opened CVT in.
 * Mirrors VS Code's own "Open Recent" list but scoped to CVT usage.
 *
 * Each time CVT opens in a workspace the project is pushed to the top.
 * Persisted in globalState under 'cvsRecentProjects'.
 */

import * as vscode from 'vscode';

export interface RecentProject {
    fsPath:  string;
    name:    string;
    lastUsed: number;   // Date.now()
}

const STORAGE_KEY = 'cvsRecentProjects';
const MAX_RECENT  = 8;

let _context: vscode.ExtensionContext | undefined;

export function initRecentProjects(context: vscode.ExtensionContext): void {
    _context = context;
}

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
}

export function getRecentProjects(): RecentProject[] {
    return _context?.globalState.get<RecentProject[]>(STORAGE_KEY) ?? [];
}
