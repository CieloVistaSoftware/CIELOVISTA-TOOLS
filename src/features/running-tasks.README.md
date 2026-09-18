---
id: feature-running-tasks
title: "Feature: Running Tasks"
description: "Running Tasks — 1 command(s). Auto-generated stub: fill in What it does and Manual test."
---

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
