---
docid: auto.corequisite-checker
id: feature-corequisite-checker
title: "Feature: Corequisite Checker"
project: cielovista-tools
description: "Corequisite Checker — 2 command(s). Auto-generated stub: fill in What it does and Manual test."
status: active
tags: [corequisite, checker]
category: 150.1 — Components / Features
created: 2026-05-15
updated: 2026-05-15
version: 1.0.0
author: CieloVista Software
relativepath: src/features/corequisite-checker.README.md
---
# Feature: Corequisite Checker

## What it does

<!-- TODO: describe what this feature does in 2–4 sentences -->
_Auto-generated stub. Replace this with a human description of the feature._

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.corequisites.check`](command:cvs.corequisites.check) | Corequisites: Check |
| [`cvs.corequisites.install`](command:cvs.corequisites.install) | Corequisites: Install |

---

## Internal architecture

```
activate(context)
  └── registers 2 command(s)
  └── Corequisites: Check → cvs.corequisites.check
  └── Corequisites: Install → cvs.corequisites.install
```

**Key internal functions:**
- `compareVersions()`
- `readCieloRequires()`
- `checkOne()`
- `findCodeInsidersBin()`
- `installViaCli()`
- `offerInstall()`
- `runInstall()`
- `runCheck()`

---

## Manual test

1. Open the Command Palette and run **Corequisites: Check** (`cvs.corequisites.check`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
2. Open the Command Palette and run **Corequisites: Install** (`cvs.corequisites.install`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
