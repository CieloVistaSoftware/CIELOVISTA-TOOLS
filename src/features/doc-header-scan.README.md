---
id: feature-doc-header-scan
title: "Feature: Doc Header Scan"
description: "Checks every doc header in the registered projects against the three-field contract, and can rewrite the non-compliant ones."
---

# Feature: Doc Header Scan

## What it does

Scans the markdown files of every registered project against the doc header contract: **id, title and description, at the top of the file, and nothing else** (#707, #708). The report goes to the CieloVista Tools output channel, grouped by project.

**Headers: Scan + Auto-Fix** also rewrites every header that breaks the contract (a block at the bottom, a missing field, retired fields like docid or category), then re-reads each file to confirm it. A doc with no header at all is only reported. Adding headers everywhere is **Headers: Add/Fix All Headers**, which asks first.

Before #730 this scan did the opposite: it treated a header at the top as wrong and moved every header in every project to the bottom. Reading, judging and rewriting now go through `src/shared/doc-frontmatter.ts`.

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.headers.scan`](command:cvs.headers.scan) | Headers: Scan Doc Header Compliance |
| [`cvs.headers.scanAuto`](command:cvs.headers.scanAuto) | Headers: Scan + Auto-Fix Doc Headers |

---

## Internal architecture

```text
activate(context)
  └── registers 1 command(s)
  └── Headers: Scan → cvs.headers.scan
```

**Key internal functions:**
- `loadRegistry()`
- `fixToContract()`
- `toRelativePath()`
- `scanDirectory()`
- `runScan()`

---

## Manual test

1. Open the Command Palette and run **Headers: Scan** (`cvs.headers.scan`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
