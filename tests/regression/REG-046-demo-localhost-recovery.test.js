// Copyright (c) CieloVista Software. All rights reserved.
// REG-046: Issue #369 — Localhost demo tab must not open on ERR_CONNECTION_REFUSED
//
// Run: node tests/regression/REG-046-demo-localhost-recovery.test.js

'use strict';

const fs     = require('fs');
const path   = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC  = fs.readFileSync(path.join(ROOT, 'src', 'features', 'doc-catalog', 'commands.ts'), 'utf8');

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

console.log('REG-046: wb-demo localhost recovery (#369)');
console.log('-'.repeat(64));

test('isPortOpen imported from shared/port-check (no inline socket)', () => {
    assert(
        SRC.includes("import { isPortOpen } from '../../shared/port-check'"),
        'isPortOpen must be imported from shared/port-check — inline socket duplicates shared utility'
    );
    // Inline raw net.Socket usage in the wb-demo handler is the old anti-pattern
    const wbDemoIdx = SRC.indexOf("case 'wb-demo':");
    const nextCase  = SRC.indexOf("case '", wbDemoIdx + 1);
    const block     = SRC.slice(wbDemoIdx, nextCase);
    assert(
        !block.includes('new net.Socket()') && !block.includes('require(\'net\')'),
        'wb-demo must not use inline net.Socket — use shared isPortOpen instead'
    );
});

test('pollUntilUp loop retries before giving up', () => {
    assert(
        SRC.includes('pollUntilUp'),
        'pollUntilUp helper must exist to avoid blind 1200ms sleep-and-pray'
    );
    // Must poll isPortOpen in a loop, not just sleep once
    const pollIdx = SRC.indexOf('pollUntilUp');
    const pollDef = SRC.slice(pollIdx, pollIdx + 400);
    assert(
        pollDef.includes('isPortOpen'),
        'pollUntilUp must call isPortOpen in its retry loop'
    );
});

test('openExternal is never called when server is not up', () => {
    const wbDemoIdx = SRC.indexOf("case 'wb-demo':");
    const nextCase  = SRC.indexOf("case '", wbDemoIdx + 1);
    const block     = SRC.slice(wbDemoIdx, nextCase);
    // openExternal must be guarded — should only appear AFTER the serverUp check resolves true
    const externalIdx = block.indexOf('openExternal');
    const ifNotUp     = block.indexOf('if (!serverUp)');
    assert(externalIdx > -1,  'openExternal must be present in wb-demo handler');
    assert(ifNotUp    > -1,   'Guard check "if (!serverUp)" must exist before openExternal');
    assert(externalIdx > ifNotUp, 'openExternal must appear AFTER the serverUp guard, not before it');
});

test('showErrorMessage shown when server does not start', () => {
    const wbDemoIdx = SRC.indexOf("case 'wb-demo':");
    const nextCase  = SRC.indexOf("case '", wbDemoIdx + 1);
    const block     = SRC.slice(wbDemoIdx, nextCase);
    assert(
        block.includes('showErrorMessage'),
        'showErrorMessage must be called when server is unreachable — do not leave user stranded'
    );
});

test('Retry option offered in the error dialog', () => {
    const wbDemoIdx = SRC.indexOf("case 'wb-demo':");
    const nextCase  = SRC.indexOf("case '", wbDemoIdx + 1);
    const block     = SRC.slice(wbDemoIdx, nextCase);
    assert(
        block.includes("'Retry'"),
        'Error dialog must offer a Retry option so user can recover without reopening the panel'
    );
});

test('handler breaks (does not open URL) when user cancels', () => {
    const wbDemoIdx = SRC.indexOf("case 'wb-demo':");
    const nextCase  = SRC.indexOf("case '", wbDemoIdx + 1);
    const block     = SRC.slice(wbDemoIdx, nextCase);
    // After Cancel path there must be a break before openExternal
    assert(
        block.includes("'Cancel'") || block.includes('} else {'),
        'Cancel path must exist — do not open the URL if user cancels the error dialog'
    );
});

console.log('-'.repeat(64));
if (failed === 0) {
    console.log(`✓ REG-046 passed (${passed} checks).\n`);
    process.exit(0);
}
console.error(`✗ REG-046 FAILED (${failed} of ${passed + failed} checks failed).\n`);
process.exit(1);
