---
id: feature-disk-cleanup-dashboard
title: "Feature: Disk Cleanup Dashboard"
description: "Disk Cleanup Dashboard — 1 command(s). Auto-generated stub: fill in What it does and Manual test."
---

# Feature: Disk Cleanup Dashboard

## What it does

Locates the DiskCleanUp service executable via VS Code settings, Windows registry, or a known debug-build path, then spawns it with `--serve` to start its local HTTP dashboard. Opens the resulting URL in the system browser, reusing an already-running instance when the port file is present and healthy.

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.diskcleanup.openDashboard`](command:cvs.diskcleanup.openDashboard) | Diskcleanup: OpenDashboard |

---

## Internal architecture

```text
activate(context)
  └── registers 1 command(s)
  └── Diskcleanup: OpenDashboard → cvs.diskcleanup.openDashboard
```

**Key internal functions:**
- `openDashboard()`
- `resolveExePath()`

---

## Manual test

1. Open the Command Palette and run **Diskcleanup: OpenDashboard** (`cvs.diskcleanup.openDashboard`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
