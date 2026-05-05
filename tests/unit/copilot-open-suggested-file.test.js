/**
 * tests/unit/copilot-open-suggested-file.test.js
 * Structural tests for src/features/copilot-open-suggested-file.ts
 * Run: node tests/unit/copilot-open-suggested-file.test.js
 */
'use strict';
const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const Module = require('module');

const OUT = path.join(__dirname, '../../out/features/copilot-open-suggested-file.js');
if (!fs.existsSync(OUT)) { console.error('SKIP: not compiled'); process.exit(0); }

const registered = new Map();
const origLoad = Module._load;
Module._load = function(req, parent, isMain) {
    if (req === 'vscode') {
        return {
            commands: { registerCommand(n, h) { registered.set(n, h); return { dispose() {} }; } },
            window:   { showErrorMessage() {}, showInformationMessage() {}, showQuickPick: async () => undefined, createOutputChannel: () => ({ appendLine() {}, show() {}, dispose() {} }) },
            workspace: { workspaceFolders: null, getConfiguration: () => ({ get: () => undefined }) },
            Uri:      { file: f => ({ fsPath: f }) },
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

console.log('\ncopilot-open-suggested-file unit tests\n' + '─'.repeat(50));

test('module loads without throwing', () => assert.ok(mod));
test('exports activate function', () => assert.strictEqual(typeof mod.activate, 'function'));
test('exports deactivate function', () => assert.strictEqual(typeof mod.deactivate, 'function'));
test('source file has copyright header', () => {
    const src = path.join(__dirname, '../../src/features/copilot-open-suggested-file.ts');
    if (!fs.existsSync(src)) return;
    const content = fs.readFileSync(src, 'utf8');
    assert.ok(content.includes('CieloVista'), 'Missing copyright header');
});
test('activate registers at least one command', () => {
    registered.clear();
    const ctx = { subscriptions: [], globalState: { get: () => undefined, update: async () => {} } };
    mod.activate(ctx);
    assert.ok(registered.size > 0 || ctx.subscriptions.length > 0, 'No commands registered');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
