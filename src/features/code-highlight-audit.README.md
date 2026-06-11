# Feature: Code Highlight Audit

## What it does

Scans all markdown files in registered projects for fenced code blocks missing a language tag (bare triple-backtick fences). Displays results as a table with file, project, line number, and content preview. Guesses the language from context and provides per-block Fix and Fix All buttons that rewrite the opening fence in place.

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.audit.codeHighlight`](command:cvs.audit.codeHighlight) | Audit: CodeHighlight |

---

## Internal architecture

```text
activate(context)
  └── registers 1 command(s)
  └── Audit: CodeHighlight → cvs.audit.codeHighlight
```

**Key internal functions:**
- `guessLanguage()`
- `buildHtml()`
- `runAudit()`
- `findMarkdownFiles()`
- `fixAllBlocks()`
- `showPanel()`

---

## Manual test

1. Open the Command Palette and run **Audit: CodeHighlight** (`cvs.audit.codeHighlight`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.

---
docid: 150.1.code-highlight-audit
id: feature-code-highlight-audit
title: "Feature: Code Highlight Audit"
project: cielovista-tools
description: "Code Highlight Audit — 1 command(s). Auto-generated stub: fill in What it does and Manual test."
status: active
tags: [code, highlight, audit]
category: 150.1 — Components / Features
created: 2026-05-15
updated: 2026-05-15
version: 1.0.0
author: CieloVista Software
relativepath: src/features/code-highlight-audit.README.md
---
