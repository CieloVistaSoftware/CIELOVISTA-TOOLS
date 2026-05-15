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

## 🅿️ PARKING LOT — end of session 2026-05-15 (npm scripts panel overflow restored)

**TASK:** Fix issue "npm scripts: panel broken — show all scripts, retest" by restoring Primary / Secondary / More commands classification and adding regression coverage.
**FILES TOUCHED:**
- `/home/runner/work/CIELOVISTA-TOOLS/CIELOVISTA-TOOLS/src/shared/project-card-shell.ts` — restore overflow classification so large script sets keep a compact secondary row and grouped More commands section
- `/home/runner/work/CIELOVISTA-TOOLS/CIELOVISTA-TOOLS/tests/regression/REG-053-npm-scripts-panel-overflow.test.js` — new regression test for 20+ scripts, grouping, and no missing commands
- `/home/runner/work/CIELOVISTA-TOOLS/CIELOVISTA-TOOLS/scripts/run-regression-tests.js` — wire REG-053 into the regression suite
- `/home/runner/work/CIELOVISTA-TOOLS/CIELOVISTA-TOOLS/docs/_today/CURRENT-STATUS.md` — parking lot update
**LAST ACTION:** Ran compile, npm-script-focused tests, full regression runner, and full rebuild; the new REG-053 and npm script tests passed, while rebuild still hit unrelated environment-specific failures for external Windows paths/registry data.
**NEXT STEP:** Review and merge the npm scripts panel fix; if a fully green rebuild is required in CI/local Windows, rerun `npm run rebuild` in an environment that has the expected external registry and launcher project paths.
**OPEN QUESTIONS:** Full rebuild still fails in this sandbox on pre-existing external-path checks (`tests/catalog-integrity.test.js` launcher paths and registry-based checks), not on the npm scripts panel changes.

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
