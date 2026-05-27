/**
 * tests/regression/REG-059-github-issues-view-dual-fetcher.test.js
 *
 * Guards issue #373: GitHub Issues Viewer dual-fetcher, auto-refresh, copy-all,
 * and paginating REST fetcher.
 *
 * All checks are source-level reads against the TypeScript file so no compilation
 * is required and no network calls are made.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '../../src/shared/github-issues-view.ts');
const src = fs.readFileSync(SRC, 'utf8');

let passed = 0;
let failed = 0;

function check(label, condition) {
    if (condition) {
        console.log(`  PASS - ${label}`);
        passed++;
    } else {
        console.log(`  FAIL - ${label}`);
        failed++;
    }
}

console.log('\nREG-059: github-issues-view dual-fetcher / auto-refresh / copy-all\n' + '─'.repeat(60));

// ── Dual-fetcher ─────────────────────────────────────────────────────────────
check('fetchIssuesViaGh function defined',
    src.includes('function fetchIssuesViaGh('));

check('fetchIssuesViaRest function defined',
    src.includes('function fetchIssuesViaRest('));

check('fetchIssues tries gh first then falls back to REST',
    src.includes('fetchIssuesViaGh(state)') && src.includes('fetchIssuesViaRest(state)'));

check('gh CLI path is resolved before exec (avoids missing-binary crash)',
    src.includes('ghCandidates') && src.includes('ghPath'));

// ── Pagination (REST fetcher walks up to 5 pages, deduplicates) ───────────────
check('REST fetcher declares maxPages = 10',
    src.includes('maxPages = 10'));

check('REST fetcher uses a Map to deduplicate by issue number',
    src.includes('byNumber') && src.includes('new Map'));

check('REST fetcher breaks early once 50 issues collected',
    src.includes('byNumber.size >= perPage'));

check('REST fetcher caps final result at perPage',
    src.includes('.slice(0, perPage)'));

// ── Auto-refresh on reopen ────────────────────────────────────────────────────
check('activeRefresh variable declared',
    src.includes('activeRefresh'));

check('activeRefresh is called when panel is already open',
    /if\s*\(\s*activeRefresh\s*\)/.test(src) || src.includes('activeRefresh()'));

check('activeRefresh is cleared on panel dispose',
    src.includes('activeRefresh = undefined'));

// ── Copy-all clipboard action ─────────────────────────────────────────────────
check("'copyAll' message type handled",
    src.includes("'copyAll'") || src.includes('"copyAll"'));

check('copy-all button rendered in HTML',
    src.includes('copy-all'));

// ── Auto-refresh timer (#531) ─────────────────────────────────────────────────
check('auto-timer span rendered in toolbar HTML',
    src.includes('id="auto-timer"') || src.includes("id='auto-timer'"));

check('auto-timer-sec inner span rendered',
    src.includes('id="auto-timer-sec"') || src.includes("id='auto-timer-sec'"));

check('setInterval countdown used for auto-refresh',
    src.includes('setInterval'));

check('countdown resets to 60 on manual reload',
    src.includes('_arSecs = 60'));

check('countdown fires postMessage refresh at 0',
    src.includes("type: 'refresh'") && src.includes('_arSecs'));

console.log('');
if (failed > 0) {
    console.log(`FAILED ${failed} / ${passed + failed}`);
    process.exit(1);
}
console.log(`PASSED ${passed} / ${passed}`);
process.exit(0);
