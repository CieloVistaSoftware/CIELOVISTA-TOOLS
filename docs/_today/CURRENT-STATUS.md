# CURRENT-STATUS.md — cielovista-tools

## 🅿️ PARKING LOT

**Task:** Fixed home-page Start button (PR #655, issue #654) + audited/fixed new-user install experience (docs + real bugs), prompted by "what would a new user experience" review.
**Files touched:**
- `src/features/home-page.ts` (Start button apostrophe-escape fix; REG-119 test target; "+ Add Folder" now visible on empty state via new `is-empty` class; empty-state copy updated)
- `tests/regression/REG-119-home-page-button-smoke-test.test.js` (new — real button-execution smoke test)
- `src/shared/cvt-registry.ts` (`addToRegistry()` now auto-bootstraps registry file + folder if missing, via new `ensureRegistryExists()`)
- `README.md`, `FRESH-INSTALL-GUIDE.md` (corrected: registry system IS real and extensively used — an earlier AI's claim it didn't exist was verified false; removed broken `npm run fresh-install` reference — that script never existed, replaced with verified-working `npm run rebuild`; clarified `project-registry.json` is personal/self-created, not cloned from CieloVistaSoftware/CieloVistaStandards; added step-by-step registry bootstrap instructions)
**Last action:** All 134 regression tests + typecheck + compile pass with the above changes. Verified `npm run rebuild` end-to-end on a genuinely fresh `git clone` (71/71 install checks + package.json validation passed).
**Next step:**
1. Fix the hardcoded-`jwpmi`-username bug: `REGISTRY_PATH` is a literal string (`C:\Users\jwpmi\Downloads\CieloVistaStandards\project-registry.json`) duplicated across 7 files (`shared/registry.ts`, `shared/cvt-registry.ts`, `daily-audit/runner.ts`, `doc-header-scan.ts`, `doc-header/feature.ts`, `doc-intelligence/commands.ts`, `marketplace-compliance/registry.ts`) instead of using `os.homedir()` — blocks any installer whose Windows username isn't `jwpmi`. This is the real remaining gate on public distribution/advertising CVT.
2. Look into why PR #655's CI build check is failing (not yet investigated).
3. Commit tonight's uncommitted changes (home-page.ts, cvt-registry.ts, README.md, FRESH-INSTALL-GUIDE.md, REG-119 test) — likely as part of PR #655 or a new PR.
**Open questions:** Who is CVT actually being advertised to — other devs willing to replicate the personal-registry setup, or the general public expecting zero external dependencies? Answer changes how far the registry-portability fix needs to go (just `os.homedir()`, vs. a fuller no-registry-required mode).

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