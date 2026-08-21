# CURRENT-STATUS.md — cielovista-tools

## 🅿️ PARKING LOT

**Task:** Fixed issue #684 — bg-health-runner filing a false "Regression tests failing" bug every hour (×50).
**Files touched:**
- `src/features/background-health-runner.ts` (new `_findSourceCheckoutRoot()` walks up from `__dirname` for the source-checkout markers; `runRegressionTests()` gates on it ahead of `spawn()`; `clearBug()` now returns whether it changed anything)
- `tests/regression/REG-128-bg-health-source-tree-gate.test.js` (new — exercises the real resolver against fixture trees)
- `src/features/background-health-runner.README.md` (new "Hourly regression run" section documenting the three skip conditions)
**Last action:** PR #695 opened and CI green (build pass, 42s). All 143 regression tests pass locally. Findings + validating test logged on issue #684.
**Root cause (for the record):** the hourly run was executing from the INSTALLED extension directory, which ships `out/` and `scripts/` but no `src/` and no `tests/`. REG-001a/001c and REG-003–008 all read `src/`, so all eight structural checks failed together on every attempt, forever. The #641 gate missed it because an installed `.vsix` has `wt=false, built=true`. The #533 forensic diagnostics are what pinned it down. Also repaired a latent off-by-one: the module now compiles to `out/features/`, so `path.join(__dirname, '..')` meant `<root>/out` — the hourly run had become a silent no-op in dev checkouts too.
**Next step:**
1. Merge PR #695, then `npm run rebuild` + reload the window — the fix does nothing until the installed 1.0.3 copy is replaced.
2. Fast-forward local `main` — it sat 7 duplicated / 13 behind `origin/main` (the 7 local commits had already landed upstream as squashed PR commits).
3. Stale PR backlog: #553, #560, #604, #606, #616 have been open 2-3 months and are likely stale against current main.
4. 55 git worktrees under `.claude/worktrees/`, many at already-merged commits — candidates for pruning.
**Open questions:** After #695 lands, the existing aggregated error-log row for `[bg-health] Regression tests failing` stays until dismissed (it stops incrementing). Worth deciding whether a cleared bug should also mark its mirrored error-log entry solved — `addBug()` mirrors to the error log on every re-detection, but `clearBug()` has no matching un-mirror.

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