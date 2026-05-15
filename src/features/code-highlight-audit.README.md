---
docid: auto.code-highlight-audit
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
# Feature: Code Highlight Audit

## What it does

<!-- TODO: describe what this feature does in 2–4 sentences -->
_Auto-generated stub. Replace this with a human description of the feature._

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.audit.codeHighlight`](command:cvs.audit.codeHighlight) | Audit: CodeHighlight |

---

## Internal architecture

```
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
