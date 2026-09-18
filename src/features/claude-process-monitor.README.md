---
id: feature-claude-process-monitor
title: "Feature: Claude Process Monitor"
description: "Claude Process Monitor — 1 command(s). Auto-generated stub: fill in What it does and Manual test."
---

# Feature: Claude Process Monitor

## What it does

Monitors all running Claude.exe processes on Windows via PowerShell/WMI, showing PID, memory usage, uptime, and parent process for each instance. Detects overload (>3 instances), memory pressure (>500 MB), orphaned processes, and MCP port contention on ports 52100/52101. Auto-refreshes every 5 seconds with per-process kill and kill-all options.

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.claude.processMonitor`](command:cvs.claude.processMonitor) | Claude: ProcessMonitor |

---

## Internal architecture

```text
activate(context)
  └── registers 1 command(s)
  └── Claude: ProcessMonitor → cvs.claude.processMonitor
```

**Key internal functions:**
- `runPs()`
- `collectData()`
- `killPid()`
- `formatUptime()`
- `openerLabel()`
- `memBadge()`
- `buildHtml()`
- `status()`
- `refresh()`
- `showPanel()`

---

## Manual test

1. Open the Command Palette and run **Claude: ProcessMonitor** (`cvs.claude.processMonitor`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
