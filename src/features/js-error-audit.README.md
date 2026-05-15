---
docid: auto.js-error-audit
id: feature-js-error-audit
title: "Feature: Js Error Audit"
project: cielovista-tools
description: "Js Error Audit — 1 command(s). Auto-generated stub: fill in What it does and Manual test."
status: active
tags: [js, error, audit]
category: 150.1 — Components / Features
created: 2026-05-15
updated: 2026-05-15
version: 1.0.0
author: CieloVista Software
relativepath: src/features/js-error-audit.README.md
---
# Feature: Js Error Audit

## What it does

<!-- TODO: describe what this feature does in 2–4 sentences -->
_Auto-generated stub. Replace this with a human description of the feature._

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.audit.jsErrors`](command:cvs.audit.jsErrors) | Audit: JsErrors |

---

## Internal architecture

```
activate(context)
  └── registers 1 command(s)
  └── Audit: JsErrors → cvs.audit.jsErrors
```

**Key internal functions:**
- `findDiskCleanUpRoot()`
- `findAuditJson()`
- `findStateJson()`
- `findAuditScript()`
- `loadState()`
- `saveState()`
- `mergeState()`
- `updateEntryStatus()`
- `classifyFixKind()`
- `findIssueLine()`
- `buildDiff()`
- `computeLCS()`
- `collapseDiff()`
- `generateAiFix()`
- `statusBadgeHtml()`
- `buildAuditHtml()`
- `showStatus()`
- `hideStatus()`
- `showDiff()`
- `hideDiff()`
- `esc()`
- `runJsErrorAudit()`
- `loadReport()`
- `refresh()`
- `showPanel()`
- `attachHandler()`
- `handleAiFix()`
- `runAuditScript()`

---

## Manual test

1. Open the Command Palette and run **Audit: JsErrors** (`cvs.audit.jsErrors`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
