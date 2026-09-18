---
id: feature-mcp-build
title: "Feature: Mcp Build"
description: "Mcp Build — 2 command(s). Auto-generated stub: fill in What it does and Manual test."
---

# Feature: Mcp Build

## What it does

<!-- TODO: describe what this feature does in 2–4 sentences -->
_Auto-generated stub. Replace this with a human description of the feature._

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.mcp.build`](command:cvs.mcp.build) | Mcp: Build |
| [`cvs.mcp.build.stop`](command:cvs.mcp.build.stop) | Mcp: Build: Stop |

---

## Internal architecture

```text
activate(context)
  └── registers 2 command(s)
  └── Mcp: Build → cvs.mcp.build
  └── Mcp: Build: Stop → cvs.mcp.build.stop
```

**Key internal functions:**
- `writeBuildResultMarkdown()`
- `showBuildResultMarkdown()`

---

## Manual test

1. Open the Command Palette and run **Mcp: Build** (`cvs.mcp.build`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
2. Open the Command Palette and run **Mcp: Build: Stop** (`cvs.mcp.build.stop`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
