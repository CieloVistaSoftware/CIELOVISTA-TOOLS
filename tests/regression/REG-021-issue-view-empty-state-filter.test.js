/**
 * REG-021-issue-view-empty-state-filter.test.js
 *
 * Regression guard for issue #281:
 * Issue Viewer must always show the open/closed state toggle,
 * including when there are zero open issues.
 *
 * Static checks:
 * 1) Header actions contain id="state-open" and id="state-closed" buttons (always-rendered region).
 * 2) The data-dependent controls block does not contain the state toggle.
 * 3) JS wiring for state toggle setState postMessage exists.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const VIEW_TS = path.join(ROOT, 'src', 'shared', 'github-issues-view.ts');

let failed = 0;

function pass(msg) { console.log('PASS: ' + msg); }
function fail(msg) { console.error('FAIL: ' + msg); failed++; }

if (!fs.existsSync(VIEW_TS)) {
  console.error('FATAL: missing file: ' + VIEW_TS);
  process.exit(1);
}

const src = fs.readFileSync(VIEW_TS, 'utf8');

if (/<div id="hd-actions">[\s\S]*?id="state-open"/.test(src) &&
    /<div id="hd-actions">[\s\S]*?id="state-closed"/.test(src)) {
  pass('state toggle buttons are rendered in header actions (always visible)');
} else {
  fail('state-open and state-closed toggle buttons must be rendered in #hd-actions so they appear in empty states');
}

const controlsDecl = src.match(/const controls = `([\s\S]*?)`;/);
const controlsHtml = controlsDecl ? controlsDecl[1] : '';
const controlsHasSearch = controlsHtml.includes('<input id="search"');
const controlsHasState = controlsHtml.includes('id="state-open"') || controlsHtml.includes('id="state-closed"');
if (!controlsHasSearch || controlsHasState) {
  fail('controls block must not contain the state toggle buttons');
} else {
  pass('controls block is data-only and does not own the state toggle');
}

if (src.includes("document.getElementById('state-open')") &&
    src.includes("document.getElementById('state-closed')") &&
    src.includes("vsc.postMessage({ type: 'setState', state: 'open' })") &&
    src.includes("vsc.postMessage({ type: 'setState', state: 'closed' })")) {
  pass('state toggle JS wiring posts setState for both open and closed');
} else {
  fail('missing state toggle setState message wiring in JS');
}

console.log('');
if (failed === 0) {
  console.log('REG-021 PASSED - Issue Viewer state filter remains visible in empty state');
  process.exit(0);
}

console.error('REG-021 FAILED - ' + failed + ' check' + (failed > 1 ? 's' : '') + ' failed');
process.exit(1);
