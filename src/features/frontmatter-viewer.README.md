---
docid: auto.frontmatter-viewer
id: feature-frontmatter-viewer
title: "Feature: Frontmatter Viewer"
project: cielovista-tools
description: "Frontmatter Viewer — 1 command(s). Auto-generated stub: fill in What it does and Manual test."
status: active
tags: [frontmatter, viewer]
category: 150.1 — Components / Features
created: 2026-05-15
updated: 2026-05-15
version: 1.0.0
author: CieloVista Software
relativepath: src/features/frontmatter-viewer.README.md
---
# Feature: Frontmatter Viewer

## What it does

<!-- TODO: describe what this feature does in 2–4 sentences -->
_Auto-generated stub. Replace this with a human description of the feature._

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.headers.frontmatterViewer`](command:cvs.headers.frontmatterViewer) | Headers: FrontmatterViewer |

---

## Internal architecture

```
activate(context)
  └── registers 1 command(s)
  └── Headers: FrontmatterViewer → cvs.headers.frontmatterViewer
```

**Key internal functions:**
- `normalizeRelPath()`
- `loadRepairSnapshot()`
- `loadFiledIssues()`
- `saveFiledIssues()`
- `walkMd()`
- `parseFm()`
- `scanProject()`
- `violations()`
- `esc()`
- `toIssueLabel()`
- `proposedFixes()`
- `toTestSlug()`
- `buildFailureTestContent()`
- `createFailingFixTest()`
- `buildFrontmatterFixIssueBody()`
- `buildViewerHtml()`
- `updateHdrHeight()`
- `applyFilter()`
- `updateFixAllState()`
- `openFrontmatterViewer()`

---

## Manual test

1. Open the Command Palette and run **Headers: FrontmatterViewer** (`cvs.headers.frontmatterViewer`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
