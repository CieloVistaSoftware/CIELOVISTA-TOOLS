/**
 * tests/unit/config-editor.test.js
 *
 * Unit tests for src/features/config-editor.ts.
 *
 * Run: node tests/unit/config-editor.test.js
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const OUT = path.join(__dirname, '../../out/features/config-editor.js');
if (!fs.existsSync(OUT)) {
    console.error(`SKIP: ${OUT} not found - run npm run compile`);
    process.exit(0);
}

const registered = new Map();
const resultCalls = [];

const origLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'vscode') {
        return {
            commands: {
                registerCommand(name, handler) {
                    registered.set(name, handler);
                    return { dispose() {} };
                }
            },
            workspace: { rootPath: 'C:\\repo' }
        };
    }
    if (request.includes('shared/show-result-webview')) {
        return {
            showResultWebview(...args) { resultCalls.push(args); }
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
    console.log('\nconfig-editor unit tests\n' + '-'.repeat(48));

    test('activate registers config edit command', () => {
        const subscriptions = [];
        mod.activate({ subscriptions });
        assert.ok(registered.has('cvs.config.edit'));
        assert.strictEqual(subscriptions.length, 1);
    });

    await testAsync('command opens result webview stub', async () => {
        await registered.get('cvs.config.edit')();
        assert.strictEqual(resultCalls.length, 1);
        assert.strictEqual(resultCalls[0][0], 'Config Editor');
        assert.strictEqual(resultCalls[0][1], 'Opened Config Editor (stub)');
        assert.strictEqual(resultCalls[0][3], 'Config Editor UI coming soon!');
        assert.ok(resultCalls[0][2] >= 0);
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
