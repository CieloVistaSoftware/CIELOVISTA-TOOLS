---
id: feature-mcp-build
title: "Feature: Mcp Build"
description: "Build the open workspace's mcp-server/ folder and show the result; stop a build that is still running."
---

# Feature: Mcp Build

## What it does

Runs `npm run build` in the open workspace's `mcp-server/` folder, so it only does something in the cielovista-tools source checkout. When the build exits, the output is written to a markdown result file and opened as a preview. **MCP Server: Start/Stop** needs the `dist/index.js` this produces, and tells you to run this command when it is missing. **MCP Server: Stop Build** kills a build that is still running.

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.mcp.build`](command:cvs.mcp.build) | MCP Server: Build |
| [`cvs.mcp.build.stop`](command:cvs.mcp.build.stop) | MCP Server: Stop Build |

---

## Internal architecture

```text
activate(context)
  └── registers 2 command(s)
  └── MCP Server: Build → cvs.mcp.build
  └── MCP Server: Stop Build → cvs.mcp.build.stop
```

**Key internal functions:**
- `writeBuildResultMarkdown()`
- `showBuildResultMarkdown()`

---

## Manual test

1. Open the cielovista-tools source checkout, open the Command Palette and run **MCP Server: Build** (`cvs.mcp.build`).
   Verify a markdown preview of the build result opens, with no errors in the CieloVista Tools output channel.
2. Run **MCP Server: Build** again and, while it runs, run **MCP Server: Stop Build** (`cvs.mcp.build.stop`).
   Verify the "MCP build stopped." message appears.
