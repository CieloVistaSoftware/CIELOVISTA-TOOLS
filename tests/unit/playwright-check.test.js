/**
 * tests/unit/playwright-check.test.js
 * Structural tests for src/features/playwright-check.ts
 * Run: node tests/unit/playwright-check.test.js
 */
'use strict';
const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const Module = require('module');

const OUT = path.join(__dirname, '../../out-test/features/playwright-check.js');
if (!fs.existsSync(OUT)) { console.error('SKIP: not compiled'); process.exit(0); }

const registered = new Map();
const origLoad = Module._load;
Module._load = function(req, parent, isMain) {
    if (req === 'vscode') {
        return {
            commands:  { registerCommand(n, h) { registered.set(n, h); return { dispose() {} }; } },
            window:    { showErrorMessage() {}, showInformationMessage() {}, createOutputChannel: () => ({ appendLine() {}, show() {}, dispose() {} }) },
            workspace: { workspaceFolders: null, getConfiguration: () => ({ get: () => undefined }) },
        };
    }
    return origLoad.apply(this, arguments);
};
const sharedOC = path.join(__dirname, '../../out-test/shared/output-channel.js');
if (fs.existsSync(sharedOC)) { try { require(sharedOC); } catch {} }
const mod = require(OUT);
Module._load = origLoad;

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log(`  ✓ ${name}`); passed++; }
    catch (e) { console.error(`  ✗ ${name}\n    → ${e.message}`); failed++; }
}
console.log('\nplaywright-check unit tests\n' + '─'.repeat(50));

test('module loads without throwing',       () => assert.ok(mod));
test('exports runPlaywrightCheck function', () => assert.strictEqual(typeof mod.runPlaywrightCheck, 'function'));
test('exports activate and deactivate (#768: it had neither, so nothing could wire it)', () => {
    assert.strictEqual(typeof mod.activate, 'function');
    assert.strictEqual(typeof mod.deactivate, 'function');
});
test('activate registers cvs.audit.playwrightSetup, not the test-coverage-auditor id', () => {
    const context = { subscriptions: [] };
    mod.activate(context);
    assert.ok(registered.has('cvs.audit.playwrightSetup'), `registered: ${[...registered.keys()].join(', ')}`);
    assert.ok(!registered.has('cvs.audit.testCoverage'), 'cvs.audit.testCoverage belongs to test-coverage-auditor.ts');
    assert.strictEqual(context.subscriptions.length, 1);
    mod.deactivate();
});
test('source file has copyright header', () => {
    const src = path.join(__dirname, '../../src/features/playwright-check.ts');
    if (!fs.existsSync(src)) return;
    assert.ok(fs.readFileSync(src, 'utf8').includes('CieloVista'));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
