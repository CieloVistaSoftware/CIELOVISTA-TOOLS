---
docid: auto.code-auditor
id: feature-code-auditor
title: "Feature: Code Auditor"
project: cielovista-tools
description: "Code Auditor — 1 command(s). Auto-generated stub: fill in What it does and Manual test."
status: active
tags: [code, auditor]
category: 150.1 — Components / Features
created: 2026-05-15
updated: 2026-05-15
version: 1.0.0
author: CieloVista Software
relativepath: src/features/code-auditor.README.md
---
# Feature: Code Auditor

## What it does

<!-- TODO: describe what this feature does in 2–4 sentences -->
_Auto-generated stub. Replace this with a human description of the feature._

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.tools.codeAuditor`](command:cvs.tools.codeAuditor) | Tools: CodeAuditor |

---

## Internal architecture

```
activate(context)
  └── registers 1 command(s)
  └── Tools: CodeAuditor → cvs.tools.codeAuditor
```

**Key internal functions:**
- `runAuditorJson()`
- `buildHtml()`
- `showCodeAuditor()`

---

## Manual test

1. Open the Command Palette and run **Tools: CodeAuditor** (`cvs.tools.codeAuditor`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
