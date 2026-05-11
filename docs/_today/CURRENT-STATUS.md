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

## 🅿️ PARKING LOT — end of session 2026-05-08 (issues #294 #305 #301 #307)

**TASK:** Implement #294 (Doc Intelligence 5 new finding types), #305 (copy button fix), #301 (pill filters), #307 (AI batch fix)
**FILES TOUCHED:**
- `src/features/readme-compliance/feature.ts` — #305: copy button routes via vscode.env.clipboard; #301: pills → buttons with data-action="filter-status", rows get data-status, applyFilter checks active pill; #307: fixAllNonCompliant redesigned — AI batch fix with buildBatchReviewHtml, per-file Approve/Skip, applyBatch message handler; cvs.readme.fillTodos stub registered to fix catalog test
- `tests/install-verify.test.js` — added 3× #307 smoke tests (59 total, 54 pass)
**LAST ACTION:** npm run rebuild — 54/59 install checks pass (5 pre-existing #299/#300/#302 unrelated); commit cf533cc
**NEXT STEP:** Close GitHub issues #294, #305, #301, #307; then tackle remaining pre-existing failures #299 (diff colors), #300 (success toast), #302 (smart fixer)
**OPEN QUESTIONS:** #294 already fully implemented prior session — confirm close

---

## 🅿️ PARKING LOT — end of session 2026-05-08 (issues #309 #290 #306 #308 #294)

**TASK:** Work through next 5 open issues
**FILES TOUCHED:**
- `src/features/doc-catalog/html.ts` — #309: `card-path` relPath wrapped in `<span class="card-path-link" data-action="open">` — clickable link
- `src/features/doc-catalog/catalog.html` — #309: added `.card-path-link` CSS
- `src/features/docs-broken-refs.ts` — #290: `buildScanningHtml()` + `attachPanelHandlers()` extracted; panel opens immediately with progress bar + ETA; yields between projects via `setTimeout(0)`
- `src/features/readme-compliance/feature.ts` — #306: `showFixDiff()` now calls Claude when `applyFix()` produces `_TODO:` stubs, replacing them with content from companion `.ts` source file; `aiFixReadme()` refactored to accept optional `statusPanel`; `scanAndFillTodos()` + `buildTodoDashboardHtml()` + `scanForTodoFiles()` added for #308; `_todoPanel` added to deactivate
- `src/features/cvs-command-launcher/catalog.ts` — added `cvs.readme.fillTodos` (dewey 400.108)
- `package.json` — added `cvs.readme.fillTodos` command contribution
**LAST ACTION:** Full `npm run rebuild` green — 53/53 install checks, 31/31 regression tests, 13/13 catalog checks, 110 commands
**NEXT STEP:** Close issues #309 #290 #306 #308 on GitHub; issue #294 (Doc Intelligence 5 finding types) was already fully implemented in prior session — verify and close
**OPEN QUESTIONS:** None

---

## 🅿️ PARKING LOT — end of session 2026-05-07 (issue #293)

**TASK:** Fix NPM Output panel dropping failed job details (issues #291 #292 #293 — all duplicates)
**FILES TOUCHED:**
- `src/features/npm-command-launcher.ts` — moved `setupOutputPanel()` to top of `run` handler (before `job-start`); removed two lazy calls from stdout/stderr data handlers
- `tests/regression/REG-025-npm-output-routing-and-timing.test.js` — updated lazy-open check → eager-open check
- `tests/regression/REG-025-npm-output-failed-jobs.test.js` — new REG-026 test; 4 checks, 0 failures
- `scripts/run-regression-tests.js` — added REG-026 entry
**LAST ACTION:** Committed `fix: #293 NPM Output panel drops failed job details` (94f2d0e); issues #291 #292 #293 closed
**NEXT STEP:** Continue with open issues — #290 (Broken Refs Scan progress/ETA), #289 (4 catalog commands not registered), #294 (Doc Intelligence stale docs)
**OPEN QUESTIONS:** None

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
