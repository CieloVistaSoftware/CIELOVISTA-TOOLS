---
id: feature-js-error-audit
title: "Feature: Js Error Audit"
description: "Js Error Audit — 1 command(s). Auto-generated stub: fill in What it does and Manual test."
---

# Feature: Js Error Audit

## What it does

<!-- TODO: describe what this feature does in 2–4 sentences -->
_Auto-generated stub. Replace this with a human description of the feature._

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.audit.jsErrors`](command:cvs.audit.jsErrors) | Audit: JS Error Handling Audit |

---

## Internal architecture

```text
activate(context)
  └── registers 1 command(s)
  └── Audit: JS Error Handling Audit → cvs.audit.jsErrors
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

1. Open the Command Palette and run **Audit: JS Error Handling Audit** (`cvs.audit.jsErrors`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
