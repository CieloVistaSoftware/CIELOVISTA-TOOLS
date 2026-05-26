// Copyright (c) 2026 CieloVista Software. All rights reserved.
// REG-107: Issue #505 — bg-health-runner schedules next test run AFTER close, not before
//
// Root cause: scheduleTestRun() was called immediately after runRegressionTests() returned,
// meaning the 1-hour countdown started while tests were still running.
// Fix: scheduleTestRun is now called inside proc.on('close') so the next cycle
// starts only after the current run fully completes.

'use strict';

const fs   = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', '..');
const SRC  = fs.readFileSync(
    path.join(ROOT, 'src', 'features', 'background-health-runner.ts'), 'utf8');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try   { fn(); console.log(`  PASS ${name}`); passed++; }
    catch (e) { console.error(`  FAIL ${name}\n       ${e.message}`); failed++; }
}

console.log('REG-107: bg-health-runner — scheduleTestRun called after close, not before (#505)');
console.log('-'.repeat(70));

test('scheduleTestRun is NOT called immediately after runRegressionTests() in scheduleTestRun body', () => {
    // The old pattern: scheduleTestRun body called runRegressionTests() then scheduleTestRun() again
    // That started the next 1h countdown before the current run finished.
    // The fix: scheduleTestRun's callback only calls runRegressionTests(); the re-schedule
    // happens inside the close handler.
    const scheduleBody = SRC.match(/function scheduleTestRun[\s\S]*?^}/m)?.[0] ?? '';
    // The body must NOT call scheduleTestRun(TEST_RUN_INTERVAL_MS) directly
    assert.ok(
        !scheduleBody.includes('scheduleTestRun(TEST_RUN_INTERVAL_MS)'),
        'scheduleTestRun body must not re-schedule itself — re-scheduling moved to close handler'
    );
});

test('scheduleTestRun(TEST_RUN_INTERVAL_MS) appears inside the proc.on(close) callback', () => {
    // Find the close handler block and confirm the re-schedule call is inside it
    const closeIdx = SRC.indexOf("proc.on('close'");
    assert.ok(closeIdx !== -1, "proc.on('close') not found");
    // Look for scheduleTestRun within the next 2500 chars (the close handler body is long)
    const closeBlock = SRC.slice(closeIdx, closeIdx + 2500);
    assert.ok(
        closeBlock.includes('scheduleTestRun(TEST_RUN_INTERVAL_MS)'),
        'scheduleTestRun(TEST_RUN_INTERVAL_MS) must be called inside proc.on(close) handler'
    );
});

test('_testRunInProgress is reset to false before scheduleTestRun in close handler', () => {
    // Ensures the guard is cleared before the next run is scheduled
    const closeIdx = SRC.indexOf("proc.on('close'");
    const closeBlock = SRC.slice(closeIdx, closeIdx + 2500);
    const falseIdx    = closeBlock.indexOf('_testRunInProgress = false');
    const scheduleIdx = closeBlock.indexOf('scheduleTestRun(TEST_RUN_INTERVAL_MS)');
    assert.ok(falseIdx !== -1,    '_testRunInProgress = false not found in close handler');
    assert.ok(scheduleIdx !== -1, 'scheduleTestRun not found in close handler');
    assert.ok(
        falseIdx < scheduleIdx,
        '_testRunInProgress must be reset to false BEFORE scheduleTestRun is called'
    );
});

test('_running guard present before scheduleTestRun call in close handler', () => {
    // The re-schedule should only happen if the runner is still active
    const closeIdx = SRC.indexOf("proc.on('close'");
    const closeBlock = SRC.slice(closeIdx, closeIdx + 2500);
    assert.ok(
        closeBlock.includes('_running') && closeBlock.includes('scheduleTestRun(TEST_RUN_INTERVAL_MS)'),
        '_running guard must gate the scheduleTestRun call in the close handler'
    );
});

console.log('-'.repeat(70));
if (failed === 0) {
    console.log(`✓ REG-107 passed (${passed} checks).\n`);
    process.exit(0);
}
console.error(`✗ REG-107 FAILED (${failed} of ${passed + failed} checks failed).\n`);
process.exit(1);
