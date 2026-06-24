# feature: test-coverage-auditor


## Commands

| Command ID | Title | Keybinding |
|---|---|---|
| `cvs.audit.testCoverage` | Audit: Test Coverage Dashboard | — |
| `cvs.audit.testCoverage.refresh` | Audit: Refresh Test Coverage | — |
| `cvs.audit.testCoverage.export` | Audit: Export Coverage Report | — |

## What it does

_TODO: one paragraph describing the single responsibility of this file._

# feature: test-coverage-auditor.ts — Test Coverage Audit Dashboard

## Overview

The test coverage auditor integrates the tiered testing strategy directly into CieloVista Tools as an interactive webview panel. It provides:

- **Audit Dashboard:** Visual summary of test coverage metrics by tier
- **Gap Analysis:** Highlights missing tiers, untested features, untested bugs
- **Smart Recommendations:** Prioritized action items (HIGH/MEDIUM/LOW)
- **One-Click Export:** Generate markdown reports for sharing/documentation
- **Auto-Generate Tests:** One-button skeleton unit test file generation for all untested features
- **Real-Time Refresh:** Re-run audits without leaving the UI

The tool analyzes your test suite against Tiers 1–5 as defined in the tiered testing strategy:
- **Tier 1:** Static Compliance (type checking, linting)
- **Tier 2:** Unit Tests (isolated functions)
- **Tier 3:** Integration Tests (module interactions)
- **Tier 4:** Functional Tests (E2E workflows)
- **Tier 5:** Regression Tests (bug fixes)

---
1. **User opens audit: ** Command `cvs.audit.testCoverage` triggered
2. **Audit execution: ** Calls `node scripts/audit-test-coverage.js --json`
3. **Parse metrics: ** Extracts test file counts, test cases, feature coverage
4. **Format report: ** Converts raw metrics to `AuditReport` structure
5. **Render webview: ** Generates HTML UI with metrics, tiers, gaps, recommendations
6. **User interacts: ** Refresh or export via webview buttons
**Title: ** Audit: Export Coverage Report
**Category: ** CieloVista Audit
**Action: ** Exports the audit results as a markdown file
**Use cases: **
- Quick health check: How much test coverage do I have?
- Identify gaps: Which features are untested?
- Understand tiers: Which tiers are missing from my test suite?
- Get recommendations: What should I test next?
└── TODO: describe call flow
Displays key numbers at a glance: [**Test Files:** Total count of test files found, **Test Cases:** Sum of all `it()` and `test()` calls, **Feature Coverage:** X/Y features with at least one test, **Coverage %:** Feature coverage percentage (color-coded), **Bugs (Untested):** X/Y bugs without regression tests (if bug registry exists)]
**Color coding: **
Lists specific problems: [29 features without unit tests, Missing TIER_1: Static Compliance, 5 bugs without regression tests]
timestamp: string;                           // ISO timestamp
totalTestFiles: number;                      // Count of test files
totalTestCases: number;                      // Sum of test cases
featuresCovered: number;                     // Count of features with tests
featuresTotal: number;                       // Total features in src/features/
coveragePercent: number;                     // 0-100%
tiers: TierData[];                          // Breakdown by tier
gaps: string[];                             // Specific gap descriptions
recommendations: Recommendation[];          // Prioritized actions
bugsUntested: number;                       // From bug registry
bugsTotal: number;                          // From bug registry
tier: string;        // "TIER_1", "TIER_2", etc.
name: string;        // "Static Compliance", "Unit Tests", etc.
description: The test coverage auditor integrates the tiered testing strategy directly into CieloVista Tools as an interactive webview panel. It provides: - Aud…
files: number;       // Count of test files in this tier
testCases: number;   // Sum of test cases in this tier
present: boolean;    // Whether tier has any tests
1. **Open the audit dashboard: **
- Command Palette → "Audit: Test Coverage Dashboard
- Or: Quick Run → "Audit" → "Test Coverage Dashboard
2. **Verify metrics display: **
3. **Test refresh button: **
4. **Test export button: **
5. **Verify gap analysis: **
6. **After adding tests: **
- Run `npm run audit: coverage` manually to verify it detects it
Returns error message: No workspace folder open
Returns error: Script not found at scripts/audit-test-coverage.js
docid: 150.3.test-coverage-auditor-readme
id: feature-test-coverage-auditorts-test-coverage-audi
title: feature: test-coverage-auditor.ts — Test Coverage Audit Dashboard
project: cielovista-tools
status: active
tags: [auditor, coverage, cvs.audit.testCoverage, cvs.audit.testCoverage.export, cvs.audit.testCoverage.refresh, test]
category: 150.3 — Testing
created: 2026-04-22
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
relativepath: src/features/test-coverage-auditor.README.md
---