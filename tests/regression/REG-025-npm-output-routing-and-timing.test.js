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

(function checkLazyOpenOnFirstOutput() {
  const runStart = src.indexOf("case 'run':");
  const runEnd = src.indexOf("case 'stop':", runStart + 1);
  if (runStart < 0 || runEnd < 0) {
    fail('Could not locate run switch block for lazy-open checks');
    return;
  }
  const runBlock = src.slice(runStart, runEnd);

  if (runBlock.includes('setupOutputPanel();\n\n                const sendOut')) {
    fail('setupOutputPanel() is called at run start; panel must open lazily on first output');
    return;
  }

  const stdoutIdx = runBlock.indexOf("proc.stdout?.on('data'");
  const stderrIdx = runBlock.indexOf("proc.stderr?.on('data'");
  if (stdoutIdx < 0 || stderrIdx < 0) {
    fail('Missing stdout/stderr data handlers');
    return;
  }

  const stdoutBlock = runBlock.slice(stdoutIdx, stderrIdx);
  const closeIdx = runBlock.indexOf("let killed = false;", stderrIdx);
  const stderrBlock = closeIdx > 0 ? runBlock.slice(stderrIdx, closeIdx) : runBlock.slice(stderrIdx);

  if (!stdoutBlock.includes('setupOutputPanel();')) {
    fail('stdout handler does not lazily open output panel');
    return;
  }
  if (!stderrBlock.includes('setupOutputPanel();')) {
    fail('stderr handler does not lazily open output panel');
    return;
  }

  ok('output panel opens lazily in stdout/stderr handlers');
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
