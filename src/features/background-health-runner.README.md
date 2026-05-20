---
docid: 150.1.background-health-runner
id: feature-background-health-runner
title: "Feature: Bg Health Runner"
project: cielovista-tools
description: "Bg Health Runner — 1 command(s). Auto-generated stub: fill in What it does and Manual test."
status: active
tags: [bg, health, runner]
category: 150.1 — Components / Features
created: 2026-05-15
updated: 2026-05-15
version: 1.0.0
author: CieloVista Software
relativepath: src/features/background-health-runner.README.md
---
# Feature: Bg Health Runner

## What it does

Runs continuous background health checks every 8 seconds (round-robin) across the extension and registered projects, writing results to `data/bg-health.json`. Checks include catalog command registration, project registry integrity, CLAUDE.md presence, duplicate command IDs, untagged code blocks, and data-dir writability. Surfaces failures in a "Fix Bugs" webview panel with per-check auto-fix buttons and GitHub issue filing.

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.health.fixBugs`](command:cvs.health.fixBugs) | Health: Fix Bugs |

---

## Internal architecture

```text
activate(context)
  └── registers 1 command(s)
  └── Health: FixBugs → cvs.health.fixBugs
```

**Key internal functions:**
- `isPortOpen()`
- `isAlreadyRunning()`
- `claimSingleton()`
- `releaseSingleton()`
- `ensureDataDir()`
- `loadState()`
- `saveState()`
- `addBug()`
- `clearBug()`
- `parseEvidenceLocation()`
- `resolveCommandEvidenceLocation()`
- `renderEvidenceHtml()`
- `defaultRecommendation()`
- `buildIssueUrl()`
- `runNextCheck()`
- `buildFixBugsHtml()`

---

## Manual test

1. Open the Command Palette and run **Health: FixBugs** (`cvs.health.fixBugs`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
