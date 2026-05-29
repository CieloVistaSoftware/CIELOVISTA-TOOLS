# feature: doc-consolidator.ts — Advanced Developer Guide

## Commands

| Command ID | Title | Keybinding |
|---|---|---|
| `cvs.consolidate.run` | Consolidate: Run Full Consolidation Wizard | — |
| `cvs.consolidate.byName` | Consolidate: By Filename (same name) | — |
| `cvs.consolidate.byContent` | Consolidate: By Content (similar docs) | — |
| `cvs.consolidate.log` | Consolidate: Open Consolidation Log | — |

## Overview
The doc-consolidator is a robust, interactive tool for eliminating duplicate documentation across all CieloVista projects and the global standards folder. It ensures every doc exists in only one place, with all references updated and a full audit trail.

---
- **Discovery: ** Scans all projects and the global folder for `.md` files (up to 3 levels deep), skipping build and system folders.
- **Grouping: ** Duplicates are grouped by exact filename and by content similarity (>70% word overlap, Jaccard index).
- **User Flow: ** Each group is presented in a QuickPick UI for review and action. For content matches, a diff is shown before consolidation.
- **Actions: ** The user picks the authoritative copy (the "keeper") and its home (global or project). All other copies are deleted, and all references in CLAUDE.md files are updated.
- **Logging: ** Every action is logged in an append-only `consolidation-log.md` for full traceability.
- **Safety: ** All destructive actions require explicit, modal confirmation. No silent deletes or moves.
### 1. Full Consolidation Wizard ([`cvs.consolidate.run`](command: cvs.consolidate.run))
- For each selected group: [User picks the keeper and its destination (global or project)., Plan is shown (keep, delete, update refs) and must be confirmed., Keeper is copied if needed, others are deleted, all CLAUDE.md references are updated, and the action is logged., At the end, a summary is shown and the log can be opened directly.]
### 2. By Filename Only ([`cvs.consolidate.byName`](command: cvs.consolidate.byName))
### 3. By Content Only ([`cvs.consolidate.byContent`](command: cvs.consolidate.byContent))
### 4. Open Log ([`cvs.consolidate.log`](command: cvs.consolidate.log))
- **ScannedDoc: ** `{ filePath, fileName, projectName, projectPath, sizeBytes, content, normalized }`
- **ConsolidationGroup: ** `{ reason, label, similarity, files }`
- **Standards Migration: ** Move all shared standards to the global folder, update every project in one pass.
- **Cleanup: ** After a bulk import, run the wizard to ensure no duplicate or near-duplicate docs remain.
- **Audit Trail: ** Every action is logged with timestamp, reason, and affected files for compliance.
└── registers 4 commands: run, byName, byContent, log
discoverGroups(filter: all' | 'name' | 'content')
└── showQuickPick(groups, canPickMany: true)
forEach non-keeper: unlinkSync()
└── forEach project CLAUDE.md: replace(oldPath, newPath) both slash styles
1. Create two files with identical names in different projects (e.g. `TEST-DOC.md`). Run [`cvs.consolidate.byName`](command: cvs.consolidate.byName) — the group should appear. Select it, pick a keeper, confirm — one copy should survive, the other should be deleted.
2. Run [`cvs.consolidate.byContent`](command: cvs.consolidate.byContent) — any docs with >70% overlapping content across different filenames should appear with a similarity percentage. Click Diff to verify before merging.
3. Run [`cvs.consolidate.log`](command: cvs.consolidate.log) — the consolidation log should open showing the action just taken with timestamp and file paths.
_TODO: one paragraph describing the single responsibility of this file._
docid: 150.1.doc-consolidator-readme
id: feature-doc-consolidatorts-advanced-developer-guid
title: feature: doc-consolidator.ts — Advanced Developer Guide
project: cielovista-tools
description: The doc-consolidator is a robust, interactive tool for eliminating duplicate documentation across all CieloVista projects and the global standards …
status: active
tags: [consolidator, cvs.consolidate.byContent, cvs.consolidate.byName, cvs.consolidate.log, cvs.consolidate.run, doc, readme]
category: 150.1 — Components / Features
created: 2026-04-22
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
relativepath: src/features/doc-consolidator.README.md
---