/**
 * tests/unit/background-health-runner.test.js
 *
 * Unit tests for background-health-runner pure logic.
 * Originally written with @jest/globals — restored as plain Node test.
 *
 * Tests the exported internal state and functions via the compiled JS output.
 * Uses a minimal vscode mock so the module loads outside VS Code.
 *
 * Run: node tests/unit/background-health-runner.test.js
 * Requires: npm run compile (needs out/features/background-health-runner.js)
 */
'use strict';

const fs     = require('fs');
const path   = require('path');
const assert = require('assert');
const Module = require('module');

// ── vscode mock ───────────────────────────────────────────────────────────────
const vscodeMock = {
    commands: {
        getCommands: async () => [],
        registerCommand: (_id, _fn) => ({ dispose: () => {} }),
    },
    workspace: { workspaceFolders: [] },
    window: {
        createWebviewPanel: () => ({
            webview: { html: '', onDidReceiveMessage: () => {}, postMessage: () => {} },
            reveal: () => {}, onDidDispose: () => {}, dispose: () => {},
        }),
        withProgress: async (_opts, fn) => fn({ report: () => {} }),
    },
    ProgressLocation: { Notification: 15 },
    ViewColumn: { Beside: 2, One: 1 },
};

const _origResolve = Module._resolveFilename.bind(Module);
Module._resolveFilename = function(req, parent, isMain, opts) {
    if (req === 'vscode') { return '__vscode_mock__'; }
    return _origResolve(req, parent, isMain, opts);
};
require.cache['__vscode_mock__'] = {
    id: '__vscode_mock__', filename: '__vscode_mock__', loaded: true,
    exports: vscodeMock, parent: null, children: [], path: '', paths: [],
};

// ── Load compiled module ──────────────────────────────────────────────────────
const OUT = path.join(__dirname, '../../out/features/background-health-runner.js');

if (!fs.existsSync(OUT)) {
    console.error(`\n  SKIP: Compiled output not found at:\n  ${OUT}`);
    console.error('  Run: npm run compile\n');
    process.exit(0);
}

const bgHealth = require(OUT);
const t = bgHealth._test; // internal test handle

// ── Runner ────────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;

function test(name, fn) {
    try { fn(); console.log(`  \u2713 ${name}`); passed++; }
    catch (err) { console.error(`  \u2717 ${name}\n    \u2192 ${err.message}`); failed++; }
}

function ok(val, msg) { assert.ok(val, msg); }
function eq(a, b, msg) { assert.strictEqual(a, b, msg); }

// ── Fixture ───────────────────────────────────────────────────────────────────
const DATA_FILE = path.join(__dirname, '../../data/bg-health.json');

const sampleBug = {
    id: 'bug-test', checkId: 'chk-test', title: 'Test Bug',
    detail: 'A test bug detail', priority: 'high', category: 'test',
    fixCommandId: 'fix.test', fixLabel: 'Fix Test',
};

function reset() {
    t.state = { lastRun: '', totalChecks: 0, bugs: [], checkIndex: 0 };
    if (fs.existsSync(DATA_FILE)) { fs.unlinkSync(DATA_FILE); }
}

// ── Tests ─────────────────────────────────────────────────────────────────────
console.log('\nbackground-health-runner unit tests\n' + '\u2500'.repeat(50));

test('_test handle is exported and has correct shape', () => {
    ok(t !== undefined, '_test must be exported');
    ok(Array.isArray(t.state.bugs), '_test.state.bugs must be an array');
    ok(typeof t.state.checkIndex === 'number', '_test.state.checkIndex must be a number');
});

test('addBug adds a bug with detectedAt and fixed:false', () => {
    reset();
    t.addBug(sampleBug);
    eq(t.state.bugs.length, 1, 'Should have 1 bug');
    eq(t.state.bugs[0].id, 'bug-test');
    eq(t.state.bugs[0].fixed, false, 'New bug must have fixed:false');
    ok(t.state.bugs[0].detectedAt, 'New bug must have detectedAt timestamp');
});

test('addBug deduplicates — updates existing bug with same id', () => {
    reset();
    t.addBug(sampleBug);
    t.addBug({ ...sampleBug, title: 'Updated Title' });
    eq(t.state.bugs.length, 1, 'Duplicate id must not create a second entry');
    eq(t.state.bugs[0].title, 'Updated Title', 'Existing entry must be updated');
});

test('addBug deduplication resets fixed:false on update', () => {
    reset();
    t.addBug(sampleBug);
    t.clearBug('bug-test');
    eq(t.state.bugs[0].fixed, true, 'Bug should be fixed before update');
    t.addBug({ ...sampleBug, title: 'Re-detected' });
    eq(t.state.bugs[0].fixed, false, 'Re-added bug must reset to fixed:false');
});

test('clearBug marks bug as fixed:true', () => {
    reset();
    t.addBug(sampleBug);
    t.clearBug('bug-test');
    eq(t.state.bugs[0].fixed, true);
});

test('clearBug on unknown id is a safe no-op', () => {
    reset();
    t.addBug(sampleBug);
    t.clearBug('does-not-exist');
    eq(t.state.bugs[0].fixed, false, 'Unrelated bug must not be affected');
});

test('saveState writes data/bg-health.json', () => {
    reset();
    t.addBug(sampleBug);
    t.saveState();
    ok(fs.existsSync(DATA_FILE), 'bg-health.json must exist after saveState');
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    eq(data.bugs.length, 1);
    eq(data.bugs[0].id, 'bug-test');
    ok(data.lastRun, 'lastRun must be set by saveState');
});

test('saveState persists fixed:true correctly', () => {
    reset();
    t.addBug(sampleBug);
    t.clearBug('bug-test');
    t.saveState();
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    eq(data.bugs[0].fixed, true, 'Persisted bug must retain fixed:true');
});

test('multiple bugs maintain insertion order', () => {
    reset();
    t.addBug({ ...sampleBug, id: 'bug-a', title: 'Alpha' });
    t.addBug({ ...sampleBug, id: 'bug-b', title: 'Beta' });
    t.addBug({ ...sampleBug, id: 'bug-c', title: 'Gamma' });
    eq(t.state.bugs.length, 3);
    eq(t.state.bugs[0].id, 'bug-a');
    eq(t.state.bugs[2].id, 'bug-c');
});

test('clearBug only affects the targeted bug', () => {
    reset();
    t.addBug({ ...sampleBug, id: 'bug-a' });
    t.addBug({ ...sampleBug, id: 'bug-b' });
    t.clearBug('bug-a');
    eq(t.state.bugs[0].fixed, true,  'bug-a must be fixed');
    eq(t.state.bugs[1].fixed, false, 'bug-b must be untouched');
});

test('activate and deactivate are exported functions', () => {
    ok(typeof bgHealth.activate   === 'function', 'activate must be exported');
    ok(typeof bgHealth.deactivate === 'function', 'deactivate must be exported');
});

test('showFixBugsPanel is exported', () => {
    ok(typeof bgHealth.showFixBugsPanel === 'function', 'showFixBugsPanel must be exported');
});

// cleanup
reset();

console.log('\u2500'.repeat(50));
if (failed === 0) {
    console.log(`\u2713 All ${passed} tests passed\n`);
    process.exit(0);
} else {
    console.error(`\n\u2717 ${failed} test(s) FAILED\n`);
    process.exit(1);
}
