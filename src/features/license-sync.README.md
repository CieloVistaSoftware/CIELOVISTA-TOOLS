---
id: feature-license-sync
title: "Feature: License Sync"
description: "License Sync — 1 command(s). Auto-generated stub: fill in What it does and Manual test."
---

# Feature: License Sync

## What it does

<!-- TODO: describe what this feature does in 2–4 sentences -->
_Auto-generated stub. Replace this with a human description of the feature._

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.license.sync`](command:cvs.license.sync) | License: Sync LICENSE Files Across All Projects |

---

## Internal architecture

```text
activate(context)
  └── registers 1 command(s)
  └── License: Sync LICENSE Files Across All Projects → cvs.license.sync
```

**Key internal functions:**
- `loadCanonical()`
- `scanProject()`
- `buildHtml()`
- `showStatus()`

---

## Manual test

1. Open a workspace with the CieloVista Tools extension active.
2. Verify License Sync activates without errors in the Output channel.
