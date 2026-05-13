// Copyright (c) CieloVista Software. All rights reserved.
// REG-031: Issue #330 — Doc Catalog dewey badges must be clickable
//
// .cat-dewey badges must have data-action="show-cat-list"
// .card-dewey badges must have data-action="jump-to-cat"
//
// Run: node tests/regression/REG-031-catalog-dewey-badges-clickable.test.js

'use strict';

const fs     = require('fs');
const path   = require('path');
const assert = require('assert');

const ROOT     = path.resolve(__dirname, '..', '..');
const HTML_SRC = fs.readFileSync(path.join(ROOT, 'src/features/doc-catalog/html.ts'), 'utf8');
const CAT_SRC  = fs.readFileSync(path.join(ROOT, 'src/features/doc-catalog/catalog.html'), 'utf8');

let passed = 0, failed = 0;

function test(name, fn) {
    try { fn(); console.log(`  PASS ${name}`); passed++; }
    catch (e) { console.error(`  FAIL ${name}\n       ${e.message}`); failed++; }
}

console.log('REG-031: Doc Catalog dewey badges are clickable (#330)');
console.log('─'.repeat(60));

test('cat-dewey span has data-action="show-cat-list"', () => {
    assert(HTML_SRC.includes('data-action="show-cat-list"'),
        'cat-dewey must have data-action="show-cat-list" for category list popover');
});

test('cat-dewey span has data-dewey-prefix attribute', () => {
    assert(HTML_SRC.includes('data-dewey-prefix='),
        'cat-dewey must carry data-dewey-prefix for the click handler');
});

test('card-dewey span has data-action="jump-to-cat"', () => {
    assert(HTML_SRC.includes('data-action="jump-to-cat"'),
        'card-dewey must have data-action="jump-to-cat" to scroll to category heading');
});

test('card-dewey span has data-cat-label attribute', () => {
    assert(HTML_SRC.includes('data-cat-label='),
        'card-dewey must carry data-cat-label so the handler knows which section to jump to');
});

test('catalog.html handles show-cat-list action', () => {
    assert(CAT_SRC.includes("'show-cat-list'") || CAT_SRC.includes('"show-cat-list"'),
        "catalog.html click handler must dispatch 'show-cat-list'");
});

test('catalog.html handles jump-to-cat action', () => {
    assert(CAT_SRC.includes("'jump-to-cat'") || CAT_SRC.includes('"jump-to-cat"'),
        "catalog.html click handler must dispatch 'jump-to-cat'");
});

test('jump-to-cat handler calls scrollIntoView', () => {
    const idx = CAT_SRC.indexOf('jump-to-cat');
    assert(idx !== -1, 'jump-to-cat handler not found');
    const region = CAT_SRC.slice(idx, idx + 300);
    assert(region.includes('scrollIntoView'), 'jump-to-cat must call scrollIntoView');
});

test('show-cat-list handler builds a popover', () => {
    const idx = CAT_SRC.indexOf('show-cat-list');
    assert(idx !== -1, 'show-cat-list handler not found');
    const region = CAT_SRC.slice(idx, idx + 600);
    assert(region.includes('popover') || region.includes('pop'),
        'show-cat-list must create a popover element');
});

test('popover dismissed on outside click', () => {
    assert(CAT_SRC.includes('_dewey-popover'),
        'Popover must use _dewey-popover id so dismiss handler can find it');
    assert(CAT_SRC.includes("style.display = 'none'") || CAT_SRC.includes('display=\'none\'') || CAT_SRC.includes('display = \'none\''),
        'Popover must be hidden on dismiss');
});

console.log('─'.repeat(60));
if (failed === 0) { console.log(`✓ REG-031 passed (${passed} checks).\n`); process.exit(0); }
else { console.error(`✗ REG-031 FAILED (${failed} of ${passed + failed} checks failed).\n`); process.exit(1); }
