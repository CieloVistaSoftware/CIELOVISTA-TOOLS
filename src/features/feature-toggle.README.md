---
docid: 150.1.feature-toggle
id: feature-feature-toggle
title: "Feature: Feature Toggle"
project: cielovista-tools
description: "Feature Toggle — 1 command(s). Auto-generated stub: fill in What it does and Manual test."
status: active
tags: [feature, toggle]
category: 150.1 — Components / Features
created: 2026-05-15
updated: 2026-05-15
version: 1.0.0
author: CieloVista Software
relativepath: src/features/feature-toggle.README.md
---
# Feature: Feature Toggle

## What it does

<!-- TODO: describe what this feature does in 2–4 sentences -->
_Auto-generated stub. Replace this with a human description of the feature._

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.features.configure`](command:cvs.features.configure) | Features: Configure |

---

## Internal architecture

```text
activate(context)
  └── registers 1 command(s)
  └── Features: Configure → cvs.features.configure
```

**Key internal functions:**
- `setFeatureEnabled()`
- `getFeatureToggleHtml()`

---

## Manual test

1. Open the Command Palette and run **Features: Configure** (`cvs.features.configure`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
