---
id: feature-frontmatter-viewer
title: "Feature: Frontmatter Viewer"
description: "Interactive table of every doc header in the project, judged by the three-field contract, with a Fix workflow per file."
---

# Feature: Frontmatter Viewer

## What it does

Scans the markdown files in the cielovista-tools project and shows every doc header in a sortable, filterable table. Each file is judged by the doc header contract: **id, title and description, at the top, and nothing else** (#707, #708). Violations include no header, a header at the bottom, a missing field, fields beyond the contract, and duplicate file names. Each flagged row has a Fix button that writes a failing regression test for that file and files a GitHub issue to track the repair. The generated test passes once the file's header meets the contract.

Before #730 the viewer enforced the retired rules. It flagged a header at the top, demanded a numbered doc id, and generated tests that required the header at the bottom.

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.headers.frontmatterViewer`](command:cvs.headers.frontmatterViewer) | Headers: FrontmatterViewer |

---

## Internal architecture

```text
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
