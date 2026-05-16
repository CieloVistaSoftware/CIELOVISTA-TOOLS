---
docid: 150.1.playwright-runner
id: feature-playwright-runner
title: "Feature: Playwright Runner"
project: cielovista-tools
description: "Playwright Runner — 3 command(s). Auto-generated stub: fill in What it does and Manual test."
status: active
tags: [playwright, runner]
category: 150.1 — Components / Features
created: 2026-05-15
updated: 2026-05-15
version: 1.0.0
author: CieloVista Software
relativepath: src/features/playwright-runner.README.md
---
# Feature: Playwright Runner

## What it does

<!-- TODO: describe what this feature does in 2–4 sentences -->
_Auto-generated stub. Replace this with a human description of the feature._

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.playwright.run`](command:cvs.playwright.run) | Playwright: Run |
| [`cvs.playwright.stop`](command:cvs.playwright.stop) | Playwright: Stop |
| [`cvs.playwright.cleanResults`](command:cvs.playwright.cleanResults) | Playwright: CleanResults |

---

## Internal architecture

```
activate(context)
  └── registers 3 command(s)
  └── Playwright: Run → cvs.playwright.run
  └── Playwright: Stop → cvs.playwright.stop
  └── Playwright: CleanResults → cvs.playwright.cleanResults
```

**Key internal functions:**
- `runPlaywrightTests()`
- `stopPlaywrightTests()`
- `writePlaywrightResultMarkdown()`
- `showPlaywrightResultMarkdown()`
- `cleanTestResults()`

---

## Manual test

1. Open the Command Palette and run **Playwright: Run** (`cvs.playwright.run`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
2. Open the Command Palette and run **Playwright: Stop** (`cvs.playwright.stop`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
3. Open the Command Palette and run **Playwright: CleanResults** (`cvs.playwright.cleanResults`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
