/**
 * tests/unit/explorer-copy-path-to-chat.test.js
 *
 * Unit tests for src/features/explorer-copy-path-to-chat.ts.
 *
 * Run: node tests/unit/explorer-copy-path-to-chat.test.js
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const OUT = path.join(__dirname, '../../out/features/explorer-copy-path-to-chat.js');
if (!fs.existsSync(OUT)) {
    console.error(`SKIP: ${OUT} not found - run npm run compile`);
    process.exit(0);
}

const registered = new Map();
const warnings = [];
const infos = [];
const errors = [];
const loggedErrors = [];
let sendBehavior = 'success';

const origLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'vscode') {
        return {
            window: {
                showWarningMessage(message) { warnings.push(message); },
                showInformationMessage(message) { infos.push(message); },
                showErrorMessage(message) { errors.push(message); }
            },
            commands: {
                registerCommand(name, handler) {
                    registered.set(name, handler);
                    return { dispose() {} };
                }
            }
        };
    }
    if (request.includes('shared/output-channel')) {
        return {
            log() {},
            logError(...args) { loggedErrors.push(args); }
        };
    }
    if (request.includes('terminal-copy-output')) {
        return {
            sendToCopilotChat: async (value) => {
                if (sendBehavior === 'throw') {
                    throw new Error('chat unavailable');
                }
                return sendBehavior === 'success';
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

function resetArrays() {
    warnings.length = 0;
    infos.length = 0;
    errors.length = 0;
    loggedErrors.length = 0;
}

(async () => {
    console.log('\nexplorer-copy-path-to-chat unit tests\n' + '-'.repeat(48));

    test('activate registers copy path command', () => {
        const subscriptions = [];
        mod.activate({ subscriptions });
        assert.ok(registered.has('cvs.explorer.copyPathToCopilotChat'));
        assert.strictEqual(subscriptions.length, 1);
    });

    await testAsync('missing uri shows warning', async () => {
        resetArrays();
        await registered.get('cvs.explorer.copyPathToCopilotChat')();
        assert.strictEqual(warnings[0], 'No file selected. Right-click a file in Explorer and try again.');
    });

    await testAsync('uri without fsPath shows warning', async () => {
        resetArrays();
        await registered.get('cvs.explorer.copyPathToCopilotChat')({});
        assert.strictEqual(warnings[0], 'Selected resource has no local file path.');
    });

    await testAsync('successful chat insertion shows info message', async () => {
        resetArrays();
        sendBehavior = 'success';
        await registered.get('cvs.explorer.copyPathToCopilotChat')({ fsPath: 'C:\\repo\\file.ts' });
        assert.strictEqual(infos[0], 'File path added to Copilot chat input.');
        assert.strictEqual(warnings.length, 0);
    });

    await testAsync('clipboard fallback shows warning message', async () => {
        resetArrays();
        sendBehavior = 'fallback';
        await registered.get('cvs.explorer.copyPathToCopilotChat')({ fsPath: 'C:\\repo\\file.ts' });
        assert.strictEqual(warnings[0], 'Could not insert into Copilot chat. Path copied to clipboard; press Ctrl+V in chat.');
        assert.strictEqual(infos.length, 0);
    });

    await testAsync('chat errors are logged and surfaced', async () => {
        resetArrays();
        sendBehavior = 'throw';
        await registered.get('cvs.explorer.copyPathToCopilotChat')({ fsPath: 'C:\\repo\\file.ts' });
        assert.strictEqual(errors[0], 'Failed to send file path to Copilot chat: chat unavailable');
        assert.strictEqual(loggedErrors.length, 1);
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
