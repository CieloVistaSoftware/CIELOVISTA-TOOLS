/**
 * tests/unit/terminal-folder-tracker.test.js
 *
 * Unit tests for helper exports in src/features/terminal-folder-tracker.ts.
 *
 * Run: node tests/unit/terminal-folder-tracker.test.js
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const OUT = path.join(__dirname, '../../out/features/terminal-folder-tracker.js');
if (!fs.existsSync(OUT)) {
    console.error(`SKIP: ${OUT} not found - run npm run compile`);
    process.exit(0);
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cvt-terminal-folder-tracker-'));

const origLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'vscode') {
        return {
            window: { onDidOpenTerminal: () => ({ dispose() {} }) },
            commands: { registerCommand: () => ({ dispose() {} }) }
        };
    }
    if (request.includes('shared/terminal-utils')) {
        return {
            getAppDataPath: () => tempRoot,
            getActiveOrCreateTerminal: () => ({ show() {}, sendText() {} })
        };
    }
    if (request.includes('shared/output-channel')) {
        return { log() {}, logError() {} };
    }
    return origLoad.call(this, request, parent, isMain);
};

const mod = require(OUT);
Module._load = origLoad;

const testApi = mod && mod._test;
if (!testApi || typeof testApi.saveLastFolder !== 'function' || typeof testApi.readLastFolder !== 'function') {
    console.error('SKIP: _test helpers not exported from out/features/terminal-folder-tracker.js');
    process.exit(0);
}

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

console.log('\nterminal-folder-tracker unit tests\n' + '-'.repeat(48));

test('STATE_FILE resolves under mocked app data path', () => {
    assert.ok(testApi.STATE_FILE.startsWith(tempRoot), `expected STATE_FILE to start with ${tempRoot}, got ${testApi.STATE_FILE}`);
});

test('readLastFolder returns undefined when file does not exist', () => {
    if (fs.existsSync(testApi.STATE_FILE)) {
        fs.unlinkSync(testApi.STATE_FILE);
    }
    assert.strictEqual(testApi.readLastFolder(), undefined);
});

test('saveLastFolder persists path and readLastFolder returns exact value', () => {
    const folder = path.join(tempRoot, 'demo-folder');
    fs.mkdirSync(folder, { recursive: true });

    testApi.saveLastFolder(folder);

    assert.strictEqual(testApi.readLastFolder(), folder);
    assert.strictEqual(fs.readFileSync(testApi.STATE_FILE, 'utf8'), folder);
});

test('readLastFolder trims trailing whitespace', () => {
    fs.writeFileSync(testApi.STATE_FILE, 'C:\\temp\\x   \n\r', 'utf8');
    assert.strictEqual(testApi.readLastFolder(), 'C:\\temp\\x');
});

console.log('-'.repeat(48));
if (failed === 0) {
    console.log(`PASS ${passed} passed`);
    process.exit(0);
}

console.error(`FAIL ${failed} failed, ${passed} passed`);
process.exit(1);
