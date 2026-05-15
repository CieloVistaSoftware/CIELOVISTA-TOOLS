---
docid: auto.daily-audit-dir
id: feature-daily-audit
title: "Feature: Daily Audit"
project: cielovista-tools
description: "Daily Audit — 1 command(s). Auto-generated stub: fill in What it does and Manual test."
status: active
tags: [daily, audit]
category: 150.1 — Components / Features
created: 2026-05-15
updated: 2026-05-15
version: 1.0.0
author: CieloVista Software
relativepath: src/features/daily-audit/README.md
---
# Feature: Daily Audit

## What it does

<!-- TODO: describe what this feature does in 2–4 sentences -->
_Auto-generated stub. Replace this with a human description of the feature._

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.audit.runDaily`](command:cvs.audit.runDaily) | Audit: RunDaily |

---

## Internal architecture

```
activate(context)
  └── registers 1 command(s)
  └── Audit: RunDaily → cvs.audit.runDaily
```

**Key internal functions:**
- `buildMarkdownReport()`
- `offerAuditActions()`

---

## Manual test

1. Open the Command Palette and run **Audit: RunDaily** (`cvs.audit.runDaily`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
