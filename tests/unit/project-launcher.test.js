/**
 * tests/unit/project-launcher.test.js
 *
 * Unit tests for src/features/project-launcher.ts.
 *
 * Run: node tests/unit/project-launcher.test.js
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const OUT = path.join(__dirname, '../../out/features/project-launcher.js');
if (!fs.existsSync(OUT)) {
    console.error(`SKIP: ${OUT} not found - run npm run compile`);
    process.exit(0);
}

const registered = new Map();
const warnings = [];
const errors = [];
const logs = [];
const terminals = [];
const quickPickCalls = [];

const state = {
    registryPath: 'C:\\Users\\jwpmi\\Downloads\\CieloVistaStandards\\project-registry.json',
    projectPath: 'C:\\dev\\demo-project',
    packagePath: 'C:\\dev\\demo-project\\package.json',
    allowFixedPaths: false,
    includeRegistry: false,
    quickPickResult: undefined
};

function makeTerminal(name, cwd) {
    return {
        name,
        cwd,
        sent: [],
        show() {},
        sendText(text) { this.sent.push(text); }
    };
}

const origLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'vscode') {
        return {
            QuickPickItemKind: { Separator: -1 },
            window: {
                terminals,
                createTerminal({ name, cwd }) {
                    const terminal = makeTerminal(name, cwd);
                    terminals.push(terminal);
                    return terminal;
                },
                async showQuickPick(items) {
                    quickPickCalls.push(items);
                    return state.quickPickResult;
                },
                showWarningMessage(message) { warnings.push(message); },
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
    if (request === 'fs') {
        return {
            existsSync(target) {
                if (target === state.registryPath) {
                    return state.includeRegistry;
                }
                if (state.allowFixedPaths && typeof target === 'string' && target.includes('source\\repos')) {
                    return true;
                }
                if (target === state.projectPath || target === state.packagePath) {
                    return state.allowFixedPaths || state.includeRegistry;
                }
                return false;
            },
            readFileSync(target) {
                if (target === state.registryPath) {
                    return JSON.stringify({
                        globalDocsPath: 'C:\\global',
                        projects: [
                            { name: 'Demo Project', path: state.projectPath, type: 'node', description: 'demo' }
                        ]
                    });
                }
                if (target === state.packagePath) {
                    return JSON.stringify({ scripts: { start: 'node app.js', build: 'tsc -p .' } });
                }
                throw new Error('unexpected read: ' + target);
            },
            readdirSync(target) {
                if (target === state.projectPath) {
                    return ['package.json'];
                }
                return [];
            }
        };
    }
    if (request.includes('shared/output-channel')) {
        return {
            log(...args) { logs.push(args); },
            logError() {}
        };
    }
    return origLoad.call(this, request, parent, isMain);
};

const mod = require(OUT);

let passed = 0;
let failed = 0;

function reset() {
    warnings.length = 0;
    errors.length = 0;
    logs.length = 0;
    terminals.length = 0;
    quickPickCalls.length = 0;
    state.allowFixedPaths = false;
    state.includeRegistry = false;
    state.quickPickResult = undefined;
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
    console.log('\nproject-launcher unit tests\n' + '-'.repeat(48));

    test('activate registers fixed launch commands and picker', () => {
        const subscriptions = [];
        mod.activate({ subscriptions });
        assert.ok(registered.has('cvs.launch.snapit.start'));
        assert.ok(registered.has('cvs.launch.diskcleanup.build'));
        assert.ok(registered.has('cvs.launch.pick'));
        assert.ok(subscriptions.length >= 10);
    });

    test('fixed launch command shows error when project folder is missing', () => {
        reset();
        registered.get('cvs.launch.snapit.start')();
        assert.ok(errors[0].includes('Project folder not found'));
    });

    test('fixed launch command reuses terminal flow when project folder exists', () => {
        reset();
        state.allowFixedPaths = true;
        registered.get('cvs.launch.snapit.start')();
        assert.strictEqual(terminals.length, 1);
        assert.strictEqual(terminals[0].name, 'SnapIt Service');
        assert.strictEqual(terminals[0].sent[0], 'npm start');
    });

    await testAsync('picker warns when registry has no projects', async () => {
        reset();
        await registered.get('cvs.launch.pick')();
        assert.strictEqual(warnings[0], 'No projects found in registry.');
    });

    await testAsync('picker shows dynamic actions and launches picked action', async () => {
        reset();
        state.includeRegistry = true;
        state.quickPickResult = {
            action: {
                label: 'Demo Project: start',
                command: 'npm run start',
                cwd: state.projectPath
            }
        };
        await registered.get('cvs.launch.pick')();
        assert.strictEqual(quickPickCalls.length, 1);
        assert.strictEqual(terminals.length, 1);
        assert.strictEqual(terminals[0].name, 'Demo Project: start');
        assert.strictEqual(terminals[0].sent[0], 'npm run start');
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
