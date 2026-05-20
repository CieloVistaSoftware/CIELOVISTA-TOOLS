---
docid: 150.1.doc-header-scan
id: feature-doc-header-scan
title: "Feature: Doc Header Scan"
project: cielovista-tools
description: "Doc Header Scan — 1 command(s). Auto-generated stub: fill in What it does and Manual test."
status: active
tags: [doc, header, scan]
category: 150.1 — Components / Features
created: 2026-05-15
updated: 2026-05-15
version: 1.0.0
author: CieloVista Software
relativepath: src/features/doc-header-scan.README.md
---
# Feature: Doc Header Scan

## What it does

Scans all markdown files in registered projects for YAML frontmatter compliance, checking for required fields (title, description, project, category, relativePath, created, updated, author, status, tags). Logs results to the CieloVista Tools output channel grouped by project, making it easy to spot docs missing required metadata.

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.headers.scan`](command:cvs.headers.scan) | Headers: Scan |

---

## Internal architecture

```text
activate(context)
  └── registers 1 command(s)
  └── Headers: Scan → cvs.headers.scan
```

**Key internal functions:**
- `loadRegistry()`
- `parseFrontmatter()`
- `toRelativePath()`
- `scanDirectory()`
- `runScan()`

---

## Manual test

1. Open the Command Palette and run **Headers: Scan** (`cvs.headers.scan`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
