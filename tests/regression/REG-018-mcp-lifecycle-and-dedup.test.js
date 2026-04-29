/**
 * REG-018-mcp-lifecycle-and-dedup.test.js
 *
 * Regression test for issues #59, #60, #63, #64 — the auto-filed
 * APP_ERROR cluster that produced 314 cumulative occurrences across
 * four GitHub issues. Two distinct fixes have to stay in source:
 *
 *   1. mcp-server-status.ts must filter SIGTERM / SIGINT and exit
 *      code 0 out of the logError + scheduleRetry path. Those are
 *      normal lifecycle events (window reload, clean self-shutdown)
 *      and were responsible for ×142 (code 0) + ×44 (SIGTERM) +
 *      ×64 + ×64 = 314 of the cluster's events.
 *
 *   2. github-issue-filer.ts fileErrorAsIssue must call
 *      findOpenAutoFiledIssue(...) before postIssue(...) so that a
 *      same-title recurrence becomes a comment on the existing
 *      issue, not a duplicate. Issue #60 (identical title to #64)
 *      is the canonical example of what dedup prevents.
 *
 * Static-source check — driving the actual MCP process or hitting
 * the real GitHub API would be slow and require credentials. The
 * structural patterns required by the fix are present in source if
 * the test passes.
 *
 * Spawned via REG-018 inside scripts/run-regression-tests.js.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT     = path.resolve(__dirname, '..', '..');
const MCP_TS   = path.join(ROOT, 'src', 'features', 'mcp-server-status.ts');
const FILER_TS = path.join(ROOT, 'src', 'shared', 'github-issue-filer.ts');

let failed = 0;
const fail = (msg) => { console.error('FAIL: ' + msg); failed++; };
const ok   = (msg) => { console.log('PASS: ' + msg); };

for (const p of [MCP_TS, FILER_TS]) {
    if (!fs.existsSync(p)) {
        console.error('FATAL: required source file missing: ' + p);
        process.exit(1);
    }
}
const mcpSrc   = fs.readFileSync(MCP_TS,   'utf8');
const filerSrc = fs.readFileSync(FILER_TS, 'utf8');

// ─── Check 1: SIGTERM/SIGINT and code===0 are filtered before logError ───

(function checkExpectedSignalGuard() {
    if (!/signal\s*===\s*['"]SIGTERM['"]\s*\|\|\s*signal\s*===\s*['"]SIGINT['"]/.test(mcpSrc)) {
        fail('mcp-server-status.ts is missing the expected-signal guard — SIGTERM/SIGINT must be filtered out so window reloads do not produce APP_ERROR issues');
        return;
    }
    ok('mcp-server-status.ts filters signal === \'SIGTERM\' || signal === \'SIGINT\'');
})();

(function checkCleanExitGuard() {
    if (!/!signal\s*&&\s*code\s*===\s*0/.test(mcpSrc)) {
        fail('mcp-server-status.ts is missing the clean-exit guard — !signal && code === 0 must be filtered out so successful shutdowns do not produce APP_ERROR issues (this is the source of issue #59 ×142)');
        return;
    }
    ok('mcp-server-status.ts filters !signal && code === 0 (clean exit)');
})();

(function checkGuardEarlyReturn() {
    // Both predicates must be combined into an early-return so the
    // logError + scheduleRetry path is skipped for those cases. The
    // exact text we look for is the boolean OR of the two locals
    // followed by a return inside the block.
    const re = /isExpectedTermSignal\s*\|\|\s*isCleanExit[\s\S]{0,200}return;/;
    if (!re.test(mcpSrc)) {
        fail('mcp-server-status.ts has the guard variables but no early return — the fix is incomplete unless logError + scheduleRetry are SKIPPED for SIGTERM/SIGINT and code===0');
        return;
    }
    ok('mcp-server-status.ts early-returns from the exit handler when expected lifecycle event detected');
})();

(function checkGuardPositionedBeforeLogError() {
    // The guard must be positioned BEFORE the logError call so the
    // log-and-retry path is skipped. Verify by checking the guard
    // text appears earlier in the file than the logError line.
    const guardIdx = mcpSrc.indexOf('isExpectedTermSignal');
    const logErrIdx = mcpSrc.indexOf('logError(`MCP process exited unexpectedly');
    if (guardIdx < 0 || logErrIdx < 0) {
        fail('mcp-server-status.ts is missing either the guard or the original logError call — cannot verify ordering');
        return;
    }
    if (guardIdx > logErrIdx) {
        fail('mcp-server-status.ts has the guard AFTER the logError call — that is a no-op. The guard must run BEFORE logError and return early.');
        return;
    }
    ok('mcp-server-status.ts guard is positioned before the logError call');
})();

// ─── Check 2: fileErrorAsIssue dedups before posting a new issue ─────────

(function checkDedupHelpersExist() {
    if (!/function\s+findOpenAutoFiledIssue\s*\(/.test(filerSrc)) {
        fail('github-issue-filer.ts is missing findOpenAutoFiledIssue() — without it the dedup path cannot run');
        return;
    }
    if (!/function\s+postIssueComment\s*\(/.test(filerSrc)) {
        fail('github-issue-filer.ts is missing postIssueComment() — dedup cannot bump existing issues without it');
        return;
    }
    ok('github-issue-filer.ts has findOpenAutoFiledIssue and postIssueComment helpers');
})();

(function checkSearchUsesAutoFiledLabel() {
    // The dedup search must scope to the auto-filed label so a manual
    // issue with a coincidentally-matching title doesn't get a stray
    // dedup comment. Open state too — we don't want to revive closed.
    if (!/labels=auto-filed[^"`']*state=open/.test(filerSrc)) {
        fail('github-issue-filer.ts findOpenAutoFiledIssue must query labels=auto-filed&state=open to scope dedup correctly');
        return;
    }
    ok('findOpenAutoFiledIssue scopes search to labels=auto-filed&state=open');
})();

(function checkDedupRunsBeforePostIssue() {
    // Inside fileErrorAsIssue, findOpenAutoFiledIssue must be awaited
    // BEFORE the postIssue call, otherwise dedup can't prevent the
    // duplicate. Find the function body and check ordering.
    const fnStart = filerSrc.indexOf('export async function fileErrorAsIssue(');
    if (fnStart < 0) {
        fail('fileErrorAsIssue export not found in github-issue-filer.ts');
        return;
    }
    const fnEnd = filerSrc.indexOf('\nexport ', fnStart + 1);
    const body  = filerSrc.slice(fnStart, fnEnd > 0 ? fnEnd : filerSrc.length);

    const findIdx = body.indexOf('findOpenAutoFiledIssue');
    const postIdx = body.indexOf('postIssue(token');
    if (findIdx < 0) {
        fail('fileErrorAsIssue does not call findOpenAutoFiledIssue — dedup is not wired in');
        return;
    }
    if (postIdx < 0) {
        fail('fileErrorAsIssue does not call postIssue — file structure has changed');
        return;
    }
    if (findIdx > postIdx) {
        fail('fileErrorAsIssue calls findOpenAutoFiledIssue AFTER postIssue — that defeats dedup. The dedup check must run first.');
        return;
    }
    ok('fileErrorAsIssue calls findOpenAutoFiledIssue before postIssue');
})();

(function checkDedupCommentsOnExistingIssue() {
    // When dedup finds a match, the call site must use postIssueComment
    // with the matched issue's number — not call postIssue, which would
    // create a duplicate.
    const fnStart = filerSrc.indexOf('export async function fileErrorAsIssue(');
    const fnEnd   = filerSrc.indexOf('\nexport ', fnStart + 1);
    const body    = filerSrc.slice(fnStart, fnEnd > 0 ? fnEnd : filerSrc.length);
    if (!/if\s*\(\s*existing\s*\)/.test(body)) {
        fail('fileErrorAsIssue is missing the if (existing) branch that handles the dedup hit');
        return;
    }
    if (!/postIssueComment\s*\(\s*token\s*,\s*existing\.number/.test(body)) {
        fail('fileErrorAsIssue dedup branch does not call postIssueComment(token, existing.number, ...) — duplicate issue would still be created');
        return;
    }
    ok('fileErrorAsIssue dedup branch posts a comment on the matched existing issue');
})();

// ─── Result ───────────────────────────────────────────────────────────────

console.log('');
if (failed === 0) {
    console.log('REG-018 PASSED — MCP lifecycle filter and auto-filer dedup are in source');
    process.exit(0);
} else {
    console.error('REG-018 FAILED — ' + failed + ' check' + (failed > 1 ? 's' : '') + ' failed');
    process.exit(1);
}
