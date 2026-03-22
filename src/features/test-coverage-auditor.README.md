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

## Architecture

### Data Flow

1. **User opens audit:** Command `cvs.audit.testCoverage` triggered
2. **Audit execution:** Calls `node scripts/audit-test-coverage.js --json`
3. **Parse metrics:** Extracts test file counts, test cases, feature coverage
4. **Format report:** Converts raw metrics to `AuditReport` structure
5. **Render webview:** Generates HTML UI with metrics, tiers, gaps, recommendations
6. **User interacts:** Refresh or export via webview buttons

### Key Functions

- `runAudit()` — Execute the audit script and return parsed JSON metrics
- `formatAuditReport()` — Convert JSON metrics to AuditReport interface
- `getWebviewHtml()` — Generate styled HTML for the webview panel
- `openAuditPanel()` — Create/show the webview with fresh audit data
- `exportReportAsMarkdown()` — Generate and open markdown report file

---

## Commands

### cvs.audit.testCoverage
**Title:** Audit: Test Coverage Dashboard  
**Category:** CieloVista Audit  
**Action:** Opens the interactive test coverage audit dashboard in a webview panel

**Use cases:**
- Quick health check: How much test coverage do I have?
- Identify gaps: Which features are untested?
- Understand tiers: Which tiers are missing from my test suite?
- Get recommendations: What should I test next?

### cvs.audit.testCoverage.refresh
**Title:** Audit: Refresh Test Coverage  
**Category:** CieloVista Audit  
**Action:** Re-runs the audit and updates the dashboard

**Use cases:**
- After adding new tests, see the updated coverage
- Verify that a tier is now present
- Update recommendations based on latest code

### cvs.audit.testCoverage.export
**Title:** Audit: Export Coverage Report  
**Category:** CieloVista Audit  
**Action:** Exports the audit results as a markdown file

**Use cases:**
- Share audit results with team
- Document coverage status for a sprint
- Create CI/CD artifacts

---

## UI Components

### Metrics Section
Displays key numbers at a glance:
- **Test Files:** Total count of test files found
- **Test Cases:** Sum of all `it()` and `test()` calls
- **Feature Coverage:** X/Y features with at least one test
- **Coverage %:** Feature coverage percentage (color-coded)
- **Bugs (Untested):** X/Y bugs without regression tests (if bug registry exists)

### Tier Breakdown
Shows the status and counts for each tier:

```
✅ Unit Tests
   Isolated functions, business logic, edge cases
   2 files • 65 test cases

❌ Static Compliance
   Type checking, linting, schema validation
   No tests found
```

**Color coding:**
- Green border + light background = Tier is present
- Red border + light background = Tier is missing

### Coverage Gaps
Lists specific problems:
- "29 features without unit tests"
- "Missing TIER_1: Static Compliance"
- "5 bugs without regression tests"

### Recommendations
Prioritized action items with context:

```
[HIGH] Coverage is 3%. Prioritize adding Tier 2 (unit) tests for each feature.

[MEDIUM] Create Tier 1 compliance tests (type checking, linting, coverage).
```

### Action Buttons

- **🔄 Refresh Audit** — Re-run the audit script (e.g., after adding tests)
- **📄 Export as Markdown** — Generate and open the full markdown report
- **📝 Generate Unit Tests** — Auto-create skeleton unit test files for all features without tests (Tier 2)

---

## Data Structures

### AuditReport
```typescript
interface AuditReport {
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
}
```

### TierData
```typescript
interface TierData {
  tier: string;        // "TIER_1", "TIER_2", etc.
  name: string;        // "Static Compliance", "Unit Tests", etc.
  description: string; // Short description of tier purpose
  files: number;       // Count of test files in this tier
  testCases: number;   // Sum of test cases in this tier
  present: boolean;    // Whether tier has any tests
}
```

---

## Testing

### Manual Test Steps

1. **Open the audit dashboard:**
   - Command Palette → "Audit: Test Coverage Dashboard"
   - Or: Quick Run → "Audit" → "Test Coverage Dashboard"

2. **Verify metrics display:**
   - Should show current test counts
   - Feature coverage should match actual tests
   - All tiers should be evaluated (present or missing)

3. **Test refresh button:**
   - Click "🔄 Refresh Audit"
   - Wait for progress, should show updated counts
   - Should not require reopening the panel

4. **Test export button:**
   - Click "📄 Export as Markdown"
   - Should open markdown file in editor
   - Check `docs/_today/test-coverage-audit-YYYY-MM-DD.md`

5. **Verify gap analysis:**
   - Check that "29 features without unit tests" appears
   - Check that missing tiers are listed
   - Verify recommendations are relevant

6. **After adding tests:**
   - Add a new test file (e.g., `tests/compliance/coverage.test.ts`)
   - Run `npm run audit:coverage` manually to verify it detects it
   - Click refresh in the UI
   - Should see updated counts

---

## Edge Cases

### No workspace open
Returns error message: "No workspace folder open"

### Audit script not found
Returns error: "Script not found at scripts/audit-test-coverage.js"

### No tests found
Shows metrics with zeros, all tiers marked as "missing", recommendations for first tier to add

### Bug registry missing
Still works, just skips bug-related metrics and recommendations

### Malformed JSON from audit script
Catches and displays error to user

---

## Related Files

- [audit-test-coverage.js](../scripts/audit-test-coverage.js) — The core audit script
- [audit-test-coverage.README.md](../scripts/audit-test-coverage.README.md) — Audit command-line documentation
- [testing-strategy.md](../../../CieloVistaStandards/testing-strategy.md) — Tier definitions
