/**
 * tests/unit/terminal-set-folder.test.js
 *
 * Unit tests for src/features/terminal-set-folder.ts.
 *
 * Run: node tests/unit/terminal-set-folder.test.js
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const OUT = path.join(__dirname, '../../out/features/terminal-set-folder.js');
if (!fs.existsSync(OUT)) {
    console.error(`SKIP: ${OUT} not found - run npm run compile`);
    process.exit(0);
}

const registered = new Map();
const cdCalls = [];

const origLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'vscode') {
        return {
            commands: {
                registerCommand(name, handler) {
                    registered.set(name, handler);
                    return { dispose() {} };
                }
            }
        };
    }
    if (request.includes('shared/terminal-utils')) {
        return {
            cdToFolderFromUri(uri) {
                cdCalls.push(uri);
                return 'cd-result';
            }
        };
    }
    if (request.includes('shared/output-channel')) {
        return { log() {} };
    }
    return origLoad.call(this, request, parent, isMain);
};

const mod = require(OUT);

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

console.log('\nterminal-set-folder unit tests\n' + '-'.repeat(48));

test('activate registers terminal set folder command', () => {
    const subscriptions = [];
    mod.activate({ subscriptions });
    assert.ok(registered.has('cvs.terminal.setFolder'));
    assert.strictEqual(subscriptions.length, 1);
});

test('registered command delegates uri to cdToFolderFromUri', () => {
    const uri = { fsPath: 'C:\\repo\\folder' };
    const result = registered.get('cvs.terminal.setFolder')(uri);
    assert.strictEqual(result, 'cd-result');
    assert.strictEqual(cdCalls.length, 1);
    assert.strictEqual(cdCalls[0], uri);
});

console.log('-'.repeat(48));
Module._load = origLoad;
if (failed === 0) {
    console.log(`PASS ${passed} passed`);
    process.exit(0);
}

console.error(`FAIL ${failed} failed, ${passed} passed`);
process.exit(1);
