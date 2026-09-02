# Feature: Bg Health Runner

## Commands

| Command ID | Title | Keybinding |
|---|---|---|
| `cvs.health.fixBugs` | Health: Fix Bugs (Background Runner) | — |

## What it does

Runs continuous background health checks every 8 seconds (round-robin) across the extension and registered projects, writing results to `data/bg-health.json`. Checks include catalog command registration, project registry integrity, CLAUDE.md presence, duplicate command IDs, untagged code blocks, and data-dir writability. Surfaces failures in a "Fix Bugs" webview panel with per-check auto-fix buttons and GitHub issue filing.

## Hourly regression run

Separately from the round-robin checks, the runner spawns `scripts/run-regression-tests.js` once an hour (first run 2 minutes after activation). A failure is retried once after 20s before a bug is filed, since a mid-edit worktree can fail transiently.

The suite analyses the **source tree** — `src/` and `tests/regression/` — so it only means anything when the running copy sits inside a source checkout. The runner walks up from its own location (`_findSourceCheckoutRoot()`) looking for `scripts/run-regression-tests.js` + `src/` + `tests/regression/`.

### When the scheduler arms

`activate()` runs that probe **once**, via `armRegressionScheduler()`, and arms the hourly timer only if it finds a source checkout (#698):

| Running copy | Timer armed? | What is logged at activation |
|---|---|---|
| Source checkout (F5 / dev host) | Yes — first run at 2 min, hourly after | `Hourly regression check active — source checkout <root>` |
| Installed `.vsix` (no `src/`, no `tests/`) | **No timer at all** | One informational line: the check is inactive, which is normal for an installed extension |

Before #698 every install armed a one-hour timer whose only possible outcome was a skip log, so an inert feature wrote an hourly line that read like a fault report. The activation line is emitted **once**, never hourly, and is worded as a statement of fact rather than a warning.

The Fix Bugs panel toolbar shows the real state (`Hourly regression: active` / `inactive (installed build)`) so no surface implies a check is running when none was armed.

### When an individual run is skipped

The in-run gate stays in place as defence in depth — `runRegressionTests()` must be safe whenever it is reached directly (a retry, a future manual trigger), whatever armed it. It skips the run entirely when:

| Situation | Why it is skipped |
|---|---|
| No source checkout above the running module | An installed `.vsix` ships `out/` and `scripts/` but no `src/` or `tests/` — all eight structural REG checks would fail every hour, forever (#684) |
| Running from a `.claude/worktrees/` copy | Worktree copies are never the source of truth; the main checkout and CI cover the signal (#641) |
| `out/extension.js` missing | An unbuilt copy is a missing build artifact, not a regression (#641) |

A skip logs `not a regression signal` to the output channel and files no bug. The no-source-tree skip also clears any stale `bug-regression-tests` an earlier build recorded, so an installed extension does not keep showing a false alarm in the Fix Bugs panel and error log.

---
| [`cvs.health.fixBugs`](command: cvs.health.fixBugs) | Health: Fix Bugs |
└── Health: FixBugs → cvs.health.fixBugs
**Key internal functions: **
1. Open the Command Palette and run **Health: FixBugs** (`cvs.health.fixBugs`).
docid: 150.1.background-health-runner
id: feature-background-health-runner
title: Feature: Bg Health Runner
project: cielovista-tools
description: Bg Health Runner — 1 command(s). Auto-generated stub: fill in What it does and Manual test.
status: active
tags: [bg, cvs.health.fixBugs, health, runner]
category: 150.1 — Components / Features
created: 2026-05-15
updated: 2026-05-15
version: 1.0.0
author: CieloVista Software
relativepath: src/features/background-health-runner.README.md
---