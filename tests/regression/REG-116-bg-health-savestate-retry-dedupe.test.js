// Copyright (c) 2026 CieloVista Software. All rights reserved.
// REG-116: bg-health saveState must not spam APP_ERROR on a transient write
// failure (#601).
//
// Root: saveState() wrote bg-health.json and called logError() on every failure.
// When the data dir was momentarily locked (e.g. an antivirus/OneDrive lock on
// <repo>/data), each 30s tick auto-filed another APP_ERROR — "(×6)".
//
// Fix: retry the write a few times to ride out a transient lock, and dedupe the
// failure log via a guard flag so a persistent failure is reported once per
// streak (reset on recovery), not every tick. A persistently unwritable dir is
// already surfaced separately by the chk-health-file health check.

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

console.log('REG-116: bg-health saveState — retry + dedupe failure logging (#601)');
console.log('-'.repeat(70));

function saveStateBody() {
    const m = SRC.match(/function saveState\(\)\s*:\s*void\s*\{([\s\S]*?)\n\}/);
    assert.ok(m, 'saveState function not found');
    return m[1];
}

test('saveState retries the write (does not give up after one attempt)', () => {
    const body = saveStateBody();
    assert.ok(
        /for\s*\(/.test(body) || /attempt/i.test(body) || /retr/i.test(body),
        'saveState must retry the write to ride out a transient lock'
    );
});

test('saveState dedupes failure logging via a guard flag', () => {
    const body = saveStateBody();
    // A module-level guard so the same persistent failure is not logged every tick.
    assert.ok(
        /_saveFailedLogged/.test(body),
        'saveState must gate failure logging behind a dedupe flag (_saveFailedLogged)'
    );
    assert.ok(
        /_saveFailedLogged/.test(SRC.match(/let _saveFailedLogged|const _saveFailedLogged|var _saveFailedLogged/)?.[0] ?? ''),
        '_saveFailedLogged must be declared at module scope'
    );
});

test('the dedupe flag resets on a successful write', () => {
    const body = saveStateBody();
    // After a successful write, clear the flag so a future failure is reported again.
    assert.ok(
        /_saveFailedLogged\s*=\s*false/.test(body),
        'saveState must reset _saveFailedLogged to false on success'
    );
});

test('failure path still records the error once (logError guarded by the flag)', () => {
    const body = saveStateBody();
    assert.ok(/logError\s*\(|log\s*\(/.test(body), 'persistent failure must still be recorded once');
    // The logError/log on failure must be guarded by an if on the flag.
    assert.ok(
        /if\s*\(\s*!_saveFailedLogged\s*\)/.test(body),
        'failure logging must be gated by `if (!_saveFailedLogged)`'
    );
});

console.log('-'.repeat(70));
if (failed === 0) {
    console.log(`✓ REG-116 passed (${passed} checks).\n`);
    process.exit(0);
}
console.error(`✗ REG-116 FAILED (${failed} of ${passed + failed} checks failed).\n`);
process.exit(1);
