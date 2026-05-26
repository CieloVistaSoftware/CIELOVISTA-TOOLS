---
docid: 150.1.tags-enrichment
id: feature-tags-enrichment
title: "Feature: Tags Enrichment"
project: cielovista-tools
description: "Tags Enrichment — 2 command(s). Auto-generated stub: fill in What it does and Manual test."
status: active
tags: [tags, enrichment]
category: 150.1 — Components / Features
created: 2026-05-25
updated: 2026-05-25
version: 1.0.0
author: CieloVista Software
relativepath: src/features/tags-enrichment.README.md
---
# Feature: Tags Enrichment

## What it does

<!-- TODO: describe what this feature does in 2–4 sentences -->
_Auto-generated stub. Replace this with a human description of the feature._

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.tags.enrich`](command:cvs.tags.enrich) | Tags: Enrich |
| [`cvs.tags.enrichAuto`](command:cvs.tags.enrichAuto) | Tags: EnrichAuto |

---

## Internal architecture

```
activate(context)
  └── registers 2 command(s)
  └── Tags: Enrich → cvs.tags.enrich
  └── Tags: EnrichAuto → cvs.tags.enrichAuto
```

**Key internal functions:**
- `parseFmBlock()`
- `parseFrontmatter()`
- `serializeFm()`
- `tokenize()`
- `deriveTags()`
- `enrichFile()`
- `runEnrichment()`
- `esc()`
- `buildReportHtml()`
- `openPanel()`

---

## Manual test

1. Open the Command Palette and run **Tags: Enrich** (`cvs.tags.enrich`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
2. Open the Command Palette and run **Tags: EnrichAuto** (`cvs.tags.enrichAuto`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
