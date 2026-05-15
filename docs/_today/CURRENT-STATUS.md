---
docid: 150.9.current-status
dewey: 150.9.current-status
id: current-statusmd-cielovista-tools
title: CURRENT-STATUS.md — cielovista-tools
project: cielovista-tools
description: - Verified live after junction install: ✅ MCP Viewer status column + pills, ✅ Symbol Index (listsymbols / listcvtcommands), ✅ Send Path tooltip + c…
status: active
tags: [current, status, currentstatusmd]
category: 150.9 — Meta
created: 2026-04-25
updated: 2026-05-11
version: 1.0.0
author: CieloVista Software
relativepath: docs/_today/CURRENT-STATUS.md
---
# CURRENT-STATUS.md — cielovista-tools

---

## 🅿️ PARKING LOT — end of session 2026-05-15 (regression log viewer integration)

**TASK:** Finish issue: Regression Log Viewer webview with file-as-issue integration
**FILES TOUCHED:**
- `/home/runner/work/CIELOVISTA-TOOLS/CIELOVISTA-TOOLS/src/features/regression-log-viewer.ts` — sorted entries by date, always-rendered count pills, open-only issue button, panel refresh after file/fix actions
- `/home/runner/work/CIELOVISTA-TOOLS/CIELOVISTA-TOOLS/src/features/home-page.ts` — added Regression Log Quick Launch button and routed it through `OPEN_DIRECT`
- `/home/runner/work/CIELOVISTA-TOOLS/CIELOVISTA-TOOLS/tests/unit/regression-log-viewer.test.js` — replaced skipped compiled-module test with source/bundle structural checks for viewer + home wiring
- `/home/runner/work/CIELOVISTA-TOOLS/CIELOVISTA-TOOLS/docs/_today/CURRENT-STATUS.md` — updated parking lot for this session
**LAST ACTION:** Compiled successfully, ran focused regression log viewer + adjacent home page tests green, and captured preview screenshot at `/tmp/regression-log-viewer-preview.png`
**NEXT STEP:** Run final PR validation (`parallel_validation`) and report/commit the finished change set
**OPEN QUESTIONS:** None

---

## 🅿️ PARKING LOT — end of session 2026-05-11 (issue #293 — test cleanup complete)

**TASK:** Fix stale tests left after #293 NPM Output → real VS Code terminal rewrite
**FILES TOUCHED:**
- `tests/regression/REG-025-npm-output-routing-and-timing.test.js` — rewritten: now asserts terminal API IS used (name/location/sendCard/map/stop), was previously inverted
- `tests/regression/REG-016-npm-output-webview.test.js` — rewritten: now asserts old webview approach is completely gone (no buildOutputShellHtml, setupOutputPanel, cp.spawn, sendOut, flushOutputQueue)
- `tests/unit/npm-output-shell.test.js` — deleted (tested buildOutputShellHtml which is gone)
- `tests/npm-fix-button.test.js` — deleted (tested webview DOM lifecycle, no longer exists)
- `tests/npm-send-to-claude.test.js` — deleted (tested webview copy-to-chat, no longer exists)
**LAST ACTION:** Full `npm run rebuild` green — 61/61 install checks, 31/31 regression tests, 13/13 catalog checks
**NEXT STEP:** Commit; ready for new feature work
**OPEN QUESTIONS:** None
**STATUS:** ✅ Issue #293 fully complete — terminal rewrite + all tests clean

---

## 🅿️ PARKING LOT — end of session 2026-05-10 (Git merge + line endings + issue closures + test fixes)

**TASK:** 1) Resolve git pull merge conflict 2) Fix LF/CRLF warnings 3) Close 11 completed issues 4) Fix remaining test failures
**FILES TOUCHED:**
- `tests/install-verify.test.js` — resolved merge conflict (kept incoming #313 tests)
- `.gitattributes` — added (new file); explicit line-ending policy for all file types
- `src/shared/doc-preview.ts` — added missing btn-terminal button to toolbar (HTML element, event listener, message handler) for #267 regression test
**COMMITS:**
- 1089efb — Merge branch 'main' of https://github.com/CieloVistaSoftware/CIELOVISTA-TOOLS (conflict resolved)
- 0308b99 — Normalize line endings with .gitattributes policy
- 690b340 — fix: #267 doc-preview toolbar — add missing btn-terminal button
**LAST ACTION:** Full `npm run rebuild` green — 61/61 install checks, 31/31 regression tests, 13/13 catalog checks, 8/8 unit tests
**NEXT STEP:** Push commits; ready for new feature work
**OPEN QUESTIONS:** None
**STATUS:** ✅ All 11 issues (#309, #290, #306, #308, #294, #305, #301, #307, #299, #300, #302) already closed on GitHub as of pull; no action needed. Line-ending policy established. Test suite clean.

---

## Key File Paths

| What | Path |
|---|---|
| Extension root | `C:\Users\jwpmi\Downloads\VSCode\projects\cielovista-tools` |
| Canonical registry loader | `src\shared\registry.ts` |
| MCP server | `mcp-server\src\` |
| MCP Viewer | `src\features\mcp-viewer\` |
| Registry promote | `src\features\registry-promote.ts` |
| Feature toggle | `src\features\feature-toggle.ts` |
| Command catalog | `src\features\cvs-command-launcher\catalog.ts` |
| doc-auditor (split) | `src\features\doc-auditor\` |
| doc-catalog (split) | `src\features\doc-catalog\` |
| Marketplace (split) | `src\features\marketplace-compliance\` |
| Fixes log | `data\fixes.json` |
| Build command | `npm run rebuild` |
| Project registry (global) | `C:\Users\jwpmi\Downloads\CieloVistaStandards\project-registry.json` |
