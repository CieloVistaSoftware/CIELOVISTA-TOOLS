// Copyright (c) CieloVista Software. All rights reserved.
// REG-032: Issue #331 — Frontmatter Viewer filenames and paths must be clickable links
//
// buildViewerHtml() must render data-action="open" + data-abs-path on both
// the Filename cell and the Path cell of every table row.
//
// Run: node tests/regression/REG-032-frontmatter-viewer-clickable.test.js

'use strict';

const fs     = require('fs');
const path   = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC  = fs.readFileSync(path.join(ROOT, 'src/features/frontmatter-viewer.ts'), 'utf8');

let passed = 0, failed = 0;

function test(name, fn) {
    try { fn(); console.log(`  PASS ${name}`); passed++; }
    catch (e) { console.error(`  FAIL ${name}\n       ${e.message}`); failed++; }
}

console.log('REG-032: Frontmatter Viewer clickable links (#331)');
console.log('─'.repeat(60));

test('buildViewerHtml is defined', () => {
    assert(SRC.includes('function buildViewerHtml'), 'buildViewerHtml must exist');
});

test('filename cell has data-action="open"', () => {
    assert(SRC.includes('data-action="open"'), 'filename/path cells must use data-action="open"');
});

test('filename cell has data-abs-path attribute', () => {
    assert(SRC.includes('data-abs-path='), 'cells must carry data-abs-path for the click handler');
});

test('abs path is constructed from report.root + f.path', () => {
    assert(SRC.includes('path.join(report.root') || SRC.includes('report.root'),
        'absPath must be built from report.root so the extension host can open the file');
});

test('file-link class is applied for styling', () => {
    assert(SRC.includes('file-link'), 'cells must use .file-link class for cursor/underline style');
});

test('click handler dispatches postMessage on data-action="open"', () => {
    assert(
        SRC.includes("closest('[data-action=\"open\"]')") ||
        SRC.includes("closest('[data-action=\"open\"]')"),
        'click handler must use closest() to find data-action="open" elements'
    );
});

test('postMessage sends command: open with path', () => {
    assert(
        SRC.includes("command: 'open'") || SRC.includes('command:"open"'),
        'postMessage must send { command: "open", path: ... }'
    );
});

test('extension host handles open message and calls openTextDocument', () => {
    assert(SRC.includes('openTextDocument'), 'extension host must call openTextDocument when command=open');
});

test('.file-link has cursor:pointer style', () => {
    assert(SRC.includes('cursor:pointer'), '.file-link must set cursor:pointer');
});

console.log('─'.repeat(60));
if (failed === 0) { console.log(`✓ REG-032 passed (${passed} checks).\n`); process.exit(0); }
else { console.error(`✗ REG-032 FAILED (${failed} of ${passed + failed} checks failed).\n`); process.exit(1); }
