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
const Module = require('module');
const ts = require('typescript');

const SRC = path.join(__dirname, '../../src/features/mcp-server-status.ts');
if (!fs.existsSync(SRC)) {
    console.error(`FATAL: ${SRC} not found`);
    process.exit(1);
}

const notifications = [];
const outputLogs = [];
const outputErrors = [];
const scheduledTimers = [];

const vscodeMock = {
    window: {
        terminals: [],
        createTerminal: () => ({ show: () => {}, dispose: () => {} }),
        showErrorMessage: (message) => {
            notifications.push(message);
            return Promise.resolve(undefined);
        },
    },
    EventEmitter: class {
        constructor() { this.event = () => {}; }
        fire() {}
    },
};

const outputChannelMock = {
    log: (feature, message) => { outputLogs.push({ feature, message }); },
    logError: (message, stacktrace, context) => { outputErrors.push({ message, stacktrace, context }); },
};

const childProcessMock = {
    spawn: () => { throw new Error('spawn should not be called by these unit tests'); },
};

const origResolve = Module._resolveFilename.bind(Module);
const origSetTimeout = global.setTimeout;
const origClearTimeout = global.clearTimeout;

Module._resolveFilename = (request, parent, ...args) => {
    if (request === 'vscode') { return '__vs_mcp_test__'; }
    if (request === '../shared/output-channel') { return '__output_channel_mcp_test__'; }
    if (request === 'child_process') { return '__child_process_mcp_test__'; }
    return origResolve(request, parent, ...args);
};

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
require.cache['__output_channel_mcp_test__'] = {
    id: '__output_channel_mcp_test__',
    filename: '__output_channel_mcp_test__',
    loaded: true,
    exports: outputChannelMock,
    parent: null,
    children: [],
    path: '',
    paths: [],
};
require.cache['__child_process_mcp_test__'] = {
    id: '__child_process_mcp_test__',
    filename: '__child_process_mcp_test__',
    loaded: true,
    exports: childProcessMock,
    parent: null,
    children: [],
    path: '',
    paths: [],
};

global.setTimeout = (fn, delay) => {
    const handle = { fn, delay, cleared: false };
    scheduledTimers.push(handle);
    return handle;
};
global.clearTimeout = (handle) => {
    if (handle && typeof handle === 'object') {
        handle.cleared = true;
    }
};

const sourceTs = fs.readFileSync(SRC, 'utf8');
const transpiled = ts.transpileModule(sourceTs, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: SRC,
}).outputText;

const testModule = new Module(SRC, module);
testModule.filename = SRC;
testModule.paths = Module._nodeModulePaths(path.dirname(SRC));
testModule._compile(transpiled, SRC);

const mcp = testModule.exports;
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

function resetHarness() {
    notifications.length = 0;
    outputLogs.length = 0;
    outputErrors.length = 0;
    scheduledTimers.length = 0;
    testApi.resetStateForTests();
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

test('extractLastNonEmptyLine ignores blanks and trims whitespace', () => {
    assert.strictEqual(testApi.extractLastNonEmptyLine('\n first \n\n second  \n'), 'second');
    assert.strictEqual(testApi.extractLastNonEmptyLine('\n \n'), '');
});

test('updateRequestTracking follows start, error, and end markers', () => {
    let state = testApi.updateRequestTracking('', '', `${testApi.REQUEST_START_PREFIX}lookup_dewey {"dewey":"150.5"}\n`);
    assert.strictEqual(state.currentRequest, 'lookup_dewey {"dewey":"150.5"}');
    assert.strictEqual(state.lastRequest, 'lookup_dewey {"dewey":"150.5"}');

    state = testApi.updateRequestTracking(state.currentRequest, state.lastRequest, `${testApi.REQUEST_ERROR_PREFIX}lookup_dewey {"dewey":"150.5"}\n`);
    assert.strictEqual(state.currentRequest, 'lookup_dewey {"dewey":"150.5"}');
    assert.strictEqual(state.lastRequest, 'lookup_dewey {"dewey":"150.5"}');

    state = testApi.updateRequestTracking(state.currentRequest, state.lastRequest, `${testApi.REQUEST_END_PREFIX}lookup_dewey {"dewey":"150.5"}\n`);
    assert.strictEqual(state.currentRequest, '');
    assert.strictEqual(state.lastRequest, 'lookup_dewey {"dewey":"150.5"}');
});

test('writeMcpCrashDiagnostics writes expected sections and context', () => {
    const filePath = testApi.writeMcpCrashDiagnostics({
        attemptNumber: 7,
        reason: 'process exited with code 1',
        traceMode: true,
        args: ['--trace-uncaught', '--trace-warnings', 'index.js'],
        stdoutTail: 'stdout line',
        stderrTail: 'stderr line',
        lastStdoutLine: 'stdout line',
        lastStderrLine: 'stderr line',
        currentRequest: 'lookup_dewey {"dewey":"150.5"}',
        lastRequest: 'lookup_dewey {"dewey":"150.5"}',
    });

    assert.ok(filePath, 'expected a diagnostics file path');
    assert.ok(fs.existsSync(filePath), 'expected diagnostics file to exist');

    const body = fs.readFileSync(filePath, 'utf8');
    assert.ok(body.includes('attempt=7'));
    assert.ok(body.includes('traceMode=true'));
    assert.ok(body.includes('reason=process exited with code 1'));
    assert.ok(body.includes('currentRequest=lookup_dewey {"dewey":"150.5"}'));
    assert.ok(body.includes('lastStderrLine=stderr line'));
    assert.ok(body.includes('--- stderr tail ---'));
    assert.ok(body.includes('stderr line'));
    assert.ok(body.includes('--- stdout tail ---'));
    assert.ok(body.includes('stdout line'));

    fs.unlinkSync(filePath);
});

test('crash loop stops after capped retries and shows one user-visible error', () => {
    resetHarness();

    const diagPaths = [];
    let finalResult = null;
    const expectedRequest = 'lookup_dewey {"dewey":"150.5"}';

    for (let attempt = 1; attempt <= testApi.MAX_RESTART_ATTEMPTS + 1; attempt++) {
        const result = testApi.handleUnexpectedFailure({
            attemptNumber: attempt,
            reason: 'process exited with code 1',
            traceMode: attempt >= testApi.DIAG_ESCALATION_ATTEMPT,
            args: ['index.js'],
            stdoutTail: `stdout tail ${attempt}`,
            stderrTail: `stderr tail ${attempt}`,
            lastStdoutLine: `stdout line ${attempt}`,
            lastStderrLine: `stderr line ${attempt}`,
            currentRequest: expectedRequest,
            lastRequest: expectedRequest,
            logMessage: 'MCP process exited unexpectedly: process exited with code 1',
        });

        if (result.diagPath) {
            diagPaths.push(result.diagPath);
        }
        if (attempt <= testApi.MAX_RESTART_ATTEMPTS) {
            assert.strictEqual(result.scheduledRetry, true, `attempt ${attempt} should still schedule a retry`);
        } else {
            finalResult = result;
            assert.strictEqual(result.scheduledRetry, false, 'final crash should stop the loop');
        }
    }

    assert.ok(finalResult, 'expected a final no-retry result');
    assert.deepStrictEqual(
        scheduledTimers.map((handle) => handle.delay),
        [1000, 2000, 5000, 10000, 30000],
        'expected bounded exponential backoff before giving up',
    );
    assert.strictEqual(notifications.length, 1, 'expected one user-visible notification when retry cap is reached');
    assert.strictEqual(outputErrors.length, 1, 'expected one persistent error entry when retry cap is reached');
    assert.ok(outputErrors[0].stacktrace.includes(`currentRequest=${expectedRequest}`), 'expected current request in final error context');
    assert.ok(outputErrors[0].stacktrace.includes('lastStderrLine=stderr line 6'), 'expected last stderr line in final error context');

    for (const diagPath of diagPaths) {
        if (fs.existsSync(diagPath)) {
            fs.unlinkSync(diagPath);
        }
    }
});

console.log('-'.repeat(50));
if (failed === 0) {
    console.log(`PASS: ${passed} passed, 0 failed`);
} else {
    console.log(`FAIL: ${passed} passed, ${failed} failed`);
}

Module._resolveFilename = origResolve;
global.setTimeout = origSetTimeout;
global.clearTimeout = origClearTimeout;

process.exit(failed === 0 ? 0 : 1);
