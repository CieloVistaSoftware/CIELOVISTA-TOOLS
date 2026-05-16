---
docid: 150.1.cvs-command-launcher-dir
id: feature-cvs-command-launcher
title: "Feature: Cvs Command Launcher"
project: cielovista-tools
description: "Cvs Command Launcher — 3 command(s). Auto-generated stub: fill in What it does and Manual test."
status: active
tags: [cvs, command, launcher]
category: 150.1 — Components / Features
created: 2026-05-15
updated: 2026-05-15
version: 1.0.0
author: CieloVista Software
relativepath: src/features/cvs-command-launcher/README.md
---
# Feature: Cvs Command Launcher

## What it does

<!-- TODO: describe what this feature does in 2–4 sentences -->
_Auto-generated stub. Replace this with a human description of the feature._

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.launcher.refresh`](command:cvs.launcher.refresh) | Launcher: Refresh |
| [`cvs.launcher.runWithOutput`](command:cvs.launcher.runWithOutput) | Launcher: RunWithOutput |
| [`cvs.mcp.startServer`](command:cvs.mcp.startServer) | Mcp: StartServer |

---

## Internal architecture

```
activate(context)
  └── registers 3 command(s)
  └── Launcher: Refresh → cvs.launcher.refresh
  └── Launcher: RunWithOutput → cvs.launcher.runWithOutput
  └── Mcp: StartServer → cvs.mcp.startServer
```

**Key internal functions:**
- `escHtml()`
- `normalizeWorkspaceDisplayName()`
- `isCancellationError()`
- `isCommandNotFoundError()`
- `detectWorkspaceType()`
- `getPinnedIds()`
- `setPinnedIds()`
- `safePostToWebview()`
- `buildStatusMap()`
- `startInterception()`
- `stopInterceptionIfIdle()`
- `buildResultPanelHtml()`
- `getOutputText()`
- `showToast()`
- `copyText()`
- `_executeWithOutput()`
- `attachMessageHandler()`
- `getRegisteredCommandSet()`
- `showLauncherPanel()`
- `refreshLauncherPanel()`

---

## Manual test

1. Open the Command Palette and run **Launcher: Refresh** (`cvs.launcher.refresh`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
2. Open the Command Palette and run **Launcher: RunWithOutput** (`cvs.launcher.runWithOutput`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
3. Open the Command Palette and run **Mcp: StartServer** (`cvs.mcp.startServer`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
