// Copyright (c) 2026 CieloVista Software. All rights reserved.
// REG-115: notify-server must not auto-file an APP_ERROR when the port is
// already in use (#591).
//
// EADDRINUSE on 127.0.0.1:52199 just means another CVT window already owns the
// notify bridge — an expected condition with multiple windows open. logError()
// persists to the error log, which auto-files a GitHub issue, so an expected
// condition must use log() (output channel only), not logError().

'use strict';

const fs     = require('fs');
const path   = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', '..');
const SRC  = fs.readFileSync(
    path.join(ROOT, 'src', 'features', 'notify-server.ts'), 'utf8');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try   { fn(); console.log(`  PASS ${name}`); passed++; }
    catch (e) { console.error(`  FAIL ${name}\n       ${e.message}`); failed++; }
}

console.log('REG-115: notify-server — EADDRINUSE is not auto-filed (#591)');
console.log('-'.repeat(70));

// Isolate the EADDRINUSE branch body.
function eaddrinuseBlock() {
    const m = SRC.match(/if\s*\(\s*err\.code === 'EADDRINUSE'\s*\)\s*\{([\s\S]*?)\}\s*else/);
    assert.ok(m, 'EADDRINUSE branch not found');
    return m[1];
}

test('EADDRINUSE branch does NOT call logError (would auto-file)', () => {
    assert.ok(
        !/logError\s*\(/.test(eaddrinuseBlock()),
        'EADDRINUSE must not use logError — it auto-files an APP_ERROR for an expected condition'
    );
});

test('EADDRINUSE branch logs via log() instead', () => {
    assert.ok(
        /\blog\s*\(/.test(eaddrinuseBlock()),
        'EADDRINUSE should still be recorded via log() to the output channel'
    );
});

test('genuine (non-EADDRINUSE) server errors still use logError', () => {
    // The else branch of the same error handler must keep logError.
    const m = SRC.match(/'EADDRINUSE'[\s\S]*?else\s*\{([\s\S]*?)\}\s*\)\s*;/);
    assert.ok(m, 'else branch of error handler not found');
    assert.ok(/logError\s*\(/.test(m[1]), 'real server errors must still logError');
});

console.log('-'.repeat(70));
if (failed === 0) {
    console.log(`✓ REG-115 passed (${passed} checks).\n`);
    process.exit(0);
}
console.error(`✗ REG-115 FAILED (${failed} of ${passed + failed} checks failed).\n`);
process.exit(1);
