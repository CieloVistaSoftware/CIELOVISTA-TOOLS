/**
 * tests/unit/mcp-server-status.test.js
 *
 * Unit tests for src/features/mcp-server-status.ts test hooks.
 *
 * Run: node tests/unit/mcp-server-status.test.js
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Module = require('module');

const vscodeMock = {
    window: {
        terminals: [],
        createTerminal: () => ({ show: () => {}, dispose: () => {} }),
    },
    EventEmitter: class {
        constructor() { this.event = () => {}; }
        fire() {}
    },
};

const origResolve = Module._resolveFilename.bind(Module);
Module._resolveFilename = (request, ...args) => request === 'vscode' ? '__vs_mcp_test__' : origResolve(request, ...args);
require.cache['__vs_mcp_test__'] = {
    id: '__vs_mcp_test__',
    filename: '__vs_mcp_test__',
    loaded: true,
    exports: vscodeMock,
    parent: null,
    children: [],
    path: '',
    paths: [],
};

const outPath = path.join(__dirname, '../../out/features/mcp-server-status.js');
if (!fs.existsSync(outPath)) {
    console.error(`SKIP: ${outPath} not found - run npm run compile`);
    process.exit(0);
}

const mcp = require(outPath);
const testApi = mcp._test;

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  PASS ${name}`);
        passed += 1;
    } catch (err) {
        console.error(`  FAIL ${name}`);
        console.error(`    -> ${err.message}`);
        failed += 1;
    }
}

console.log('\nmcp-server-status unit tests\n' + '-'.repeat(50));

test('launch config: no trace before escalation attempt', () => {
    mcp.initMcpServerPath(process.cwd());
    const cfg = testApi.buildMcpLaunchConfig(testApi.DIAG_ESCALATION_ATTEMPT - 1);

    assert.strictEqual(cfg.traceMode, false);
    assert.deepStrictEqual(cfg.args, [path.join(process.cwd(), 'mcp-server', 'dist', 'index.js')]);
});

test('launch config: trace flags and NODE_DEBUG at escalation attempt', () => {
    mcp.initMcpServerPath(process.cwd());
    const cfg = testApi.buildMcpLaunchConfig(testApi.DIAG_ESCALATION_ATTEMPT);

    assert.strictEqual(cfg.traceMode, true);
    assert.strictEqual(cfg.args[0], '--trace-uncaught');
    assert.strictEqual(cfg.args[1], '--trace-warnings');
    assert.ok(String(cfg.env.NODE_DEBUG || '').includes('module,http,net,tls'));
});

test('trimTail keeps only the latest max chars', () => {
    const max = testApi.DIAG_TAIL_MAX_CHARS;
    const source = 'a'.repeat(max + 100);
    const result = testApi.trimTail(source);

    assert.strictEqual(result.length, max);
    assert.strictEqual(result, source.slice(100));
});

test('appendTail keeps bounded tail size', () => {
    const max = testApi.DIAG_TAIL_MAX_CHARS;
    const start = 'x'.repeat(max - 10);
    const next = Buffer.from('y'.repeat(50));
    const result = testApi.appendTail(start, next);

    assert.strictEqual(result.length, max);
    assert.ok(result.endsWith('y'.repeat(50)));
});

test('writeMcpCrashDiagnostics writes expected sections', () => {
    const filePath = testApi.writeMcpCrashDiagnostics({
        attemptNumber: 7,
        reason: 'process exited with code 1',
        traceMode: true,
        args: ['--trace-uncaught', '--trace-warnings', 'index.js'],
        stdoutTail: 'stdout line',
        stderrTail: 'stderr line',
    });

    assert.ok(filePath, 'expected a diagnostics file path');
    assert.ok(fs.existsSync(filePath), 'expected diagnostics file to exist');

    const body = fs.readFileSync(filePath, 'utf8');
    assert.ok(body.includes('attempt=7'));
    assert.ok(body.includes('traceMode=true'));
    assert.ok(body.includes('reason=process exited with code 1'));
    assert.ok(body.includes('--- stderr tail ---'));
    assert.ok(body.includes('stderr line'));
    assert.ok(body.includes('--- stdout tail ---'));
    assert.ok(body.includes('stdout line'));

    fs.unlinkSync(filePath);
});

console.log('-'.repeat(50));
if (failed === 0) {
    console.log(`PASS: ${passed} passed, 0 failed`);
    process.exit(0);
}
console.log(`FAIL: ${passed} passed, ${failed} failed`);
process.exit(1);
