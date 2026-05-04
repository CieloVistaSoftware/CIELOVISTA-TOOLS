/**
 * tests/unit/python-runner.test.js
 *
 * Unit tests for src/features/python-runner.ts.
 *
 * Run: node tests/unit/python-runner.test.js
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const OUT = path.join(__dirname, '../../out/features/python-runner.js');
if (!fs.existsSync(OUT)) {
    console.error(`SKIP: ${OUT} not found - run npm run compile`);
    process.exit(0);
}

const registered = new Map();
const errors = [];
const sentTexts = [];
const info = { interpreter: 'python', activeUri: undefined, throwTerminal: false };
const logErrors = [];

const terminal = {
    show() {},
    sendText(text) { sentTexts.push(text); }
};

const origLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'vscode') {
        return {
            workspace: {
                getConfiguration() {
                    return {
                        get(_key, fallback) {
                            return info.interpreter ?? fallback;
                        }
                    };
                }
            },
            window: {
                get activeTextEditor() {
                    return info.activeUri ? { document: { uri: info.activeUri } } : undefined;
                },
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
            getActiveOrCreateTerminal(label) {
                if (info.throwTerminal) {
                    throw new Error('terminal failure');
                }
                terminal.label = label;
                return terminal;
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
    sentTexts.length = 0;
    logErrors.length = 0;
    info.interpreter = 'python';
    info.activeUri = undefined;
    info.throwTerminal = false;
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

console.log('\npython-runner unit tests\n' + '-'.repeat(48));

test('activate registers python run file command', () => {
    const subscriptions = [];
    mod.activate({ subscriptions });
    assert.ok(registered.has('cvs.python.runFile'));
    assert.strictEqual(subscriptions.length, 1);
});

test('non-python selection shows error', () => {
    reset();
    registered.get('cvs.python.runFile')({ fsPath: 'C:\\repo\\note.txt' });
    assert.strictEqual(errors[0], 'Please select a Python (.py) file.');
});

test('falls back to active editor uri when no explorer uri is passed', () => {
    reset();
    info.activeUri = { fsPath: 'C:\\repo\\main.py' };
    registered.get('cvs.python.runFile')();
    assert.strictEqual(sentTexts[0], 'python "C:\\repo\\main.py"');
    assert.strictEqual(terminal.label, 'Run: main.py');
});

test('uses configured interpreter path when running selected python file', () => {
    reset();
    info.interpreter = 'C:\\Python\\python.exe';
    registered.get('cvs.python.runFile')({ fsPath: 'C:\\repo\\script.py' });
    assert.strictEqual(sentTexts[0], 'C:\\Python\\python.exe "C:\\repo\\script.py"');
    assert.strictEqual(errors.length, 0);
});

test('terminal creation failures are logged and shown', () => {
    reset();
    info.throwTerminal = true;
    registered.get('cvs.python.runFile')({ fsPath: 'C:\\repo\\script.py' });
    assert.ok(errors[0].startsWith('Failed to run Python file: Error: terminal failure'));
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
