---
id: feature-link-integrity-checker
title: "Feature: Link Integrity Checker"
description: "Link Integrity Checker — 0 command(s). Auto-generated stub: fill in What it does and Manual test."
---

# Feature: Link Integrity Checker

## What it does

<!-- TODO: describe what this feature does in 2–4 sentences -->
_Auto-generated stub. Replace this with a human description of the feature._

---

## Commands

| Command ID | Title | Keybinding |
|---|---|---|
| `cvs.links.check` | Tools: Link Integrity Check | — |

---

## Internal architecture

```text
activate(context)
  └── registers 0 command(s)

```

**Key internal functions:**
- `extractLinks()`
- `classifyHref()`
- `validateCommandLink()`
- `validateFileLink()`
- `extractHeadings()`
- `validateAnchorLink()`
- `headCheck()`
- `collectMdFiles()`
- `scanLinks()`
- `buildReportHtml()`
- `checkLinks()`

---

## Manual test

1. Open a workspace with the CieloVista Tools extension active.
2. Verify Link Integrity Checker activates without errors in the Output channel.
