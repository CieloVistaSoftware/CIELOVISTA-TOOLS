# Test Coverage Audit

**Date:** 2026-03-16 18:12:54
**Project:** cielovista-tools
**Strategy:** Tiered Testing (Tiers 1–5)

## 📊 Summary

| Metric | Count |
|---|---|
| Test Files | 4 |
| Test Cases | 93 |
| Features Covered | 1/33 |

## 📋 Tier Breakdown

### TIER_1: Static Compliance — ✅ Present

**Description:** Type checking, linting, schema validation, code quality

**Files:** 1 | **Test Cases:** 15

| Test File | Test Cases | Bug Refs |
|---|---|---|
| `launcher-test-coverage.test.js` | 15 | — |

### TIER_2: Unit Tests — ✅ Present

**Description:** Isolated functions, business logic, edge cases

**Files:** 2 | **Test Cases:** 65

| Test File | Test Cases | Bug Refs |
|---|---|---|
| `doc-catalog.test.js` | 45 | — |
| `launcher-script.test.js` | 20 | — |

### TIER_3: Integration Tests — ✅ Present

**Description:** Module interactions, data flow, API mocks

**Files:** 1 | **Test Cases:** 13

| Test File | Test Cases | Bug Refs |
|---|---|---|
| `test-coverage-commands.integration.test.js` | 13 | — |

### TIER_4: Functional Tests — ❌ Missing

**Description:** User workflows, UI rendering, server responses

**Status:** No tests found in this tier.

### TIER_5: Regression Tests — ❌ Missing

**Description:** Specific bug fixes, prevents re-breaking

**Status:** No tests found in this tier.

## 🎯 Feature Coverage Matrix

| Feature | Tier 1 | Tier 2 | Tier 3 | Tier 4 | Tier 5 |
|---|---|---|---|---|---|
| `codebase-auditor` | — | — | — | — | — |
| `copilot-open-suggested-file` | — | — | — | — | — |
| `copilot-rules-enforcer` | — | — | — | — | — |
| `css-class-hover` | — | — | — | — | — |
| `cvs-command-launcher` | — | — | — | — | — |
| `daily-audit` | — | — | — | — | — |
| `doc-auditor` | — | — | — | — | — |
| `doc-catalog` | — | ✅ | — | — | — |
| `doc-catalog` | — | ✅ | — | — | — |
| `doc-consolidator` | — | — | — | — | — |
| `doc-header` | — | — | — | — | — |
| `doc-intelligence` | — | — | — | — | — |
| `docs-manager` | — | — | — | — | — |
| `feature-toggle` | — | — | — | — | — |
| `html-template-downloader` | — | — | — | — | — |
| `license-sync` | — | — | — | — | — |
| `marketplace-compliance` | — | — | — | — | — |
| `marketplace-compliance` | — | — | — | — | — |
| `mcp-server-scaffolder` | — | — | — | — | — |
| `npm-command-launcher` | — | — | — | — | — |
| `open-folder-as-root` | — | — | — | — | — |
| `openai-chat` | — | — | — | — | — |
| `playwright-check` | — | — | — | — | — |
| `project-home-opener` | — | — | — | — | — |
| `project-launcher` | — | — | — | — | — |
| `python-runner` | — | — | — | — | — |
| `readme-compliance` | — | — | — | — | — |
| `readme-generator` | — | — | — | — | — |
| `terminal-copy-output` | — | — | — | — | — |
| `terminal-folder-tracker` | — | — | — | — | — |
| `terminal-prompt-shortener` | — | — | — | — | — |
| `terminal-set-folder` | — | — | — | — | — |
| `test-coverage-auditor` | — | — | — | — | — |

## ⚠️ Coverage Gaps

### Features Without Unit Tests (Tier 2)

- `codebase-auditor` — features\codebase-auditor.ts
- `copilot-open-suggested-file` — features\copilot-open-suggested-file.ts
- `copilot-rules-enforcer` — features\copilot-rules-enforcer.ts
- `css-class-hover` — features\css-class-hover.ts
- `cvs-command-launcher` — features\cvs-command-launcher.ts
- `daily-audit` — features\daily-audit\index.ts
- `doc-auditor` — features\doc-auditor.ts
- `doc-consolidator` — features\doc-consolidator.ts
- `doc-header` — features\doc-header.ts
- `doc-intelligence` — features\doc-intelligence\index.ts
- `docs-manager` — features\docs-manager.ts
- `feature-toggle` — features\feature-toggle.ts
- `html-template-downloader` — features\html-template-downloader.ts
- `license-sync` — features\license-sync.ts
- `marketplace-compliance` — features\marketplace-compliance\index.ts
- `marketplace-compliance` — features\marketplace-compliance.ts
- `mcp-server-scaffolder` — features\mcp-server-scaffolder.ts
- `npm-command-launcher` — features\npm-command-launcher.ts
- `open-folder-as-root` — features\open-folder-as-root.ts
- `openai-chat` — features\openai-chat.ts
- `playwright-check` — features\playwright-check.ts
- `project-home-opener` — features\project-home-opener.ts
- `project-launcher` — features\project-launcher.ts
- `python-runner` — features\python-runner.ts
- `readme-compliance` — features\readme-compliance.ts
- `readme-generator` — features\readme-generator.ts
- `terminal-copy-output` — features\terminal-copy-output.ts
- `terminal-folder-tracker` — features\terminal-folder-tracker.ts
- `terminal-prompt-shortener` — features\terminal-prompt-shortener.ts
- `terminal-set-folder` — features\terminal-set-folder.ts
- `test-coverage-auditor` — features\test-coverage-auditor.ts

### Missing Tier(s)

- ❌ TIER_4: Functional Tests
- ❌ TIER_5: Regression Tests

## 💡 Recommendations

1. **High Priority:** Coverage is < 50%. Prioritize adding Tier 2 (unit) tests for each feature.
2. Add Tier 4 functional tests (E2E) for user-facing workflows in `tests/functional/`.

---

**Generated:** 2026-03-16T23:12:54.343Z
**Command:** `node scripts/audit-test-coverage.js`
