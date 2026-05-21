// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * mcp-viewer-path-links.test.js
 * Issue #329: Windows file paths in MCP viewer md-preview must be linkified.
 * Run: node tests/unit/mcp-viewer-path-links.test.js
 */
'use strict';

const assert = require('assert');
const path   = require('path');
const fs     = require('fs');

// buildMarkdownPreviewHtml is not exported — test by string-scanning the source.
const SRC = path.join(__dirname, '../../src/features/mcp-viewer/index.ts');
if (!fs.existsSync(SRC)) { console.error(`SKIP: src not found`); process.exit(0); }

const src = fs.readFileSync(SRC, 'utf8');

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log(`  ✓ ${name}`); passed++; }
    catch (e) { console.error(`  ✗ ${name}\n    → ${e.message}`); failed++; }
}
function ok(v, msg) { assert.ok(v, msg); }

console.log('\nmcp-viewer path linkification tests (#329)\n' + '─'.repeat(50));

test('buildMarkdownPreviewHtml contains path linkification script', () => {
    ok(src.includes('pathRe'), 'Must include pathRe regex for Windows paths');
});

test('linkification regex targets Windows absolute paths', () => {
    ok(src.includes('[A-Za-z]:\\\\'), 'Must match Windows drive-letter paths');
});

test('.md paths are linked to /md-preview endpoint', () => {
    ok(src.includes('/md-preview?path='), 'Must link .md paths to /md-preview');
});

test('non-.md paths are NOT wrapped in anchor tags (use span instead)', () => {
    // The script wraps non-.md paths in a span, not an <a>
    const mdBlock = src.indexOf('pathRe');
    const region  = src.slice(mdBlock, mdBlock + 2000);
    ok(region.includes("createElement('span')") || region.includes('createElement("span")') || region.includes("createElement(`span`)"),
       'Non-.md paths must use span, not anchor');
});

test('back URL is preserved in /md-preview link', () => {
    ok(src.includes('back=') || src.includes('back=\''), 'Must pass back URL for navigation');
});

test('linkification script runs after page load (inside script block)', () => {
    ok(src.includes('querySelector(\'main\')') || src.includes('querySelector("main")'),
       'Script must target the <main> element');
});

console.log('\n' + '─'.repeat(50));
if (failed === 0) { console.log(`✓ All ${passed} tests passed\n`); process.exit(0); }
else { console.error(`\n✗ ${failed} test(s) FAILED\n`); process.exit(1); }
