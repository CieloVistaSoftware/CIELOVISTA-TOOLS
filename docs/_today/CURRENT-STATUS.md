# CURRENT-STATUS.md — cielovista-tools

## 🅿️ PARKING LOT

**Task:** #615 — MCP server crashes on startup (0xC0000142 STATUS_DLL_INIT_FAILED) on Windows
**Files touched:** `src/features/mcp-server-status.ts`, `tests/unit/mcp-server-status.test.js`, `tests/regression/REG-116-mcp-bundled-node-launch.test.js`, `data/claude-job-status.json`
**Last action:** Launch MCP via VS Code bundled Node (`process.execPath` + `ELECTRON_RUN_AS_NODE=1`) instead of PATH `node`; added `windowsHide: true`; recorded resolved node path in crash diagnostics. Compile clean, all 133 regression tests green (built `mcp-server/dist` first — worktree gap).
**Next step:** Commit + open PR for #615; then pick next open issue
**Open questions:** None

---

---
docid: 150.9.current-status
id: current-statusmd-cielovista-tools
title: CURRENT-STATUS.md — cielovista-tools
project: cielovista-tools
description: - Verified live after junction install: ✅ MCP Viewer status column + pills, ✅ Symbol Index (listsymbols / listcvtcommands), ✅ Send Path tooltip + c…
status: active
tags: [after, cielovista, column, current, currentstatusmd, install, junction, live, mcp, meta, pills, status, statusmd, today, tools, verified, viewer]
category: 150.9 — Meta
created: 2026-04-25
updated: 2026-05-14
version: 1.0.0
author: CieloVista Software
relativepath: docs/_today/CURRENT-STATUS.md
---