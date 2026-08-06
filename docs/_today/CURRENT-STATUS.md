# CURRENT-STATUS.md — cielovista-tools

## 🅿️ PARKING LOT

**Task:** ✅ COMPLETED: Fixed hardcoded `jwpmi` username bug across 7 files. CVT is now portable to any Windows username.
**Files touched:**
- `src/shared/registry.ts` (canonical REGISTRY_PATH now uses `os.homedir()` instead of hardcoded path)
- `src/features/daily-audit/runner.ts` (imports REGISTRY_PATH from shared; added AuditProjectRegistry type for audit-specific auditExcluded property)
- `src/features/doc-intelligence/commands.ts` (imports REGISTRY_PATH and loadRegistry from shared)
- `src/features/doc-header/feature.ts` (imports REGISTRY_PATH, loadRegistry, ProjectEntry from shared; GLOBAL_DOCS now derives from REGISTRY_PATH)
- `src/features/doc-header-scan.ts` (imports REGISTRY_PATH and loadRegistry from shared)
- `src/features/marketplace-compliance/registry.ts` (loadRegistry now calls shared version)
- `tests/unit/doc-contract.test.ts` (REGISTRY_PATH now uses `os.homedir()` via Node's `os` module)
- `mcp-server/src/tools/catalog-helpers.ts` (REGISTRY_PATH now uses `os.homedir()`)
**Last action:** All 139 regression tests pass — full compile, typecheck, all suites green.
**Next step:**
1. ~~Fix the hardcoded-`jwpmi`-username bug~~ ✅ DONE
2. Look into why PR #655's CI build check is failing (not yet investigated).
3. Commit these changes as a new PR or add to PR #655.
**Open questions:** None — the hardcoded path issue is resolved and the code is now portable to any Windows username.

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