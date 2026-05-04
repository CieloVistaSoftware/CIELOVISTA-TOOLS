/**
 * tests/unit/terminal-copy-output.test.js
 *
 * Unit tests for helper exports in src/features/terminal-copy-output.ts.
 *
 * Run: node tests/unit/terminal-copy-output.test.js
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const OUT = path.join(__dirname, '../../out/features/terminal-copy-output.js');
if (!fs.existsSync(OUT)) {
    console.error(`SKIP: ${OUT} not found - run npm run compile`);
    process.exit(0);
}

const origLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'vscode') {
        return {
            commands: { registerCommand: () => ({ dispose() {} }) },
            window: {},
            env: { clipboard: { readText: async () => '', writeText: async () => {} } }
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
if (!testApi || typeof testApi.sanitizeTerminalOutput !== 'function' || typeof testApi.extractLastCommandLine !== 'function') {
    console.error('SKIP: _test helpers not exported from out/features/terminal-copy-output.js');
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

console.log('\nterminal-copy-output unit tests\n' + '-'.repeat(48));

test('sanitizeTerminalOutput removes History restored banner and trims result', () => {
    const raw = '* History restored\nhello\n';
    assert.strictEqual(testApi.sanitizeTerminalOutput(raw), 'hello');
});

test('sanitizeTerminalOutput removes empty continuation prompt lines without collapsing normal spacing', () => {
    const raw = 'line 1\n>\nline 2';
    assert.strictEqual(testApi.sanitizeTerminalOutput(raw), 'line 1\n\nline 2');
});

test('sanitizeTerminalOutput collapses repeated duplicate lines', () => {
    const raw = 'boom\nboom\nboom';
    assert.strictEqual(testApi.sanitizeTerminalOutput(raw), 'boom');
});

test('sanitizeTerminalOutput removes invalid PowerShell prompt fragments but keeps real output', () => {
    const raw = 'PS C:\\repo this is corrupted\nreal output';
    assert.strictEqual(testApi.sanitizeTerminalOutput(raw), 'real output');
});

test('sanitizeTerminalOutput collapses excessive blank lines', () => {
    const raw = 'a\n\n\n\n b';
    assert.strictEqual(testApi.sanitizeTerminalOutput(raw), 'a\n\n b');
});

test('extractLastCommandLine returns last PS prompt command', () => {
    const raw = 'PS C:\\repo> npm test\noutput\nPS C:\\repo> git status';
    assert.strictEqual(testApi.extractLastCommandLine(raw), 'git status');
});

test('extractLastCommandLine returns >-prefixed fallback command', () => {
    const raw = 'output\n> npm run build';
    assert.strictEqual(testApi.extractLastCommandLine(raw), 'npm run build');
});

test('extractLastCommandLine falls back to first non-empty line when no prompt exists', () => {
    const raw = '\n\nplain command text\nmore';
    assert.strictEqual(testApi.extractLastCommandLine(raw), 'plain command text');
});

console.log('-'.repeat(48));
if (failed === 0) {
    console.log(`PASS ${passed} passed`);
    process.exit(0);
}

console.error(`FAIL ${failed} failed, ${passed} passed`);
process.exit(1);
