---
docid: 150.1.mcp-viewer-dir
id: feature-mcp-viewer
title: "Feature: Mcp Viewer"
project: cielovista-tools
description: "Mcp Viewer — 1 command(s). Auto-generated stub: fill in What it does and Manual test."
status: active
tags: [mcp, viewer]
category: 150.1 — Components / Features
created: 2026-05-15
updated: 2026-05-15
version: 1.0.0
author: CieloVista Software
relativepath: src/features/mcp-viewer/README.md
---
# Feature: Mcp Viewer

## What it does

<!-- TODO: describe what this feature does in 2–4 sentences -->
_Auto-generated stub. Replace this with a human description of the feature._

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.mcp.viewer.open`](command:cvs.mcp.viewer.open) | Mcp: Viewer: Open |

---

## Internal architecture

```text
activate(context)
  └── registers 1 command(s)
  └── Mcp: Viewer: Open → cvs.mcp.viewer.open
```

**Key internal functions:**
- `cardToDocJson()`
- `coerceStatus()`
- `handleListProjects()`
- `handleFindProject()`
- `handleSearchDocs()`
- `handleGetCatalog()`
- `parseFrontmatter()`
- `handleListDocViolations()`
- `handleValidateDoc()`
- `normalizeDewey()`
- `scoreDewey()`
- `handleLookupDewey()`
- `handleListSymbols()`
- `handleFindSymbol()`
- `handleListCvtCommands()`
- `handleNormalizeDoc()`
- `handleGetDocByIdentity()`
- `handleListOldDewey()`
- `handleGetActiveMarkdown()`
- `handleListMarkdownPaths()`
- `jsonResponse()`
- `htmlResponse()`
- `escHtml()`
- `buildMarkdownPreviewHtml()`
- `handleRequest()`
- `readRequestBody()`
- `openViewer()`

---

## Manual test

1. Open the Command Palette and run **Mcp: Viewer: Open** (`cvs.mcp.viewer.open`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
