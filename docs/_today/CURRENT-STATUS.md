---
docid: 150.9.current-status
id: current-statusmd-cielovista-tools
title: CURRENT-STATUS.md — cielovista-tools
project: cielovista-tools
description: - Verified live after junction install: ✅ MCP Viewer status column + pills, ✅ Symbol Index (listsymbols / listcvtcommands), ✅ Send Path tooltip + c…
status: active
tags: [current, status, currentstatusmd]
category: 150.9 — Meta
created: 2026-04-25
updated: 2026-05-14
version: 1.0.0
author: CieloVista Software
relativepath: docs/_today/CURRENT-STATUS.md
---
# CURRENT-STATUS.md — cielovista-tools

---

## 🅿️ PARKING LOT — end of session 2026-05-24 (issues #467–#477 all closed)

**TASK:** Implement and close all open issues (#467, #468, #469, #470, #477, +earlier #471–#476)
**STATUS:** ✅ Complete — 0 open issues, all 81 regressions green, branch `claude/thirsty-pasteur-39b9cd` ready to merge

**FILES TOUCHED THIS SESSION:**
- `src/features/mcp-viewer/html.ts` — #477 back button + nav-stack; #470 parseFrontmatter dual-position
- `src/features/mcp-viewer/index.ts` — #470 /api/reveal endpoint, path reveal button in markdown preview, updated parseFrontmatter
- `src/features/doc-catalog/html.ts` — #470 card projectPath clickable; #468 ✅ Done button
- `src/features/doc-catalog/catalog.html` — #468 Finished Work section, CSS, JS handlers
- `src/features/doc-catalog/commands.ts` — #468 finish-doc-confirm / restore-finished handlers
- `src/features/doc-catalog/finished.ts` — NEW: #468 FinishedEntry storage
- `src/features/playwright-runner.ts` — #469 live WebviewPanel with streaming output + progress bar
- `src/features/doc-header/feature.ts` — #467 moveToBottom command + dual-position parseFrontmatter
- `package.json` — #467 cvs.headers.moveToBottom command entry

**NEXT STEP:** Merge `claude/thirsty-pasteur-39b9cd` → main from the MAIN project directory, then run `npm run rebuild`
**OPEN QUESTIONS:** None

---

## 🅿️ PARKING LOT — end of session 2026-05-15 (MCP HTTP migration cleanup #390/#392)

**TASK:** Finish MCP HTTP transport migration — remove residual `/api/...` calls, migrate transport tests
**STATUS:** ✅ Complete — #392 closed, duplicate tracker #390 closed, all 75 regressions green, rebuild + install successful

**FILES TOUCHED THIS SESSION:**
- `src/features/mcp-viewer/html.ts` — replaced `fetch(BASE + '/api/list_projects')` and `fetch(BASE + '/api/active_markdown')` with JSON-RPC `POST /mcp` calls
- `tests/unit/mcp-viewer-dropdown-runtime.test.js` — updated mock fetch to `(url, options)` + JSON-RPC payload; changed assertion from URL-based to `method`/`params`-based
- `tests/unit/mcp-viewer-project-link-runtime.test.js` — same as above
- `docs/_today/MCP-HTTP-MIGRATION-PLAN.md` — status updated to complete, cleanup steps 12-15 logged

**COMMITS THIS SESSION:**
- `1d8d345` — fix: #392 MCP HTTP migration cleanup — remove residual /api/ calls, migrate transport tests to JSON-RPC

**ISSUES CLOSED:**
- #390 — MCP HTTP migration cleanup duplicate tracker, closed after verifying work already landed in `1d8d345`
- #392 — MCP HTTP migration cleanup: remove residual /api usage and align tests/docs

**REMAINING OPEN ISSUES:**
- None — `gh issue list --state open` is empty for `CieloVistaSoftware/CIELOVISTA-TOOLS`

**LAST ACTION:** Closed duplicate issue #390 and verified the GitHub open-issue queue is empty
**NEXT STEP:** Reload VS Code window, then choose the next feature or backlog item to start fresh
**OPEN QUESTIONS:** None

---


**TASK:** Fix #374 MCP server crash-respawn loop; bulk-close frontmatter noise issues
**STATUS:** ✅ Complete — #374 closed, REG-054 passing, 8 noise issues bulk-closed

**FILES TOUCHED THIS SESSION:**
- `src/features/mcp-server-status.ts` — added `MAX_RETRY_ATTEMPTS = 10`; `scheduleRetry()` now gives up after 10 failures with a single `logError` and user-readable terminal message; manual `startMcpServer()` resets retry count; retry messages show "attempt N of 10"
- `tests/regression/REG-054-mcp-retry-cap.test.js` — new (6-check source-level regression for the retry cap)

**COMMITS THIS SESSION:**
- `9f4fa4c` — fix: #374 MCP server crash-respawn loop — add retry cap + give-up path

**ISSUES CLOSED:**
- #374 — MCP server lifecycle crashes and crash-respawn loops
- #380 — Documentation Gap: Feature README coverage (already implemented in a4ef685)
- #381–#387 — Frontmatter noise on `.tmp_*`, `_comment-*`, `_close-*` generated files

**REMAINING OPEN ISSUES:**
- #375 — Regression Log Viewer webview with file-as-issue integration (feature)
- #373 — GitHub Issues Viewer polish: dual-fetcher, auto-refresh, copy-all (feature)
- #392 — MCP HTTP migration cleanup: remove residual `/api/...` usage and align tests/docs (enhancement; supersedes remaining tail work from #371)

**LAST ACTION:** Committed 9f4fa4c with retry cap fix + REG-054 passing
**NEXT STEP:** Execute #392 cleanup plan (residual `/api/...` calls + test migration), then proceed with #373 or #375
**OPEN QUESTIONS:** None

---

## 🅿️ PARKING LOT — end of session 2026-05-14 (doc-contract repair + rebuild stabilized)

**TASK:** Unblock rebuild by fixing doc-contract docid failures and stabilizing flaky REG-001 regression gate
**STATUS:** ✅ Complete — full `npm run rebuild` passed end-to-end

**FILES TOUCHED THIS SESSION:**
- `C:\Users\jwpmi\Downloads\VSCode\projects\cielovista-tools\src\features\**\*.md` (37 files) — normalized `docid: auto.*` to `docid: 150.1.*` for feature docs
- `C:\Users\jwpmi\Downloads\VSCode\projects\cielovista-tools\tests\regression\REG-001-extension-activation.test.js` — removed duplicate local TypeScript compile invocation; compile gate now explicitly delegated to REG-003
- `C:\Users\jwpmi\Downloads\VSCode\projects\cielovista-tools\docs\_today\CURRENT-STATUS.md` — parking lot update

**VALIDATION:**
- `node tests/unit/doc-contract.test.ts` → 3151 passed, 0 failed
- `node tests/regression/REG-001-extension-activation.test.js` → passed
- `node scripts/run-regression-tests.js` → all 65 regression tests passed
- `npm run rebuild` → completed successfully through install-verify + package.json validation

**LAST ACTION:** Full rebuild completed with all gates green
**NEXT STEP:** Reload VS Code Insiders window so the newly installed VSIX is active in the UI
**OPEN QUESTIONS:** None

---

## 🅿️ PARKING LOT — end of session 2026-05-14 (issue project-label enforcement)

**TASK:** Ensure all GitHub issues have a `project:*` label and enforce this for newly filed issues
**STATUS:** ✅ Complete — repo issues backfilled and filer now injects project labels by default

**FILES TOUCHED THIS SESSION:**
- `C:\Users\jwpmi\Downloads\VSCode\projects\cielovista-tools\src\shared\github-issue-filer.ts` — added `PROJECT_LABEL` + `withRequiredProjectLabel()` and enforced it in all issue-create paths
- `C:\Users\jwpmi\Downloads\VSCode\projects\cielovista-tools\tests\github-issue-filer.test.js` — added project-label enforcement assertions
- `C:\Users\jwpmi\Downloads\VSCode\projects\cielovista-tools\docs\_today\CURRENT-STATUS.md` — parking lot update

**VALIDATION:**
- `node tests/github-issue-filer.test.js` → 35 passed, 0 failed
- `node tests/regression/REG-018-mcp-lifecycle-and-dedup.test.js` → passed
- GitHub bulk backfill result → `REMAINING_COUNT=0` issues missing `project:*` label

**LAST ACTION:** Ran targeted backfill + code-level enforcement; verified zero issues without `project:*` label
**NEXT STEP:** Continue rebuild pipeline after doc-contract failures are fixed (README `docid` normalization)
**OPEN QUESTIONS:** None

---

## 🅿️ PARKING LOT — end of session 2026-05-13 (async test runner rewrite + issue queue cleared)

**TASK:** Async concurrent test runner rewrite + close all open GitHub issues
**STATUS:** ✅ Complete — 57/57 regression tests passing, zero open issues

**FILES TOUCHED THIS SESSION:**
- `C:\Users\jwpmi\Downloads\VSCode\projects\cielovista-tools\scripts\run-regression-tests.js` — full async rewrite: `Promise.all` concurrent spawning, auto-discovery of all `REG-*.test.js` files, `check/subprocess/command/regressionFile` helpers, REG-008 false-positive fix via `stripTemplateLiterals()` + quote-line skip
- `C:\Users\jwpmi\Downloads\VSCode\projects\cielovista-tools\src\features\doc-catalog\commands.ts` — REG-028 fix: project rows in Rebuild Summary are now clickable (`data-action="open-project-vscode"`)
- `C:\Users\jwpmi\Downloads\VSCode\projects\cielovista-tools\src\features\test-coverage-auditor.ts` — #352 fix: `onDidReceiveMessage` now registered exactly once at panel creation with `context.subscriptions`; buttons no longer silently drop after Refresh
- `C:\Users\jwpmi\Downloads\VSCode\projects\cielovista-tools\tests\regression\REG-034-frontmatter-viewer-fix-workflow.test.js` — strengthened: added `data-fix-id` round-trip assertion, fix-result re-select check, open-issue `data-url` check (8 checks total)
- `C:\Users\jwpmi\Downloads\VSCode\projects\cielovista-tools\tests\regression\REG-039-error-log-active-count.test.js` — created (issue #350 — error log active count pill)
- `C:\Users\jwpmi\Downloads\VSCode\projects\cielovista-tools\tests\regression\REG-040-proper-case-panel-titles.test.js` — created (issue #350 — UI title casing)
- `C:\Users\jwpmi\Downloads\VSCode\projects\cielovista-tools\tests\regression\REG-045-test-coverage-webview-buttons.test.js` — strengthened: added single-registration guard + `context.subscriptions` disposal check (5 checks)

**COMMITS THIS SESSION:**
- `b0481bb` — async test runner rewrite + REG-028/034 fixes
- `8f5094c` — fix #352 Test Coverage Audit buttons (onDidReceiveMessage single registration)
- `8adb63f` — REG-039/040 created for issue #350

**ISSUES CLOSED:**
- #352 — Test Coverage Audit buttons silently dropped after Refresh (onDidReceiveMessage placement bug)
- #353 — FileList Run Test context menu (already implemented — closed)
- #351 — Code Auditor scanning projects (already implemented — closed)
- #354–#365 — Bulk-closed as frontmatter noise on temp/generated files

**LAST ACTION:** Closed #351 (Code Auditor already scanning 19 projects — verified and closed)
**NEXT STEP:** Issue queue is empty — run `npm run rebuild` to verify full pipeline, then start fresh feature work
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
