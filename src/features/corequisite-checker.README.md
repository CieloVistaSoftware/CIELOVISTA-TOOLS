# Feature: Corequisite Checker

## Commands

| Command ID | Title | Keybinding |
|---|---|---|
| `cvs.corequisites.check` | Check Corequisite Extensions | — |
| `cvs.corequisites.install` | Install Missing Corequisite Extensions | — |

## What it does

Reads the `cieloRequires` block from `package.json` and verifies that each declared peer extension is installed at the required minimum version. Offers one-click install via the VS Code extension API (with a CLI fallback). A silent background check runs automatically 3 seconds after activation to catch missing dependencies early.

---
| [`cvs.corequisites.check`](command: cvs.corequisites.check) | Corequisites: Check |
| [`cvs.corequisites.install`](command: cvs.corequisites.install) | Corequisites: Install |
└── Corequisites: Install → cvs.corequisites.install
**Key internal functions: **
1. Open the Command Palette and run **Corequisites: Check** (`cvs.corequisites.check`).
2. Open the Command Palette and run **Corequisites: Install** (`cvs.corequisites.install`).
docid: 150.1.corequisite-checker
id: feature-corequisite-checker
title: Feature: Corequisite Checker
project: cielovista-tools
description: Corequisite Checker — 2 command(s). Auto-generated stub: fill in What it does and Manual test.
status: active
tags: [checker, corequisite, cvs.corequisites.check, cvs.corequisites.install]
category: 150.1 — Components / Features
created: 2026-05-15
updated: 2026-05-15
version: 1.0.0
author: CieloVista Software
relativepath: src/features/corequisite-checker.README.md
---