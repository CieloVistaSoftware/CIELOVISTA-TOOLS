'use strict';
/**
 * tests/home-recent-runs-tooltip.test.js
 *
 * Regression guard for CVT Home "Recent Runs" full-string hover tooltip.
 *
 * Requirements locked by this test:
 *   1) Each recent run title emits a data-tip attribute with full title text.
 *   2) CSS defines an immediate custom tooltip for .hist-title using ::after.
 *   3) Hover rule shows tooltip immediately (.hist-title:hover::after { display:block }).
 *   4) Compiled output also contains the same tooltip wiring.
 *
 * Run: node tests/home-recent-runs-tooltip.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src', 'features', 'home-page.ts');
const OUT = path.join(__dirname, '..', 'out', 'features', 'home-page.js');

const src = fs.readFileSync(SRC, 'utf8');
const out = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';

function mustContain(haystack, needle, label) {
  assert.ok(haystack.includes(needle), `${label}\nMissing: ${needle}`);
}

// Source checks
mustContain(src, 'class="hist-title" data-tip="${esc(h.title)}"',
  'SOURCE: Recent run title must include data-tip with full text');
mustContain(src, '.hist-title::after{',
  'SOURCE: CSS tooltip pseudo-element is required');
mustContain(src, '.hist-title:hover::after{display:block}',
  'SOURCE: Tooltip must show immediately on hover');

// Compiled checks
assert.ok(out.length > 0,
  'COMPILED: out/features/home-page.js not found. Run npm run compile or npm run rebuild.');
mustContain(out, 'class="hist-title" data-tip="',
  'COMPILED: data-tip attribute missing in compiled output');
mustContain(out, '.hist-title::after{',
  'COMPILED: tooltip CSS missing in compiled output');
mustContain(out, '.hist-title:hover::after{display:block}',
  'COMPILED: immediate hover display rule missing in compiled output');

console.log('PASS: Home Recent Runs tooltip regression checks passed.');
