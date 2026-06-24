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

## Current Job Panel (issue #3)

The Issue Viewer shows a live **Current Job** banner at the top whenever Claude
is running a batch job, so you can see what's happening without leaving VS Code:
the job title, a progress bar, the active step, elapsed time, ETA, and a checklist
of every step (✓ done / ▶ active / ○ pending).

### Data source

The banner reads a status file that Claude writes/updates as it works:

```text
<workspace>/data/claude-job-status.json
```

Schema:

```json
{
  "jobId":     "issue-3-current-job-panel",
  "title":     "Issue #3 — Current Job panel",
  "startedAt": "2026-06-15T12:00:00.000Z",
  "updatedAt": "2026-06-15T12:03:20.000Z",
  "etaIso":    "2026-06-15T12:08:00.000Z",
  "steps": [
    { "name": "Write reader + tests", "status": "done" },
    { "name": "Wire into Issue Viewer", "status": "active" },
    { "name": "Rebuild + verify",       "status": "pending" }
  ],
  "detail": "compiling extension"
}
```

### How the file stays current (auto-writer)

You do **not** hand-write the status file. Two writers keep it live:

1. **Claude (rich content)** — as Claude works it writes the `title`, `steps`, and
   `etaIso` so the banner shows real steps + ETA.
2. **PostToolUse hook (heartbeat)** — `scripts/claude-job-heartbeat.mjs`, wired in
   `.claude/settings.json`, fires after *every* Claude tool use. It refreshes
   `updatedAt` (so the banner stays visible while Claude is active) and sets
   `detail` to the current activity. It **preserves** Claude's title/steps/ETA and
   only writes a minimal placeholder when no status exists yet.

When Claude stops, the heartbeat stops too — so the banner auto-hides after
`STALE_MS` (5 min). No cleanup needed.

### Architecture

- `src/shared/job-status-reader.ts` — **pure, vscode-free**: `readJobStatus(path)`
  parses the file; `summarizeJob(status, now)` derives state, percent, active step,
  elapsed, and ETA. `now` is injected, so it is fully unit-testable
  (`tests/unit/job-status-reader.test.js`).
- `github-issues-view.ts` — the webview polls (`jobPoll`) every 4 s; the extension
  host reads the workspace status file, summarizes it, and posts `jobStatus` back.
  The banner re-renders in place without re-fetching the issue list.
- A job is **hidden** when there is no status file, the JSON is invalid, or the
  file hasn't been touched in `STALE_MS` (5 min) — so a finished/abandoned job
  disappears on its own.

Guarded by `tests/regression/REG-112-issue-viewer-current-job.test.js`.

---

If you need to add custom sync logic, update the reload handler in `github-issues-view.ts` as described above.