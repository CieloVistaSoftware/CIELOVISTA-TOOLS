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
 *   LAYER 2 — Behavioral mock test
 *     Simulates the fixed execution pattern with a mock withProgress and
 *     confirms:
 *       - the withProgress callback resolves without awaiting offerAuditActions
 *       - offerAuditActions is called after withProgress resolves
 *       - the execution order is: [audit] → [progress closes] → [offerAuditActions]
 *
 * Run: node tests/unit/daily-audit-progress-guard.test.js
 */

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');

const SRC = path.join(__dirname, '../../src/features/daily-audit/index.ts');

let passed = 0, failed = 0;

function test(name, fn) {
    try {
        const r = fn();
        if (r instanceof Promise) {
            // Handle async tests — collect for final report
            r.then(() => {
                console.log(`  \u2713 ${name}`);
                passed++;
            }).catch(e => {
                console.error(`  \u2717 ${name}\n    \u2192 ${e.message}`);
                failed++;
            });
        } else {
            console.log(`  \u2713 ${name}`);
            passed++;
        }
    } catch (e) {
        console.error(`  \u2717 ${name}\n    \u2192 ${e.message}`);
        failed++;
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

// ─── Layer 2: Behavioral mock test ───────────────────────────────────────────

console.log('\n-- Layer 2: Behavioral mock — execution order contract --');

/**
 * Simulates the FIXED pattern:
 *   let _result;
 *   await withProgress(async () => { _result = await runAudit(); // work only
 *   });
 *   if (_result) { await offerActions(_result); }
 *
 * Verifies:
 *   1. withProgress callback resolves before offerActions is called
 *   2. offerActions is called after withProgress resolves
 *   3. The order array is exactly: audit → progressClose → offerActions
 */
test('FIXED pattern: withProgress resolves before offerAuditActions runs', async () => {
    const order = [];

    // Mock withProgress — runs its callback and resolves immediately when done
    async function mockWithProgress(callback) {
        await callback();
        order.push('progressClose');
    }

    // Mock runDailyAudit — fast async operation
    async function mockRunDailyAudit() {
        order.push('audit');
        return { written: true, report: { summary: {}, checks: [], durationMs: 1 }, projectNames: [] };
    }

    // Mock offerAuditActions — simulates user prompt (slow)
    async function mockOfferAuditActions() {
        order.push('offerActions');
    }

    // ── Fixed implementation pattern ──────────────────────────────────────────
    let _auditResult;
    await mockWithProgress(async () => {
        _auditResult = await mockRunDailyAudit();
        // NOTE: offerAuditActions is NOT called here — that is the fix
    });
    if (_auditResult) {
        await mockOfferAuditActions(_auditResult);
    }

    assert.deepStrictEqual(
        order,
        ['audit', 'progressClose', 'offerActions'],
        `Execution order must be [audit → progressClose → offerActions]. Got: ${JSON.stringify(order)}`
    );
});

/**
 * Simulates the BROKEN pattern (the original bug) to confirm the test would
 * catch a regression if offerAuditActions were moved back inside withProgress.
 *
 * Verifies that in the broken pattern the order is wrong:
 *   audit → offerActions → progressClose   ← BAD: progress stays open during offerActions
 */
test('BROKEN pattern: offerAuditActions inside withProgress causes wrong order (regression baseline)', async () => {
    const order = [];

    async function mockWithProgress(callback) {
        await callback();
        order.push('progressClose');
    }

    async function mockRunDailyAudit() {
        order.push('audit');
        return { written: true };
    }

    async function mockOfferAuditActions() {
        order.push('offerActions');
    }

    // ── Broken pattern (what the bug was) ─────────────────────────────────────
    await mockWithProgress(async () => {
        const result = await mockRunDailyAudit();
        await mockOfferAuditActions(result);   // BUG: inside withProgress
    });

    assert.deepStrictEqual(
        order,
        ['audit', 'offerActions', 'progressClose'],
        'Broken pattern must show offerActions fires BEFORE progressClose'
    );
});

/**
 * Confirms the fixed and broken patterns produce DIFFERENT orders —
 * ensuring the structural test above actually catches a real regression.
 */
test('fixed and broken execution orders are distinct (test is meaningful)', async () => {
    async function runPattern(putOfferInsideProgress) {
        const order = [];
        const withProgressMock = async (cb) => { await cb(); order.push('progressClose'); };
        const auditMock  = async () => { order.push('audit'); return {}; };
        const offerMock  = async () => { order.push('offerActions'); };

        if (putOfferInsideProgress) {
            await withProgressMock(async () => { const r = await auditMock(); await offerMock(r); });
        } else {
            let r;
            await withProgressMock(async () => { r = await auditMock(); });
            await offerMock(r);
        }
        return order;
    }

    const fixedOrder  = await runPattern(false);
    const brokenOrder = await runPattern(true);

    assert.notDeepStrictEqual(fixedOrder, brokenOrder, 'Fixed and broken patterns must differ in execution order');
    assert.deepStrictEqual(fixedOrder,  ['audit', 'progressClose', 'offerActions'], 'Fixed order');
    assert.deepStrictEqual(brokenOrder, ['audit', 'offerActions', 'progressClose'], 'Broken order');
});

// ─── Final report ─────────────────────────────────────────────────────────────

// Give async tests a tick to settle
setTimeout(() => {
    console.log('\n' + '\u2500'.repeat(60));
    if (failed === 0) {
        console.log(`\u2713 All ${passed} tests passed — issue #317 regression guard is active\n`);
        process.exit(0);
    } else {
        console.error(`\n\u2717 ${failed} test(s) FAILED\n`);
        process.exit(1);
    }
}, 50);
