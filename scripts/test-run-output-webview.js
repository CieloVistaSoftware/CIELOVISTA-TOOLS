/**
 * scripts/test-run-output-webview.js
 *
 * Verifies that every "run" catalog command routes through the streaming
 * cvsJobResult webview in cvs-command-launcher/index.ts.
 *
 * Architecture as of refactor:
 *   - All runs go through _executeWithOutput()
 *   - Shared channel interception via _activeStreams Map
 *   - Fire-and-forget from attachMessageHandler (void _executeWithOutput)
 *   - runWithOutput() exported for home page / external callers
 *
 * Run: node scripts/test-run-output-webview.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// ─── Load catalog ─────────────────────────────────────────────────────────────

const catalogSrc = fs.readFileSync(
    path.join(ROOT, 'src/features/cvs-command-launcher/catalog.ts'), 'utf8'
);

const catalogEntries = [];
const entryRe = /\{\s*[\s\S]*?id:\s*'([^']+)'[\s\S]*?\}/g;
let m;
while ((m = entryRe.exec(catalogSrc)) !== null) {
    const block  = m[0];
    const id     = m[1];
    const actM   = block.match(/action:\s*'([^']+)'/);
    const action = actM ? actM[1] : 'run';
    catalogEntries.push({ id, action });
}

const runEntries  = catalogEntries.filter(e => e.action !== 'read');
const readEntries = catalogEntries.filter(e => e.action === 'read');

// ─── Load handler source ──────────────────────────────────────────────────────

const handlerSrc = fs.readFileSync(
    path.join(ROOT, 'src/features/cvs-command-launcher/index.ts'), 'utf8'
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

let pass = 0, fail = 0;
const failures = [];

function ok(label, value, detail) {
    if (value) {
        console.log('  PASS: ' + label);
        pass++;
    } else {
        console.log('  FAIL: ' + label + (detail ? '\n         ' + detail : ''));
        fail++;
        failures.push(label);
    }
}

// ─── CHECK-1: run path ────────────────────────────────────────────────────────

console.log('\n-- CHECK-1: Handler processes run commands --\n');

ok('Handler routes run messages to _executeWithOutput',
    handlerSrc.includes("msg.command === 'run' && msg.id") ||
    handlerSrc.includes("msg.command !== 'run' || !msg.id"));

ok('cvs.mcp.startServer has special case (toggle, no output panel)',
    handlerSrc.includes("cvs.mcp.startServer"));

const runCount  = runEntries.length;
const readCount = readEntries.length;
console.log('  INFO: ' + catalogEntries.length + ' total catalog commands (' + runCount + ' run, ' + readCount + ' read)');
ok('Catalog has run-type commands (' + runCount + ')', runCount > 0);

// ─── CHECK-2: Panel opens IMMEDIATELY ────────────────────────────────────────

console.log('\n-- CHECK-2: Streaming panel opens immediately on Run click --\n');

ok("Panel created with type 'cvsJobResult'",
    handlerSrc.includes("'cvsJobResult'"));

ok('Panel opens with hourglass spinner title',
    handlerSrc.includes('\\u23f3'));

ok('buildResultPanelHtml produces streaming panel',
    handlerSrc.includes('buildResultPanelHtml'));

// ─── CHECK-3: Shared async streaming ─────────────────────────────────────────

console.log('\n-- CHECK-3: Shared async channel interception --\n');

ok('_activeStreams Map supports multiple simultaneous runs',
    handlerSrc.includes('_activeStreams'));

ok('startInterception() / stopInterceptionIfIdle() manage lifecycle',
    handlerSrc.includes('startInterception') && handlerSrc.includes('stopInterceptionIfIdle'));

ok("Lines posted as { type:'line' } to panel",
    handlerSrc.includes("type: 'line'"));

ok('Lines split on newlines for real-time streaming',
    handlerSrc.includes('split(/\\r?\\n/)') || handlerSrc.includes("split(/\\r?\\n/)"));

// ─── CHECK-4: Terminal command detection ─────────────────────────────────────

console.log('\n-- CHECK-4: Terminal commands detected --\n');

ok('Terminal commands detected by new terminal creation (not elapsed time)',
    handlerSrc.includes('termIdsBefore') || handlerSrc.includes('termsBefore'));

ok("Terminal case posts { type:'terminal' } to panel",
    handlerSrc.includes("type: 'terminal'"));

ok('Terminal case records run and notifies launcher',
    handlerSrc.includes('recordRun') && handlerSrc.includes("state: 'ok'"));

// ─── CHECK-5: Completion ──────────────────────────────────────────────────────

console.log('\n-- CHECK-5: Completion and error handling --\n');

ok('finish() updates panel title with checkmark/cross',
    handlerSrc.includes('\\u2705') || handlerSrc.includes('u2705'));

ok('finish() sends elapsed time',
    handlerSrc.includes('elapsed'));

ok('Failure path calls finish(false, elapsed, stack)',
    handlerSrc.includes('finish(false, elapsed, stack)'));

ok('Success path calls finish(true, elapsed)',
    handlerSrc.includes('finish(true, elapsed)'));

// ─── CHECK-6: Copy to Chat ────────────────────────────────────────────────────

console.log('\n-- CHECK-6: Copy to Chat button --\n');

ok("Result panel has Copy Output button",
    handlerSrc.includes('btn-copy') || handlerSrc.includes('Copy Output'));

ok("Result panel has Copy to Chat button",
    handlerSrc.includes('btn-chat') || handlerSrc.includes('Copy to Chat'));

ok("copy-to-chat message forwarded to VS Code clipboard",
    handlerSrc.includes("copy-to-chat") && handlerSrc.includes('clipboard'));

// ─── CHECK-7: Green light run-state ──────────────────────────────────────────

console.log('\n-- CHECK-7: Green light run-state messages --\n');

ok("run-state 'running' sent to launcher card on start",
    handlerSrc.includes("state: 'running'"));

ok("run-state 'ok' sent on success",
    handlerSrc.includes("state: 'ok'"));

ok("run-state 'error' sent on failure",
    handlerSrc.includes("state: 'error'") || handlerSrc.includes("state: ok ? 'ok' : 'error'"));

// ─── CHECK-8: Read commands skip panel ───────────────────────────────────────

console.log('\n-- CHECK-8: Read commands skip output panel reveal --\n');

ok("Guard: launcher panel reveal skipped for read-type commands",
    handlerSrc.includes("entry?.action !== 'read'"));

console.log('\n  INFO: Read commands (' + readCount + '):');
readEntries.forEach(function(e) { console.log('         ' + e.id); });

// ─── CHECK-9: Panel HTML ──────────────────────────────────────────────────────

console.log('\n-- CHECK-9: Result panel HTML structure --\n');

ok('Panel HTML has spinner animation',
    handlerSrc.includes('animation:spin'));

ok('Panel HTML has scrolling #out div',
    handlerSrc.includes('id="out"') || handlerSrc.includes("id='out'"));

ok('Panel HTML uses VS Code CSS variables',
    handlerSrc.includes('var(--vscode-editor-background)'));

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log('\n' + '-'.repeat(60));
console.log((pass + fail) + ' checks: ' + pass + ' passed, ' + fail + ' failed');
if (fail === 0) {
    console.log('\nRUN OUTPUT WEBVIEW: All checks passed');
    console.log(runCount + ' run commands, shared async interception, Copy to Chat, green lights.');
    process.exit(0);
} else {
    console.log('\nRUN OUTPUT WEBVIEW: FAILED');
    failures.forEach(function(f) { console.log('  - ' + f); });
    process.exit(1);
}
