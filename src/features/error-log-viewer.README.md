---
id: feature-error-log-viewer
title: "Feature: Error Log Viewer"
description: "Error Log Viewer — 1 command(s). Auto-generated stub: fill in What it does and Manual test."
---

# Feature: Error Log Viewer

## What it does

Shows the persistent CieloVista Tools error log in a webview panel, displaying error type, context, triggering command, timestamp, and stack trace for each entry. Supports refresh, clear all, open raw JSON, and filing selected errors directly as GitHub issues.

- **One card per error.** Repeats of the same error collapse into one card with a `(×N)` count, across both logs and across the workspace and data log files.
- **Active count.** The red badge counts errors that are neither solved nor filed. Solved entries (bg-health marks the bugs it no longer detects) render dimmed with a ✔ Solved badge and their solution.

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.tools.errorLog`](command:cvs.tools.errorLog) | Tools: Error Log |


---

## Internal architecture

```text
activate(context)
  └── registers 1 command(s)
  └── Tools: Error Log → cvs.tools.errorLog
```

**Key internal functions:**
- `typeColor()`
- `buildHtml()`
- `handleMessage()` — webview button handler; failures are logged and shown, never silent

---

## Manual test

1. Open a workspace with the CieloVista Tools extension active.
2. Verify Error Log Viewer activates without errors in the Output channel.
3. Run **Tools: Error Log**. An error that recurred shows once with `(×N)`, not once per occurrence.
4. An entry bg-health marked solved shows ✔ Solved and is not counted in the red badge.
5. Click ⚡ File as Issue, close the panel before it finishes: no error appears, and reopening shows ✅ Filed #N.
