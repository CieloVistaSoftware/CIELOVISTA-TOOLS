# Feature: Bg Health Runner

## Commands

| Command ID | Title | Keybinding |
|---|---|---|
| `cvs.health.fixBugs` | Health: Fix Bugs (Background Runner) | — |

## What it does

Runs continuous background health checks every 8 seconds (round-robin) across the extension and registered projects, writing results to `data/bg-health.json`. Checks include catalog command registration, project registry integrity, CLAUDE.md presence, duplicate command IDs, untagged code blocks, and data-dir writability. Surfaces failures in a "Fix Bugs" webview panel with per-check auto-fix buttons and GitHub issue filing.

---
| [`cvs.health.fixBugs`](command: cvs.health.fixBugs) | Health: Fix Bugs |
└── Health: FixBugs → cvs.health.fixBugs
**Key internal functions: **
1. Open the Command Palette and run **Health: FixBugs** (`cvs.health.fixBugs`).
docid: 150.1.background-health-runner
id: feature-background-health-runner
title: Feature: Bg Health Runner
project: cielovista-tools
description: Bg Health Runner — 1 command(s). Auto-generated stub: fill in What it does and Manual test.
status: active
tags: [bg, cvs.health.fixBugs, health, runner]
category: 150.1 — Components / Features
created: 2026-05-15
updated: 2026-05-15
version: 1.0.0
author: CieloVista Software
relativepath: src/features/background-health-runner.README.md
---