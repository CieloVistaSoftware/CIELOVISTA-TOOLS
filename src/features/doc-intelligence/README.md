---
docid: 150.1.doc-intelligence-dir
id: feature-doc-intelligence
title: "Feature: Doc Intelligence"
project: cielovista-tools
description: "Doc Intelligence — 1 command(s). Auto-generated stub: fill in What it does and Manual test."
status: active
tags: [doc, intelligence]
category: 150.1 — Components / Features
created: 2026-05-15
updated: 2026-05-15
version: 1.0.0
author: CieloVista Software
relativepath: src/features/doc-intelligence/README.md
---
# Feature: Doc Intelligence

## What it does

<!-- TODO: describe what this feature does in 2–4 sentences -->
_Auto-generated stub. Replace this with a human description of the feature._

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.docs.intelligence`](command:cvs.docs.intelligence) | Docs: Intelligence |

---

## Internal architecture

```
activate(context)
  └── registers 1 command(s)
  └── Docs: Intelligence → cvs.docs.intelligence
```

---

## Manual test

1. Open the Command Palette and run **Docs: Intelligence** (`cvs.docs.intelligence`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
