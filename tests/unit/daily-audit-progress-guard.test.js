'use strict';

/**
 * tests/unit/daily-audit-progress-guard.test.js
 *
 * Regression guard for issue #317:
 *   "Daily Health Check spinner runs continuously — offerAuditActions blocks withProgress"
 *
 * Root cause: offerAuditActions() was awaited INSIDE the withProgress callback.
 * withProgress keeps its progress notification open until its callback resolves,
 * so awaiting a showInformationMessage inside that callback made the spinner appear
 * to run continuously until the user clicked a button.
 *
 * This test has two layers:
 *
 *   LAYER 1 — Source structural check
 *     Reads src/features/daily-audit/index.ts and asserts that
 *     offerAuditActions is NOT called inside the withProgress callback
 *     (i.e., it appears after the withProgress block closes).
 *
 *   LAYER 2 — The real command
 *     Loads the out-test build of src/features/daily-audit/index.ts, runs the
 *     cvs.audit.runDaily command it registers, and records, through a vscode
 *     mock, when the audit runs, when withProgress's callback resolves (the
 *     notification closes) and when the "Daily Audit found N actionable
 *     issue(s)" prompt opens. The order must be: audit, progress closes,
 *     prompt. Only the audit itself (runner.ts, which reads every registered
 *     project) is replaced, by one that returns a clean report at once.
 *
 *     Until #828 Layer 2 ran three hand-written copies of the pattern
 *     (mockWithProgress, mockRunDailyAudit, mockOfferAuditActions) and
 *     checked the order of its own calls; no code from src/ ran.
 *
 * Run: node tests/unit/daily-audit-progress-guard.test.js
 */

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const Module = require('module');

const SRC = path.join(__dirname, '../../src/features/daily-audit/index.ts');
const OUT = path.join(__dirname, '../../out-test/features/daily-audit/index.js');

let passed = 0, failed = 0;
const pending = [];

function test(name, fn) {
    const pass = () => { console.log(`  ✓ ${name}`); passed++; };
    const fail = e => { console.error(`  ✗ ${name}\n    → ${e && e.message}`); failed++; };
    try {
        const r = fn();
        if (r instanceof Promise) { pending.push(r.then(pass, fail)); }
        else { pass(); }
    } catch (e) {
        fail(e);
    }
}

function ok(v, msg)    { assert.ok(v, msg); }
function eq(a, b, msg) { assert.strictEqual(a, b, msg); }

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Given the full source text and the starting index of "withProgress(",
 * returns the index of the matching closing ");" that ends the withProgress call.
 * Counts open/close parens to handle nested parens inside callbacks.
 */
function findMatchingCloseParen(src, openIdx) {
    let depth = 0;
    for (let i = openIdx; i < src.length; i++) {
        if (src[i] === '(') { depth++; }
        else if (src[i] === ')') {
            depth--;
            if (depth === 0) { return i; }
        }
    }
    return -1;
}

// ─── Source file check ────────────────────────────────────────────────────────

console.log('\ndaily-audit-progress-guard — regression tests for issue #317\n' + '\u2500'.repeat(60));
console.log('\n-- Layer 1: Source structural analysis --');

if (!fs.existsSync(SRC)) {
    console.error(`SKIP: Source not found — ${SRC}`);
    process.exit(0);
}

const src = fs.readFileSync(SRC, 'utf8');

test('source file contains withProgress call', () => {
    ok(src.includes('withProgress'), 'withProgress must be present in the source');
});

test('source file contains offerAuditActions call', () => {
    ok(src.includes('offerAuditActions'), 'offerAuditActions must be present in the source');
});

test('offerAuditActions is NOT inside the withProgress callback body', () => {
    const wpStart = src.indexOf('withProgress(');
    ok(wpStart !== -1, 'withProgress( not found');

    const wpEnd = findMatchingCloseParen(src, wpStart);
    ok(wpEnd !== -1, 'Could not find closing paren of withProgress call');

    const insideBody = src.slice(wpStart, wpEnd);
    const hasOfferInside = insideBody.includes('offerAuditActions');

    ok(
        !hasOfferInside,
        'offerAuditActions must NOT be called inside the withProgress callback — ' +
        'doing so keeps the progress spinner alive while waiting for user input. ' +
        'Move it after the withProgress block. (Bug #317)'
    );
});

test('offerAuditActions is called AFTER withProgress block closes', () => {
    const wpStart = src.indexOf('withProgress(');
    ok(wpStart !== -1, 'withProgress( not found');

    const wpEnd = findMatchingCloseParen(src, wpStart);
    ok(wpEnd !== -1, 'Could not find closing paren of withProgress call');

    const afterBlock = src.slice(wpEnd);
    const hasOfferAfter = afterBlock.includes('offerAuditActions');

    ok(
        hasOfferAfter,
        'offerAuditActions must be called after the withProgress block — ' +
        'the progress spinner should close before the follow-up UI appears. (Bug #317)'
    );
});

test('_auditResult capture variable exists (result bridged out of withProgress)', () => {
    ok(
        src.includes('_auditResult'),
        '_auditResult capture variable must exist — it bridges the audit result ' +
        'out of the withProgress callback so offerAuditActions can use it after. (Bug #317)'
    );
});

test('_auditResult is assigned inside withProgress and consumed outside', () => {
    const wpStart = src.indexOf('withProgress(');
    const wpEnd   = findMatchingCloseParen(src, wpStart);
    ok(wpStart !== -1 && wpEnd !== -1, 'withProgress block not found');

    const insideBody = src.slice(wpStart, wpEnd);
    const afterBlock = src.slice(wpEnd);

    ok(insideBody.includes('_auditResult ='), '_auditResult must be assigned inside withProgress callback');
    ok(afterBlock.includes('_auditResult'),   '_auditResult must be referenced after withProgress resolves');
});

// ─── Layer 2: the real command ───────────────────────────────────────────────

console.log('\n-- Layer 2: the real cvs.audit.runDaily command — execution order --');

if (!fs.existsSync(OUT)) {
    // Not a skip: the runners build out-test/ first, so this is a real failure.
    console.error(`  ✗ out-test build missing: ${OUT}`);
    process.exit(1);
}

/** What happened, in order: 'audit', 'progress-open', 'progress-close', 'prompt'. */
const events = [];
const commands = new Map();

function inert() {
    return new Proxy(function () { return inert(); }, {
        get: (_t, k) => (k === 'then' ? undefined : inert()),
        apply: () => inert(),
    });
}
const vscodeMock = new Proxy({
    commands: {
        registerCommand: (id, fn) => { commands.set(id, fn); return { dispose() {} }; },
        executeCommand: () => Promise.resolve(),
    },
    window: {
        // Resolves when its callback does, as VS Code's does: that is when the notification closes.
        withProgress: async (_opts, task) => {
            events.push('progress-open');
            const result = await task({ report() {} }, { isCancellationRequested: false, onCancellationRequested() {} });
            events.push('progress-close');
            return result;
        },
        showInformationMessage: (message) => {
            if (/^Daily Audit found/.test(String(message))) { events.push('prompt'); }
            return Promise.resolve(undefined);   // the user dismisses it
        },
        showErrorMessage: () => Promise.resolve(undefined),
        showWarningMessage: () => Promise.resolve(undefined),
        createOutputChannel: () => ({ appendLine() {}, append() {}, show() {}, dispose() {}, clear() {} }),
        createWebviewPanel: () => inert(),   // the results panel; not what this test checks
    },
    workspace: { workspaceFolders: [], getConfiguration: () => ({ get: (_k, d) => d, update: () => Promise.resolve() }) },
    ProgressLocation: { Notification: 15 },
    ViewColumn: { One: 1, Two: 2, Beside: -2, Active: -1 },
}, { get: (t, k) => (k in t ? t[k] : inert()) });

/** A clean report, returned at once: all green, so nothing is filed as a GitHub issue. */
function cleanAudit() {
    events.push('audit');
    const now = new Date().toISOString();
    return Promise.resolve({
        report: {
            auditId: now, generatedAt: now, durationMs: 1,
            checks: [{ checkId: 'probe', title: 'Probe', category: 'test', status: 'green', summary: 'ok' }],
            summary: { red: 0, yellow: 0, green: 1, grey: 0, total: 1 },
        },
        written: true,
        projectNames: ['probe'],
    });
}

const DAILY_AUDIT_DIR = path.dirname(OUT);
const origLoad = Module._load;
Module._load = function (request, parent) {
    if (request === 'vscode') { return vscodeMock; }
    if (request === './runner' && parent && path.dirname(parent.filename) === DAILY_AUDIT_DIR) {
        return { runDailyAudit: cleanAudit };
    }
    return origLoad.apply(this, arguments);
};

const dailyAudit = require(OUT);
dailyAudit.activate({ subscriptions: [], extensionPath: path.join(__dirname, '..', '..') });

test('the real module registers cvs.audit.runDaily', () => {
    assert.ok(commands.has('cvs.audit.runDaily'), `registered: ${JSON.stringify([...commands.keys()])}`);
});

test('running it: the audit runs, the progress notification closes, THEN the follow-up prompt opens', async () => {
    const run = commands.get('cvs.audit.runDaily');
    assert.ok(run, 'cvs.audit.runDaily was not registered');
    await run();
    assert.deepStrictEqual(
        events,
        ['progress-open', 'audit', 'progress-close', 'prompt'],
        'the "Daily Audit found N actionable issue(s)" prompt must open after withProgress resolves; '
        + 'awaiting it inside the callback keeps the spinner running until the user answers (Bug #317). '
        + `Got: ${JSON.stringify(events)}`
    );
});

// ─── Final report ─────────────────────────────────────────────────────────────

Promise.all(pending).then(() => {
    Module._load = origLoad;
    console.log('\n' + '─'.repeat(60));
    if (failed === 0) {
        console.log(`✓ All ${passed} tests passed — issue #317 regression guard is active\n`);
        process.exit(0);   // the command's 90-second audit timeout timer would keep the process alive
    } else {
        console.error(`\n✗ ${failed} test(s) FAILED\n`);
        process.exit(1);
    }
});
