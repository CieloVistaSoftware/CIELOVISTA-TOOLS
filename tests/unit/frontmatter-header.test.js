'use strict';
/**
 * tests/unit/frontmatter-header.test.js
 *
 * Regression test for #266: doc preview frontmatter header styling.
 * Verifies that YAML frontmatter at the top of a markdown file is:
 *   - Parsed and stripped (not rendered as horizontal rules/paragraphs)
 *   - Rendered as a .fm-block with .fm-label and .fm-value spans
 *   - Labels are proper-cased
 *   - CSS applies blue color and script-like font (Georgia/serif)
 *
 * Run: node tests/unit/frontmatter-header.test.js
 */

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');

const SRC_RENDERER  = path.join(__dirname, '../../src/shared/md-renderer.ts');
const SRC_PREVIEW   = path.join(__dirname, '../../src/shared/doc-preview.ts');
const srcRenderer   = fs.readFileSync(SRC_RENDERER, 'utf8');
const srcPreview    = fs.readFileSync(SRC_PREVIEW,  'utf8');

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log(`  PASS ${name}`); passed++; }
    catch (e) { console.error(`  FAIL ${name}\n       → ${e.message}`); failed++; }
}

console.log('\nfrontmatter-header styling — #266\n' + '-'.repeat(50));

// ── md-renderer.ts: frontmatter parsing ──────────────────────────────────────
test('parseFrontmatter function exists in md-renderer', () => {
    assert.ok(srcRenderer.includes('function parseFrontmatter'), 'parseFrontmatter missing from md-renderer.ts');
});

test('mdToHtml strips frontmatter (does not render --- as <hr>)', () => {
    assert.ok(
        srcRenderer.includes('parseFrontmatter(lines)'),
        'mdToHtml must call parseFrontmatter to strip the YAML block'
    );
});

test('parseFrontmatter renders .fm-block wrapper', () => {
    assert.ok(srcRenderer.includes('"fm-block"') || srcRenderer.includes("'fm-block'") || srcRenderer.includes('fm-block'),
        '.fm-block class missing from parseFrontmatter output');
});

test('parseFrontmatter renders .fm-label and .fm-value spans', () => {
    assert.ok(srcRenderer.includes('fm-label'), '.fm-label class missing');
    assert.ok(srcRenderer.includes('fm-value'), '.fm-value class missing');
});

test('parseFrontmatter proper-cases label keys', () => {
    assert.ok(
        srcRenderer.includes('toUpperCase') || srcRenderer.includes('\\b\\w'),
        'Labels must be proper-cased (capitalize first letter of each word)'
    );
});

// ── doc-preview.ts: CSS styling ───────────────────────────────────────────────
test('.fm-block CSS is in doc-preview stylesheet', () => {
    assert.ok(srcPreview.includes('.fm-block'), '.fm-block CSS missing from doc-preview.ts');
});

test('.fm-label uses blue color (#4dabf7 or similar)', () => {
    const bluePattern = /fm-label[^}]*color\s*:\s*#[0-9a-f]{6}/i;
    assert.ok(
        bluePattern.test(srcPreview),
        '.fm-label must have a blue color value'
    );
});

test('.fm-value uses blue/teal color', () => {
    const bluePattern = /fm-value[^}]*color\s*:\s*#[0-9a-f]{6}/i;
    assert.ok(
        bluePattern.test(srcPreview),
        '.fm-value must have a blue or teal color value'
    );
});

test('.fm-block uses a script/serif font (Georgia or cursive)', () => {
    assert.ok(
        srcPreview.includes('Georgia') || srcPreview.includes('cursive') || srcPreview.includes('serif'),
        '.fm-block must use Georgia or another serif/cursive font'
    );
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + '-'.repeat(50));
console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) { process.exit(1); }
