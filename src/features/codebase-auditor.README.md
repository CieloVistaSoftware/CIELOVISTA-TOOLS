---
id: feature-codebase-auditor
title: "Feature: Codebase Auditor"
description: "Codebase Auditor — 1 command(s). Auto-generated stub: fill in What it does and Manual test."
---

# Feature: Codebase Auditor

## What it does

Scans `src/` for nine categories of structural health issues: oversized files (300/600-line thresholds), long functions (40/60-line thresholds), duplicate exports, dead monolith files (both `.ts` and folder/`index.ts` exist), missing READMEs, one-time-one-place violations (inline helpers, hardcoded paths), improper shared-utils usage, dead files not imported in `extension.ts`, and duplicate code blocks in folder features. Results are shown in an interactive webview panel.

---

## Commands

| Command ID | Title | Keybinding |
|---|---|---|
| `cvs.audit.codebase` | Audit: Codebase Health Audit | — |

---

## Internal architecture

```text
activate(context)
  └── registers 1 command(s)
  └── Audit: Codebase Health Audit → cvs.audit.codebase
```

**Key internal functions:**
- `collectTsFiles()`
- `id()`
- `checkFileSizes()`
- `checkFunctionLength()`
- `checkDuplicateExports()`
- `checkDeadMonoliths()`
- `checkMissingReadmes()`
- `checkOneTimeOnePlace()`
- `checkSharedUtilUsage()`
- `checkDeadFiles()`
- `checkFolderDuplicateCode()`
- `buildAuditHtml()`
- `showStatus()`
- `applyFilter()`
- `buildSummaryText()`
- `runScan()`

---

## Manual test

1. Open a workspace with the CieloVista Tools extension active.
2. Verify Codebase Auditor activates without errors in the Output channel.
