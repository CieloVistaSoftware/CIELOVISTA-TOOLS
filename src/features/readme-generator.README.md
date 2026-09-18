---
id: feature-readme-generator
title: "Feature: Readme Generator"
description: "Readme Generator — 3 command(s). Auto-generated stub: fill in What it does and Manual test."
---

# Feature: Readme Generator

## What it does

Scans every registered project for a missing `README.md` and uses the AI to
write one from the project's `CLAUDE.md`, `package.json` and folder layout.
Every generated README is shown in a review panel as a new file, and nothing
is written until you approve it (#798). The generator never overwrites a
README: a project whose README appeared after the scan is skipped and reported,
and an approved file is created only if it still does not exist.

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
