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

---
docid: 150.1.link-integrity-checker
id: feature-link-integrity-checker
title: "Feature: Link Integrity Checker"
project: cielovista-tools
description: "Link Integrity Checker — 0 command(s). Auto-generated stub: fill in What it does and Manual test."
status: active
tags: [link, integrity, checker]
category: 150.1 — Components / Features
created: 2026-05-25
updated: 2026-05-25
version: 1.0.0
author: CieloVista Software
relativepath: src/features/link-integrity-checker.README.md
---
