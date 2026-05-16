---
docid: 150.1.claude-process-monitor
id: feature-claude-process-monitor
title: "Feature: Claude Process Monitor"
project: cielovista-tools
description: "Claude Process Monitor — 1 command(s). Auto-generated stub: fill in What it does and Manual test."
status: active
tags: [claude, process, monitor]
category: 150.1 — Components / Features
created: 2026-05-15
updated: 2026-05-15
version: 1.0.0
author: CieloVista Software
relativepath: src/features/claude-process-monitor.README.md
---
# Feature: Claude Process Monitor

## What it does

<!-- TODO: describe what this feature does in 2–4 sentences -->
_Auto-generated stub. Replace this with a human description of the feature._

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.claude.processMonitor`](command:cvs.claude.processMonitor) | Claude: ProcessMonitor |

---

## Internal architecture

```
activate(context)
  └── registers 1 command(s)
  └── Claude: ProcessMonitor → cvs.claude.processMonitor
```

**Key internal functions:**
- `runPs()`
- `collectData()`
- `killPid()`
- `formatUptime()`
- `openerLabel()`
- `memBadge()`
- `buildHtml()`
- `status()`
- `refresh()`
- `showPanel()`

---

## Manual test

1. Open the Command Palette and run **Claude: ProcessMonitor** (`cvs.claude.processMonitor`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
