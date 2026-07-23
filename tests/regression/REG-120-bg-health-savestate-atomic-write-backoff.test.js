// Copyright (c) 2026 CieloVista Software. All rights reserved.
// REG-120: bg-health saveState must write atomically and back off on a
// persistent failure (#651).
//
// Root: "[APP_ERROR] Failed to save health state (x6)" was auto-filed from
// bg-health-runner. writeFileSync was called directly against bg-health.json
// with no atomic-write protection, and every check tick (e.g. every 30s)
// re-attempted the full write-with-retries indefinitely on a persistent
// failure (wrong/foreign workspace open, missing disk, permissions, an
// "UNKNOWN" Windows I/O error) with no backoff and no per-attempt context
// (path / error code) in the logged message.
//
// Fix: write to a unique temp file in the same directory and rename it over
// the target (atomic — a reader never observes a half-written file, and
// rename sidesteps some Windows AV/OneDrive lock contention). Track a
// consecutive-failure counter and back off exponentially (capped) once a
// streak is underway, so a persistent failure fails quietly on a growing
// schedule instead of hammering the filesystem on every tick forever. Log
// the file path and the error's code/message (not just a bare label) when a
// failure streak is first reported.

'use strict';

const fs     = require('fs');
const path   = require('path');
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

console.log('REG-120: bg-health saveState — atomic write + backoff (#651)');
console.log('-'.repeat(70));

function saveStateBody() {
    const m = SRC.match(/function saveState\(\)\s*:\s*void\s*\{([\s\S]*?)\n\}/);
    assert.ok(m, 'saveState function not found');
    return m[1];
}

test('the data directory is created before any write is attempted', () => {
    const body = saveStateBody();
    assert.ok(/ensureDataDir\s*\(\s*\)/.test(body),
        'saveState must call ensureDataDir() so a missing data/ dir does not ENOENT');
});

test('saveState writes to a temp file, not directly to HEALTH_FILE', () => {
    const body = saveStateBody();
    assert.ok(
        /writeFileSync\s*\(\s*tmpFile/.test(body),
        'saveState must writeFileSync to a temp path, not straight to HEALTH_FILE, to avoid partial writes'
    );
});

test('saveState renames the temp file over HEALTH_FILE (atomic swap)', () => {
    const body = saveStateBody();
    assert.ok(
        /renameSync\s*\(\s*tmpFile\s*,\s*HEALTH_FILE\s*\)/.test(body),
        'saveState must fs.renameSync(tmpFile, HEALTH_FILE) to complete the write atomically'
    );
});

test('a leftover temp file is cleaned up when the write fails', () => {
    const body = saveStateBody();
    assert.ok(
        /unlinkSync\s*\(\s*tmpFile\s*\)/.test(body),
        'a failed write must not leave a stray .tmp- file behind in data/'
    );
});

test('a persistent failure streak triggers a backoff instead of retrying every tick', () => {
    assert.ok(/_consecutiveSaveFailures/.test(SRC),
        'a module-level consecutive-failure counter must exist');
    const body = saveStateBody();
    assert.ok(/_consecutiveSaveFailures\s*(>=|>)\s*SAVE_BACKOFF_AFTER_N_FAILURES/.test(body),
        'saveState must check the failure streak against a backoff threshold');
    assert.ok(/Date\.now\(\)\s*-\s*_lastSaveAttemptMs\s*<\s*backoffMs/.test(body),
        'saveState must skip the attempt entirely while inside the backoff window');
});

test('the backoff grows and is capped, not unbounded', () => {
    assert.ok(/SAVE_BACKOFF_MAX_MS/.test(SRC), 'a maximum backoff ceiling must be defined');
    const body = saveStateBody();
    assert.ok(/Math\.min\([\s\S]*?SAVE_BACKOFF_MAX_MS\s*\)/.test(body),
        'the computed backoff must be clamped with Math.min(..., SAVE_BACKOFF_MAX_MS)');
});

test('the failure streak resets to zero on a successful save', () => {
    const body = saveStateBody();
    assert.ok(/_consecutiveSaveFailures\s*=\s*0/.test(body),
        'a successful write must reset _consecutiveSaveFailures back to 0');
});

test('the logged failure includes the file path and the underlying error detail', () => {
    const body = saveStateBody();
    assert.ok(/HEALTH_FILE/.test(body.match(/logError\(([\s\S]*?)\);/)?.[1] ?? ''),
        'the logError call must include HEALTH_FILE so the failing path is known');
    assert.ok(/describeError\s*\(\s*lastError\s*\)/.test(body),
        'the logError call must include describeError(lastError) (message + error code)');
});

test('describeError surfaces the Node error code (e.g. ENOENT/EPERM/UNKNOWN) when present', () => {
    assert.ok(/function describeError/.test(SRC), 'describeError helper must exist');
    const m = SRC.match(/function describeError\([\s\S]*?\n\}/);
    assert.ok(m, 'describeError function not found');
    assert.ok(/\.code/.test(m[0]), 'describeError must read the ErrnoException .code field');
});

console.log('-'.repeat(70));
if (failed === 0) {
    console.log(`✓ REG-120 passed (${passed} checks).\n`);
    process.exit(0);
}
console.error(`✗ REG-120 FAILED (${failed} of ${passed + failed} checks failed).\n`);
process.exit(1);
