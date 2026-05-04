/**
 * tests/unit/open-folder-as-root.test.js
 *
 * Unit tests for src/features/open-folder-as-root.ts.
 *
 * Run: node tests/unit/open-folder-as-root.test.js
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const OUT = path.join(__dirname, '../../out/features/open-folder-as-root.js');
if (!fs.existsSync(OUT)) {
    console.error(`SKIP: ${OUT} not found - run npm run compile`);
    process.exit(0);
}

const registered = new Map();
const commandCalls = [];
const resultCalls = [];

const origLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'vscode') {
        return {
            commands: {
                registerCommand(name, handler) {
                    registered.set(name, handler);
                    return { dispose() {} };
                },
                executeCommand(name, ...args) {
                    commandCalls.push({ name, args });
                    return Promise.resolve(true);
                }
            }
        };
    }
    if (request.includes('shared/output-channel')) {
        return { log() {} };
    }
    if (request.includes('shared/show-result-webview')) {
        return {
            showResultWebview(title, action, duration, html) {
                resultCalls.push({ title, action, duration, html });
            }
        };
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

async function testAsync(name, fn) {
    try {
        await fn();
        console.log(`  OK ${name}`);
        passed++;
    } catch (err) {
        console.error(`  FAIL ${name}`);
        console.error(`    -> ${err.message}`);
        failed++;
    }
}

(async () => {
    console.log('\nopen-folder-as-root unit tests\n' + '-'.repeat(48));

    test('activate registers explorer open-folder command', () => {
        const subscriptions = [];
        mod.activate({ subscriptions });
        assert.ok(registered.has('cvs.explorer.openFolderAsRoot'));
        assert.strictEqual(subscriptions.length, 1);
    });

    test('missing uri shows result webview instead of opening folder', () => {
        const handler = registered.get('cvs.explorer.openFolderAsRoot');
        handler();

        assert.strictEqual(resultCalls.length, 1);
        assert.strictEqual(resultCalls[0].title, 'No Folder Selected');
        assert.strictEqual(commandCalls.length, 0);
    });

    await testAsync('uri calls vscode.openFolder with forceNewWindow false', async () => {
        const handler = registered.get('cvs.explorer.openFolderAsRoot');
        const uri = { fsPath: 'C:\\repo\\folder' };

        await handler(uri);

        assert.strictEqual(commandCalls.length, 1);
        assert.strictEqual(commandCalls[0].name, 'vscode.openFolder');
        assert.strictEqual(commandCalls[0].args[0], uri);
        assert.deepStrictEqual(commandCalls[0].args[1], { forceNewWindow: false });
    });

    console.log('-'.repeat(48));
    Module._load = origLoad;
    if (failed === 0) {
        console.log(`PASS ${passed} passed`);
        process.exit(0);
    }

    console.error(`FAIL ${failed} failed, ${passed} passed`);
    process.exit(1);
})();
