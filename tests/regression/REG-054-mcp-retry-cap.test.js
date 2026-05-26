/**
 * REG-054-mcp-retry-cap.test.js
 *
 * Regression test for #374 — MCP server crash-respawn loop.
 *
 * The problem: scheduleRetry() previously had no upper bound on the number
 * of retries. A sticky failure (e.g., dist not built, port in use) would
 * loop indefinitely at 30s intervals, generating a continuous stream of
 * APP_ERROR issues. 314 cumulative occurrences across 5 auto-filed issues
 * were traced to this pattern.
 *
 * The fix: MAX_RETRY_ATTEMPTS constant (10) with a hard give-up path in
 * scheduleRetry() that emits a single user-visible terminal message and
 * logError call, then stops — no further scheduling.
 *
 * Checks (source-level):
 *   1. MAX_RETRY_ATTEMPTS constant is defined in mcp-server-status.ts
 *   2. scheduleRetry guards on retryAttempt >= MAX_RETRY_ATTEMPTS before scheduling
 *   3. Give-up path calls logError (single error) then returns — no setTimeout
 *   4. Give-up message is user-readable and names a recovery command
 *   5. Retry messages include the attempt count and total cap (e.g. "attempt N of 10")
 *   6. MAX_RETRY_ATTEMPTS is exposed on _test for testability
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT   = path.resolve(__dirname, '..', '..');
const MCP_TS = path.join(ROOT, 'src', 'features', 'mcp-server-status.ts');

let failed = 0;
const fail = (msg) => { console.error('FAIL: ' + msg); failed++; };
const ok   = (msg) => { console.log('PASS: ' + msg); };

if (!fs.existsSync(MCP_TS)) {
    console.error('FATAL: mcp-server-status.ts not found at ' + MCP_TS);
    process.exit(1);
}

const src = fs.readFileSync(MCP_TS, 'utf8');

// ─── Check 1: MAX_RETRY_ATTEMPTS constant ────────────────────────────────────

(function checkConstantDefined() {
    if (!/const\s+MAX_RETRY_ATTEMPTS\s*=\s*\d+/.test(src)) {
        fail('MAX_RETRY_ATTEMPTS constant not found in mcp-server-status.ts — the retry cap is undefined');
        return;
    }
    ok('MAX_RETRY_ATTEMPTS constant is defined');
})();

// ─── Check 2: scheduleRetry guards on the cap ────────────────────────────────

(function checkCapGuardExists() {
    // Must be retryAttempt >= MAX_RETRY_ATTEMPTS (or equivalent > MAX_RETRY_ATTEMPTS-1)
    if (!/retryAttempt\s*>=\s*MAX_RETRY_ATTEMPTS/.test(src)) {
        fail('scheduleRetry does not guard on retryAttempt >= MAX_RETRY_ATTEMPTS — the loop runs forever on sticky failures');
        return;
    }
    ok('scheduleRetry guards on retryAttempt >= MAX_RETRY_ATTEMPTS');
})();

// ─── Check 3: Give-up path calls logError then returns, no setTimeout ────────

(function checkGiveUpReturnsWithoutTimer() {
    // Find the guard block and check it has logError + return before setTimeout
    const guardIdx    = src.indexOf('retryAttempt >= MAX_RETRY_ATTEMPTS');
    if (guardIdx < 0) {
        fail('guard block not found — cannot verify give-up path structure');
        return;
    }
    // Slice from the guard to the next closing brace of the if block (~300 chars)
    const snippet = src.slice(guardIdx, guardIdx + 400);
    if (!/logError\s*\(/.test(snippet)) {
        fail('give-up path does not call logError — a single error must be emitted on final give-up');
        return;
    }
    if (!/return;/.test(snippet)) {
        fail('give-up path does not return — setTimeout will still be scheduled after hitting the cap');
        return;
    }
    ok('give-up path calls logError and returns without scheduling another retry');
})();

// ─── Check 4: Give-up message is user-readable ───────────────────────────────

(function checkGiveUpMessage() {
    // Message must mention giving up and a way to recover
    if (!/giving up/.test(src)) {
        fail('give-up message does not say "giving up" — the user needs a clear signal that retries have stopped');
        return;
    }
    if (!/cvs\.mcp\.start/.test(src)) {
        fail('give-up message does not mention cvs.mcp.start — the user must know how to recover manually');
        return;
    }
    ok('give-up message is user-readable and names cvs.mcp.start as recovery command');
})();

// ─── Check 5: Retry messages include attempt count and total cap ─────────────

(function checkRetryProgressMessage() {
    // terminalWriteLine should say "attempt N of ${MAX_RETRY_ATTEMPTS}" or similar
    if (!/of \$\{MAX_RETRY_ATTEMPTS\}/.test(src)) {
        fail('retry progress message does not include total cap (e.g. "attempt N of ${MAX_RETRY_ATTEMPTS}") — user cannot tell how many retries remain');
        return;
    }
    ok('retry progress messages include attempt count and cap');
})();

// ─── Check 6: MAX_RETRY_ATTEMPTS exposed on _test ───────────────────────────

(function checkTestExport() {
    if (!/MAX_RETRY_ATTEMPTS,/.test(src)) {
        fail('MAX_RETRY_ATTEMPTS is not exported on _test — unit tests cannot verify the cap value');
        return;
    }
    ok('MAX_RETRY_ATTEMPTS is exported on _test for testability');
})();

// ─── Result ──────────────────────────────────────────────────────────────────

console.log('');
if (failed === 0) {
    console.log('REG-054 PASSED — MCP retry cap and give-up path are in source');
    process.exit(0);
} else {
    console.error('REG-054 FAILED — ' + failed + ' check' + (failed > 1 ? 's' : '') + ' failed');
    process.exit(1);
}
