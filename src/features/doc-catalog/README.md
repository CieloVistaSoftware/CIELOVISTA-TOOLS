---
docid: 150.1.doc-catalog-dir
id: feature-doc-catalog
title: "Feature: Doc Catalog"
project: cielovista-tools
description: "Doc Catalog — 4 command(s). Auto-generated stub: fill in What it does and Manual test."
status: active
tags: [doc, catalog]
category: 150.1 — Components / Features
created: 2026-05-15
updated: 2026-05-15
version: 1.0.0
author: CieloVista Software
relativepath: src/features/doc-catalog/README.md
---
# Feature: Doc Catalog

## What it does

<!-- TODO: describe what this feature does in 2–4 sentences -->
_Auto-generated stub. Replace this with a human description of the feature._

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.catalog.open`](command:cvs.catalog.open) | Catalog: Open |
| [`cvs.catalog.rebuild`](command:cvs.catalog.rebuild) | Catalog: Rebuild |
| [`cvs.catalog.view`](command:cvs.catalog.view) | Catalog: View |
| [`cvs.catalog.viewArchived`](command:cvs.catalog.viewArchived) | Catalog: ViewArchived |

---

## Internal architecture

```
activate(context)
  └── registers 4 command(s)
  └── Catalog: Open → cvs.catalog.open
  └── Catalog: Rebuild → cvs.catalog.rebuild
  └── Catalog: View → cvs.catalog.view
  └── Catalog: ViewArchived → cvs.catalog.viewArchived
```

---

## Manual test

1. Open the Command Palette and run **Catalog: Open** (`cvs.catalog.open`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
2. Open the Command Palette and run **Catalog: Rebuild** (`cvs.catalog.rebuild`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
3. Open the Command Palette and run **Catalog: View** (`cvs.catalog.view`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
4. Open the Command Palette and run **Catalog: ViewArchived** (`cvs.catalog.viewArchived`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
