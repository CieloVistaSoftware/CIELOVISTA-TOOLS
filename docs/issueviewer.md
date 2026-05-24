# Issue Viewer Integration Overview

## How It Works

1. The VS Code extension registers the command `cvs.issues.openViewer` in `src/extension.ts`.
2. When this command is triggered (e.g., from a menu or button), it calls `showGithubIssues()` from `src/shared/github-issues-view.ts`.
3. The `showGithubIssues()` function is responsible for rendering the Issue Viewer UI, including the reload button.
4. The reload button’s click handler is implemented in `github-issues-view.ts`. When clicked, it triggers the reload logic for the Issue Viewer.

## Two-Way Priority Sync (Planned)

- The reload button handler will be updated to:
  1. Write any local priority changes to GitHub (using the sync module).
  2. Read the latest priorities from GitHub and update the UI.

This ensures that changes to the priority field are always kept in sync between the Issue Viewer and the GitHub Project board.

---

If you need to add custom sync logic, update the reload handler in `github-issues-view.ts` as described above.