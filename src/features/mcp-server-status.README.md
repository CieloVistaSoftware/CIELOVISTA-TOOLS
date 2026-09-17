# Feature: Mcp Server Status

## What it does

<!-- TODO: describe what this feature does in 2–4 sentences -->
_Auto-generated stub. Replace this with a human description of the feature._

---

## Commands

| Command ID | Title |
|---|---|
_No commands registered — utility/shared module._

---

## Internal architecture

```text
activate(context)
  └── registers 0 command(s)

```

**Key internal functions:**
- `resolveMcpDistPath()`
- `notifyListeners()`
- `clearRetryTimer()`
- `clearStableTimer()`
- `setStatus()`
- `isMcpProcessAlive()`
- `terminalWriteLine()`
- `trimTail()`
- `appendTail()`
- `buildMcpLaunchConfig()`
- `resolveNodeLauncher()` — imported from `src/shared/node-launcher.ts`, not defined
  here. Picks the Node binary: VS Code's own host binary (`process.execPath` +
  `ELECTRON_RUN_AS_NODE=1`) instead of a PATH-resolved `node.exe`, which on Windows
  could be the wrong ABI or an AV-wrapped shim and fail DLL init with `0xC0000142`
  before any code ran (#615). It moved to `shared/` once four other call sites
  turned out to have the same bug (#723).
- `writeMcpCrashDiagnostics()`
- `runMcpProcess()`
- `scheduleRetry()`

---

## Manual test

1. Open a workspace with the CieloVista Tools extension active.
2. Verify Mcp Server Status activates without errors in the Output channel.

---
docid: 150.1.mcp-server-status
id: feature-mcp-server-status
title: "Feature: Mcp Server Status"
project: cielovista-tools
description: "Mcp Server Status — 0 command(s). Auto-generated stub: fill in What it does and Manual test."
status: active
tags: [mcp, server, status]
category: 150.1 — Components / Features
created: 2026-05-15
updated: 2026-05-15
version: 1.0.0
author: CieloVista Software
relativepath: src/features/mcp-server-status.README.md
---
