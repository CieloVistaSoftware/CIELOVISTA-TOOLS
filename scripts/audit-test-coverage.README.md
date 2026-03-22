# feature: Test Coverage Audit Tool

## Overview

The `audit-test-coverage.js` script analyzes your test suite against the **tiered testing strategy** defined in the CieloVista Standards (`testing-strategy.md`). It automatically:

- **Categorizes** test files into 5 tiers (Compliance, Unit, Integration, Functional, Regression)
- **Identifies gaps** in test coverage by feature and tier
- **Flags untested bugs** if a bug registry exists
- **Generates reports** with actionable recommendations

---

## Quick Start

```bash
# Run the audit with console output + markdown report
npm run audit:coverage

# Run with JSON output for CI/CD pipelines
npm run audit:coverage:json

# Run with detailed analysis
npm run audit:coverage:detailed
```text
### Output

- **Console:** Colored summary with tier breakdown and gap analysis
- **Markdown Report:** Saved to `docs/_today/test-coverage-audit-YYYY-MM-DD.md`
- **JSON (optional):** Machine-readable metrics for automation

---

## How It Works

### 1. Tier Classification

Tests are categorized into 5 tiers based on location and naming:

| Tier | Directory Pattern | File Pattern | Purpose |
|---|---|---|---|
| **Tier 1** | `compliance/`, `linting/`, `types/` | `*compliance*`, `*lint*` | Static checks: type validation, linting, coverage |
| **Tier 2** | `unit/`, `utils/`, `helpers/` | `*unit*`, `*utils*` | Unit tests: isolated functions, business logic |
| **Tier 3** | `integration/`, `components/`, `modules/` | `*integration*` | Integration: module interactions, data flow |
| **Tier 4** | `functional/`, `e2e/`, `ui/`, `features/` | `*functional*`, `*e2e*` | Functional: E2E workflows, UI rendering |
| **Tier 5** | `regression/`, `bugfixes/`, `bugs/` | `*regression*`, `*bug*` | Regression: bug fixes, prevents re-breaking |

**Default:** Files without matching patterns are classified as **Tier 2 (Unit Tests)**.

### 2. Feature Coverage Analysis

The audit scans `src/features/` for all feature files (`.ts` files), then checks which features have corresponding test files.

**Coverage Matrix:** Shows which features are tested in which tiers.

### 3. Bug Tracking

If a `bug-registry.json` exists in the project root, the audit checks:
- How many bugs have regression tests
- Which bugs are untested

**Bug Registry entry format:**
```json
{
  "id": "BUG-2024-12-19-001",
  "title": "Email validator accepts invalid format",
  "regressionTests": ["tests/regression/regression-tests.spec.ts"],
  "testCases": ["Email validator rejects missing TLD"]
}
```text
### 4. Metrics Calculation

- **Total Test Files:** Count across all tiers
- **Total Test Cases:** Sum of `it()` and `test()` calls
- **Features Covered:** Count of features with any test
- **Bugs Untested:** Count of bugs without regression tests
- **Tier Coverage:** Files and test cases per tier

---

## Reports

### Console Output

Displays:
- 📊 Summary metrics
- 📋 Tier breakdown with file counts
- ⚠️ Coverage gaps by feature and tier
- 💡 Recommendations for improvement

Example:
```text
📊 SUMMARY
   Test Files: 2
   Test Cases: 65
   Features Covered: 1/30
   Bugs Total: 0 | Untested: 0

📋 TIER BREAKDOWN
   ❌ Static Compliance — 0 files
   ✅ Unit Tests — 2 files (65 test cases)
   ❌ Integration Tests — 0 files
   ❌ Functional Tests — 0 files
   ❌ Regression Tests — 0 files
```text
### Markdown Report

Full report saved to `docs/_today/test-coverage-audit-YYYY-MM-DD.md`:

- Summary table
- Tier-by-tier breakdown with file lists
- Feature coverage matrix
- Coverage gaps (features without tests, missing tiers, untested bugs)
- Recommendations prioritized by impact

---

## Interpreting Results

### 🔴 Critical Gaps

1. **Missing Tier 1 (Compliance):** No type checking or linting tests
   - Add tests for TypeScript compilation, coverage thresholds
   - Create `tests/compliance/` directory

2. **Low Tier 2 Coverage** (< 50% of features):
   - Add unit tests for each feature's core logic
   - Target: 1 test file per feature in `tests/unit/`

3. **No Tier 5 (Regression):** Bugs without tests
   - Create `tests/regression/` with tests for each bug
   - Reference bug IDs in test names: `BUG-2024-12-19-001`

### 🟡 Warnings

- **Missing Tier 3:** No integration tests for cross-module workflows
- **Missing Tier 4:** No E2E tests for user workflows
- **Unclassified tests:** Move tests into tier-specific directories

### 🟢 Good Signs

- ✅ All tiers present
- ✅ > 70% of features have tests
- ✅ 100% of bugs have regression tests
- ✅ Clear test organization by tier

---

## Adding Tests to Your Project

### Step 1: Create Tier Structure

```text
tests/
├── compliance/          # Tier 1
│   ├── type-checking.spec.ts
│   └── coverage.spec.ts
├── unit/                # Tier 2
│   ├── utils.spec.ts
│   └── validators.spec.ts
├── integration/         # Tier 3
│   └── api.spec.ts
├── functional/          # Tier 4
│   └── user-flows.spec.ts
└── regression/          # Tier 5
    └── regression-tests.spec.ts
```text
### Step 2: Add Tier 2 (Unit) Tests for Each Feature

Example for `doc-catalog` feature:

```typescript
// tests/unit/doc-catalog.test.ts
describe('doc-catalog', () => {
  it('should parse project cards correctly', () => {
    // Test isolated function
  });

  it('should handle missing README gracefully', () => {
    // Test error case
  });
});
```text
### Step 3: Add Tier 5 (Regression) Tests for Bugs

```typescript
// tests/regression/regression-tests.spec.ts
describe('BUG-2024-12-19-001: Email validation', () => {
  it('rejects invalid emails without TLD', () => {
    expect(validateEmail('test@domain')).toBe(false);
  });
});
```text
### Step 4: Re-run Audit

```bash
npm run audit:coverage
```text
---

## CLI Options

```bash
# Basic audit with console + markdown report
node scripts/audit-test-coverage.js

# Include JSON output for CI/CD
node scripts/audit-test-coverage.js --json

# Detailed analysis (reserved for future expansion)
node scripts/audit-test-coverage.js --detailed
```text
---

## Integration with CI/CD

### GitHub Actions Example

```yaml
- name: Audit Test Coverage
  run: npm run audit:coverage

- name: Generate Coverage Report
  run: npm run audit:coverage:json > coverage-metrics.json

- name: Upload Report
  uses: actions/upload-artifact@v3
  with:
    name: test-coverage-audit
    path: docs/_today/test-coverage-audit-*.md
```text
---

## FAQ

**Q: What if my tests are in a different structure?**  
A: Update tier classification in the script. Modify `TIER_PATTERNS` or the `classifyTier()` function.

**Q: How are test case counts calculated?**  
A: Counts are based on regex matches for `it()` and `test()` function calls in your test files.

**Q: Can I customize the report?**  
A: Yes, edit `formatConsoleReport()` or `formatMarkdownReport()` functions in the script.

**Q: Why is my test file unclassified?**  
A: The script couldn't match your file to a tier. Either place it in a tier-named directory or add its pattern to `classifyTier()`.

**Q: How do I link bugs to regression tests?**  
A: Add `bugId` references to your test names:
```typescript
it('BUG-2024-12-19-001: Email validator rejects invalid format', () => {
  // test
});
```text
---

## Testing the Tool

```bash
# Full audit
npm run audit:coverage

# JSON output
npm run audit:coverage:json > report.json
cat report.json
```text
Check the output in `docs/_today/test-coverage-audit-YYYY-MM-DD.md` for the full markdown report.

---

## Related Documents

- [Testing Strategy](./../../downloads/CieloVistaStandards/testing-strategy.md) — Tier definitions and best practices
- [Doc Auditor](../features/doc-auditor.README.md) — Similar audit tool for documentation
- [Run Audit Script](./run-audit.js) — General-purpose audit runner

---

## What it does

_TODO: one paragraph describing the single responsibility of this file._

---

## Internal architecture

```text
activate()
  └── TODO: describe call flow
```text
---

## Manual test

1. TODO: step one
2. TODO: step two
3. TODO: expected result
