/**
 * tests/unit/project-home-opener.test.js
 *
 * Unit tests for src/features/project-home-opener.ts.
 *
 * Run: node tests/unit/project-home-opener.test.js
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const OUT = path.join(__dirname, '../../out/features/project-home-opener.js');
if (!fs.existsSync(OUT)) {
    console.error(`SKIP: ${OUT} not found - run npm run compile`);
    process.exit(0);
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cvt-home-opener-'));
const existingDir = path.join(tempRoot, 'home-project');
fs.mkdirSync(existingDir, { recursive: true });
const filePath = path.join(tempRoot, 'not-a-folder.txt');
fs.writeFileSync(filePath, 'x', 'utf8');

const registered = new Map();
const errors = [];
const openCalls = [];
const logErrors = [];
const configState = {
    value: '',
    workspaceFolders: undefined,
    throwOpen: false
};

const origLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'vscode') {
        return {
            Uri: { file: (value) => ({ fsPath: value }) },
            workspace: {
                get workspaceFolders() {
                    return configState.workspaceFolders;
                },
                getConfiguration() {
                    return {
                        get(_key, fallback) {
                            return configState.value === undefined ? fallback : configState.value;
                        }
                    };
                }
            },
            window: {
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
    if (request.includes('shared/terminal-utils')) {
        return {
            openFolderInVSCode: async (uri) => {
                openCalls.push(uri);
                if (configState.throwOpen) {
                    throw new Error('open failed');
                }
            }
        };
    }
    if (request.includes('shared/output-channel')) {
        return {
            log() {},
            logError(...args) { logErrors.push(args); }
        };
    }
    return origLoad.call(this, request, parent, isMain);
};

const mod = require(OUT);

let passed = 0;
let failed = 0;

function reset() {
    errors.length = 0;
    openCalls.length = 0;
    logErrors.length = 0;
    configState.throwOpen = false;
}

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
    console.log('\nproject-home-opener unit tests\n' + '-'.repeat(48));

    test('activate registers project open home command', () => {
        const subscriptions = [];
        mod.activate({ subscriptions });
        assert.ok(registered.has('cvs.project.openHome'));
        assert.strictEqual(subscriptions.length, 1);
    });

    await testAsync('missing configuration shows actionable error', async () => {
        reset();
        configState.value = '';
        await registered.get('cvs.project.openHome')();
        assert.strictEqual(errors[0], 'CieloVista home project path is not configured. Set "CieloVista Tools: Home Project Path" in Settings.');
    });

    await testAsync('nonexistent configured path shows not-exist error', async () => {
        reset();
        configState.value = path.join(tempRoot, 'missing-folder');
        await registered.get('cvs.project.openHome')();
        assert.ok(errors[0].includes('does not exist'));
    });

    await testAsync('configured file path shows not-a-folder error', async () => {
        reset();
        configState.value = filePath;
        await registered.get('cvs.project.openHome')();
        assert.ok(errors[0].includes('is not a folder'));
    });

    await testAsync('valid absolute configured path opens folder', async () => {
        reset();
        configState.value = existingDir;
        await registered.get('cvs.project.openHome')();
        assert.strictEqual(openCalls.length, 1);
        assert.strictEqual(openCalls[0].fsPath, existingDir);
        assert.strictEqual(errors.length, 0);
    });

    await testAsync('relative path resolves against first workspace folder', async () => {
        reset();
        const wsRoot = path.join(tempRoot, 'workspace');
        const relDir = path.join(wsRoot, 'relative-home');
        fs.mkdirSync(relDir, { recursive: true });
        configState.workspaceFolders = [{ uri: { fsPath: wsRoot } }];
        configState.value = 'relative-home';
        await registered.get('cvs.project.openHome')();
        assert.strictEqual(openCalls[0].fsPath, relDir);
        configState.workspaceFolders = undefined;
    });

    await testAsync('open failure is logged and surfaced', async () => {
        reset();
        configState.value = existingDir;
        configState.throwOpen = true;
        await registered.get('cvs.project.openHome')();
        assert.strictEqual(errors[0], `Failed to open Project: Open Home: ${existingDir}`);
        assert.strictEqual(logErrors.length, 1);
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
