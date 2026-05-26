---
docid: 150.1.command-registry-viewer
id: feature-command-registry-viewer
title: "Feature: Command Registry Viewer"
project: cielovista-tools
description: "Command Registry Viewer — 3 command(s). Auto-generated stub: fill in What it does and Manual test."
status: active
tags: [command, registry, viewer]
category: 150.1 — Components / Features
created: 2026-05-25
updated: 2026-05-25
version: 1.0.0
author: CieloVista Software
relativepath: src/features/command-registry-viewer.README.md
---
# Feature: Command Registry Viewer

## What it does

<!-- TODO: describe what this feature does in 2–4 sentences -->
_Auto-generated stub. Replace this with a human description of the feature._

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.registry.showCommands`](command:cvs.registry.showCommands) | Registry: ShowCommands |
| [`cvs.registry.showComponents`](command:cvs.registry.showComponents) | Registry: ShowComponents |
| [`cvs.registry.rebuild`](command:cvs.registry.rebuild) | Registry: Rebuild |

---

## Internal architecture

```
activate(context)
  └── registers 3 command(s)
  └── Registry: ShowCommands → cvs.registry.showCommands
  └── Registry: ShowComponents → cvs.registry.showComponents
  └── Registry: Rebuild → cvs.registry.rebuild
```

**Key internal functions:**
- `showRegistry()`
- `refreshPanel()`
- `showComponents()`
- `refreshCompPanel()`
- `rebuildRegistry()`
- `rebuildAndRefresh()`
- `workspaceRoot()`
- `loadRegistry()`
- `esc()`
- `buildHtml()`
- `buildComponentHtml()`
- `wrapCompHtml()`
- `wrapHtml()`

---

## Manual test

1. Open the Command Palette and run **Registry: ShowCommands** (`cvs.registry.showCommands`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
2. Open the Command Palette and run **Registry: ShowComponents** (`cvs.registry.showComponents`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
3. Open the Command Palette and run **Registry: Rebuild** (`cvs.registry.rebuild`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
