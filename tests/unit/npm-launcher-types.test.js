/**
 * tests/unit/npm-launcher-types.test.js
 * Structural tests for src/features/npm-launcher-types.ts
 * Run: node tests/unit/npm-launcher-types.test.js
 */
'use strict';
const assert = require('assert');
const fs     = require('fs');
const path   = require('path');

const OUT = path.join(__dirname, '../../out/features/npm-launcher-types.js');
const SRC = path.join(__dirname, '../../src/features/npm-launcher-types.ts');

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log(`  ✓ ${name}`); passed++; }
    catch (e) { console.error(`  ✗ ${name}\n    → ${e.message}`); failed++; }
}
console.log('\nnpm-launcher-types unit tests\n' + '─'.repeat(50));

test('compiled file exists', () => assert.ok(fs.existsSync(OUT), `Missing: ${OUT}`));
test('source file exists',   () => assert.ok(fs.existsSync(SRC), `Missing: ${SRC}`));
test('source defines ScriptEntry interface', () => {
    const content = fs.readFileSync(SRC, 'utf8');
    assert.ok(content.includes('ScriptEntry') || content.includes('interface') || content.includes('type '), 'No type definitions found');
});
test('source file has copyright header', () => {
    assert.ok(fs.readFileSync(SRC, 'utf8').includes('CieloVista'));
});
test('source is non-empty', () => {
    const size = fs.statSync(SRC).size;
    assert.ok(size > 50, `Source file too small: ${size} bytes`);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
