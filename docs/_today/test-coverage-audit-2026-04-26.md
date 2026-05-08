---
docid: 150.3
dewey: 150.3
id: test-coverage-audit
title: Test Coverage Audit
project: cielovista-tools
description: Date: 2026-04-26 18:03:59 Project: cielovista-tools Strategy: Tiered Testing (Tiers 1–5)
status: active
tags: [test, coverage, audit]
category: 150.3 — Testing
created: 2026-04-26
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
relativepath: docs/_today/test-coverage-audit-2026-04-26.md
---
# Test Coverage Audit

**Date:** 2026-04-26 18:03:59
**Project:** cielovista-tools
**Strategy:** Tiered Testing (Tiers 1–5)

> **⚠️ Low Coverage:** Only 16 of 51 features have tests.**

> **💡 Actionable Recommendations:**
> - [ ] **High Priority:** Coverage is < 50%. Prioritize adding Tier 2 (unit) tests for each feature.

## 📊 Summary

| Metric | Count |
|---|---|
| Test Files | 62 |
| Test Cases | 1018 |
| Features Covered | 16/51 |

## 📋 Tier Breakdown

### TIER_1: Static Compliance — ✅ Present

**Description:** Type checking, linting, schema validation, code quality

**Files:** 1 | **Test Cases:** 15

| Test File | Test Cases | Bug Refs |
|---|---|---|
| `launcher-test-coverage.test.js` | 15 | — |

### TIER_2: Unit Tests — ✅ Present

**Description:** Isolated functions, business logic, edge cases

**Files:** 54 | **Test Cases:** 935

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
| `github-issues-view.test.js` | 2 | — |
| `home-page-prefix-strip.test.js` | 0 | — |
| `home-page-visible-commands.test.js` | 0 | — |
| `home-recent-projects-send-path.test.js` | 0 | — |
| `home-recent-runs-tooltip.test.js` | 0 | — |
| `install-verify.test.js` | 8 | — |
| `launcher-script.test.js` | 21 | — |
| `npm-dewey-uniqueness.test.js` | 0 | — |
| `npm-fix-button.test.js` | 14 | — |
| `npm-send-to-claude.test.js` | 13 | — |
| `package-json-command-descriptions.test.js` | 2 | — |
| `unit\background-health-runner.test.js` | 20 | — |
| `unit\code-highlight-audit.pairing.test.js` | 4 | — |
| `unit\codebase-auditor.test.js` | 34 | — |
| `unit\command-renames.test.js` | 14 | — |
| `unit\css-class-hover.test.js` | 15 | — |
| `unit\cvt-registry.test.js` | 17 | — |
| `unit\daily-audit-checks.test.js` | 40 | — |
| `unit\doc-auditor-analyzer.test.js` | 33 | — |
| `unit\doc-auditor-scanner.test.js` | 22 | — |
| `unit\doc-consolidator.test.js` | 37 | — |
| `unit\doc-header.test.js` | 48 | — |
| `unit\docs-audit-utils.test.js` | 24 | — |
| `unit\error-log-utils.test.js` | 26 | — |
| `unit\error-log.test.js` | 32 | — |
| `unit\feature-toggle.test.js` | 34 | — |
| `unit\js-error-audit.test.js` | 44 | — |
| `unit\license-sync.test.js` | 21 | — |
| `unit\marketplace-compliance.test.js` | 28 | — |
| `unit\mcp-packaging.test.js` | 9 | — |
| `unit\mcp-server-status.test.js` | 9 | — |
| `unit\mcp-vsix-contents.test.js` | 3 | — |
| `unit\npm-scripts-cards.test.js` | 2 | — |
| `unit\npm-scripts-runtime.test.js` | 4 | — |
| `unit\npm-start-browser.test.js` | 30 | — |
| `unit\readme-compliance.test.js` | 51 | — |
| `unit\shared-source.test.js` | 54 | — |
| `unit\thin-features.test.js` | 40 | — |
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

**Files:** 2 | **Test Cases:** 30

| Test File | Test Cases | Bug Refs |
|---|---|---|
| `regression\REG-001-extension-activation.test.js` | 13 | — |
| `three-bugs.test.js` | 17 | — |

## 🎯 Feature Coverage Matrix

| Feature | Tier 1 | Tier 2 | Tier 3 | Tier 4 | Tier 5 |
|---|---|---|---|---|---|
| `background-health-runner` | — | ✅ | — | — | — |
| `claude-process-monitor` | — | — | — | — | — |
| `code-highlight-audit` | — | ✅ | — | — | — |
| `codebase-auditor` | — | ✅ | — | — | — |
| `config-editor` | — | — | — | — | — |
| `copilot-open-suggested-file` | — | — | — | — | — |
| `copilot-rules-enforcer` | — | — | — | — | — |
| `css-class-hover` | — | ✅ | — | — | — |
| `cvs-command-launcher` | — | — | — | — | — |
| `cvs-command-launcher` | — | — | — | — | — |
| `daily-audit` | — | ✅ | — | — | — |
| `doc-auditor` | — | ✅ | — | — | — |
| `doc-catalog` | — | ✅ | — | — | — |
| `doc-consolidator` | — | ✅ | — | — | — |
| `doc-header-scan` | — | — | — | — | — |
| `doc-header` | — | ✅ | — | — | — |
| `doc-intelligence` | — | — | — | — | — |
| `docs-broken-refs` | — | — | — | — | — |
| `docs-manager` | — | — | — | — | — |
| `error-log-viewer` | — | — | — | — | — |
| `explorer-copy-path-to-chat` | — | — | — | — | — |
| `feature-toggle` | — | ✅ | — | — | — |
| `home-page` | — | ✅ | — | — | — |
| `html-template-downloader` | — | — | — | — | — |
| `image-reader` | — | — | — | — | — |
| `js-error-audit` | — | ✅ | — | — | — |
| `license-sync` | — | ✅ | — | — | — |
| `marketplace-compliance` | — | ✅ | — | — | — |
| `mcp-build` | — | — | — | — | — |
| `mcp-server-scaffolder` | — | — | — | — | — |
| `mcp-server-status` | — | ✅ | — | — | — |
| `mcp-viewer` | — | — | — | — | — |
| `npm-command-launcher` | — | — | — | — | — |
| `npm-launcher-types` | — | — | — | — | — |
| `open-folder-as-root` | — | — | — | — | — |
| `openai-chat` | — | — | — | — | — |
| `playwright-check` | — | — | — | — | — |
| `playwright-runner` | — | — | — | — | — |
| `project-home-opener` | — | — | — | — | — |
| `project-launcher` | — | — | — | — | — |
| `python-runner` | — | — | — | — | — |
| `readme-compliance` | — | ✅ | — | — | — |
| `readme-generator` | — | — | — | — | — |
| `registry-promote` | — | — | — | — | — |
| `regression-log-viewer` | — | — | — | — | — |
| `script-runner` | — | — | — | — | — |
| `terminal-copy-output` | — | — | — | — | — |
| `terminal-folder-tracker` | — | — | — | — | — |
| `terminal-prompt-shortener` | — | — | — | — | — |
| `terminal-set-folder` | — | — | — | — | — |
| `test-coverage-auditor` | — | — | — | — | — |

## ⚠️ Coverage Gaps

### Features Without Unit Tests (Tier 2)

- `claude-process-monitor` — features\claude-process-monitor.ts
- `config-editor` — features\config-editor.ts
- `copilot-open-suggested-file` — features\copilot-open-suggested-file.ts
- `copilot-rules-enforcer` — features\copilot-rules-enforcer.ts
- `cvs-command-launcher` — features\cvs-command-launcher\index.ts
- `cvs-command-launcher` — features\cvs-command-launcher.ts
- `doc-header-scan` — features\doc-header-scan.ts
- `doc-intelligence` — features\doc-intelligence\index.ts
- `docs-broken-refs` — features\docs-broken-refs.ts
- `docs-manager` — features\docs-manager.ts
- `error-log-viewer` — features\error-log-viewer.ts
- `explorer-copy-path-to-chat` — features\explorer-copy-path-to-chat.ts
- `html-template-downloader` — features\html-template-downloader.ts
- `image-reader` — features\image-reader.ts
- `mcp-build` — features\mcp-build.ts
- `mcp-server-scaffolder` — features\mcp-server-scaffolder.ts
- `mcp-viewer` — features\mcp-viewer\index.ts
- `npm-command-launcher` — features\npm-command-launcher.ts
- `npm-launcher-types` — features\npm-launcher-types.ts
- `open-folder-as-root` — features\open-folder-as-root.ts
- `openai-chat` — features\openai-chat.ts
- `playwright-check` — features\playwright-check.ts
- `playwright-runner` — features\playwright-runner.ts
- `project-home-opener` — features\project-home-opener.ts
- `project-launcher` — features\project-launcher.ts
- `python-runner` — features\python-runner.ts
- `readme-generator` — features\readme-generator.ts
- `registry-promote` — features\registry-promote.ts
- `regression-log-viewer` — features\regression-log-viewer.ts
- `script-runner` — features\script-runner.ts
- `terminal-copy-output` — features\terminal-copy-output.ts
- `terminal-folder-tracker` — features\terminal-folder-tracker.ts
- `terminal-prompt-shortener` — features\terminal-prompt-shortener.ts
- `terminal-set-folder` — features\terminal-set-folder.ts
- `test-coverage-auditor` — features\test-coverage-auditor.ts

---

**Generated:** 2026-04-26T23:03:59.281Z
**Command:** `node scripts/audit-test-coverage.js`
