---
id: feature-error-log-viewer
title: "Feature: Error Log Viewer"
description: "Error Log Viewer — 0 command(s). Auto-generated stub: fill in What it does and Manual test."
---

# Feature: Error Log Viewer

## What it does

Shows the persistent CieloVista Tools error log in a webview panel, displaying error type, context, triggering command, timestamp, and stack trace for each entry. Supports refresh, clear all, open raw JSON, and filing selected errors directly as GitHub issues.

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.tools.errorLog`](command:cvs.tools.errorLog) | Tools: Error Log |


---

## Internal architecture

```text
activate(context)
  └── registers 0 command(s)

```

**Key internal functions:**
- `typeColor()`
- `buildHtml()`

---

## Manual test

1. Open a workspace with the CieloVista Tools extension active.
2. Verify Error Log Viewer activates without errors in the Output channel.
