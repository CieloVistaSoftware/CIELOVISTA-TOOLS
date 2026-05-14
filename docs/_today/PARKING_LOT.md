# PARKING LOT — session 2026-05-14 (npm scripts feature investigation + Issue #372)

**TASK:** Fix npm scripts panel that "has been broken over last 6 fixes" per user red-box alert

**STATUS:** 🔍 [IN PROGRESS] Issue #372 created, REG-053 test created and passing, investigating root cause

**FILES CREATED THIS SESSION:**
- `tests/regression/REG-053-npm-scripts-all-shown.test.js` — New test verifying script classification (2 checks, both passing)
- `docs/_today/CURRENT-STATUS.md` (this file)

**GITHUB ISSUES:**
- Created **Issue #372**: "npm scripts: panel broken — show all scripts, retest"
- Closed **Issue #362**: "temp artifact frontmatter violation" (identified as noise, deferred scanner improvement)
- Completed **Issue #371**: "Migrate MCP Endpoint Viewer from REST to JSON-RPC protocol" (all steps verified complete)

**INVESTIGATION NOTES:**
1. npm-command-launcher.ts wiring is correct (activate, deactivate, command registration all verified)
2. home-page.ts quick-launch button is correctly configured: `cvs.npm.showAndRunScripts` ✓
3. REG-053 classifyScripts() logic test passes (all 20 scripts are classified correctly) ✓
4. REG-053 init message test passes (all 9 scripts present in message payload) ✓
5. **Root cause TBD**: Either collectCards() failing to find packages, or webview rendering issue

**NEXT STEPS:**
1. Create a deep-dive test of collectCards() function to ensure it finds all package.json files
2. Create a full webview integration test that simulates the entire panel opening flow
3. Run full rebuild with REG-053 enabled and check for any failures
4. If still unclear, manually test the npm scripts button in VS Code to see exact failure mode
5. Fix and verify with full rebuild

**LAST ACTION:** Investigated recent commit history; found most recent npm-command-launcher change was stale closure fix (645e980). That fix looks correct. Issue must be in collectCards() or elsewhere.

**OPEN QUESTIONS:**
1. Does collectCards() properly find nested package.json files in monorepos?
2. Are there any race conditions between collectCards() and the webview rendering?
3. Has there been a regression in how scripts are filtered or excluded?
