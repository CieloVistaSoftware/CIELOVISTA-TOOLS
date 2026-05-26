# Feature: Running Tasks

## What it does

<!-- TODO: describe what this feature does in 2–4 sentences -->
_Auto-generated stub. Replace this with a human description of the feature._

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.tools.runningTasks`](command:cvs.tools.runningTasks) | Tools: RunningTasks |

---

## Internal architecture

```text
activate(context)
  └── registers 1 command(s)
  └── Tools: RunningTasks → cvs.tools.runningTasks
```

**Key internal functions:**
- `classifyProcess()`
- `runPs()`
- `collectData()`
- `killPids()`
- `focusWindowByPid()`
- `buildHtml()`
- `status()`
- `getCheckedPids()`
- `updateKillBtn()`
- `applyFilter()`
- `doRefresh()`
- `refresh()`
- `showPanel()`

---

## Manual test

1. Open the Command Palette and run **Tools: RunningTasks** (`cvs.tools.runningTasks`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.

---
docid: 150.1.running-tasks
id: feature-running-tasks
title: "Feature: Running Tasks"
project: cielovista-tools
description: "Running Tasks — 1 command(s). Auto-generated stub: fill in What it does and Manual test."
status: active
tags: [running, tasks]
category: 150.1 — Components / Features
created: 2026-05-19
updated: 2026-05-19
version: 1.0.0
author: CieloVista Software
relativepath: src/features/running-tasks.README.md
---
