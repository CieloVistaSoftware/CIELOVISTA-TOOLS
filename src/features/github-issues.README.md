---
id: feature-github-issues
title: "Feature: GitHub Issues"
description: "GitHub Issues — 2 command(s). Command palette entry points for the Issue Viewer and for filing a new issue."
---

# Feature: GitHub Issues

## What it does

Registers the two GitHub issue commands. **Issues: Open GitHub Issues Viewer** opens the Issue Viewer panel for the current workspace's repo. **Issues: New GitHub Issue** opens GitHub's new-issue page with the body pre-filled with the registry project that contains the current workspace.

The viewer itself lives in `src/shared/github-issues-view.ts`, because the Home page and the Doc Catalog open it too. `shared/` holds functions only, never command registrations, so the commands are registered here. They were registered in `extension.ts` until #738.

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.issues.openViewer`](command:cvs.issues.openViewer) | Issues: Open GitHub Issues Viewer |
| [`cvs.issues.newIssue`](command:cvs.issues.newIssue) | Issues: New GitHub Issue |

---

## Internal architecture

```text
activate(context)
  └── registers 2 command(s)
  └── Issues: Open GitHub Issues Viewer → cvs.issues.openViewer → showGithubIssues()
  └── Issues: New GitHub Issue          → cvs.issues.newIssue   → newIssueForCurrentProject()
```

**Key internal functions:**
- `newIssueForCurrentProject()` — looks up the workspace's project in the registry, then calls `newIssueForProject()`

---

## Manual test

1. Open the Command Palette and run **Issues: Open GitHub Issues Viewer** (`cvs.issues.openViewer`).
   Verify the Issue Viewer panel opens for the current workspace's repo.
2. Run **Issues: New GitHub Issue** (`cvs.issues.newIssue`) from a registered project's folder.
   Verify the browser opens the new-issue page with `**Project:** <name>` in the body.
