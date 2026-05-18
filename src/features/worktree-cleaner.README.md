---
docid: 150.1.worktree-cleaner
id: feature-worktree-cleaner
title: "Feature: Worktree Cleaner"
project: cielovista-tools
description: "Worktree Cleaner — 1 command(s). Auto-generated stub: fill in What it does and Manual test."
status: active
tags: [worktree, cleaner]
category: 150.1 — Components / Features
created: 2026-05-15
updated: 2026-05-15
version: 1.0.0
author: CieloVista Software
relativepath: src/features/worktree-cleaner.README.md
---
# Feature: Worktree Cleaner

## What it does

<!-- TODO: describe what this feature does in 2–4 sentences -->
_Auto-generated stub. Replace this with a human description of the feature._

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.tools.cleanWorktrees`](command:cvs.tools.cleanWorktrees) | Tools: CleanWorktrees |

---

## Internal architecture

```text
activate(context)
  └── registers 1 command(s)
  └── Tools: CleanWorktrees → cvs.tools.cleanWorktrees
```

**Key internal functions:**
- `run()`
- `listClaudeWorktrees()`
- `cleanWorktrees()`

---

## Manual test

1. Open the Command Palette and run **Tools: CleanWorktrees** (`cvs.tools.cleanWorktrees`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
