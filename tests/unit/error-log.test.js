/**
 * tests/unit/error-log.test.js
 *
 * Unit tests for src/shared/error-log.ts
 * Uses minimal vscode mock — tests the pure internal logic via _test handle.
 *
 * Covers:
 *   _test.parseStack()  — extracts filename, lineno, colno from stack strings
 *   _test.inferType()   — classifies errors into ErrorType categories
 *   _test.hashError()   — deterministic hash from message+stack
 *   logError()          — writes entry to disk
 *   getErrors()         — reads persisted entries
 *   clearErrors()       — empties the log
 *   setCurrentCommand() — command context stored on entries
 *   getLogPath()        — returns path string
 *
 * Run: node tests/unit/error-log.test.js
 */
'use strict';

const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const Module = require('module');

// ── vscode mock ───────────────────────────────────────────────────────────────
const vscodeMock = {
    window: {
        showWarningMessage: async () => undefined,
        showErrorMessage:   async () => undefined,
        createOutputChannel: () => ({
            appendLine: () => {},
            show: () => {},
            dispose: () => {},
        }),
    },
    commands: { executeCommand: async () => {} },
    workspace: { workspaceFolders: [] },
};

const _orig = Module._resolveFilename.bind(Module);
Module._resolveFilename = (req, ...args) => req === 'vscode' ? '__vs_mock__' : _orig(req, ...args);
require.cache['__vs_mock__'] = {
    id: '__vs_mock__', filename: '__vs_mock__', loaded: true,
    exports: vscodeMock, parent: null, children: [], path: '', paths: [],
};

// ── Load module ───────────────────────────────────────────────────────────────
const OUT_CHANNEL = path.join(__dirname, '../../out/shared/output-channel.js');
const OUT         = path.join(__dirname, '../../out/shared/error-log.js');

for (const p of [OUT_CHANNEL, OUT]) {
    if (!fs.existsSync(p)) {
        console.error(`SKIP: ${p} not found — run npm run compile`);
        process.exit(0);
    }
}

const errorLog = require(OUT);
const t = errorLog._test;

// ── Runner ────────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;

function test(name, fn) {
    try { fn(); console.log(`  \u2713 ${name}`); passed++; }
    catch (e) { console.error(`  \u2717 ${name}\n    \u2192 ${e.message}`); failed++; }
}

function eq(a, b, msg)  { assert.strictEqual(a, b, msg); }
function ok(v, msg)     { assert.ok(v, msg); }

// Clean up test log before starting
const LOG_PATH = errorLog.getLogPath();
if (fs.existsSync(LOG_PATH)) { fs.unlinkSync(LOG_PATH); }

console.log('\nerror-log unit tests\n' + '\u2500'.repeat(50));

// ── parseStack() ──────────────────────────────────────────────────────────────
console.log('\n-- parseStack() --');

test('parseStack: extracts filename from at SomeFn (file.ts:42:7)', () => {
    const r = t.parseStack('Error\n    at runTest (error-log.ts:42:7)');
    eq(r.filename, 'error-log.ts');
    eq(r.lineno, 42);
    eq(r.colno, 7);
});

test('parseStack: extracts filename from bare at file.ts:10:3', () => {
    const r = t.parseStack('Error\n    at C:\\path\\to\\file.ts:10:3');
    eq(r.filename, 'file.ts');
    eq(r.lineno, 10);
    eq(r.colno, 3);
});

test('parseStack: returns zeros for empty stack', () => {
    const r = t.parseStack('');
    eq(r.filename, '');
    eq(r.lineno, 0);
    eq(r.colno, 0);
});

test('parseStack: returns zeros for stack with no location', () => {
    const r = t.parseStack('Error: something went wrong');
    eq(r.lineno, 0);
});

// ── inferType() ───────────────────────────────────────────────────────────────
console.log('\n-- inferType() --');

test('inferType: JSON error classified as JSON_PARSE_ERROR', () => {
    eq(t.inferType(new Error('Unexpected token in JSON')), 'JSON_PARSE_ERROR');
});

test('inferType: file not found classified as FILE_IO_ERROR', () => {
    eq(t.inferType(new Error('ENOENT: no such file or directory')), 'FILE_IO_ERROR');
});

test('inferType: permission denied classified as FILE_IO_ERROR', () => {
    eq(t.inferType(new Error('EACCES: permission denied')), 'FILE_IO_ERROR');
});

test('inferType: network error classified as NETWORK_ERROR', () => {
    eq(t.inferType(new Error('ECONNREFUSED connection refused')), 'NETWORK_ERROR');
});

test('inferType: fetch failure classified as NETWORK_ERROR', () => {
    eq(t.inferType(new Error('fetch failed: network error')), 'NETWORK_ERROR');
});

test('inferType: anthropic error classified as AI_ERROR', () => {
    eq(t.inferType(new Error('anthropic rate limit exceeded')), 'AI_ERROR');
});

test('inferType: openai error classified as AI_ERROR', () => {
    eq(t.inferType(new Error('openai api error 429')), 'AI_ERROR');
});

test('inferType: generic error classified as APP_ERROR', () => {
    eq(t.inferType(new Error('something broke')), 'APP_ERROR');
});

test('inferType: explicit override wins over inference', () => {
    eq(t.inferType(new Error('ENOENT'), 'COMMAND_ERROR'), 'COMMAND_ERROR');
});

test('inferType: string error handled (not just Error objects)', () => {
    const type = t.inferType('unexpected token in json');
    eq(type, 'JSON_PARSE_ERROR');
});

// ── hashError() ───────────────────────────────────────────────────────────────
console.log('\n-- hashError() --');

test('hashError: same inputs produce same hash', () => {
    const h1 = t.hashError('msg', 'stack line 1\nstack line 2');
    const h2 = t.hashError('msg', 'stack line 1\nstack line 2');
    eq(h1, h2, 'Hash must be deterministic');
});

test('hashError: different messages produce different hashes', () => {
    const h1 = t.hashError('error A', '');
    const h2 = t.hashError('error B', '');
    ok(h1 !== h2, 'Different messages must produce different hashes');
});

test('hashError: returns a non-negative integer', () => {
    const h = t.hashError('test error', '');
    ok(typeof h === 'number' && h >= 0 && Number.isInteger(h), 'Hash must be non-negative integer');
});

// ── getLogPath() ──────────────────────────────────────────────────────────────
console.log('\n-- getLogPath() --');

test('getLogPath returns a string ending in .json', () => {
    const p = errorLog.getLogPath();
    ok(typeof p === 'string', 'Must return a string');
    ok(p.endsWith('.json'), 'Must end in .json');
});

test('getLogPath includes data/ in path', () => {
    ok(errorLog.getLogPath().includes('data'), 'Path must include data/ directory');
});

// ── logError() / getErrors() / clearErrors() ─────────────────────────────────
console.log('\n-- logError() / getErrors() / clearErrors() --');

test('logError: writes entry and getErrors returns it', () => {
    errorLog.clearErrors();
    errorLog.logError('[test]', new Error('test error alpha'), { context: 'testFn' });
    const errors = errorLog.getErrors();
    eq(errors.length, 1, 'Should have 1 error');
    eq(errors[0].message, 'test error alpha');
    eq(errors[0].prefix, '[test]');
    eq(errors[0].context, 'testFn');
});

test('logError: entry has correct type inferred', () => {
    errorLog.clearErrors();
    errorLog.logError('[test]', new Error('ENOENT: no such file'));
    const errors = errorLog.getErrors();
    eq(errors[0].type, 'FILE_IO_ERROR');
});

test('logError: entry has timestamp', () => {
    errorLog.clearErrors();
    errorLog.logError('[test]', new Error('ts test'));
    const errors = errorLog.getErrors();
    ok(errors[0].timestamp, 'Must have timestamp');
    ok(!isNaN(Date.parse(errors[0].timestamp)), 'Timestamp must be valid ISO date');
});

test('logError: entry has id (numeric hash)', () => {
    errorLog.clearErrors();
    errorLog.logError('[test]', new Error('hash test'));
    const errors = errorLog.getErrors();
    ok(typeof errors[0].id === 'number', 'id must be a number');
});

test('logError: multiple errors accumulate', () => {
    errorLog.clearErrors();
    errorLog.logError('[test]', new Error('error 1'));
    errorLog.logError('[test]', new Error('error 2'));
    errorLog.logError('[test]', new Error('error 3'));
    eq(errorLog.getErrors().length, 3, 'Must have 3 errors');
});

test('clearErrors: empties the log', () => {
    errorLog.logError('[test]', new Error('to be cleared'));
    errorLog.clearErrors();
    eq(errorLog.getErrors().length, 0, 'getErrors must return empty after clear');
});

test('setCurrentCommand: stored on logged entries', () => {
    errorLog.clearErrors();
    errorLog.setCurrentCommand('cvs.audit.testCoverage');
    errorLog.logError('[test]', new Error('command context test'));
    errorLog.clearCurrentCommand();
    const errors = errorLog.getErrors();
    eq(errors[0].command, 'cvs.audit.testCoverage', 'command must be recorded');
});

test('logError: string error handled (not just Error objects)', () => {
    errorLog.clearErrors();
    errorLog.logError('[test]', 'plain string error', { context: 'stringTest' });
    const errors = errorLog.getErrors();
    eq(errors.length, 1);
    eq(errors[0].message, 'plain string error');
});

// cleanup
errorLog.clearErrors();

console.log('\n' + '\u2500'.repeat(50));
if (failed === 0) { console.log(`\u2713 All ${passed} tests passed\n`); process.exit(0); }
else { console.error(`\n\u2717 ${failed} test(s) FAILED\n`); process.exit(1); }
