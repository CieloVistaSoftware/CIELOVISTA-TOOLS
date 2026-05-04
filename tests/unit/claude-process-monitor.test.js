/**
 * tests/unit/claude-process-monitor.test.js
 *
 * Unit tests for helper exports in src/features/claude-process-monitor.ts.
 *
 * Run: node tests/unit/claude-process-monitor.test.js
 */
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const Module = require('module');

const OUT = path.join(__dirname, '../../out/features/claude-process-monitor.js');
if (!fs.existsSync(OUT)) {
    console.error(`SKIP: ${OUT} not found - run npm run compile`);
    process.exit(0);
}

const origLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'vscode') {
        return {
            window: {},
            commands: { registerCommand: () => ({ dispose() {} }) },
            ViewColumn: { One: 1 }
        };
    }
    return origLoad.call(this, request, parent, isMain);
};

const mod = require(OUT);
Module._load = origLoad;
const testApi = mod && mod._test;
if (!testApi || typeof testApi.formatUptime !== 'function' || typeof testApi.openerLabel !== 'function' || typeof testApi.esc !== 'function') {
    console.error('SKIP: _test helpers not exported from out/features/claude-process-monitor.js');
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

function mkProc(parentName) {
    return {
        pid: 1,
        name: 'claude.exe',
        memoryMb: 10,
        uptimeMs: 1000,
        parentPid: 2,
        parentName,
        cmdLine: ''
    };
}

console.log('\nclaude-process-monitor unit tests\n' + '-'.repeat(48));

test('formatUptime: negative values clamp to 0s', () => {
    assert.strictEqual(testApi.formatUptime(-1), '0s');
});

test('formatUptime: seconds-only format under 1 minute', () => {
    assert.strictEqual(testApi.formatUptime(59 * 1000), '59s');
});

test('formatUptime: minute+seconds format', () => {
    assert.strictEqual(testApi.formatUptime(61 * 1000), '1m 1s');
});

test('formatUptime: hour+minutes format', () => {
    assert.strictEqual(testApi.formatUptime((2 * 3600 + 5 * 60 + 7) * 1000), '2h 5m');
});

test('esc: escapes &, <, >, and double quote', () => {
    const actual = testApi.esc('<a href="x&y">"go"</a>');
    assert.strictEqual(actual, '&lt;a href=&quot;x&amp;y&quot;&gt;&quot;go&quot;&lt;/a&gt;');
});

test('openerLabel: VS Code variants map to VS Code label', () => {
    const label = testApi.openerLabel(mkProc('Code - Insiders.exe'));
    assert.strictEqual(label, '⚡ VS Code');
});

test('openerLabel: parent exited maps to orphaned label', () => {
    const label = testApi.openerLabel(mkProc('unknown (parent exited)'));
    assert.strictEqual(label, '👻 Orphaned (parent exited)');
});

test('openerLabel: unknown parent falls back to package label', () => {
    const label = testApi.openerLabel(mkProc('my-launcher.exe'));
    assert.strictEqual(label, '📦 my-launcher.exe');
});

console.log('-'.repeat(48));
if (failed === 0) {
    console.log(`PASS ${passed} passed`);
    process.exit(0);
}

console.error(`FAIL ${failed} failed, ${passed} passed`);
process.exit(1);
