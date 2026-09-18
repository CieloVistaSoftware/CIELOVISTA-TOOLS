// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * github-issues.ts
 *
 * Command palette entry points for GitHub issues:
 *   cvs.issues.openViewer  opens the GitHub Issues viewer panel
 *   cvs.issues.newIssue    opens GitHub's new-issue page, pre-filled with the
 *                          registry project that contains the current workspace
 *
 * The viewer itself (webview, fetching, rendering) lives in
 * shared/github-issues-view.ts because the Home page and the Doc Catalog call
 * it too. shared/ holds functions only, never command registrations, so the
 * commands are registered here. Until #738 they were registered in extension.ts.
 */

import * as vscode from 'vscode';
import { showGithubIssues, newIssueForProject } from '../shared/github-issues-view';
import { loadRegistry } from './doc-catalog/registry';
import { getCurrentWorkspaceProjectName } from './doc-catalog/commands';

/** Open the new-issue page for the registry project that contains the workspace. */
export function newIssueForCurrentProject(): void {
    const registry = loadRegistry();
    const projName = getCurrentWorkspaceProjectName(registry?.projects ?? []);
    newIssueForProject(projName || undefined);
}

export function activate(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.issues.openViewer', () => showGithubIssues()),
        vscode.commands.registerCommand('cvs.issues.newIssue', newIssueForCurrentProject),
    );
}

export function deactivate(): void { /* the viewer panel is owned by shared/github-issues-view */ }
