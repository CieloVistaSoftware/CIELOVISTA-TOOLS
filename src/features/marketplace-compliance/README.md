---
docid: 150.1.marketplace-compliance-dir
id: feature-marketplace-compliance
title: "Feature: Marketplace Compliance"
project: cielovista-tools
description: "Marketplace Compliance — 3 command(s). Auto-generated stub: fill in What it does and Manual test."
status: active
tags: [marketplace, compliance]
category: 150.1 — Components / Features
created: 2026-05-15
updated: 2026-05-15
version: 1.0.0
author: CieloVista Software
relativepath: src/features/marketplace-compliance/README.md
---
# Feature: Marketplace Compliance

## What it does

<!-- TODO: describe what this feature does in 2–4 sentences -->
_Auto-generated stub. Replace this with a human description of the feature._

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.marketplace.scan`](command:cvs.marketplace.scan) | Marketplace: Scan |
| [`cvs.marketplace.fixAll`](command:cvs.marketplace.fixAll) | Marketplace: FixAll |
| [`cvs.marketplace.fixOne`](command:cvs.marketplace.fixOne) | Marketplace: FixOne |

---

## Internal architecture

```
activate(context)
  └── registers 3 command(s)
  └── Marketplace: Scan → cvs.marketplace.scan
  └── Marketplace: FixAll → cvs.marketplace.fixAll
  └── Marketplace: FixOne → cvs.marketplace.fixOne
```

---

## Manual test

1. Open the Command Palette and run **Marketplace: Scan** (`cvs.marketplace.scan`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
2. Open the Command Palette and run **Marketplace: FixAll** (`cvs.marketplace.fixAll`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
3. Open the Command Palette and run **Marketplace: FixOne** (`cvs.marketplace.fixOne`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
