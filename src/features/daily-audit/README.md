---
id: feature-daily-audit
title: "Feature: Daily Audit"
description: "Daily Audit — 1 command(s). Auto-generated stub: fill in What it does and Manual test."
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

```text
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
