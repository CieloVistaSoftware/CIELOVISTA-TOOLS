/**
 * tests/unit/terminal-prompt-shortener.test.js
 *
 * Unit tests for src/features/terminal-prompt-shortener.ts.
 *
 * Run: node tests/unit/terminal-prompt-shortener.test.js
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const OUT = path.join(__dirname, '../../out/features/terminal-prompt-shortener.js');
if (!fs.existsSync(OUT)) {
    console.error(`SKIP: ${OUT} not found - run npm run compile`);
    process.exit(0);
}

const sentTexts = [];
const infoMessages = [];
const registered = new Map();
const terminal = {
    show() {},
    sendText(text) { sentTexts.push(text); }
};

const origLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'vscode') {
        return {
            window: {
                showInformationMessage(message) { infoMessages.push(message); }
            },
            commands: {
                registerCommand(name, handler) {
                    registered.set(name, handler);
                    return { dispose() {} };
                }
            }
        };
    }
    if (request.includes('shared/terminal-utils')) {
        return { getActiveOrCreateTerminal: () => terminal };
    }
    if (request.includes('shared/output-channel')) {
        return { log() {} };
    }
    return origLoad.call(this, request, parent, isMain);
};

const mod = require(OUT);
Module._load = origLoad;

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  OK ${name}`);
        passed++;
    } catch (err) {
        console.error(`  FAIL ${name}`);
        console.error(`    -> ${err.message}`);
        failed++;
    }
}

console.log('\nterminal-prompt-shortener unit tests\n' + '-'.repeat(48));

test('activate registers toggle prompt command', () => {
    const subscriptions = [];
    mod.activate({ subscriptions });
    assert.ok(registered.has('cvs.terminal.togglePromptLength'));
    assert.strictEqual(subscriptions.length, 1);
});

test('first invocation sends short prompt script and short status message', () => {
    const handler = registered.get('cvs.terminal.togglePromptLength');
    assert.ok(handler, 'command handler not registered');

    handler();

    assert.strictEqual(sentTexts[0], "function prompt { '> ' }");
    assert.strictEqual(infoMessages[0], 'Terminal prompt: SHORT (>)');
});

test('second invocation sends full prompt restore script and full status message', () => {
    const handler = registered.get('cvs.terminal.togglePromptLength');
    handler();

    assert.strictEqual(sentTexts[1], "function prompt { \"PS $($executionContext.SessionState.Path.CurrentLocation)$('>' * ($nestedPromptLevel + 1)) \" }");
    assert.strictEqual(infoMessages[1], 'Terminal prompt: FULL (path)');
});

console.log('-'.repeat(48));
if (failed === 0) {
    console.log(`PASS ${passed} passed`);
    process.exit(0);
}

console.error(`FAIL ${failed} failed, ${passed} passed`);
process.exit(1);
