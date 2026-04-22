# Test Coverage Audit

**Date:** 2026-03-31 11:57:20
**Project:** cielovista-tools
**Strategy:** Tiered Testing (Tiers 1–5)

> **⚠️ Low Coverage:** Only 14 of 43 features have tests.**

> **💡 Actionable Recommendations:**
> - [ ] **High Priority:** Coverage is < 50%. Prioritize adding Tier 2 (unit) tests for each feature.

## 📊 Summary

| Metric | Count |
|---|---|
| Test Files | 38 |
| Test Cases | 911 |
| Features Covered | 14/43 |

## 📋 Tier Breakdown

### TIER_1: Static Compliance — ✅ Present

**Description:** Type checking, linting, schema validation, code quality

**Files:** 1 | **Test Cases:** 15

| Test File | Test Cases | Bug Refs |
|---|---|---|
| `launcher-test-coverage.test.js` | 15 | — |

### TIER_2: Unit Tests — ✅ Present

**Description:** Isolated functions, business logic, edge cases

**Files:** 33 | **Test Cases:** 836

| Test File | Test Cases | Bug Refs |
|---|---|---|
| `catalog-integrity.test.js` | 17 | — |
| `command-validation.test.js` | 3 | — |
| `doc-catalog.add-project.test.js` | 2 | — |
| `doc-catalog.test.js` | 45 | — |
| `home-page-prefix-strip.test.js` | 0 | — |
| `install-verify.test.js` | 4 | — |
| `launcher-script.test.js` | 21 | — |
| `npm-fix-button.test.js` | 14 | — |
| `npm-send-to-claude.test.js` | 13 | — |
| `package-json-command-descriptions.test.js` | 2 | — |
| `unit\background-health-runner.test.js` | 17 | — |
| `unit\code-highlight-audit.pairing.test.js` | 4 | — |
| `unit\codebase-auditor.test.js` | 34 | — |
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
| `unit\readme-compliance.test.js` | 51 | — |
| `unit\shared-source.test.js` | 54 | — |
| `unit\thin-features.test.js` | 40 | — |
| `unit\view-a-doc.test.ts` | 2 | — |
| `unit\webview-utils.test.js` | 67 | — |
| `view-doc-click-opens.test.js` | 12 | — |
| `view-doc-interactions.test.js` | 26 | — |
| `view-doc-search-yellow.test.js` | 19 | — |

### TIER_3: Integration Tests — ✅ Present

**Description:** Module interactions, data flow, API mocks

**Files:** 1 | **Test Cases:** 12

| Test File | Test Cases | Bug Refs |
|---|---|---|
| `test-coverage-commands.integration.test.js` | 12 | — |

### TIER_4: Functional Tests — ✅ Present

**Description:** User workflows, UI rendering, server responses

**Files:** 1 | **Test Cases:** 18

| Test File | Test Cases | Bug Refs |
|---|---|---|
| `view-doc-e2e.test.js` | 18 | — |

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
| `css-class-hover` | — | — | — | — | — |
| `cvs-command-launcher` | — | — | — | — | — |
| `cvs-command-launcher` | — | — | — | — | — |
| `daily-audit` | — | ✅ | — | — | — |
| `doc-auditor` | — | ✅ | — | — | — |
| `doc-catalog` | — | ✅ | — | — | — |
| `doc-consolidator` | — | ✅ | — | — | — |
| `doc-header-scan` | — | — | — | — | — |
| `doc-header` | — | ✅ | — | — | — |
| `doc-intelligence` | — | — | — | — | — |
| `docs-manager` | — | — | — | — | — |
| `error-log-viewer` | — | — | — | — | — |
| `feature-toggle` | — | ✅ | — | — | — |
| `home-page` | — | ✅ | — | — | — |
| `html-template-downloader` | — | — | — | — | — |
| `image-reader` | — | — | — | — | — |
| `js-error-audit` | — | ✅ | — | — | — |
| `license-sync` | — | ✅ | — | — | — |
| `marketplace-compliance` | — | ✅ | — | — | — |
| `mcp-server-scaffolder` | — | — | — | — | — |
| `mcp-server-status` | — | — | — | — | — |
| `npm-command-launcher` | — | — | — | — | — |
| `open-folder-as-root` | — | — | — | — | — |
| `openai-chat` | — | — | — | — | — |
| `playwright-check` | — | — | — | — | — |
| `project-home-opener` | — | — | — | — | — |
| `project-launcher` | — | — | — | — | — |
| `python-runner` | — | — | — | — | — |
| `readme-compliance` | — | ✅ | — | — | — |
| `readme-generator` | — | — | — | — | — |
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
- `css-class-hover` — features\css-class-hover.ts
- `cvs-command-launcher` — features\cvs-command-launcher\index.ts
- `cvs-command-launcher` — features\cvs-command-launcher.ts
- `doc-header-scan` — features\doc-header-scan.ts
- `doc-intelligence` — features\doc-intelligence\index.ts
- `docs-manager` — features\docs-manager.ts
- `error-log-viewer` — features\error-log-viewer.ts
- `html-template-downloader` — features\html-template-downloader.ts
- `image-reader` — features\image-reader.ts
- `mcp-server-scaffolder` — features\mcp-server-scaffolder.ts
- `mcp-server-status` — features\mcp-server-status.ts
- `npm-command-launcher` — features\npm-command-launcher.ts
- `open-folder-as-root` — features\open-folder-as-root.ts
- `openai-chat` — features\openai-chat.ts
- `playwright-check` — features\playwright-check.ts
- `project-home-opener` — features\project-home-opener.ts
- `project-launcher` — features\project-launcher.ts
- `python-runner` — features\python-runner.ts
- `readme-generator` — features\readme-generator.ts
- `script-runner` — features\script-runner.ts
- `terminal-copy-output` — features\terminal-copy-output.ts
- `terminal-folder-tracker` — features\terminal-folder-tracker.ts
- `terminal-prompt-shortener` — features\terminal-prompt-shortener.ts
- `terminal-set-folder` — features\terminal-set-folder.ts
- `test-coverage-auditor` — features\test-coverage-auditor.ts

---

**Generated:** 2026-03-31T16:57:20.482Z
**Command:** `node scripts/audit-test-coverage.js`
