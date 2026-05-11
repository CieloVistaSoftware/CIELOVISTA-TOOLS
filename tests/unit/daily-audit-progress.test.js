'use strict';

/**
 * tests/unit/daily-audit-progress.test.js
 *
 * Regression test for issue #317 — Daily Health Check spinner ran continuously.
 *
 * Root cause: offerAuditActions() was awaited INSIDE the withProgress callback.
 * withProgress keeps its spinner open until the callback resolves. Since
 * offerAuditActions waits for user input, the spinner never closed.
 *
 * Fix: offerAuditActions() must be called AFTER withProgress resolves, not inside it.
 *
 * This test is a static-source check. It verifies the structural guarantee
 * without launching VS Code.
 */

const fs   = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '..', '..', 'src', 'features', 'daily-audit', 'index.ts');

let failed = 0;
const fail = (msg) => { console.error('FAIL: ' + msg); failed++; };
const ok   = (msg) => { console.log('PASS: ' + msg); };

if (!fs.existsSync(SRC)) {
    console.error('FATAL: daily-audit/index.ts not found at ' + SRC);
    process.exit(1);
}
const src = fs.readFileSync(SRC, 'utf8');

// ─── Check 1: withProgress block closes before offerAuditActions ─────────────

(function checkOfferAuditActionsOutsideProgress() {
    const progressStart = src.indexOf('withProgress(');
    if (progressStart < 0) {
        fail('withProgress() call not found in daily-audit/index.ts');
        return;
    }

    // Find the closing paren of withProgress(...) — it ends after the async callback
    // The pattern is: await withProgress(..., async (progress) => { ... });
    // We look for ); after the callback body.
    // Simpler: find where the withProgress block ends by locating the
    // "if (_auditResult)" line — that must come AFTER the withProgress closes.
    const afterProgressIdx = src.indexOf('if (_auditResult)');
    if (afterProgressIdx < 0) {
        fail('"if (_auditResult)" guard not found — offerAuditActions may be inside withProgress');
        return;
    }

    // offerAuditActions call must appear after the withProgress block
    const offerIdx = src.indexOf('await offerAuditActions(');
    if (offerIdx < 0) {
        fail('offerAuditActions() call not found');
        return;
    }

    if (offerIdx < afterProgressIdx) {
        fail('offerAuditActions() call appears before the post-progress guard — it may be inside withProgress');
        return;
    }

    ok('offerAuditActions() is called after withProgress resolves (spinner closes on audit completion)');
})();

// ─── Check 2: offerAuditActions is NOT referenced inside the callback body ───

(function checkNotInsideCallback() {
    // The withProgress callback is everything between the async arrow and the
    // closing ); of the withProgress call. We identify it as the block between
    // "async (progress) => {" and the first line that reads "            }".
    // Simpler heuristic: offerAuditActions must not appear before _auditResult is used.
    const progressCallbackStart = src.indexOf('async (progress) =>');
    const auditResultAssign     = src.indexOf('_auditResult = result');
    const auditResultGuard      = src.indexOf('if (_auditResult)');

    if (progressCallbackStart < 0 || auditResultAssign < 0 || auditResultGuard < 0) {
        fail('Could not locate expected structural markers in daily-audit/index.ts');
        return;
    }

    // Slice out everything strictly INSIDE the withProgress callback
    // (from callback start to the guard that follows withProgress)
    const callbackBody = src.slice(progressCallbackStart, auditResultGuard);

    if (callbackBody.includes('offerAuditActions(')) {
        fail('offerAuditActions() found INSIDE the withProgress callback body — spinner will block on user input');
        return;
    }

    ok('offerAuditActions() not present inside withProgress callback — spinner closes promptly');
})();

// ─── Check 3: _auditResult capture pattern exists ────────────────────────────

(function checkAuditResultCapture() {
    // The fix requires capturing the result inside withProgress so it can be
    // used after withProgress returns.
    if (!src.includes('let _auditResult')) {
        fail('_auditResult variable not declared — result cannot be passed to offerAuditActions after withProgress');
        return;
    }
    if (!src.includes('_auditResult = result')) {
        fail('_auditResult not assigned inside withProgress — audit result not captured for post-progress use');
        return;
    }
    ok('_auditResult capture pattern in place — audit result available after withProgress resolves');
})();

// ─── Result ───────────────────────────────────────────────────────────────────

console.log('');
if (failed === 0) {
    console.log('daily-audit-progress PASSED — offerAuditActions correctly runs after withProgress');
    process.exit(0);
} else {
    console.error('daily-audit-progress FAILED — ' + failed + ' check' + (failed > 1 ? 's' : '') + ' failed');
    process.exit(1);
}
