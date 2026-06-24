# Test Coverage Audit

**Date:** 2026-06-16 19:55:43
**Project:** cielovista-tools
**Strategy:** Tiered Testing (Tiers 1–5)

> **ℹ️ Coverage Status:** 58 of 62 features have tests.**

## 📊 Summary

| Metric | Count |
|---|---|
| Test Files | 233 |
| Test Cases | 2173 |
| Features Covered | 58/62 |

## 📋 Tier Breakdown

### TIER_1: Static Compliance — ✅ Present

**Description:** Type checking, linting, schema validation, code quality

**Files:** 1 | **Test Cases:** 15

| Test File | Test Cases | Bug Refs |
|---|---|---|
| `launcher-test-coverage.test.js` | 15 | — |

### TIER_2: Unit Tests — ✅ Present

**Description:** Isolated functions, business logic, edge cases

**Files:** 118 | **Test Cases:** 1566

| Test File | Test Cases | Bug Refs |
|---|---|---|
| `broken-refs-mcp.test.js` | 1 | — |
| `catalog-dewey-uniqueness.test.js` | 3 | — |
| `catalog-integrity.test.js` | 18 | — |
| `command-validation.test.js` | 4 | — |
| `dewey-lookup-mcp.test.js` | 1 | — |
| `doc-catalog.add-project.test.js` | 6 | — |
| `doc-catalog.archive.test.js` | 24 | — |
| `doc-catalog.test.js` | 13 | — |
| `error-log-adapter.test.js` | 2 | — |
| `github-issue-filer.test.js` | 1 | — |
| `github-issues-view.test.js` | 2 | — |
| `home-page-prefix-strip.test.js` | 0 | — |
| `home-page-visible-commands.test.js` | 0 | — |
| `home-recent-projects-send-path.test.js` | 0 | — |
| `home-recent-runs-tooltip.test.js` | 0 | — |
| `home-todo-opens-github-issues.test.js` | 0 | — |
| `install-verify.test.js` | 10 | — |
| `launcher-script.test.js` | 21 | — |
| `npm-dewey-uniqueness.test.js` | 0 | — |
| `package-json-command-descriptions.test.js` | 2 | — |
| `unit\background-health-runner.test.js` | 20 | — |
| `unit\claude-notifier.test.js` | 18 | — |
| `unit\claude-process-monitor.test.js` | 13 | — |
| `unit\code-highlight-audit.pairing.test.js` | 8 | — |
| `unit\codebase-auditor.test.js` | 36 | — |
| `unit\command-renames.test.js` | 14 | — |
| `unit\config-editor.test.js` | 5 | — |
| `unit\copilot-open-suggested-file.test.js` | 8 | — |
| `unit\copilot-rules-enforcer.test.js` | 8 | — |
| `unit\corequisite-checker.test.js` | 10 | — |
| `unit\css-class-hover.test.js` | 15 | — |
| `unit\cvs-command-launcher.test.js` | 8 | — |
| `unit\cvt-registry.test.js` | 17 | — |
| `unit\daily-audit-checks.test.js` | 40 | — |
| `unit\daily-audit-progress-guard.test.js` | 19 | — |
| `unit\daily-audit-progress.test.js` | 3 | — |
| `unit\daily-audit-runner.test.js` | 7 | — |
| `unit\daily-audit.test.js` | 8 | — |
| `unit\doc-auditor-analyzer.test.js` | 33 | — |
| `unit\doc-auditor-duplicates.test.js` | 12 | — |
| `unit\doc-auditor-html.test.js` | 13 | — |
| `unit\doc-auditor-scanner.test.js` | 23 | — |
| `unit\doc-catalog-back-and-wrap.test.js` | 0 | — |
| `unit\doc-catalog-preview-restore-state.test.js` | 0 | — |
| `unit\doc-catalog-run-button.test.js` | 3 | — |
| `unit\doc-consolidator.test.js` | 37 | — |
| `unit\doc-contract.test.ts` | 11 | — |
| `unit\doc-header-scan.test.js` | 8 | — |
| `unit\doc-header.test.js` | 48 | — |
| `unit\doc-intelligence-analyzer.test.js` | 8 | — |
| `unit\doc-intelligence.test.js` | 8 | — |
| `unit\doc-preview-toolbar.test.js` | 11 | — |
| `unit\docs-audit-utils.test.js` | 24 | — |
| `unit\docs-broken-refs.test.js` | 8 | — |
| `unit\docs-manager.test.js` | 8 | — |
| `unit\error-log-utils.test.js` | 26 | — |
| `unit\error-log-viewer.test.js` | 7 | — |
| `unit\error-log.test.js` | 32 | — |
| `unit\explorer-copy-path-to-chat.test.js` | 5 | — |
| `unit\feature-toggle.test.js` | 34 | — |
| `unit\file-list-sort.test.js` | 20 | — |
| `unit\file-list-viewer-webview.test.js` | 25 | — |
| `unit\file-list-viewer.test.js` | 8 | — |
| `unit\frontmatter-header.test.js` | 29 | — |
| `unit\github-issues-view-ui.test.js` | 19 | — |
| `unit\html-template-downloader.test.js` | 8 | — |
| `unit\image-reader.test.js` | 8 | — |
| `unit\interactive-result-chat-button.test.js` | 0 | — |
| `unit\job-status-reader.test.js` | 3 | — |
| `unit\js-error-audit.test.js` | 44 | — |
| `unit\json-copy-to-chat.test.js` | 8 | — |
| `unit\license-sync.test.js` | 21 | — |
| `unit\marketplace-compliance.test.js` | 28 | — |
| `unit\mcp-build.test.js` | 8 | — |
| `unit\mcp-markdown-preview-back.test.js` | 0 | — |
| `unit\mcp-packaging.test.js` | 13 | — |
| `unit\mcp-server-scaffolder.test.js` | 8 | — |
| `unit\mcp-server-status.test.js` | 9 | — |
| `unit\mcp-viewer-dropdown-runtime.test.js` | 1 | — |
| `unit\mcp-viewer-path-links.test.js` | 11 | — |
| `unit\mcp-viewer-project-link-runtime.test.js` | 1 | — |
| `unit\mcp-viewer-routes.test.js` | 0 | — |
| `unit\mcp-viewer-runtime-script.test.js` | 0 | — |
| `unit\mcp-viewer.test.js` | 44 | — |
| `unit\mcp-vsix-contents.test.js` | 3 | — |
| `unit\md-preview-no-cdn.test.js` | 9 | — |
| `unit\open-folder-as-root.test.js` | 6 | — |
| `unit\openai-chat.test.js` | 8 | — |
| `unit\pick-list.test.js` | 17 | — |
| `unit\playwright-check.test.js` | 6 | — |
| `unit\playwright-runner.test.js` | 8 | — |
| `unit\post-install.test.js` | 19 | — |
| `unit\project-home-opener.test.js` | 5 | — |
| `unit\project-launcher.test.js` | 7 | — |
| `unit\python-runner.test.js` | 9 | — |
| `unit\readme-compliance.test.js` | 51 | — |
| `unit\readme-generator.test.js` | 8 | — |
| `unit\registry-promote.test.js` | 8 | — |
| `unit\regression-log-viewer.test.js` | 8 | — |
| `unit\runtime-assets.test.js` | 19 | — |
| `unit\script-runner.test.js` | 8 | — |
| `unit\shared-source.test.js` | 54 | — |
| `unit\terminal-copy-output.test.js` | 13 | — |
| `unit\terminal-folder-tracker.test.js` | 9 | — |
| `unit\terminal-prompt-shortener.test.js` | 7 | — |
| `unit\terminal-set-folder.test.js` | 6 | — |
| `unit\test-coverage-auditor.test.js` | 27 | — |
| `unit\thin-features.test.js` | 40 | — |
| `unit\validate-package-json.test.js` | 16 | — |
| `unit\view-a-doc.test.ts` | 16 | — |
| `unit\webview-utils.test.js` | 67 | — |
| `view-doc-click-opens.test.js` | 12 | — |
| `view-doc-interactions.test.js` | 16 | — |
| `view-doc-search-yellow.test.js` | 12 | — |
| `view-doc-server.test.js` | 2 | — |
| `view-doc-toolbar.test.js` | 20 | — |
| `vscode\suite\activation.test.js` | 7 | — |
| `vscode\suite\home-filelist-gui.test.js` | 3 | — |

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

**Files:** 109 | **Test Cases:** 554

| Test File | Test Cases | Bug Refs |
|---|---|---|
| `regression\REG-001-extension-activation.test.js` | 12 | — |
| `regression\REG-015-package-json-round-trip.test.js` | 3 | — |
| `regression\REG-017-launcher-filter.test.js` | 14 | — |
| `regression\REG-018-mcp-lifecycle-and-dedup.test.js` | 11 | — |
| `regression\REG-019-filelist-feature.test.js` | 14 | — |
| `regression\REG-020-launcher-read-error-visible.test.js` | 7 | — |
| `regression\REG-021-issue-view-empty-state-filter.test.js` | 5 | — |
| `regression\REG-022-md-renderer-tables.test.js` | 1 | — |
| `regression\REG-023-doc-placeholder-guardrail.test.js` | 3 | — |
| `regression\REG-024-daily-audit-excluded.test.js` | 11 | — |
| `regression\REG-027-doc-catalog-no-collisions.test.js` | 8 | — |
| `regression\REG-028-catalog-open-folder-actions.test.js` | 7 | — |
| `regression\REG-029-catalog-folder-button.test.js` | 8 | — |
| `regression\REG-029-readme-compliance-pill-filters.test.js` | 7 | — |
| `regression\REG-030-readme-compliance-smart-fixer.test.js` | 30 | — |
| `regression\REG-031-catalog-dewey-badges-clickable.test.js` | 12 | — |
| `regression\REG-031-doc-catalog-card-path-link.test.js` | 7 | — |
| `regression\REG-032-broken-refs-progressive-scan.test.js` | 9 | — |
| `regression\REG-032-frontmatter-viewer-clickable.test.js` | 12 | — |
| `regression\REG-033-no-dewey-field-in-src-docs.test.js` | 8 | — |
| `regression\REG-033-readme-compliance-ai-todo-fill.test.js` | 8 | — |
| `regression\REG-034-frontmatter-viewer-fix-workflow.test.js` | 11 | — |
| `regression\REG-034-readme-compliance-batch-fix-and-fill-todos.test.js` | 11 | — |
| `regression\REG-035-frontmatter-viewer-rescan.test.js` | 6 | — |
| `regression\REG-035-mcp-viewer-catalog-filter.test.js` | 9 | — |
| `regression\REG-036-github-comment-no-escaped-newlines.test.js` | 10 | — |
| `regression\REG-036-launcher-direct-panel-no-result-pane.test.js` | 7 | — |
| `regression\REG-037-error-log-no-duplicate-pane.test.js` | 8 | — |
| `regression\REG-037-error-log-refresh-button.test.js` | 6 | — |
| `regression\REG-038-error-log-refresh-button.test.js` | 8 | — |
| `regression\REG-038-error-log-unresolved-count.test.js` | 7 | — |
| `regression\REG-039-doc-audit-table-copy-controls.test.js` | 7 | — |
| `regression\REG-039-error-log-active-count.test.js` | 8 | — |
| `regression\REG-040-issue-closure-and-comment-formatting-gate.test.js` | 6 | — |
| `regression\REG-040-proper-case-panel-titles.test.js` | 7 | — |
| `regression\REG-041-launcher-title-casing.test.js` | 6 | — |
| `regression\REG-042-launcher-status-field-and-error-log-routing.test.js` | 7 | — |
| `regression\REG-043-doc-audit-non-blocking.test.js` | 7 | — |
| `regression\REG-044-code-auditor-duplication-surface.test.js` | 7 | — |
| `regression\REG-045-test-coverage-webview-buttons.test.js` | 15 | — |
| `regression\REG-046-demo-localhost-recovery.test.js` | 9 | — |
| `regression\REG-046-filelist-run-test-context-menu.test.js` | 5 | — |
| `regression\REG-047-frontmatter-viewer-rescan-preserves-filed-issues.test.js` | 1 | — |
| `regression\REG-048-frontmatter-fix-all-no-new-issues.test.js` | 1 | — |
| `regression\REG-049-filelist-webview-basic-render.test.js` | 1 | — |
| `regression\REG-050-doc-catalog-ready-race.test.js` | 9 | — |
| `regression\REG-050-filelist-multiselect-and-path-tooltip.test.js` | 8 | — |
| `regression\REG-054-home-filelist-click.test.js` | 10 | — |
| `regression\REG-054-mcp-retry-cap.test.js` | 11 | — |
| `regression\REG-055-filelist-initial-rows-folder-click.test.js` | 1 | — |
| `regression\REG-056-filelist-default-viewers.test.js` | 1 | — |
| `regression\REG-057-filelist-special-file-actions.test.js` | 1 | — |
| `regression\REG-058-filelist-folder-open-fallback.test.js` | 1 | — |
| `regression\REG-059-filelist-explorer-context-menu.test.js` | 1 | — |
| `regression\REG-059-github-issues-view-dual-fetcher.test.js` | 3 | — |
| `regression\REG-060-regression-log-viewer-acceptance.test.js` | 2 | — |
| `regression\REG-061-open-folder-as-root-uri-fallback.test.js` | 2 | — |
| `regression\REG-062-filelist-navigate-to-preserves-folder.test.js` | 2 | — |
| `regression\REG-063-mcp-viewer-json-rpc-runtime.test.js` | 1 | — |
| `regression\REG-064-filelist-open-panel-navigate-refresh.test.js` | 2 | — |
| `regression\REG-065-filelist-activate-idempotent.test.js` | 2 | — |
| `regression\REG-066-filelist-click-behavior-by-filetype.test.js` | 1 | — |
| `regression\REG-066-frontmatter-scan-scope-excludes-foreign-artifacts.test.js` | 3 | — |
| `regression\REG-067-doc-catalog-current-project-default.test.js` | 8 | — |
| `regression\REG-069-filelist-run-js-uses-node-not-code-exe.test.js` | 8 | — |
| `regression\REG-070-issue-viewer-commands-registered.test.js` | 0 | — |
| `regression\REG-071-fix-bugs-create-issue-handler-registered-once.test.js` | 7 | — |
| `regression\REG-072-view-archived-docs-button-routes-correctly.test.js` | 1 | — |
| `regression\REG-073-issue-view-state-buttons.test.js` | 3 | — |
| `regression\REG-074-mcp-server-http-build.test.js` | 0 | — |
| `regression\REG-076-running-tasks-kill-selected-functional.test.js` | 3 | — |
| `regression\REG-077-audit-coverage-script-bundled.test.js` | 1 | — |
| `regression\REG-078-vscode-test-npm-exclude.test.js` | 1 | — |
| `regression\REG-079-filelist-debug-commands-registered.test.js` | 2 | — |
| `regression\REG-080-debug-logging-setting.test.js` | 4 | — |
| `regression\REG-081-background-health-no-home-page-spec.test.js` | 2 | — |
| `regression\REG-082-openai-refactor-prompt-content.test.js` | 1 | — |
| `regression\REG-083-activation-test-runner-config.test.js` | 1 | — |
| `regression\REG-084-all-cards-webview-spec.test.js` | 2 | — |
| `regression\REG-085-issues-status-column.test.js` | 1 | — |
| `regression\REG-086-vscode-suite-excludes-gui.test.js` | 1 | — |
| `regression\REG-087-npm-scripts-tree-excludes-vscode-test.test.js` | 1 | — |
| `regression\REG-088-command-registry.test.js` | 1 | — |
| `regression\REG-089-component-registry-viewer.test.js` | 1 | — |
| `regression\REG-090-bg-health-runner-output-format.test.js` | 0 | — |
| `regression\REG-091-runtime-scripts-bundled.test.js` | 2 | — |
| `regression\REG-092-launch-commands-not-in-palette.test.js` | 0 | — |
| `regression\REG-092-launcher-status-persists-from-history.test.js` | 8 | — |
| `regression\REG-093-header-scan-position-check.test.js` | 3 | — |
| `regression\REG-094-npm-scripts-run-btn-tooltip.test.js` | 1 | — |
| `regression\REG-095-terminal-exit-monitoring.test.js` | 1 | — |
| `regression\REG-096-reveal-in-filelist.test.js` | 1 | — |
| `regression\REG-097-feature-toggle-acquire-api.test.js` | 1 | — |
| `regression\REG-098-playwright-runner-paths.test.js` | 1 | — |
| `regression\REG-099-clean-artifacts-no-stale-targets.test.js` | 1 | — |
| `regression\REG-100-link-integrity-checker.test.js` | 1 | — |
| `regression\REG-101-command-validator.test.js` | 1 | — |
| `regression\REG-102-worktree-cleaner-root.test.js` | 1 | — |
| `regression\REG-103-filelist-search.test.js` | 1 | — |
| `regression\REG-104-code-highlight-audit-scanner.test.js` | 1 | — |
| `regression\REG-105-launcher-panel-context.test.js` | 1 | — |
| `regression\REG-106-tags-enrichment-and-shared-categories.test.js` | 2 | — |
| `regression\REG-107-bg-health-runner-schedule-after-close.test.js` | 7 | — |
| `regression\REG-108-no-duplicate-command-ids.test.js` | 7 | — |
| `regression\REG-109-issue-viewer-no-project-label-in-status.test.js` | 3 | — |
| `regression\REG-110-viewer-md-links-open-beside.test.js` | 2 | — |
| `regression\REG-111-md-frontmatter-at-bottom.test.js` | 4 | — |
| `regression\REG-112-issue-viewer-current-job.test.js` | 9 | — |
| `three-bugs.test.js` | 18 | — |

## 🎯 Feature Coverage Matrix

| Feature | Tier 1 | Tier 2 | Tier 3 | Tier 4 | Tier 5 |
|---|---|---|---|---|---|
| `background-health-runner` | — | ✅ | — | — | — |
| `claude-process-monitor` | — | ✅ | — | — | — |
| `code-auditor` | — | — | — | — | ✅ |
| `code-highlight-audit` | — | ✅ | — | — | ✅ |
| `codebase-auditor` | — | ✅ | — | — | — |
| `command-registry-viewer` | — | — | — | — | — |
| `command-validator` | — | — | — | — | ✅ |
| `config-editor` | — | ✅ | — | — | — |
| `copilot-open-suggested-file` | — | ✅ | — | — | — |
| `copilot-rules-enforcer` | — | ✅ | — | — | — |
| `corequisite-checker` | — | ✅ | — | — | — |
| `css-class-hover` | — | ✅ | — | — | — |
| `cvs-command-launcher` | — | ✅ | — | — | — |
| `daily-audit` | — | ✅ | — | — | ✅ |
| `disk-cleanup-dashboard` | — | — | — | — | — |
| `doc-auditor` | — | ✅ | — | — | — |
| `doc-catalog` | — | ✅ | — | — | ✅ |
| `doc-consolidator` | — | ✅ | — | — | — |
| `doc-header` | — | ✅ | — | — | — |
| `doc-header-scan` | — | ✅ | — | — | — |
| `doc-intelligence` | — | ✅ | — | — | — |
| `docs-broken-refs` | — | ✅ | — | — | — |
| `docs-manager` | — | ✅ | — | — | — |
| `error-log-viewer` | — | ✅ | — | — | — |
| `explorer-copy-path-to-chat` | — | ✅ | — | — | — |
| `feature-toggle` | — | ✅ | — | — | ✅ |
| `file-list-viewer` | — | ✅ | — | — | — |
| `frontmatter-viewer` | — | — | — | — | ✅ |
| `home-page` | — | ✅ | — | — | ✅ |
| `html-template-downloader` | — | ✅ | — | — | — |
| `image-reader` | — | ✅ | — | — | — |
| `js-error-audit` | — | ✅ | — | — | — |
| `json-copy-to-chat` | — | ✅ | — | — | — |
| `license-sync` | — | ✅ | — | — | — |
| `link-integrity-checker` | — | — | — | — | ✅ |
| `marketplace-compliance` | — | ✅ | — | — | — |
| `mcp-build` | — | ✅ | — | — | — |
| `mcp-server-scaffolder` | — | ✅ | — | — | — |
| `mcp-server-status` | — | ✅ | — | — | — |
| `mcp-viewer` | — | ✅ | — | — | ✅ |
| `notify-server` | — | — | — | — | — |
| `npm-scripts-tree` | — | — | — | — | ✅ |
| `open-folder-as-root` | — | ✅ | — | — | ✅ |
| `openai-chat` | — | ✅ | — | — | — |
| `playwright-check` | — | ✅ | — | — | — |
| `playwright-runner` | — | ✅ | — | — | ✅ |
| `project-home-opener` | — | ✅ | — | — | — |
| `python-runner` | — | ✅ | — | — | — |
| `readme-compliance` | — | ✅ | — | — | ✅ |
| `readme-compliance` | — | ✅ | — | — | ✅ |
| `readme-generator` | — | ✅ | — | — | — |
| `registry-promote` | — | ✅ | — | — | — |
| `regression-log-viewer` | — | ✅ | — | — | ✅ |
| `running-tasks` | — | — | — | — | ✅ |
| `script-runner` | — | ✅ | — | — | — |
| `tags-enrichment` | — | — | — | — | ✅ |
| `terminal-copy-output` | — | ✅ | — | — | — |
| `terminal-folder-tracker` | — | ✅ | — | — | — |
| `terminal-prompt-shortener` | — | ✅ | — | — | — |
| `terminal-set-folder` | — | ✅ | — | — | — |
| `test-coverage-auditor` | — | ✅ | — | — | — |
| `worktree-cleaner` | — | — | — | — | ✅ |

## ⚠️ Coverage Gaps

### Features Without Unit Tests (Tier 2)

- `code-auditor` — features\code-auditor.ts
- `command-registry-viewer` — features\command-registry-viewer.ts
- `command-validator` — features\command-validator.ts
- `disk-cleanup-dashboard` — features\disk-cleanup-dashboard.ts
- `frontmatter-viewer` — features\frontmatter-viewer.ts
- `link-integrity-checker` — features\link-integrity-checker.ts
- `notify-server` — features\notify-server.ts
- `npm-scripts-tree` — features\npm-scripts-tree.ts
- `running-tasks` — features\running-tasks.ts
- `tags-enrichment` — features\tags-enrichment.ts
- `worktree-cleaner` — features\worktree-cleaner.ts

---

**Generated:** 2026-06-16T00:55:43.981Z
**Command:** `node scripts/audit-test-coverage.js`
