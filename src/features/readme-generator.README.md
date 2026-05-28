# Feature: Readme Generator

## What it does

<!-- TODO: describe what this feature does in 2–4 sentences -->
_Auto-generated stub. Replace this with a human description of the feature._

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.readme.generate.scan`](command:cvs.readme.generate.scan) | Readme: Generate: Scan |
| [`cvs.readme.generate.run`](command:cvs.readme.generate.run) | Readme: Generate: Run |
| [`cvs.readme.generate.single`](command:cvs.readme.generate.single) | Readme: Generate: Single |

---

## Internal architecture

```text
activate(context)
  └── registers 3 command(s)
  └── Readme: Generate: Scan → cvs.readme.generate.scan
  └── Readme: Generate: Run → cvs.readme.generate.run
  └── Readme: Generate: Single → cvs.readme.generate.single
```

**Key internal functions:**
- `gatherContext()`
- `generateReadme()`
- `findMissingReadmes()`
- `buildScanReportHtml()`
- `setStatus()`
- `runScan()`
- `postProgress()`
- `postDone()`
- `postError()`
- `generateAllMissing()`
- `generateSingleByName()`
- `generateSingleInteractive()`

---

## Manual test

1. Open the Command Palette and run **Readme: Generate: Scan** (`cvs.readme.generate.scan`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
2. Open the Command Palette and run **Readme: Generate: Run** (`cvs.readme.generate.run`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
3. Open the Command Palette and run **Readme: Generate: Single** (`cvs.readme.generate.single`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.

---
docid: 150.1.readme-generator
id: feature-readme-generator
title: "Feature: Readme Generator"
project: cielovista-tools
description: "Readme Generator — 3 command(s). Auto-generated stub: fill in What it does and Manual test."
status: active
tags: [readme, generator]
category: 150.1 — Components / Features
created: 2026-05-15
updated: 2026-05-15
version: 1.0.0
author: CieloVista Software
relativepath: src/features/readme-generator.README.md
---
