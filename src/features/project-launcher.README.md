# Feature: Project Launcher

## What it does

<!-- TODO: describe what this feature does in 2–4 sentences -->
_Auto-generated stub. Replace this with a human description of the feature._

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.launch.pick`](command:cvs.launch.pick) | Launch: Pick |

---

## Internal architecture

```text
activate(context)
  └── registers 1 command(s)
  └── Launch: Pick → cvs.launch.pick
```

**Key internal functions:**
- `loadRegistry()`
- `discoverActions()`
- `runInTerminal()`
- `pickAndLaunch()`
- `registerFixed()`

---

## Manual test

1. Open the Command Palette and run **Launch: Pick** (`cvs.launch.pick`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.

---
docid: 150.1.project-launcher
id: feature-project-launcher
title: "Feature: Project Launcher"
project: cielovista-tools
description: "Project Launcher — 1 command(s). Auto-generated stub: fill in What it does and Manual test."
status: active
tags: [project, launcher]
category: 150.1 — Components / Features
created: 2026-05-15
updated: 2026-05-15
version: 1.0.0
author: CieloVista Software
relativepath: src/features/project-launcher.README.md
---
