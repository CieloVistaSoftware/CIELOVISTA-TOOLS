'use strict';

const fs = require('fs');
const path = require('path');

const SRC_PATH = path.resolve(__dirname, '..', '..', 'src', 'features', 'npm-command-launcher.ts');

let failed = 0;
const fail = (msg) => { console.error('FAIL: ' + msg); failed++; };
const ok   = (msg) => { console.log('PASS: ' + msg); };

if (!fs.existsSync(SRC_PATH)) {
  console.error('FATAL: npm-command-launcher.ts not found at ' + SRC_PATH);
  process.exit(1);
}
const src = fs.readFileSync(SRC_PATH, 'utf8');

(function checkNoTerminalForRun() {
  const runStart = src.indexOf("case 'run':");
  const runEnd = src.indexOf("case 'stop':", runStart + 1);
  if (runStart < 0 || runEnd < 0) {
    fail('Could not locate run switch block');
    return;
  }
  const runBlock = src.slice(runStart, runEnd);
  if (/createTerminal\s*\(/.test(runBlock) || /sendText\s*\(/.test(runBlock)) {
    fail('run block uses terminal APIs; output must route to NPM Output panel instead');
    return;
  }
  ok('run block does not use terminal APIs');
})();

(function checkEagerOpenBeforeJobStart() {
  // Fix for issue #293: setupOutputPanel() must be called BEFORE job-start so
  // failed zero-output jobs still appear in the panel. Lazy open (in data
  // handlers) caused the panel to never open for jobs with no stdout/stderr.
  const runStart = src.indexOf("case 'run':");
  const runEnd   = src.indexOf("case 'stop':", runStart + 1);
  if (runStart < 0 || runEnd < 0) {
    fail('Could not locate run switch block for eager-open checks');
    return;
  }
  const runBlock = src.slice(runStart, runEnd);

  const setupIdx    = runBlock.indexOf('setupOutputPanel()');
  const jobStartIdx = runBlock.indexOf("sendOut('job-start'");
  if (setupIdx < 0) {
    fail('setupOutputPanel() not called in run handler — failed zero-output jobs will not appear in panel');
    return;
  }
  if (jobStartIdx < 0) {
    fail("sendOut('job-start') missing from run handler");
    return;
  }
  if (setupIdx > jobStartIdx) {
    fail('setupOutputPanel() called AFTER job-start — panel may not exist when first messages queue');
    return;
  }

  // Lazy calls inside data handlers are a regression of the fix
  const stdoutIdx  = runBlock.indexOf("proc.stdout?.on('data'");
  const stderrIdx  = runBlock.indexOf("proc.stderr?.on('data'");
  if (stdoutIdx >= 0) {
    const stdoutBody = runBlock.slice(stdoutIdx, runBlock.indexOf('});', stdoutIdx) + 3);
    if (stdoutBody.includes('setupOutputPanel()')) {
      fail('Lazy setupOutputPanel() call inside stdout handler — regression of issue #293 fix');
      return;
    }
  }
  if (stderrIdx >= 0) {
    const stderrBody = runBlock.slice(stderrIdx, runBlock.indexOf('});', stderrIdx) + 3);
    if (stderrBody.includes('setupOutputPanel()')) {
      fail('Lazy setupOutputPanel() call inside stderr handler — regression of issue #293 fix');
      return;
    }
  }

  ok('output panel opens eagerly before job-start (zero-output failures show in panel)');
})();

(function checkElapsedTimePlumbing() {
  const hasStart = src.includes('const startedAt = Date.now();');
  const hasCloseDuration = src.includes("sendOut('done', { code: code ?? 1, killed, durationMs: Date.now() - startedAt });");
  const hasErrorDuration = src.includes("sendOut('done', { code: 1, killed: false, durationMs: Date.now() - startedAt });");
  const hasDurationText = src.includes("var durText = (typeof m.durationMs === 'number' && m.durationMs >= 0)");

  if (!hasStart) { fail('run block missing startedAt timestamp'); return; }
  if (!hasCloseDuration) { fail('done payload on close missing durationMs'); return; }
  if (!hasErrorDuration) { fail('done payload on error missing durationMs'); return; }
  if (!hasDurationText) { fail('webview done handler missing duration text rendering'); return; }

  ok('elapsed time is measured and rendered on completion');
})();

console.log('');
if (failed === 0) {
  console.log('REG-025 PASSED — NPM output routing + timing guarantees are in source');
  process.exit(0);
} else {
  console.error('REG-025 FAILED — ' + failed + ' check' + (failed > 1 ? 's' : '') + ' failed');
  process.exit(1);
}
