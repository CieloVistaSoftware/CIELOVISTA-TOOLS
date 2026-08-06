# CURRENT-STATUS.md — cielovista-tools

## 🅿️ PARKING LOT

**Task:** ✅ COMPLETED: Fixed hardcoded `jwpmi` username bug. CVT is now portable to any Windows username.

**Commit:** `8522d18` — Replace hardcoded paths with `os.homedir()`

**PR:** [#679](https://github.com/CieloVistaSoftware/CIELOVISTA-TOOLS/pull/679) — Use os.homedir() for portable registry paths

**Files touched:**
- `src/shared/registry.ts` (canonical REGISTRY_PATH now uses `os.homedir()` instead of hardcoded path)
- `src/features/daily-audit/runner.ts` (imports REGISTRY_PATH from shared; added AuditProjectRegistry type for audit-specific auditExcluded property)
- `src/features/doc-intelligence/commands.ts` (imports REGISTRY_PATH and loadRegistry from shared)
- `src/features/doc-header/feature.ts` (imports REGISTRY_PATH, loadRegistry, ProjectEntry from shared; GLOBAL_DOCS now derives from REGISTRY_PATH)
- `src/features/doc-header-scan.ts` (imports REGISTRY_PATH and loadRegistry from shared; restored FEATURE constant)
- `src/features/marketplace-compliance/registry.ts` (loadRegistry now calls shared version)
- `tests/unit/doc-contract.test.ts` (REGISTRY_PATH now uses `os.homedir()` via Node's `os` module)
- `mcp-server/src/tools/catalog-helpers.ts` (REGISTRY_PATH now uses `os.homedir()`)

**Status:** 
- ✅ All 139 regression tests pass
- ✅ Full compile and typecheck success
- ✅ Code pushed to origin/claude/continue-f836c6
- ✅ PR #679 created and awaiting review
- ✅ PR #655 already merged with successful CI build

**Open questions:** None — all loose ends resolved.

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