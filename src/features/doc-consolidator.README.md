# feature: doc-consolidator.ts — Advanced Developer Guide

## Overview
The doc-consolidator is a robust, interactive tool for eliminating duplicate documentation across all CieloVista projects and the global standards folder. It ensures every doc exists in only one place, with all references updated and a full audit trail.

---

## Architecture & Data Flow
- **Discovery:** Scans all projects and the global folder for `.md` files (up to 3 levels deep), skipping build and system folders.
- **Grouping:** Duplicates are grouped by exact filename and by content similarity (>70% word overlap, Jaccard index).
- **User Flow:** Each group is presented in a QuickPick UI for review and action. For content matches, a diff is shown before consolidation.
- **Actions:** The user picks the authoritative copy (the "keeper") and its home (global or project). All other copies are deleted, and all references in CLAUDE.md files are updated.
- **Logging:** Every action is logged in an append-only `consolidation-log.md` for full traceability.
- **Safety:** All destructive actions require explicit, modal confirmation. No silent deletes or moves.

---

## Command Flows & UX

### 1. Full Consolidation Wizard ([`cvs.consolidate.run`](command:cvs.consolidate.run))
- Scans all docs, groups duplicates (by name and content), and presents all groups in a QuickPick (multi-select).
- For each selected group:
	- User picks the keeper and its destination (global or project).
	- Plan is shown (keep, delete, update refs) and must be confirmed.
	- Keeper is copied if needed, others are deleted, all CLAUDE.md references are updated, and the action is logged.
- At the end, a summary is shown and the log can be opened directly.

### 2. By Filename Only ([`cvs.consolidate.byName`](command:cvs.consolidate.byName))
- Same as above, but only groups with exact filename matches are shown.

### 3. By Content Only ([`cvs.consolidate.byContent`](command:cvs.consolidate.byContent))
- Only groups with >70% content similarity (different filenames) are shown.
- For each, a diff is shown before consolidation is allowed.

### 4. Open Log ([`cvs.consolidate.log`](command:cvs.consolidate.log))
- Opens the append-only consolidation log for review.

---

## Data Structures
- **ScannedDoc:** `{ filePath, fileName, projectName, projectPath, sizeBytes, content, normalized }`
- **ConsolidationGroup:** `{ reason, label, similarity, files }`

---

## Error Handling & Logging
- All file operations are wrapped in try/catch; errors are logged and surfaced to the user.
- All destructive actions require explicit, modal user confirmation.
- The log is append-only and never overwritten.
- All reference updates are robust to both forward and backslash path variants.

---

## Extending & Debugging
- To add new grouping logic, extend `discoverGroups`.
- To support new reference types, update `updateReferences`.
- All logic is pure and testable; UI is decoupled from file operations.
- Use the OutputChannel for all debugging — never use `console.log`.

---

## Real-World Scenarios
- **Standards Migration:** Move all shared standards to the global folder, update every project in one pass.
- **Cleanup:** After a bulk import, run the wizard to ensure no duplicate or near-duplicate docs remain.
- **Audit Trail:** Every action is logged with timestamp, reason, and affected files for compliance.

---

## Troubleshooting
- If a file fails to delete or copy, check permissions and log output.
- If references are not updated, verify path formats and CLAUDE.md content.
- All errors are logged with context in the OutputChannel and the consolidation log.

---

## Internal architecture

```
activate()
  └── registers 4 commands: run, byName, byContent, log

discoverGroups(filter: 'all' | 'name' | 'content')
  └── collectDocs(global) + collectDocs(each project)
  └── group by fileName.toLowerCase()         → name duplicates
  └── Jaccard index on word sets (>70%)        → content duplicates
  └── returns ConsolidationGroup[]

runConsolidationWizard(filter)
  └── withProgress → discoverGroups(filter)
  └── showQuickPick(groups, canPickMany:true)
  └── forEach selected group:
       showQuickPick(keeper)        → which file to keep
       showQuickPick(destination)   → global or project folder
       show consolidation plan      → modal confirm
       copyFileSync(keeper → dest)
       forEach non-keeper: unlinkSync()
       updateReferences()           → rewrite CLAUDE.md path refs
       appendLog()                  → consolidation-log.md

updateReferences(oldPath, newPath)
  └── forEach project CLAUDE.md: replace(oldPath, newPath) both slash styles
```

---

## Manual test

1. Create two files with identical names in different projects (e.g. `TEST-DOC.md`). Run [`cvs.consolidate.byName`](command:cvs.consolidate.byName) — the group should appear. Select it, pick a keeper, confirm — one copy should survive, the other should be deleted.
2. Run [`cvs.consolidate.byContent`](command:cvs.consolidate.byContent) — any docs with >70% overlapping content across different filenames should appear with a similarity percentage. Click Diff to verify before merging.
3. Run [`cvs.consolidate.log`](command:cvs.consolidate.log) — the consolidation log should open showing the action just taken with timestamp and file paths.
