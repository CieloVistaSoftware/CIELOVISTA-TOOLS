/**
 * tests/unit/doc-header-scan.test.js
 * Structural tests for src/features/doc-header-scan.ts
 * Run: node tests/unit/doc-header-scan.test.js
 */
'use strict';
const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const Module = require('module');

const OUT = path.join(__dirname, '../../out/features/doc-header-scan.js');
if (!fs.existsSync(OUT)) { console.error('SKIP: not compiled'); process.exit(0); }

const registered = new Map();
const origLoad = Module._load;
Module._load = function(req, parent, isMain) {
    if (req === 'vscode') {
        return {
            commands:  { registerCommand(n, h) { registered.set(n, h); return { dispose() {} }; } },
            window:    { showErrorMessage() {}, showInformationMessage() {}, withProgress: async (_, fn) => fn({ report() {} }), createOutputChannel: () => ({ appendLine() {}, show() {}, dispose() {} }) },
            workspace: { workspaceFolders: null, getConfiguration: () => ({ get: () => undefined }) },
            ProgressLocation: { Notification: 15 },
        };
    }
    return origLoad.apply(this, arguments);
};
const sharedOC = path.join(__dirname, '../../out/shared/output-channel.js');
if (fs.existsSync(sharedOC)) { try { require(sharedOC); } catch {} }
const mod = require(OUT);
Module._load = origLoad;

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log(`  ✓ ${name}`); passed++; }
    catch (e) { console.error(`  ✗ ${name}\n    → ${e.message}`); failed++; }
}
console.log('\ndoc-header-scan unit tests\n' + '─'.repeat(50));

test('module loads without throwing', () => assert.ok(mod));
test('exports activate function',    () => assert.strictEqual(typeof mod.activate,   'function'));
test('exports deactivate function',  () => assert.strictEqual(typeof mod.deactivate, 'function'));
test('source file has copyright header', () => {
    const src = path.join(__dirname, '../../src/features/doc-header-scan.ts');
    if (!fs.existsSync(src)) return;
    assert.ok(fs.readFileSync(src, 'utf8').includes('CieloVista'));
});
test('activate registers at least one command', () => {
    registered.clear();
    const ctx = { subscriptions: [] };
    mod.activate(ctx);
    assert.ok(registered.size > 0 || ctx.subscriptions.length > 0);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
