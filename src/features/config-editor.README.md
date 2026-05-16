---
docid: 150.1.config-editor
id: feature-config-editor
title: "Feature: Config Editor"
project: cielovista-tools
description: "Config Editor — 1 command(s). Auto-generated stub: fill in What it does and Manual test."
status: active
tags: [config, editor]
category: 150.1 — Components / Features
created: 2026-05-15
updated: 2026-05-15
version: 1.0.0
author: CieloVista Software
relativepath: src/features/config-editor.README.md
---
# Feature: Config Editor

## What it does

<!-- TODO: describe what this feature does in 2–4 sentences -->
_Auto-generated stub. Replace this with a human description of the feature._

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.config.edit`](command:cvs.config.edit) | Config: Edit |

---

## Internal architecture

```
activate(context)
  └── registers 1 command(s)
  └── Config: Edit → cvs.config.edit
```

---

## Manual test

1. Open the Command Palette and run **Config: Edit** (`cvs.config.edit`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
