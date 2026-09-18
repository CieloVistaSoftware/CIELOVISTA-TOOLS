---
id: feature-code-auditor
title: "Feature: Code Auditor"
description: "Code Auditor — 1 command(s). Auto-generated stub: fill in What it does and Manual test."
---

# Feature: Code Auditor

## What it does

Runs `scripts/code-auditor.js --json` to detect duplicate code clusters (exact, near-duplicate, and pattern-based) across the codebase. Renders a clickable webview report with cluster type, similarity percentage, file locations, and a suggested shared path. Individual clusters can be filed as GitHub issues directly from the panel.

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.tools.codeAuditor`](command:cvs.tools.codeAuditor) | Tools: CodeAuditor |

---

## Internal architecture

```text
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
