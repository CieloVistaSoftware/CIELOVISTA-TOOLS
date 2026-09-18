---
id: feature-npm-scripts-tree
title: "Feature: Npm Scripts Tree"
description: "Npm Scripts Tree — 0 command(s). Auto-generated stub: fill in What it does and Manual test."
---

# Feature: Npm Scripts Tree

## What it does

<!-- TODO: describe what this feature does in 2–4 sentences -->
_Auto-generated stub. Replace this with a human description of the feature._

---

## Commands

| Command ID | Title | Keybinding |
|---|---|---|
| `cvs.npm.tree` | NPM Scripts: Tree View | — |

---

## Internal architecture

```text
activate(context)
  └── registers 0 command(s)

```

**Key internal functions:**
- `collectEntries()`
- `buildHtml()`
- `openPanel()`

---

## Manual test

1. Open a workspace with the CieloVista Tools extension active.
2. Verify Npm Scripts Tree activates without errors in the Output channel.
