// Copyright (c) CieloVista Software. All rights reserved.
// REG-031: Issue #309 — Doc Catalog card file-path is a clickable open link.
//
// Proves 3 structural requirements introduced by the fix:
//   1. The card-path <span> uses class "card-path-link"
//   2. The span carries data-action="open" so the webview handler routes it correctly
//   3. The span carries data-path="${filePath}" for the handler to resolve the file

'use strict';

const fs     = require('fs');
const path   = require('path');
const assert = require('assert');

const ROOT      = path.resolve(__dirname, '..', '..');
const HTML_SRC  = fs.readFileSync(path.join(ROOT, 'src/features/doc-catalog/html.ts'), 'utf8');
const CSS_SRC   = fs.readFileSync(path.join(ROOT, 'src/features/doc-catalog/catalog.html'), 'utf8');

let passed = 0, failed = 0;

function test(name, fn) {
    try { fn(); console.log(`  PASS ${name}`); passed++; }
    catch (err) { console.error(`  FAIL ${name}`); console.error(`       ${err.message}`); failed++; }
}

// ─── 1. card-path-link class exists on the span ───────────────────────────────

test('card-path span uses class "card-path-link"', () => {
    assert(
        HTML_SRC.includes('card-path-link'),
        'html.ts does not contain "card-path-link" — the file path is plain text, not a clickable link'
    );
});

// ─── 2. data-action="open" routes to the open-file handler ───────────────────

test('card-path-link has data-action="open"', () => {
    // The span must carry data-action="open" so the existing open handler processes it
    const hasAction = HTML_SRC.includes('card-path-link') &&
        (HTML_SRC.includes('data-action="open"') || HTML_SRC.includes("data-action='open'"));
    assert(hasAction, 'card-path-link does not carry data-action="open" — clicking the path will do nothing');
});

// ─── 3. data-path carries the file path for the handler ──────────────────────

test('card-path-link carries data-path attribute with the file path', () => {
    // Look for data-path on or near the card-path-link span
    const linkIdx = HTML_SRC.indexOf('card-path-link');
    assert(linkIdx !== -1, 'card-path-link not found');
    const surrounding = HTML_SRC.slice(linkIdx, linkIdx + 200);
    assert(
        surrounding.includes('data-path'),
        'card-path-link span does not include a data-path attribute — the handler cannot open the file'
    );
});

// ─── 4. CSS for card-path-link is defined ────────────────────────────────────

test('catalog.html defines .card-path-link CSS rule', () => {
    assert(
        CSS_SRC.includes('card-path-link'),
        'catalog.html does not define .card-path-link CSS — the link will have no styling'
    );
});

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log('REG-031: Doc Catalog card-path-link (#309)');
console.log('─'.repeat(50));
if (failed === 0) {
    console.log(`✓ REG-031 passed (${passed} checks — card file path is a clickable link).`);
    process.exit(0);
} else {
    console.error(`✗ REG-031 FAILED (${failed} of ${passed + failed} checks failed).`);
    process.exit(1);
}
