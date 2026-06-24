# Feature: Home Page

## What it does

<!-- TODO: describe what this feature does in 2–4 sentences -->
_Auto-generated stub. Replace this with a human description of the feature._

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.tools.home`](command:cvs.tools.home) | Tools: Home |

---

## Internal architecture

```text
activate(context)
  └── registers 1 command(s)
  └── Tools: Home → cvs.tools.home
```

**Key internal functions:**
- `normalizeWorkspaceDisplayName()`
- `showHomePage()`
- `buildDashboardHtml()`
- `renderResults()`
- `setActive()`
- `runSearchResult()`
- `esc()`
- `updateBadgeInteractivity()`
- `loadToggles()`
- `applyToggles()`
- `buildCfgList()`
- `formatAgo()`

---

## Manual test

1. Open the Command Palette and run **Tools: Home** (`cvs.tools.home`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.

---
docid: 150.1.home-page
id: feature-home-page
title: "Feature: Home Page"
project: cielovista-tools
description: "Home Page — 1 command(s). Auto-generated stub: fill in What it does and Manual test."
status: active
tags: [home, page]
category: 150.1 — Components / Features
created: 2026-05-15
updated: 2026-05-15
version: 1.0.0
author: CieloVista Software
relativepath: src/features/home-page.README.md
---
