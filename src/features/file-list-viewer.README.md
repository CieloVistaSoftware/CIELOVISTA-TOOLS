# feature: FileList — Sortable Alternative File Browser

Issue [#68](https://github.com/CieloVistaSoftware/CIELOVISTA-TOOLS/issues/68).

A details-view file browser surfaced as a Quick Launch button on the CieloVista Home page. Solves three things the Explorer tree handles poorly:

- **Find the most recently modified file** — sort by Date modified
- **Identify the largest files** — sort by Size
- **Filter by extension at a glance** — sort by Type

## Usage

Open the Home page (`cvs.tools.home`) and click **FileList**, or run **CieloVista: Tools: FileList** from the command palette (`cvs.tools.fileList`).

The webview opens at the current workspace root. Click any column header to sort — click again to flip direction. The sort indicator (▲ / ▼) shows the active column and direction.

Click a file row to open it in the editor beside the FileList tab. Click a folder row to navigate into it. The **↑ Up** button climbs to the parent (disabled at the workspace root).

When FileList is showing a directory under `tests/`, right-click any `.js` test file to open **▶ Run Test**. That runs the file with `node`, streams output to the shared OutputChannel, and reports pass/fail with a toast.

Two header toggles:

- **.hidden** — show / hide dotfiles (default: shown, de-emphasized)
- **excludes** — show / hide normally-excluded folders: `node_modules`, `.git`, `out`, `dist`, `.vscode-test` (default: hidden)

## Doc Catalog integration

When the FileList panel is open, clicking **View** on any Doc Catalog card automatically highlights the corresponding row — even if the document belongs to a different project outside the current workspace.

| Document location | VS Code Explorer | FileList panel |
|---|---|---|
| Inside CVT workspace | ✅ Highlighted | ✅ Highlighted |
| Outside workspace (e.g. DiskCleanUp, wb-core) | ❌ Will not show | ✅ Navigates + highlights |

If the document is in a different directory than the one currently shown, the FileList panel navigates to that directory first, then selects the row. This makes the FileList the primary cross-project locator when working with the Doc Catalog across multiple registered projects.

## Sort behavior

Folders always sort above files within the active column / direction (Windows Explorer convention). Tie-breaks within the same primary value use ascending name order so the table is stable across repeated sorts.

Comparators live in `src/shared/file-list-sort.ts` and are unit-tested in `tests/unit/file-list-sort.test.js` (18 assertions).

## Feature toggle

Disable via setting `cielovistaTools.features.fileListViewer = false` and reload the window.

## Phase 2 (separate issues, future work)

Multi-root workspace support, filter / search input, custom column visibility, persist last directory + sort across sessions.

---

## What it does

_TODO: one paragraph describing the single responsibility of this file._

---

## Internal architecture

```text
activate()
  └── TODO: describe call flow
```

---

## Manual test

1. TODO: step one
2. TODO: step two
3. TODO: expected result

---
docid: 150.1.file-list-viewer-readme
id: filelist-sortable-alternative-file-browser
title: FileList — Sortable Alternative File Browser
project: cielovista-tools
description: Issue [#68](https://github.com/CieloVistaSoftware/CIELOVISTA-TOOLS/issues/68). A details-view file browser surfaced as a Quick Launch button on the…
status: active
tags: [file, list, viewer]
category: 150.1 — Components / Features
created: 2026-04-27
updated: 2026-05-13
version: 1.0.0
author: CieloVista Software
relativepath: src/features/file-list-viewer.README.md
---
