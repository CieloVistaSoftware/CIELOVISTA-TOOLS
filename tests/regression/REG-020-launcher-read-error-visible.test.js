/**
 * REG-020-launcher-read-error-visible.test.js
 *
 * Regression guard for issue #2:
 * launcher read-action failures must surface as visible UI errors.
 *
 * Static checks only:
 * 1) The read-action catch path in cvs-command-launcher/index.ts posts
 *    { type: 'error', ... } to the launcher webview.
 * 2) The launcher webview html listens for msg.type === 'error'.
 * 3) A visible run-status element exists in html markup.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const INDEX_TS = path.join(ROOT, 'src', 'features', 'cvs-command-launcher', 'index.ts');
const HTML_TS = path.join(ROOT, 'src', 'features', 'cvs-command-launcher', 'html.ts');

let failed = 0;

function pass(msg) { console.log('PASS: ' + msg); }
function fail(msg) { console.error('FAIL: ' + msg); failed++; }

if (!fs.existsSync(INDEX_TS)) {
  console.error('FATAL: missing file: ' + INDEX_TS);
  process.exit(1);
}
if (!fs.existsSync(HTML_TS)) {
  console.error('FATAL: missing file: ' + HTML_TS);
  process.exit(1);
}

const indexSrc = fs.readFileSync(INDEX_TS, 'utf8');
const htmlSrc = fs.readFileSync(HTML_TS, 'utf8');

if (/notifyPanel\.webview\.postMessage\(\{\s*type:\s*'error'/.test(indexSrc)) {
  pass('index.ts posts type:error to launcher webview on read-action failure');
} else {
  fail('index.ts must post { type: \'error\' } to launcher webview when read-action command execution throws');
}

if (/if \(msg\.type === 'error'\)/.test(htmlSrc)) {
  pass('html.ts handles msg.type === error');
} else {
  fail('html.ts must handle msg.type === \'error\' in window message listener');
}

if (/id="run-status"/.test(htmlSrc)) {
  pass('html.ts renders visible run-status container');
} else {
  fail('html.ts must include #run-status element for visible failure state');
}

console.log('');
if (failed === 0) {
  console.log('REG-020 PASSED - launcher read-action failures are wired to visible UI error state');
  process.exit(0);
}

console.error('REG-020 FAILED - ' + failed + ' check' + (failed > 1 ? 's' : '') + ' failed');
process.exit(1);
