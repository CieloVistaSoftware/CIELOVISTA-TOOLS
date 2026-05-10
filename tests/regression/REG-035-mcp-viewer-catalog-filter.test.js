// Copyright (c) CieloVista Software. All rights reserved.
// REG-035: Issue #310 — get_catalog project filter respected on tab init and Run.
//
// Bug: selectTab() for get_catalog always fired runEndpoint(null) after
// loadProjectOptions() set pEl.value, causing a race where the unfiltered
// (all-docs) request overwrote the filtered result.
//
// This test verifies the fix: the initial runEndpoint call in the get_catalog
// branch reads pEl.value instead of hardcoding null.

'use strict';

const fs     = require('fs');
const path   = require('path');
const assert = require('assert');

const ROOT    = path.resolve(__dirname, '..', '..');
const SRC     = fs.readFileSync(path.join(ROOT, 'src/features/mcp-viewer/html.ts'), 'utf8');

let passed = 0, failed = 0;

function test(name, fn) {
    try { fn(); console.log(`  PASS ${name}`); passed++; }
    catch (err) { console.error(`  FAIL ${name}`); console.error(`       ${err.message}`); failed++; }
}

// ── Locate the get_catalog branch inside selectTab ────────────────────────────

// Find the get_catalog branch in the selectTab function.
// The pattern we look for: the else-if that matches 'get_catalog'
// and its subsequent runEndpoint call.
const selectTabIdx = SRC.indexOf("function selectTab");
assert(selectTabIdx !== -1, 'selectTab function not found in mcp-viewer/html.ts');

// The get_catalog branch exists within ~200 lines of selectTab — grab enough
const selectTabBody = SRC.slice(selectTabIdx, selectTabIdx + 6000);

// ─── 1. The get_catalog branch does NOT call runEndpoint(null) ────────────────

test('get_catalog branch does not call runEndpoint(null) unconditionally', () => {
    // Target the } else if (endpoint === 'get_catalog') { branch — the init-run branch
    const branchIdx = selectTabBody.indexOf("} else if (endpoint === 'get_catalog')");
    assert(branchIdx !== -1, "get_catalog else-if init branch not found in selectTab");

    // Extract only this branch (bounded by the next else-if)
    const branchBody = selectTabBody.slice(branchIdx, branchIdx + 400);

    // The bug: unconditional runEndpoint(null)
    // The fix: runEndpoint reads pEl.value (never passes literal null alone)
    const hasUnconditionalNull = /runEndpoint\s*\(\s*null\s*\)/.test(branchBody);
    assert(
        !hasUnconditionalNull,
        'get_catalog branch still calls runEndpoint(null) unconditionally — ' +
        'unfiltered request will race and overwrite the filtered result'
    );
});

// ─── 2. The initial run reads pEl.value to respect any pre-set filter ─────────

test('get_catalog initial run reads pEl.value for the project filter', () => {
    const branchIdx = selectTabBody.indexOf("} else if (endpoint === 'get_catalog')");
    const branchBody = selectTabBody.slice(branchIdx, branchIdx + 400);

    // The fixed code reads pEl.value and passes it when truthy
    const readsValue = branchBody.includes('pEl') && branchBody.includes('.value');
    assert(
        readsValue,
        'get_catalog branch does not read pEl.value — pre-set filter from openProjectCatalog is ignored'
    );
});

// ─── 3. runEndpoint is called with projectName when filter is set ─────────────

test('get_catalog initial runEndpoint passes projectName when filter is non-empty', () => {
    const branchIdx = selectTabBody.indexOf("} else if (endpoint === 'get_catalog')");
    const branchBody = selectTabBody.slice(branchIdx, branchIdx + 400);

    // Should have a conditional: if filter exists → pass { projectName: filter }, else null
    const hasConditionalRun =
        branchBody.includes('projectName') ||
        (branchBody.includes('pEl') && branchBody.includes('runEndpoint'));
    assert(
        hasConditionalRun,
        'get_catalog branch does not conditionally pass projectName to runEndpoint'
    );
});

// ─── 4. runFromControls passes projectName from select value ──────────────────

test('runFromControls for get_catalog reads pEl.value and passes it as projectName', () => {
    // The runFromControls function must read the select value and pass it
    const rcIdx = SRC.indexOf('function runFromControls');
    assert(rcIdx !== -1, 'runFromControls function not found');
    const rcBody = SRC.slice(rcIdx, rcIdx + 2000);

    const catalogBranchIdx = rcBody.indexOf("endpoint === 'get_catalog'");
    assert(catalogBranchIdx !== -1, 'get_catalog branch missing from runFromControls');
    const catalogBranch = rcBody.slice(catalogBranchIdx, catalogBranchIdx + 300);

    assert(
        catalogBranch.includes('pEl') && catalogBranch.includes('.value'),
        'runFromControls does not read pEl.value for get_catalog'
    );
    assert(
        catalogBranch.includes('projectName'),
        'runFromControls does not pass projectName to runEndpoint for get_catalog'
    );
});

// ─── 5. Server-side: handleGetCatalog filters by projectName ──────────────────

test('mcp-viewer/index.ts handleGetCatalog filters cards by projectName', () => {
    const idxSrc = fs.readFileSync(path.join(ROOT, 'src/features/mcp-viewer/index.ts'), 'utf8');
    const fnIdx  = idxSrc.indexOf('async function handleGetCatalog');
    assert(fnIdx !== -1, 'handleGetCatalog not found in index.ts');
    const fnBody = idxSrc.slice(fnIdx, fnIdx + 400);
    assert(
        fnBody.includes('filter') && fnBody.includes('projectName'),
        'handleGetCatalog does not filter cards by projectName'
    );
});

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log('REG-035: get_catalog project filter (#310)');
console.log('─'.repeat(50));
if (failed === 0) {
    console.log(`✓ REG-035 passed (${passed} checks — project filter is respected on init and Run).`);
    process.exit(0);
} else {
    console.error(`✗ REG-035 FAILED (${failed} of ${passed + failed} checks failed).`);
    process.exit(1);
}
