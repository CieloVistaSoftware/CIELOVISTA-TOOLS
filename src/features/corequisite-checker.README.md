---
docid: 150.1.corequisite-checker
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

Reads the `cieloRequires` block from `package.json` and verifies that each declared peer extension is installed at the required minimum version. Offers one-click install via the VS Code extension API (with a CLI fallback). A silent background check runs automatically 3 seconds after activation to catch missing dependencies early.

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.corequisites.check`](command:cvs.corequisites.check) | Corequisites: Check |
| [`cvs.corequisites.install`](command:cvs.corequisites.install) | Corequisites: Install |

---

## Internal architecture

```text
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
