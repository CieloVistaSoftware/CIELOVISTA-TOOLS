# Feature: Regression Log Viewer

## What it does

<!-- TODO: describe what this feature does in 2–4 sentences -->
_Auto-generated stub. Replace this with a human description of the feature._

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.tools.regressionLog`](command:cvs.tools.regressionLog) | Tools: RegressionLog |

---

## Internal architecture

```text
activate(context)
  └── registers 1 command(s)
  └── Tools: RegressionLog → cvs.tools.regressionLog
```

**Key internal functions:**
- `readEntries()`
- `writeEntries()`
- `patchEntry()`
- `severityColor()`
- `statusColor()`
- `buildHtml()`

---

## Manual test

1. Open the Command Palette and run **Tools: RegressionLog** (`cvs.tools.regressionLog`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.

---
docid: 150.1.regression-log-viewer
id: feature-regression-log-viewer
title: "Feature: Regression Log Viewer"
project: cielovista-tools
description: "Regression Log Viewer — 1 command(s). Auto-generated stub: fill in What it does and Manual test."
status: active
tags: [regression, log, viewer]
category: 150.1 — Components / Features
created: 2026-05-15
updated: 2026-05-15
version: 1.0.0
author: CieloVista Software
relativepath: src/features/regression-log-viewer.README.md
---
