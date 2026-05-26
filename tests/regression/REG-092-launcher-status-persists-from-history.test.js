// Copyright (c) CieloVista Software. All rights reserved.
// REG-092: Issue #472 — launcher STATUS pill must reflect last run outcome,
//          not revert to static audit status on panel refresh
//
// Run: node tests/regression/REG-092-launcher-status-persists-from-history.test.js

'use strict';

const fs     = require('fs');
const path   = require('path');
const assert = require('assert');

const ROOT      = path.resolve(__dirname, '..', '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'src', 'features', 'cvs-command-launcher', 'index.ts'), 'utf8');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  PASS ${name}`);
        passed += 1;
    } catch (err) {
        console.error(`  FAIL ${name}\n       ${err.message}`);
        failed += 1;
    }
}

console.log('REG-092: Launcher STATUS persists last run outcome across refreshes (#472)');
console.log('-'.repeat(72));

test('buildStatusMap seeds entries from run history', () => {
    assert(
        INDEX_SRC.includes('for (const h of getHistory())'),
        'buildStatusMap must iterate getHistory() to seed last-run status per command'
    );
});

test('history seed maps ok=true to Completed (green)', () => {
    assert(
        INDEX_SRC.includes("label: 'Completed', title: 'Last run succeeded', tone: 'good'"),
        "successful run must produce label:'Completed', tone:'good' in statusMap"
    );
});

test('history seed maps ok=false to Error (red)', () => {
    assert(
        INDEX_SRC.includes("label: 'Error',     title: 'Last run failed',    tone: 'bad'"),
        "failed run must produce label:'Error', tone:'bad' in statusMap"
    );
});

test('error log entry is still overridden after history seed', () => {
    // The errorLog override must come AFTER the history loop so it takes precedence
    const historyLoop = INDEX_SRC.indexOf('for (const h of getHistory())');
    const errorLogSet  = INDEX_SRC.indexOf("statusMap.set('cvs.tools.errorLog'");
    assert(historyLoop >= 0, 'history loop not found in buildStatusMap');
    assert(errorLogSet  >= 0, 'errorLog set not found in buildStatusMap');
    assert(errorLogSet > historyLoop, 'errorLog override must appear AFTER the history loop');
});

test('buildStatusMap() is called once per buildLauncherHtml call', () => {
    const launcherCalls  = (INDEX_SRC.match(/buildLauncherHtml\(/g) || []).length;
    // Count call-sites only — exclude the function definition "function buildStatusMap()"
    const statusMapCalls = (INDEX_SRC.match(/(?<!function )buildStatusMap\(\)/g) || []).length;
    assert(launcherCalls > 0, 'no buildLauncherHtml calls found');
    assert(statusMapCalls === launcherCalls,
        `expected ${launcherCalls} buildStatusMap() calls (one per buildLauncherHtml) but found ${statusMapCalls}`);
});

console.log('-'.repeat(72));
if (failed === 0) {
    console.log(`✓ REG-092 passed (${passed} checks).\n`);
    process.exit(0);
}
console.error(`✗ REG-092 FAILED (${failed} of ${passed + failed} checks failed).\n`);
process.exit(1);
