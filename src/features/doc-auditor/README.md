---
docid: auto.doc-auditor-dir
id: feature-doc-auditor
title: "Feature: Doc Auditor"
project: cielovista-tools
description: "Doc Auditor — 9 command(s). Auto-generated stub: fill in What it does and Manual test."
status: active
tags: [doc, auditor]
category: 150.1 — Components / Features
created: 2026-05-15
updated: 2026-05-15
version: 1.0.0
author: CieloVista Software
relativepath: src/features/doc-auditor/README.md
---
# Feature: Doc Auditor

## What it does

<!-- TODO: describe what this feature does in 2–4 sentences -->
_Auto-generated stub. Replace this with a human description of the feature._

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.audit.docs`](command:cvs.audit.docs) | Audit: Docs |
| [`cvs.audit.findDuplicates`](command:cvs.audit.findDuplicates) | Audit: FindDuplicates |
| [`cvs.audit.findSimilar`](command:cvs.audit.findSimilar) | Audit: FindSimilar |
| [`cvs.audit.findOrphans`](command:cvs.audit.findOrphans) | Audit: FindOrphans |
| [`cvs.audit.mergeFiles`](command:cvs.audit.mergeFiles) | Audit: MergeFiles |
| [`cvs.audit.moveToGlobal`](command:cvs.audit.moveToGlobal) | Audit: MoveToGlobal |
| [`cvs.audit.openReport`](command:cvs.audit.openReport) | Audit: OpenReport |
| [`cvs.audit.actOnReport`](command:cvs.audit.actOnReport) | Audit: ActOnReport |
| [`cvs.audit.walkthrough`](command:cvs.audit.walkthrough) | Audit: Walkthrough |

---

## Internal architecture

```
activate(context)
  └── registers 9 command(s)
  └── Audit: Docs → cvs.audit.docs
  └── Audit: FindDuplicates → cvs.audit.findDuplicates
  └── Audit: FindSimilar → cvs.audit.findSimilar
  └── Audit: FindOrphans → cvs.audit.findOrphans
  └── Audit: MergeFiles → cvs.audit.mergeFiles
  └── Audit: MoveToGlobal → cvs.audit.moveToGlobal
  └── Audit: OpenReport → cvs.audit.openReport
  └── Audit: ActOnReport → cvs.audit.actOnReport
  └── Audit: Walkthrough → cvs.audit.walkthrough
```

**Key internal functions:**
- `ensurePanel()`
- `registerPanelMessages()`
- `runFullAudit()`
- `openPastReport()`
- `actOnReport()`
- `quickFindDuplicates()`
- `quickFindSimilar()`
- `quickFindOrphans()`
- `interactiveMerge()`
- `interactiveMoveToGlobal()`

---

## Manual test

1. Open the Command Palette and run **Audit: Docs** (`cvs.audit.docs`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
2. Open the Command Palette and run **Audit: FindDuplicates** (`cvs.audit.findDuplicates`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
3. Open the Command Palette and run **Audit: FindSimilar** (`cvs.audit.findSimilar`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
4. Open the Command Palette and run **Audit: FindOrphans** (`cvs.audit.findOrphans`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
5. Open the Command Palette and run **Audit: MergeFiles** (`cvs.audit.mergeFiles`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
6. Open the Command Palette and run **Audit: MoveToGlobal** (`cvs.audit.moveToGlobal`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
7. Open the Command Palette and run **Audit: OpenReport** (`cvs.audit.openReport`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
8. Open the Command Palette and run **Audit: ActOnReport** (`cvs.audit.actOnReport`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
9. Open the Command Palette and run **Audit: Walkthrough** (`cvs.audit.walkthrough`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
