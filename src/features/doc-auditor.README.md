---
title: feature: doc-auditor.ts — Advanced Developer Guide
description: The doc-auditor is a comprehensive, interactive tool for auditing documentation health across all CieloVista projects and the global standards fold…
project: cielovista-tools
category: 700 — Project Docs
relativePath: src/features/doc-auditor.README.md
created: 2026-04-22
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
status: active
tags: [doc, auditor, readme]
---

# feature: doc-auditor.ts — Advanced Developer Guide

## Overview
The doc-auditor is a comprehensive, interactive tool for auditing documentation health across all CieloVista projects and the global standards folder. It detects and helps resolve:
- Duplicate filenames
- Near-matching content (over 65% word overlap)
- Docs that should be moved to global standards
- Orphaned docs (unreferenced anywhere)

---

## Architecture & Data Flow
- **Collection:** Recursively scans all projects and the global folder for `.md` files (up to 3 levels deep), skipping build and system folders.
- **Analysis:**
	- Duplicates: Groups by exact filename
	- Similar: Pairs with >65% content overlap (Jaccard index)
	- Move Candidates: Filenames or content that indicate global relevance
	- Orphans: Docs not referenced by any other doc, CLAUDE.md, or README
- **UI:** Results are presented in a rich webview panel with actionable cards (merge, diff, move, delete, open).
- **Reports:** All audits are written to datestamped markdown files in the workspace or global reports folder.
- **Logging:** All actions and errors are logged through `shared/output-channel.ts`.

---

## Command Flows & UX

### 1. Full Audit ([`cvs.audit.docs`](command:cvs.audit.docs))
- Scans all docs, analyzes for all four problem types, and presents a summary dashboard in a webview.
- Each issue is actionable: merge, diff, move, delete, or open the file directly.
- All actions require explicit user confirmation.

### 2. Find Duplicates ([`cvs.audit.findDuplicates`](command:cvs.audit.findDuplicates))
- Scans for duplicate filenames only and presents results in the webview.

### 3. Find Similar ([`cvs.audit.findSimilar`](command:cvs.audit.findSimilar))
- Scans for near-matching content pairs and presents results in the webview.

### 4. Find Orphans ([`cvs.audit.findOrphans`](command:cvs.audit.findOrphans))
- Scans for unreferenced docs and presents results in the webview.

### 5. Merge Files ([`cvs.audit.mergeFiles`](command:cvs.audit.mergeFiles))
- Interactively merges two docs into one, with a diff and manual resolution.

### 6. Move to Global ([`cvs.audit.moveToGlobal`](command:cvs.audit.moveToGlobal))
- Moves a project doc to the global standards folder, updating references.

---

## Data Structures
- **DocFile:** `{ filePath, fileName, projectName, sizeBytes, content, normalized }`
- **AuditResults:** `{ duplicates, similar, moveCandidates, orphans, totalDocsScanned, projectsScanned }`

---

## Error Handling & Logging
- All file operations are wrapped in try/catch; errors are logged and surfaced to the user.
- All destructive actions require explicit user confirmation.
- Reports are datestamped and never overwrite existing files.

---

## Extending & Debugging
- To add new audit checks, extend the analysis section in `runAudit`.
- To support new move/diff/merge actions, update the webview and command handlers.
- All logic is pure and testable; UI is decoupled from file operations.
- Use the OutputChannel for all debugging — never use `console.log`.

---

## Real-World Scenarios
- **Pre-Release Audit:** Run a full audit before a major release to ensure no duplicate, orphaned, or misplaced docs remain.
- **Standards Enforcement:** Quickly find and move project-local standards to the global folder.
- **Cleanup:** Identify and delete orphaned docs after a migration or refactor.

---

## Troubleshooting
- If a file fails to open, move, or delete, check permissions and log output.
- If orphans are not detected, verify that all references are in markdown link format.
- All errors are logged with context in the OutputChannel and in audit reports.

---

## Internal architecture

```
activate()
  └── registers 9 commands: docs, findDuplicates, findSimilar,
      findOrphans, mergeFiles, moveToGlobal, openReport,
      actOnReport, walkthrough

runAudit()  [core — called by all scan commands]
  └── withProgress → collectDocs(global) + collectDocs(each project)
  └── Analysis pass (single loop):
       duplicates      → group by fileName.toLowerCase()
       similar         → Jaccard index on normalized word sets (>65%)
       moveCandidates  → filename/content regex vs GLOBAL_PATTERNS
       orphans         → check every doc against allDocs[].content refs
  └── returns AuditResults

runFullAudit()
  └── runAudit() → buildAuditHtml(results) → createWebviewPanel
  └── onDidReceiveMessage: open | merge | moveToGlobal | delete | diff
  └── saveAuditReport() → datestamped .md with AUDIT-ACTION: tags
  └── offer walkthrough via showInformationMessage

walkThroughFindings(results)
  └── buildFindingsList() → Finding[]  (flatten all 4 categories)
  └── forEach finding: showQuickPick(actionsFor(kind))
       └── merge | diff | move | open | delete | skip | stop

actOnReport()
  └── pick report file → parseReportActions() → AUDIT-ACTION tags
  └── showQuickPick(actions) → execute chosen action
```

---

## Manual test

1. Run [`cvs.audit.docs`](command:cvs.audit.docs) — audit panel should open with four sections (Duplicates, Similar, Move Candidates, Orphans). Click a stat box to filter to that section only.
2. In the Duplicates section, click the tab for each copy to read it, then click `⬛ Diff` to compare two copies side-by-side in VS Code's native diff viewer.
3. Run [`cvs.audit.findOrphans`](command:cvs.audit.findOrphans) — any unreferenced `.md` files should appear. Select one; it opens in the editor for review.
4. After running a full audit, run [`cvs.audit.actOnReport`](command:cvs.audit.actOnReport) — pick the saved report and select an action to execute from it.
