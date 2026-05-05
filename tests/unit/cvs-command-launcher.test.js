/**
 * tests/unit/cvs-command-launcher.test.js
 * Structural tests for src/features/cvs-command-launcher/
 * Run: node tests/unit/cvs-command-launcher.test.js
 */
'use strict';
const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const Module = require('module');

const OUT = path.join(__dirname, '../../out/features/cvs-command-launcher.js');
if (!fs.existsSync(OUT)) { console.error('SKIP: not compiled'); process.exit(0); }

const registered = new Map();
const panels = [];
const origLoad = Module._load;
Module._load = function(req, parent, isMain) {
    if (req === 'vscode') {
        return {
            commands:   { registerCommand(n, h) { registered.set(n, h); return { dispose() {} }; }, executeCommand: async () => {} },
            window:     {
                showErrorMessage() {},
                showInformationMessage() {},
                createWebviewPanel(type, title, col, opts) {
                    const p = { webview: { html: '', options: {}, onDidReceiveMessage: () => ({ dispose() {} }), asWebviewUri: u => u }, onDidDispose: () => ({ dispose() {} }), reveal() {}, dispose() {} };
                    panels.push(p);
                    return p;
                },
                createOutputChannel: () => ({ appendLine() {}, show() {}, dispose() {} }),
            },
            workspace:  { workspaceFolders: null, getConfiguration: () => ({ get: () => undefined }), onDidChangeConfiguration: () => ({ dispose() {} }) },
            ViewColumn:  { One: 1, Two: 2 },
            Uri:         { file: f => ({ fsPath: f, toString: () => f }), joinPath: (b, ...s) => b },
            ExtensionContext: {},
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
console.log('\ncvs-command-launcher unit tests\n' + '─'.repeat(50));

test('module loads without throwing', () => assert.ok(mod));
test('exports activate function',    () => assert.strictEqual(typeof mod.activate,   'function'));
test('exports deactivate function',  () => assert.strictEqual(typeof mod.deactivate, 'function'));
test('source directory exists', () => {
    const src = path.join(__dirname, '../../src/features/cvs-command-launcher');
    assert.ok(fs.existsSync(src), 'cvs-command-launcher directory missing');
});
test('catalog.js compiled file exists', () => {
    const catOut = path.join(__dirname, '../../out/features/cvs-command-launcher/catalog.js');
    assert.ok(fs.existsSync(catOut), 'catalog.js not compiled');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
