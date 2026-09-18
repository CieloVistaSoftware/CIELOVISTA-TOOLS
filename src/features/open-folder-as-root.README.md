---
id: feature-open-folder-as-root
title: "Feature: Open Folder As Root"
description: "Open Folder As Root — 1 command(s). Auto-generated stub: fill in What it does and Manual test."
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

```text
activate(context)
  └── registers 1 command(s)
  └── Explorer: OpenFolderAsRoot → cvs.explorer.openFolderAsRoot
```

---

## Manual test

1. Open the Command Palette and run **Explorer: OpenFolderAsRoot** (`cvs.explorer.openFolderAsRoot`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
