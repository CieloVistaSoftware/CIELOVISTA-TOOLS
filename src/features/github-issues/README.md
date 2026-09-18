---
id: feature-github-issues
title: "Feature: GitHub Issues"
description: "GitHub Issues — 2 command(s). The Issue Viewer panel, plus command palette entry points for it and for filing a new issue."
---

# Feature: GitHub Issues

## What it does

Owns the Issue Viewer: the webview panel that lists a repo's GitHub issues, fetches them (through `gh`, falling back to the REST API), and renders, filters and acts on them. **Issues: Open GitHub Issues Viewer** opens that panel for the current workspace's repo. **Issues: New GitHub Issue** opens GitHub's new-issue page with the body pre-filled with the registry project that contains the current workspace.

The Home page, the Doc Catalog and Session Activity also open the viewer or reuse its fetchers. They import them from this feature's `index.ts`. Until #745 the viewer lived in `src/shared/github-issues-view.ts` and the commands in a separate `src/features/github-issues.ts`; now it is one feature.

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.issues.openViewer`](command:cvs.issues.openViewer) | Issues: Open GitHub Issues Viewer |
| [`cvs.issues.newIssue`](command:cvs.issues.newIssue) | Issues: New GitHub Issue |

---

## Internal architecture

```text
index.ts     public surface: activate/deactivate + the viewer functions other features use
feature.ts   activate(context)
               └── registers 2 command(s)
               └── Issues: Open GitHub Issues Viewer → cvs.issues.openViewer → showGithubIssues()
               └── Issues: New GitHub Issue          → cvs.issues.newIssue   → newIssueForCurrentProject()
view.ts      the Issue Viewer webview: panel state, gh/REST fetch, HTML rendering, message handling
```

**Exported from `index.ts`:**
- `showGithubIssues(viewColumn?, wsPath?)` — open (or reuse) the Issue Viewer panel. Used by the Home page.
- `newIssueForProject(projectName?)` — open GitHub's new-issue page. Used by the Doc Catalog's Report Issue button.
- `newIssueForCurrentProject()` — looks up the workspace's project in the registry, then calls `newIssueForProject()`.
- `detectRepoFromWorkspace(wsPath?)`, `fetchIssuesForRepo(repo, state?, limit?)`, types `GHIssue`, `IssueState` — used by Session Activity.

---

## Manual test

1. Open the Command Palette and run **Issues: Open GitHub Issues Viewer** (`cvs.issues.openViewer`).
   Verify the Issue Viewer panel opens for the current workspace's repo.
2. Run **Issues: New GitHub Issue** (`cvs.issues.newIssue`) from a registered project's folder.
   Verify the browser opens the new-issue page with `**Project:** <name>` in the body.
3. On CVT Home, click **Issue Viewer**. Verify the same panel opens.
