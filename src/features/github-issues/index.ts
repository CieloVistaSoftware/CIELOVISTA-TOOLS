// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

// component: issv

/**
 * github-issues: the feature's public surface.
 *
 *   feature.ts  registers cvs.issues.openViewer and cvs.issues.newIssue
 *   view.ts     the Issue Viewer webview: panel state, fetch, rendering
 *
 * extension.ts wires activate/deactivate. The Home page, the Doc Catalog and
 * Session Activity open the viewer or reuse its fetchers through the exports
 * below, never by reaching into view.ts. (#745)
 */

export { activate, deactivate, newIssueForCurrentProject } from './feature';
export {
    showGithubIssues,
    newIssueForProject,
    detectRepoFromWorkspace,
    fetchIssuesForRepo,
    type GHIssue,
    type IssueState,
} from './view';
