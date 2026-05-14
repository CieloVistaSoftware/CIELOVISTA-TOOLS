// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
'use strict';
/**
 * tests/unit/md-preview-no-cdn.test.js
 *
 * Regression for #326 — md-preview must not load marked.js from a CDN.
 * The VS Code webview CSP (default-src 'none') and Edge Tracking Prevention
 * both block external script sources. Markdown must be rendered server-side
 * using src/shared/md-renderer.ts before being injected into the webview.
 *
 * Run: node tests/unit/md-preview-no-cdn.test.js
 */

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');

const SRC = path.join(__dirname, '..', '..', 'src', 'features', 'mcp-viewer', 'index.ts');
const src  = fs.readFileSync(SRC, 'utf8');

let passed = 0, failed = 0;
function test(name, fn) {
    try   { fn(); passed++; console.log('  PASS', name); }
    catch (e) { failed++; console.log('  FAIL', name); console.log('       ->', e.message); }
}

console.log('\nmd-preview CDN regression — #326');
console.log('-'.repeat(50));

test('md-preview does not load marked.js from jsdelivr CDN', () => {
    assert.ok(
        !src.includes('cdn.jsdelivr.net'),
        'Found cdn.jsdelivr.net in mcp-viewer/index.ts — remove CDN script tag'
    );
});

test('md-preview does not call marked.parse() (client-side markdown)', () => {
    assert.ok(
        !src.includes('marked.parse'),
        'Found marked.parse() in mcp-viewer/index.ts — use server-side mdToHtml() instead'
    );
});

test('md-preview does not reference the marked library at all', () => {
    assert.ok(
        !/\bmarked\b/.test(src),
        'Found "marked" identifier in mcp-viewer/index.ts — must use bundled md-renderer'
    );
});

test('md-preview imports mdToHtml from shared/md-renderer', () => {
    assert.ok(
        src.includes('mdToHtml') || src.includes('md-renderer'),
        'md-preview must import mdToHtml from ../../shared/md-renderer'
    );
});

test('md-preview page function contains no external <script src> tags', () => {
    // Extract the buildMdPreviewHtml function body (heuristic: everything between /md-preview and the next route handler)
    const mdSection = src.slice(src.indexOf('/md-preview'));
    const externalScript = /<script\s+src=["']https?:\/\//i.test(mdSection.slice(0, 2000));
    assert.ok(!externalScript, 'External <script src="http..."> tag found in md-preview page HTML');
});

console.log('-'.repeat(50));
const failStr = failed > 0 ? `\x1b[31m${failed} failed\x1b[0m` : '0 failed';
console.log(`${passed + failed} tests: \x1b[32m${passed} passed\x1b[0m, ${failStr}\n`);
if (failed > 0) { process.exit(1); }
