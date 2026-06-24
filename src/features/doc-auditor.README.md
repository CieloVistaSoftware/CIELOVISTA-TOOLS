# feature: doc-auditor.ts — Advanced Developer Guide

## Commands

| Command ID | Title | Keybinding |
|---|---|---|
| `cvs.docs.intelligence` | Docs: Intelligence — Unified Scan & Fix | — |
| `cvs.audit.runDaily` | Audit: Run Daily Health Check | — |
| `cvs.audit.docs` | Audit: Run Full Docs Audit | — |
| `cvs.audit.walkthrough` | Audit: Walk Through Findings | — |
| `cvs.audit.findDuplicates` | Audit: Find Duplicate Doc Filenames | — |
| `cvs.audit.findSimilar` | Audit: Find Similar Content | — |
| `cvs.audit.findOrphans` | Audit: Find Orphaned Docs | — |
| `cvs.audit.actOnReport` | Audit: Act on Audit Report | — |
| `cvs.audit.openReport` | Audit: Open Past Audit Report | — |
| `cvs.audit.mergeFiles` | Audit: Merge Docs Together | — |
| `cvs.audit.moveToGlobal` | Audit: Move Doc to Global Standards | — |

## Overview
The doc-auditor is a comprehensive, interactive tool for auditing documentation health across all CieloVista projects and the global standards folder. It detects and helps resolve:
- Duplicate filenames
- Near-matching content (over 65% word overlap)
- Docs that should be moved to global standards
- Orphaned docs (unreferenced anywhere)

---
- **Collection: ** Recursively scans all projects and the global folder for `.md` files (up to 3 levels deep), skipping build and system folders.
- **Analysis: **
- Duplicates: Groups by exact filename
- Similar: Pairs with >65% content overlap (Jaccard index)
- Move Candidates: Filenames or content that indicate global relevance
- Orphans: Docs not referenced by any other doc, CLAUDE.md, or README
- **UI: ** Results are presented in a rich webview panel with actionable cards (merge, diff, move, delete, open).
- **Reports: ** All audits are written to datestamped markdown files in the workspace or global reports folder.
- **Logging: ** All actions and errors are logged through `shared/output-channel.ts`.
### 1. Full Audit ([`cvs.audit.docs`](command: cvs.audit.docs))
- Each issue is actionable: merge, diff, move, delete, or open the file directly.
### 2. Find Duplicates ([`cvs.audit.findDuplicates`](command: cvs.audit.findDuplicates))
### 3. Find Similar ([`cvs.audit.findSimilar`](command: cvs.audit.findSimilar))
### 4. Find Orphans ([`cvs.audit.findOrphans`](command: cvs.audit.findOrphans))
### 5. Merge Files ([`cvs.audit.mergeFiles`](command: cvs.audit.mergeFiles))
### 6. Move to Global ([`cvs.audit.moveToGlobal`](command: cvs.audit.moveToGlobal))
- **DocFile: ** `{ filePath, fileName, projectName, sizeBytes, content, normalized }`
- **AuditResults: ** `{ duplicates, similar, moveCandidates, orphans, totalDocsScanned, projectsScanned }`
- **Pre-Release Audit: ** Run a full audit before a major release to ensure no duplicate, orphaned, or misplaced docs remain.
- **Standards Enforcement: ** Quickly find and move project-local standards to the global folder.
- **Cleanup: ** Identify and delete orphaned docs after a migration or refactor.
└── registers 9 commands: docs, findDuplicates, findSimilar,
└── onDidReceiveMessage: open | merge | moveToGlobal | delete | diff
└── saveAuditReport() → datestamped .md with AUDIT-ACTION: tags
└── forEach finding: showQuickPick(actionsFor(kind))
1. Run [`cvs.audit.docs`](command: cvs.audit.docs) — audit panel should open with four sections (Duplicates, Similar, Move Candidates, Orphans). Click a stat box to filter to that section only.
3. Run [`cvs.audit.findOrphans`](command: cvs.audit.findOrphans) — any unreferenced `.md` files should appear. Select one; it opens in the editor for review.
4. After running a full audit, run [`cvs.audit.actOnReport`](command: cvs.audit.actOnReport) — pick the saved report and select an action to execute from it.
_TODO: one paragraph describing the single responsibility of this file._
docid: 150.1.doc-auditor-readme
id: feature-doc-auditorts-advanced-developer-guide
title: feature: doc-auditor.ts — Advanced Developer Guide
project: cielovista-tools
description: The doc-auditor is a comprehensive, interactive tool for auditing documentation health across all CieloVista projects and the global standards fold…
status: active
tags: [auditor, cvs.audit.actOnReport, cvs.audit.docs, cvs.audit.findDuplicates, cvs.audit.findOrphans, cvs.audit.findSimilar, cvs.audit.mergeFiles, cvs.audit.moveToGlobal, doc, readme]
category: 150.1 — Components / Features
created: 2026-04-22
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
relativepath: src/features/doc-auditor.README.md
---