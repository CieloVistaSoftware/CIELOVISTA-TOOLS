---
docid: 150.1.open-folder-as-root
id: feature-open-folder-as-root
title: "Feature: Open Folder As Root"
project: cielovista-tools
description: "Open Folder As Root — 1 command(s). Auto-generated stub: fill in What it does and Manual test."
status: active
tags: [open, folder, as]
category: 150.1 — Components / Features
created: 2026-05-15
updated: 2026-05-15
version: 1.0.0
author: CieloVista Software
relativepath: src/features/open-folder-as-root.README.md
---
# Feature: Open Folder As Root

## What it does

<!-- TODO: describe what this feature does in 2–4 sentences -->
_Auto-generated stub. Replace this with a human description of the feature._

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.explorer.openFolderAsRoot`](command:cvs.explorer.openFolderAsRoot) | Explorer: OpenFolderAsRoot |

---

## Internal architecture

```
activate(context)
  └── registers 1 command(s)
  └── Explorer: OpenFolderAsRoot → cvs.explorer.openFolderAsRoot
```

---

## Manual test

1. Open the Command Palette and run **Explorer: OpenFolderAsRoot** (`cvs.explorer.openFolderAsRoot`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
