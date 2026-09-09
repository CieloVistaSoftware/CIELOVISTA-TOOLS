# CURRENT-STATUS.md — cielovista-tools

## 🅿️ PARKING LOT

**Task:** Fixed issue #700 — REG-066 mutated the shared repo tree during the concurrent suite (same class as #697).
**Files touched:**
- `tests/regression/REG-066-frontmatter-scan-scope-excludes-foreign-artifacts.test.js` (rewritten — builds its fixture tree in `fs.mkdtempSync(os.tmpdir())` and runs a copy of the production audit script from `<sandbox>/scripts/` so its `ROOT` resolves to the sandbox; four new assertions prove the repo tree came out unchanged)
- `tests/regression/REG-130-suite-shared-source-tree-isolation.test.js` (invariant 1 widened from `src/` to the whole repo-relative tree; origin-resolving classifier replaces the name-based regex, and the mutator table now records which argument each call writes)
**Last action:** PR #702 opened, issue #700 commented with root cause + validating tests. Full suite 145/145 green locally.
**Root cause (for the record):** `scripts/audit-frontmatter-by-filename.js` hardcodes `ROOT = path.resolve(__dirname, '..')`, so the only way to point it elsewhere without touching production code is to move the script. Copying it into the sandbox does exactly that. No production file changed.
**Next step:**
1. Merge PR #702 once CI is green.
2. Remaining open issues: #696 (no `registry_promote` MCP tool), #680 (Home Start button no-ops without .claude/launch.json), #677 (package.json JSON_PARSE_ERROR), #669/#668 (daily-audit), #667 (doc-auditor false positives — PR #676 already open), #615 (MCP server 0xC0000142 — PR #622 already open).
3. Stale PR backlog is down to three: #683, #676, #622. All predate current main by 1-3 months.
4. 55 git worktrees under `.claude/worktrees/`, many at already-merged commits — candidates for pruning.
**Open questions:** Carried over from #684 and still unaddressed — `addBug()` mirrors to the error log on every re-detection but `clearBug()` has no matching un-mirror, so a cleared bug leaves its aggregated error-log row standing until dismissed by hand.

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