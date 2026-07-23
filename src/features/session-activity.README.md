# Feature: Session Activity Dashboard

## Commands

| Command ID | Title | Keybinding |
|---|---|---|
| `cvs.tools.sessionActivity` | Tools: Session Activity Dashboard | — |

## What it does

A single live "what's going on right now" rollup for the repo behind the
currently open workspace, rendered as a VS Code webview panel (opens beside
the active editor). Five sections:

1. **Current Focus** — the one issue actively being worked on right now,
   read from `<workspace root>/data/claude-job-status.json` (see schema
   below). Shows "No active job data" if the file doesn't exist or can't be
   parsed.
2. **Current Batch** — open issues labeled `status:in-progress` or
   `priority:1` (the same "actively worked" convention the Issue Viewer
   already uses for its in-progress chip). This is the batch currently being
   burned down, not the full backlog.
3. **Pushes to Deploy Branch** — the last 20 commits on whichever remote
   branch looks like the deploy/publish branch, auto-detected from `git
   branch -r` against a candidate list (`gh-pages`, `deploy`, `live`, `prod`,
   `production`, `io`, `release` — first match wins). If none of those exist
   as remote branches, the section says so instead of guessing.
4. **CI** — the last 10 GitHub Actions runs for the repo (`gh run list`),
   with a pass/fail/in-progress pill per run and a link to open it on GitHub.
5. **Open Issues** — every open issue for the repo, **uncapped** (unlike the
   Issue Viewer's usual page size), sorted by most-recently-updated first.

A "&#8635; Reload" button forces a live re-fetch of all five sections; data
is otherwise cached for ~12 seconds per (workspace, repo) pair so opening the
panel and immediately reloading doesn't hammer `git`/`gh`. The panel also
auto-refreshes on a 60-second countdown, matching the Issue Viewer's existing
auto-refresh convention.

## Design decision (GitHub issue #650)

**New dedicated feature file** (`src/features/session-activity.ts`), not an
extension of the existing Issue Viewer (`src/shared/github-issues-view.ts`,
wired from `home-page.ts`). Reasoning:

- Issue Viewer's job is browsing/triaging/claiming individual issues in one
  big sortable table. Session Activity's job is a small at-a-glance rollup
  across **four different data sources** (job-status file, `git log`, `gh run
  list`, `gh issue list`) that Issue Viewer has no reason to know about.
  Folding those in would turn one focused file into two jobs, violating the
  "one job per file" rule.
- No logic is duplicated to get there. `src/shared/github-issues-view.ts` was
  given two small additions specifically so this feature could reuse them
  instead of re-implementing:
  - `detectRepoFromWorkspace(wsPath?)` — was already implemented there but
    unexported; now exported. Detects the `{owner, name}` GitHub repo for a
    workspace path via `git remote get-url origin`, with the same fallbacks
    Issue Viewer already used (active editor's workspace, then the CVT repo
    itself).
  - `fetchIssuesForRepo(repo, state, limit)` — a thin exported wrapper around
    the existing (unexported) `fetchIssuesViaGh`, which was generalized to
    take an explicit `repo` and `limit` instead of always using the module's
    internal `currentRepo` and a hardcoded 50-item cap. This is what makes
    the "Open Issues — uncapped" section possible without copy-pasting the
    `gh issue list` invocation and JSON-shape mapping into a second file.
  - Everything else this feature needs (the job-status file, `git log` on a
    deploy branch, `gh run list` for CI) has no existing shared helper
    anywhere in `src/shared/` — there is no dedicated git/gh wrapper module
    in this codebase yet. It's implemented here the same ad hoc way
    `github-issues-view.ts` and `mcp-viewer/index.ts` already shell out to
    `git`/`gh` directly (`child_process.execFile`), so this isn't a new
    pattern, just the existing one applied to a new feature.
- Rendered as a **webview panel** (`vscode.window.createWebviewPanel`), the
  same pattern Home and Issue Viewer already use — not a standalone local
  HTTP server. The one place in this codebase that does spin up a local HTTP
  server for a feature (`mcp-viewer`) does so specifically to sidestep CSP
  for opening rendered Markdown/JSON in the system browser; that constraint
  doesn't apply here, so the simpler webview-panel + `postMessage` pattern
  (as used by Issue Viewer) was the right fit.

## Data sources

| Section | Source | How |
|---|---|---|
| Current Focus | `<workspace root>/data/claude-job-status.json` | Read + JSON-parsed directly; missing/invalid file → empty state, no error |
| Current Batch | GitHub Issues API (via `gh`) | `fetchIssuesForRepo(repo, 'open', 500)`, filtered to `status:in-progress` / `priority:1` labels |
| Pushes to Deploy Branch | `git` | `git branch -r` to detect the branch, `git fetch origin <branch> --quiet` (best-effort, ignored if offline), then `git log origin/<branch>` |
| CI | GitHub Actions (via `gh`) | `gh run list -R <owner>/<name> --limit 10 --json name,displayTitle,status,conclusion,headBranch,createdAt,url` |
| Open Issues | GitHub Issues API (via `gh`) | `fetchIssuesForRepo(repo, 'open', 500)`, unfiltered, sorted by `updated_at` desc |

Nothing here is hardcoded to a specific repo or port. The workspace root is
`vscode.workspace.workspaceFolders[0]`; the repo is detected from that
folder's own `git remote get-url origin`; the deploy branch is detected, not
assumed.

### `data/claude-job-status.json` schema (consumed, not yet produced)

This feature **reads** this file if present but does not write it, and as of
this change **no other feature in cielovista-tools produces it yet** — a full
search of `src/`, `data/`, and `docs/_today/` turned up no existing writer.
The path matches the convention already referenced in project working notes
("Current Job" banner), so this feature adopts that same path rather than
inventing a second one, but wiring a producer (e.g. a Claude session
updating this file as it works, or a small `cvs.session.setFocus` command) is
**out of scope for issue #650** and left for a follow-up.

Expected shape — all fields optional, unknown/extra fields ignored:

```json
{
  "issueNumber": 650,
  "title": "Add Session Activity dashboard as a cvt feature",
  "branch": "feat/650-session-activity-dashboard",
  "startedAt": "2026-07-23T14:00:00.000Z",
  "updatedAt": "2026-07-23T15:30:00.000Z",
  "note": "Implementing session-activity.ts, wiring extension.ts next"
}
```

## Manual test steps

1. Run `npm run rebuild` and reload the VS Code Insiders window.
2. Open the Command Palette → **Tools: Session Activity Dashboard**
   (`cvs.tools.sessionActivity`). A panel opens beside the active editor
   titled "Session Activity".
3. Confirm the header shows `github.com/<owner>/<repo>` matching the current
   workspace's `git remote get-url origin`.
4. Confirm all five sections render (Current Focus, Current Batch, Pushes to
   Deploy Branch, CI, Open Issues) without a JS console error
   (`Help > Toggle Developer Tools`).
5. Create `data/claude-job-status.json` in the workspace root with the
   sample JSON above, click **&#8635; Reload** — Current Focus should now
   show issue #650 with its branch and timestamps instead of the empty
   state. Delete the file and reload again — it should cleanly fall back to
   the empty state.
6. Click a row's title link in Current Batch or Open Issues — it should open
   that issue on github.com in the default browser.
7. Click a CI run's "view" link — it should open that run on
   github.com/&lt;owner&gt;/&lt;repo&gt;/actions in the default browser.
8. Wait 60 seconds without touching the panel — the auto-timer should hit 0
   and trigger a silent refresh (watch the Output panel's "CieloVista Tools"
   channel — no explicit log line is emitted per auto-tick by design, but the
   webview HTML will update; use the manual Reload button instead for a
   verifiable single refresh).

---
docid: 150.1.session-activity
id: feature-session-activity
title: Feature: Session Activity Dashboard
project: cielovista-tools
description: Session Activity Dashboard — live rollup of Current Focus, Current Batch, deploy-branch pushes, CI, and uncapped open issues for the current workspace's repo.
status: active
tags: [cvs.tools.sessionActivity, session-activity, ci, issues, dashboard]
category: 150.1 — Components / Features
created: 2026-07-23
updated: 2026-07-23
version: 1.0.0
author: CieloVista Software
relativepath: src/features/session-activity.README.md
---
