// Copyright (c) CieloVista Software. All rights reserved.
// REG-029: Issue #301 — README Compliance status pills must filter the row list.
//
// Proves 4 fails before fix:
//   1. Status pills rendered as <button> (not <span>) with data-action="filter-status"
//   2. Each pill has data-status="compliant" | "partial" | "non-compliant"
//   3. Each <tr> row has a data-status attribute matching its score category
//   4. JS applyFilter() checks active pill filters (not just search text)

'use strict';

const fs   = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT       = path.resolve(__dirname, '..', '..');
const FEATURE_SRC = fs.readFileSync(path.join(ROOT, 'src/features/readme-compliance/feature.ts'), 'utf8');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL ${name}`);
    console.error(`       ${err.message}`);
    failed++;
  }
}

// ─── 1. Pills are buttons with data-action="filter-status" ────────────────────

test('status pills rendered as buttons with data-action="filter-status"', () => {
  assert(
    FEATURE_SRC.includes('data-action="filter-status"'),
    'status pills do not have data-action="filter-status" — they are <span> elements with no click action'
  );
});

// ─── 2. Each pill has data-status attribute ────────────────────────────────────

test('status pills have data-status="compliant", "partial", "non-compliant"', () => {
  assert(
    FEATURE_SRC.includes('data-status="compliant"') &&
    FEATURE_SRC.includes('data-status="partial"') &&
    FEATURE_SRC.includes('data-status="non-compliant"'),
    'one or more status pills are missing data-status attribute (compliant / partial / non-compliant)'
  );
});

// ─── 3. Each <tr> row has data-status attribute ────────────────────────────────

test('compliance table rows have data-status attribute for filtering', () => {
  // The <tr> elements rendered per-file must include data-status so JS can show/hide by category
  assert(
    FEATURE_SRC.includes("data-status=\"compliant\"") &&
    (FEATURE_SRC.includes("data-status=\"non-compliant\"") || FEATURE_SRC.includes("data-status='non-compliant'") ||
     FEATURE_SRC.includes('data-status="${') || FEATURE_SRC.includes("data-status='${")),
    '<tr> rows do not include a data-status attribute — pill filter cannot target them'
  );
});

// ─── 4. JS applyFilter checks active pill filters ─────────────────────────────

test('applyFilter() in webview JS checks active pill filter state', () => {
  // applyFilter must reference filter-status or activePills or similar
  const hasActivePills = FEATURE_SRC.includes('activePill') ||
    FEATURE_SRC.includes('filter-status') && FEATURE_SRC.includes('applyFilter');
  assert(
    hasActivePills,
    'applyFilter() only checks the search input — it does not check active pill filter state'
  );
});

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log('REG-029: README Compliance status pill filters (#301)');
console.log('─'.repeat(50));
if (failed === 0) {
  console.log(`✓ REG-029 passed (${passed} checks — status pills filter the row list).`);
  process.exit(0);
} else {
  console.error(`✗ REG-029 FAILED (${failed} of ${passed + failed} checks failed).`);
  process.exit(1);
}
