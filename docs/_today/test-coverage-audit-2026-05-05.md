# Test Coverage Audit

**Date:** 2026-05-05 20:40:31
**Project:** cielovista-tools
**Strategy:** Tiered Testing (Tiers 1–5)

> **ℹ️ Coverage Status:** 53 of 54 features have tests.**

## 📊 Summary

| Metric | Count |
|---|---|
| Test Files | 111 |
| Test Cases | 1424 |
| Features Covered | 53/54 |

## 📋 Tier Breakdown

### TIER_1: Static Compliance — ✅ Present

**Description:** Type checking, linting, schema validation, code quality

**Files:** 1 | **Test Cases:** 15

| Test File | Test Cases | Bug Refs |
|---|---|---|
| `launcher-test-coverage.test.js` | 15 | — |

### TIER_2: Unit Tests — ✅ Present

**Description:** Isolated functions, business logic, edge cases

**Files:** 96 | **Test Cases:** 1286

| Test File | Test Cases | Bug Refs |
|---|---|---|
| `broken-refs-mcp.test.js` | 1 | — |
| `catalog-dewey-uniqueness.test.js` | 1 | — |
| `catalog-integrity.test.js` | 17 | — |
| `command-validation.test.js` | 3 | — |
| `dewey-lookup-mcp.test.js` | 1 | — |
| `doc-catalog.add-project.test.js` | 6 | — |
| `doc-catalog.test.js` | 12 | — |
| `error-log-adapter.test.js` | 2 | — |
| `github-issue-filer.test.js` | 2 | — |
| `github-issues-view.test.js` | 3 | — |
| `home-page-prefix-strip.test.js` | 0 | — |
| `home-page-visible-commands.test.js` | 0 | — |
| `home-recent-projects-send-path.test.js` | 0 | — |
| `home-recent-runs-tooltip.test.js` | 0 | — |
| `home-todo-opens-github-issues.test.js` | 0 | — |
| `install-verify.test.js` | 8 | — |
| `launcher-script.test.js` | 21 | — |
| `npm-dewey-uniqueness.test.js` | 0 | — |
| `npm-fix-button.test.js` | 14 | — |
| `npm-send-to-claude.test.js` | 13 | — |
| `package-json-command-descriptions.test.js` | 2 | — |
| `unit\background-health-runner.test.js` | 20 | — |
| `unit\claude-process-monitor.test.js` | 13 | — |
| `unit\code-highlight-audit.pairing.test.js` | 4 | — |
| `unit\codebase-auditor.test.js` | 34 | — |
| `unit\command-renames.test.js` | 14 | — |
| `unit\config-editor.test.js` | 5 | — |
| `unit\copilot-open-suggested-file.test.js` | 8 | — |
| `unit\copilot-rules-enforcer.test.js` | 8 | — |
| `unit\corequisite-checker.test.js` | 8 | — |
| `unit\css-class-hover.test.js` | 15 | — |
| `unit\cvs-command-launcher.test.js` | 8 | — |
| `unit\cvt-registry.test.js` | 17 | — |
| `unit\daily-audit-checks.test.js` | 40 | — |
| `unit\doc-auditor-analyzer.test.js` | 33 | — |
| `unit\doc-auditor-scanner.test.js` | 22 | — |
| `unit\doc-consolidator.test.js` | 37 | — |
| `unit\doc-header-scan.test.js` | 8 | — |
| `unit\doc-header.test.js` | 48 | — |
| `unit\doc-intelligence.test.js` | 8 | — |
| `unit\docs-audit-utils.test.js` | 24 | — |
| `unit\docs-broken-refs.test.js` | 8 | — |
| `unit\docs-manager.test.js` | 8 | — |
| `unit\error-log-utils.test.js` | 26 | — |
| `unit\error-log-viewer.test.js` | 8 | — |
| `unit\error-log.test.js` | 32 | — |
| `unit\explorer-copy-path-to-chat.test.js` | 5 | — |
| `unit\feature-toggle.test.js` | 34 | — |
| `unit\file-list-sort.test.js` | 20 | — |
| `unit\file-list-viewer.test.js` | 8 | — |
| `unit\github-issues-view-ui.test.js` | 14 | — |
| `unit\html-template-downloader.test.js` | 8 | — |
| `unit\image-reader.test.js` | 8 | — |
| `unit\js-error-audit.test.js` | 44 | — |
| `unit\json-copy-to-chat.test.js` | 8 | — |
| `unit\license-sync.test.js` | 21 | — |
| `unit\marketplace-compliance.test.js` | 28 | — |
| `unit\mcp-build.test.js` | 8 | — |
| `unit\mcp-packaging.test.js` | 9 | — |
| `unit\mcp-server-scaffolder.test.js` | 8 | — |
| `unit\mcp-server-status.test.js` | 9 | — |
| `unit\mcp-viewer.test.js` | 8 | — |
| `unit\mcp-vsix-contents.test.js` | 3 | — |
| `unit\npm-command-launcher.test.js` | 8 | — |
| `unit\npm-launcher-types.test.js` | 7 | — |
| `unit\npm-output-shell.test.js` | 8 | — |
| `unit\npm-scripts-cards.test.js` | 2 | — |
| `unit\npm-scripts-runtime.test.js` | 4 | — |
| `unit\npm-start-browser.test.js` | 30 | — |
| `unit\open-folder-as-root.test.js` | 6 | — |
| `unit\openai-chat.test.js` | 8 | — |
| `unit\playwright-check.test.js` | 8 | — |
| `unit\playwright-runner.test.js` | 8 | — |
| `unit\project-home-opener.test.js` | 5 | — |
| `unit\project-launcher.test.js` | 7 | — |
| `unit\python-runner.test.js` | 9 | — |
| `unit\readme-compliance.test.js` | 51 | — |
| `unit\readme-generator.test.js` | 8 | — |
| `unit\registry-promote.test.js` | 8 | — |
| `unit\regression-log-viewer.test.js` | 8 | — |
| `unit\script-runner.test.js` | 8 | — |
| `unit\shared-source.test.js` | 54 | — |
| `unit\terminal-copy-output.test.js` | 13 | — |
| `unit\terminal-folder-tracker.test.js` | 9 | — |
| `unit\terminal-prompt-shortener.test.js` | 7 | — |
| `unit\terminal-set-folder.test.js` | 6 | — |
| `unit\test-coverage-auditor.test.js` | 8 | — |
| `unit\thin-features.test.js` | 40 | — |
| `unit\validate-package-json.test.js` | 16 | — |
| `unit\view-a-doc.test.ts` | 2 | — |
| `unit\webview-utils.test.js` | 67 | — |
| `view-doc-click-opens.test.js` | 12 | — |
| `view-doc-interactions.test.js` | 26 | — |
| `view-doc-search-yellow.test.js` | 19 | — |
| `view-doc-server.test.js` | 2 | — |
| `vscode\suite\activation.test.js` | 7 | — |

### TIER_3: Integration Tests — ✅ Present

**Description:** Module interactions, data flow, API mocks

**Files:** 2 | **Test Cases:** 14

| Test File | Test Cases | Bug Refs |
|---|---|---|
| `test-coverage-commands.integration.test.js` | 12 | — |
| `view-doc-integration.test.js` | 2 | — |

### TIER_4: Functional Tests — ✅ Present

**Description:** User workflows, UI rendering, server responses

**Files:** 3 | **Test Cases:** 24

| Test File | Test Cases | Bug Refs |
|---|---|---|
| `ui\view-doc-ui.test.js` | 3 | — |
| `view-doc-e2e.test.js` | 18 | — |
| `view-doc-functional.test.js` | 3 | — |

### TIER_5: Regression Tests — ✅ Present

**Description:** Specific bug fixes, prevents re-breaking

**Files:** 9 | **Test Cases:** 85

| Test File | Test Cases | Bug Refs |
|---|---|---|
| `regression\REG-001-extension-activation.test.js` | 13 | — |
| `regression\REG-015-package-json-round-trip.test.js` | 3 | — |
| `regression\REG-016-npm-output-webview.test.js` | 7 | — |
| `regression\REG-017-launcher-filter.test.js` | 11 | — |
| `regression\REG-018-mcp-lifecycle-and-dedup.test.js` | 11 | — |
| `regression\REG-019-filelist-feature.test.js` | 15 | — |
| `regression\REG-020-launcher-read-error-visible.test.js` | 7 | — |
| `regression\REG-022-md-renderer-tables.test.js` | 1 | — |
| `three-bugs.test.js` | 17 | — |

## 🎯 Feature Coverage Matrix

| Feature | Tier 1 | Tier 2 | Tier 3 | Tier 4 | Tier 5 |
|---|---|---|---|---|---|
| `background-health-runner` | — | ✅ | — | — | — |
| `claude-process-monitor` | — | ✅ | — | — | — |
| `code-highlight-audit` | — | ✅ | — | — | — |
| `codebase-auditor` | — | ✅ | — | — | — |
| `config-editor` | — | ✅ | — | — | — |
| `copilot-open-suggested-file` | — | ✅ | — | — | — |
| `copilot-rules-enforcer` | — | ✅ | — | — | — |
| `corequisite-checker` | — | ✅ | — | — | — |
| `css-class-hover` | — | ✅ | — | — | — |
| `cvs-command-launcher` | — | ✅ | — | — | — |
| `daily-audit` | — | ✅ | — | — | — |
| `doc-auditor` | — | ✅ | — | — | — |
| `doc-catalog` | — | ✅ | — | — | — |
| `doc-consolidator` | — | ✅ | — | — | — |
| `doc-header` | — | ✅ | — | — | — |
| `doc-header-scan` | — | ✅ | — | — | — |
| `doc-intelligence` | — | ✅ | — | — | — |
| `docs-broken-refs` | — | ✅ | — | — | — |
| `docs-manager` | — | ✅ | — | — | — |
| `error-log-viewer` | — | ✅ | — | — | — |
| `explorer-copy-path-to-chat` | — | ✅ | — | — | — |
| `feature-toggle` | — | ✅ | — | — | — |
| `file-list-viewer` | — | ✅ | — | — | — |
| `home-page` | — | ✅ | — | — | — |
| `html-template-downloader` | — | ✅ | — | — | — |
| `image-reader` | — | ✅ | — | — | — |
| `js-error-audit` | — | ✅ | — | — | — |
| `json-copy-to-chat` | — | ✅ | — | — | — |
| `license-sync` | — | ✅ | — | — | — |
| `marketplace-compliance` | — | ✅ | — | — | — |
| `mcp-build` | — | ✅ | — | — | — |
| `mcp-server-scaffolder` | — | ✅ | — | — | — |
| `mcp-server-status` | — | ✅ | — | — | — |
| `mcp-viewer` | — | ✅ | — | — | — |
| `npm-command-launcher` | — | ✅ | — | — | — |
| `npm-launcher-types` | — | ✅ | — | — | — |
| `open-folder-as-root` | — | ✅ | — | — | — |
| `openai-chat` | — | ✅ | — | — | — |
| `playwright-check` | — | ✅ | — | — | — |
| `playwright-runner` | — | ✅ | — | — | — |
| `project-home-opener` | — | ✅ | — | — | — |
| `project-launcher` | — | ✅ | — | — | — |
| `python-runner` | — | ✅ | — | — | — |
| `readme-compliance` | — | ✅ | — | — | — |
| `readme-compliance` | — | ✅ | — | — | — |
| `readme-generator` | — | ✅ | — | — | — |
| `registry-promote` | — | ✅ | — | — | — |
| `regression-log-viewer` | — | ✅ | — | — | — |
| `script-runner` | — | ✅ | — | — | — |
| `terminal-copy-output` | — | ✅ | — | — | — |
| `terminal-folder-tracker` | — | ✅ | — | — | — |
| `terminal-prompt-shortener` | — | ✅ | — | — | — |
| `terminal-set-folder` | — | ✅ | — | — | — |
| `test-coverage-auditor` | — | ✅ | — | — | — |

## ⚠️ Coverage Gaps

---

**Generated:** 2026-05-05T01:40:31.756Z
**Command:** `node scripts/audit-test-coverage.js`
