// Copyright (c) 2026 CieloVista Software. All rights reserved.
// REG-126: launcher root path constants must still resolve after the
// os.homedir() move -- covers tests/utils/parse-path-const.js (#687).
//
// The helper exists because catalog-integrity and command-validation used to
// read launcher root paths with a literal-only regex, which silently returned
// '' once those constants became path.join(os.homedir(), ...). An empty result
// is the dangerous case: the "commands map to real scripts" checks then pass
// vacuously. These cases pin both forms and the empty-on-unknown contract.

'use strict';

const assert = require('assert');
const os     = require('os');
const path   = require('path');
const { parsePathConst } = require('../utils/parse-path-const.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try   { fn(); console.log(`  PASS ${name}`); passed++; }
    catch (e) { console.error(`  FAIL ${name}\n       ${e.message}`); failed++; }
}

console.log('REG-126: launcher path constants resolve from source text (#687)');
console.log('-'.repeat(70));

test('resolves path.join(os.homedir(), ...)', () => {
    const src = "const _SNAPIT_ROOT = path.join(os.homedir(), 'source', 'repos', 'SnapIt');";
    assert.strictEqual(
        parsePathConst(src, '_SNAPIT_ROOT'),
        path.join(os.homedir(), 'source', 'repos', 'SnapIt'));
});

test('resolves a plain escaped string literal', () => {
    const src = "const OLD = 'C:\\\\Users\\\\someone\\\\repos';";
    assert.strictEqual(parsePathConst(src, 'OLD'), 'C:\\Users\\someone\\repos');
});

test('resolves a constant built from another constant', () => {
    const src = [
        "const _SNAPIT_ROOT = path.join(os.homedir(), 'source', 'repos', 'SnapIt');",
        "const _SNAPIT_SVC  = path.join(_SNAPIT_ROOT, 'SnapIt.Service');",
    ].join('\n');
    assert.strictEqual(
        parsePathConst(src, '_SNAPIT_SVC'),
        path.join(os.homedir(), 'source', 'repos', 'SnapIt', 'SnapIt.Service'));
});

test('returns empty string for an unknown constant', () => {
    assert.strictEqual(parsePathConst("const A = 'x';", 'B'), '');
});

test('returns empty string rather than guessing at an unsupported form', () => {
    const src = "const X = path.join(process.env.SOMETHING, 'a');";
    assert.strictEqual(parsePathConst(src, 'X'), '');
});

test('does not hang on a self-referential constant', () => {
    assert.strictEqual(parsePathConst("const X = path.join(X, 'a');", 'X'), '');
});

test('resolves the real launcher roots from cvs-command-launcher source', () => {
    const fs  = require('fs');
    const src = fs.readFileSync(
        path.join(__dirname, '..', '..', 'src', 'features', 'cvs-command-launcher', 'index.ts'), 'utf8');
    for (const name of ['_SNAPIT_ROOT', '_DISKCLEANUP_ROOT']) {
        const resolved = parsePathConst(src, name);
        assert.ok(resolved.length > 0, `${name} must resolve to a non-empty path`);
        assert.ok(path.isAbsolute(resolved), `${name} must resolve to an absolute path, got: ${resolved}`);
    }
});

console.log('-'.repeat(70));
console.log(`REG-126: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
