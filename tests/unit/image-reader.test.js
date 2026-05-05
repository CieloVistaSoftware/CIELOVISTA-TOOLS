/**
 * tests/unit/image-reader.test.js
 * Structural tests for src/features/image-reader.ts
 * Run: node tests/unit/image-reader.test.js
 */
'use strict';
const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const Module = require('module');

const OUT = path.join(__dirname, '../../out/features/image-reader.js');
if (!fs.existsSync(OUT)) { console.error('SKIP: not compiled'); process.exit(0); }

const registered = new Map();
const origLoad = Module._load;
Module._load = function(req, parent, isMain) {
    if (req === 'vscode') {
        return {
            commands:  { registerCommand(n, h) { registered.set(n, h); return { dispose() {} }; } },
            window:    { showErrorMessage() {}, showInformationMessage() {}, createWebviewPanel: () => ({ webview: { html: '', onDidReceiveMessage: () => ({ dispose() {} }), asWebviewUri: u => u }, onDidDispose: () => ({ dispose() {} }), reveal() {} }), createOutputChannel: () => ({ appendLine() {}, show() {}, dispose() {} }) },
            workspace: { workspaceFolders: null, getConfiguration: () => ({ get: () => undefined }) },
            ViewColumn: { One: 1 },
            Uri:        { file: f => ({ fsPath: f, toString: () => f }) },
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
console.log('\nimage-reader unit tests\n' + '─'.repeat(50));

test('module loads without throwing', () => assert.ok(mod));
test('exports activate function',    () => assert.strictEqual(typeof mod.activate,   'function'));
test('exports deactivate function',  () => assert.strictEqual(typeof mod.deactivate, 'function'));
test('source file has copyright header', () => {
    const src = path.join(__dirname, '../../src/features/image-reader.ts');
    if (!fs.existsSync(src)) return;
    assert.ok(fs.readFileSync(src, 'utf8').includes('CieloVista'));
});
test('activate does not throw synchronously', () => {
    assert.doesNotThrow(() => mod.activate({ subscriptions: [] }));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
