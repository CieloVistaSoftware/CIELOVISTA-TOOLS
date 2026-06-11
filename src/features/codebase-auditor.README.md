# Feature: Codebase Auditor

## What it does

Scans `src/` for nine categories of structural health issues: oversized files (300/600-line thresholds), long functions (40/60-line thresholds), duplicate exports, dead monolith files (both `.ts` and folder/`index.ts` exist), missing READMEs, one-time-one-place violations (inline helpers, hardcoded paths), improper shared-utils usage, dead files not imported in `extension.ts`, and duplicate code blocks in folder features. Results are shown in an interactive webview panel.

---

## Commands

| Command ID | Title |
|---|---|
_No commands registered — utility/shared module._

---

## Internal architecture

```text
activate(context)
  └── registers 0 command(s)

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

---
docid: 150.1.codebase-auditor
id: feature-codebase-auditor
title: "Feature: Codebase Auditor"
project: cielovista-tools
description: "Codebase Auditor — 0 command(s). Auto-generated stub: fill in What it does and Manual test."
status: active
tags: [codebase, auditor]
category: 150.1 — Components / Features
created: 2026-05-15
updated: 2026-05-15
version: 1.0.0
author: CieloVista Software
relativepath: src/features/codebase-auditor.README.md
---
