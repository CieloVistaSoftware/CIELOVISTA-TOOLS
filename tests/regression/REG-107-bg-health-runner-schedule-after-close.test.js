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

// #693: locate the proc.on('close', ...) callback body structurally instead of
// slicing a fixed number of characters from the source. The old `SRC.slice(idx,
// idx + 2500)` window had to be widened to 4000 in f86b1ff purely because
// adding diagnostics pushed scheduleTestRun() past the cutoff -- nothing about
// the runner was broken, the test just ran out of window, and it would break
// the same way on the next edit that grows the handler.
function closeHandlerBody() {
    const start = SRC.indexOf("proc.on('close'");
    assert.ok(start !== -1, "proc.on('close') not found");
    const open = SRC.indexOf('{', start);
    assert.ok(open !== -1, "no opening brace after proc.on('close')");
    let depth = 0;
    for (let i = open; i < SRC.length; i++) {
        const ch = SRC[i];
        if (ch === '{') { depth++; }
        else if (ch === '}') {
            depth--;
            if (depth === 0) { return SRC.slice(open + 1, i); }
        }
    }
    throw new Error("proc.on('close') callback is never closed -- unbalanced braces");
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
    const closeBlock = closeHandlerBody();
    assert.ok(
        closeBlock.includes('scheduleTestRun(TEST_RUN_INTERVAL_MS)'),
        'scheduleTestRun(TEST_RUN_INTERVAL_MS) must be called inside proc.on(close) handler'
    );
});

test('_testRunInProgress is reset to false before scheduleTestRun in close handler', () => {
    // Ensures the guard is cleared before the next run is scheduled
    const closeBlock = closeHandlerBody();
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
    const closeBlock = closeHandlerBody();
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
