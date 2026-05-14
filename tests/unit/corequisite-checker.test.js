/**
 * tests/unit/corequisite-checker.test.js
 * Structural tests for src/features/corequisite-checker.ts
 * Run: node tests/unit/corequisite-checker.test.js
 */
'use strict';
const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const Module = require('module');

const OUT = path.join(__dirname, '../../out/features/corequisite-checker.js');
if (!fs.existsSync(OUT)) { console.error('SKIP: not compiled'); process.exit(0); }

const registered = new Map();
const origLoad = Module._load;
Module._load = function(req, parent, isMain) {
    if (req === 'vscode') {
        return {
            commands:  { registerCommand(n, h) { registered.set(n, h); return { dispose() {} }; } },
            window:    { showErrorMessage() {}, showInformationMessage() {}, showWarningMessage() {}, createOutputChannel: () => ({ appendLine() {}, show() {}, dispose() {} }) },
            workspace: { workspaceFolders: null, getConfiguration: () => ({ get: () => undefined }) },
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
console.log('\ncorequisite-checker unit tests\n' + '─'.repeat(50));

test('module loads without throwing', () => assert.ok(mod));
test('exports activate function',    () => assert.strictEqual(typeof mod.activate,   'function'));
test('exports deactivate function',  () => assert.strictEqual(typeof mod.deactivate, 'function'));
test('source file has copyright header', () => {
    const src = path.join(__dirname, '../../src/features/corequisite-checker.ts');
    if (!fs.existsSync(src)) return;
    assert.ok(fs.readFileSync(src, 'utf8').includes('CieloVista'));
});
test('source installs via VS Code command first', () => {
    const src = path.join(__dirname, '../../src/features/corequisite-checker.ts');
    if (!fs.existsSync(src)) return;
    const text = fs.readFileSync(src, 'utf8');
    assert.ok(text.includes("workbench.extensions.installExtension"));
});
test('source has Windows-safe CLI fallback for .cmd/.bat', () => {
    const src = path.join(__dirname, '../../src/features/corequisite-checker.ts');
    if (!fs.existsSync(src)) return;
    const text = fs.readFileSync(src, 'utf8');
    assert.ok(text.includes('spawnSync'));
    assert.ok(text.includes('/\\.(cmd|bat)\\$/i'));
    assert.ok(text.includes("process.env.ComSpec || 'cmd.exe'"));
});
test('activate does not throw synchronously', () => {
    const ctx = { subscriptions: [] };
    assert.doesNotThrow(() => mod.activate(ctx));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
