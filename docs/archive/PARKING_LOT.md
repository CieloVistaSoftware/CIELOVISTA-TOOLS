# PARKING LOT — session 2026-05-14 (npm scripts feature investigation + Issue #372, doc catalog cleanup)

**PRIMARY TASK:** Fix npm scripts panel that "has been broken over last 6 fixes" per user red-box alert
**SECONDARY TASK:** Clean doc catalog by converting *.issue.md files to GitHub issues (per red error overlay)

**STATUS:** 
- ✅ Doc catalog pollution resolved (3 files removed, 3 issues created)
- 🔍 [IN PROGRESS] npm scripts fix: Issue #372 created, REG-053 test created and passing, investigating root cause

**FILES CREATED THIS SESSION:**
- `tests/regression/REG-053-npm-scripts-all-shown.test.js` — New test verifying script classification (2 checks, both passing)
- `tests/regression/REG-053-2-npm-script-collection.test.js` — Deep-dive test for script collection logic

**GITHUB ISSUES:**
- Created **Issue #372**: "npm scripts: panel broken — show all scripts, retest"
- Created **Issue #373**: "giv: Polish GitHub Issues Viewer with dual-fetcher, auto-refresh, copy-all" (from _giv-issue.md)
- Created **Issue #374**: "mcp-server: Fix lifecycle crashes and crash-respawn loops" (from _mcp-lifecycle-issue.md)
- Created **Issue #375**: "feature: Regression Log Viewer webview with file-as-issue integration" (from _reg-log-issue.md)
- Closed **Issue #362**: "temp artifact frontmatter violation" (identified as noise, deferred scanner improvement)
- Completed **Issue #371**: "Migrate MCP Endpoint Viewer from REST to JSON-RPC protocol" (all steps verified complete)

**INVESTIGATION NOTES:**
1. npm-command-launcher.ts wiring is correct (activate, deactivate, command registration all verified)
2. home-page.ts quick-launch button is correctly configured: `cvs.tools.showAndRunScripts` ✓
3. REG-053 classifyScripts() logic test passes (all 20 scripts are classified correctly) ✓
4. REG-053 init message test passes (all 9 scripts present in message payload) ✓
5. **Root cause TBD**: Either collectCards() failing to find packages, or webview rendering issue

**DOC CATALOG CLEANUP (COMPLETED):**
1. ✅ Identified three *.issue.md files polluting the doc catalog per red error overlay
2. ✅ Removed _giv-issue.md → Created Issue #373 with full feature proposal
3. ✅ Removed _mcp-lifecycle-issue.md → Created Issue #374 with crash analysis
4. ✅ Removed _reg-log-issue.md → Created Issue #375 with feature proposal
5. ✅ Committed removal with message: "chore: remove catalog-polluting *.issue.md documentation files"
6. ✅ Cleaned up temporary issue body files and creation scripts

**NEXT STEPS (NPM SCRIPTS FIX):**
1. Create a deep-dive test of collectCards() function to ensure it finds all package.json files ✓ (REG-053-2 created)
2. Run full rebuild with REG-053 enabled and check for any failures
3. If still unclear, manually test the npm scripts button in VS Code to see exact failure mode
4. Fix classifyScripts() to populate moreGroups dict with overflow scripts
5. Update buildCard() to render moreGroups section if scripts exceed visible limit
6. Full rebuild and verify all 61 regression tests pass
7. Manual test of npm scripts panel UI
8. Close Issue #372 with completion evidence

**LAST ACTION:** Created three GitHub issues (#373, #374, #375) from removed *.issue.md files per doc catalog error overlay. Cleaned up workspace. Next: Focus on npm scripts panel fix (Issue #372).

**OPEN QUESTIONS:**
1. Does collectCards() properly find nested package.json files in monorepos?
2. Are there any race conditions between collectCards() and the webview rendering?
3. Has there been a regression in how scripts are filtered or excluded?
