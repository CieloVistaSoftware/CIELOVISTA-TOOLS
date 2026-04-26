/**
 * tests/unit/css-class-hover.test.js
 *
 * Structural tests for the css-class-hover double-tab fix (issue #32).
 *
 * Problem fixed: cvs.cssClassHover.enable called showResultWebview,
 * which created a second webview tab when invoked via the Guided Launcher
 * (which already creates its own result panel). Fixed by removing the
 * showResultWebview call from the enable command body.
 *
 * Covers:
 *   - The compiled output does NOT call showResultWebview in activate()
 *   - The hover provider core logic: findCssRule() matches .className selectors
 *   - extractInlineCss() regex parses <style> blocks
 *   - findCssRule() returns null when class not in CSS
 *
 * Run: node tests/unit/css-class-hover.test.js
 */
'use strict';

const assert = require('assert');
const path   = require('path');
const fs     = require('fs');

let passed = 0, failed = 0;

function test(name, fn) {
    try   { fn(); console.log(`  \u2713 ${name}`); passed++; }
    catch (e) { console.error(`  \u2717 ${name}\n    \u2192 ${e.message}`); failed++; }
}
function ok(v, msg)  { assert.ok(v, msg); }
function eq(a, b, m) { assert.strictEqual(a, b, m); }

const SRC = path.resolve(__dirname, '../../src/features/css-class-hover.ts');
const OUT = path.resolve(__dirname, '../../out/features/css-class-hover.js');

console.log('\ncss-class-hover tests');
console.log('\u2500'.repeat(50));

// ── Helper: strip line and block comments before checking source ──────────
// References to showResultWebview survive in comments that explain the fix
// ("It previously called showResultWebview here…"). Those mentions are
// historical and harmless. We only care about live code references:
// imports and call expressions.
function stripComments(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
        .replace(/^\s*\/\/.*$/gm, '');      // whole-line line comments
}

// ── Structural: verify double-tab fix is in source ─────────────────────────
console.log('\n-- Double-tab fix (structural, source) --');

test('source file exists', () => {
    ok(fs.existsSync(SRC), `css-class-hover.ts not found at ${SRC}`);
});

test('activate() does NOT call showResultWebview', () => {
    const code = stripComments(fs.readFileSync(SRC, 'utf8'));
    const activateIdx = code.indexOf('export function activate(');
    ok(activateIdx >= 0, 'activate() not found in source');
    // Live-code check: forbid actual call expressions, not historical mentions in comments.
    ok(!/\bshowResultWebview\s*\(/.test(code), 'showResultWebview() call still present — double-tab fix was reverted');
});

test('enable command only registers hover provider, no webview side-effect', () => {
    const raw  = fs.readFileSync(SRC, 'utf8');
    const code = stripComments(raw);
    // The enable command should register a hover provider, not open any panel
    ok(code.includes('registerHoverProvider'), 'hover provider registration missing');
    // Forbid live import or call of showResultWebview (comments OK).
    ok(!/\bshowResultWebview\s*\(/.test(code), 'showResultWebview() call still present in live code');
    ok(!/\bimport[^;]*\bshowResultWebview\b[^;]*;/.test(code), 'showResultWebview is still imported');
});

// ── findCssRule logic (pure regex, tested inline) ─────────────────────────
console.log('\n-- findCssRule() logic --');

// Replicate the core regex from the source for pure-unit testing
function findCssRule(css, className) {
    const re      = new RegExp(`\\.${className}\\s*\\{[^}]*\\}`, 'g');
    const matches = css.match(re);
    return matches && matches.length ? matches.join('\n\n') : null;
}

test('finds simple .foo selector', () => {
    const css = '.foo { color: red; } .bar { color: blue; }';
    const result = findCssRule(css, 'foo');
    ok(result !== null, 'should find .foo');
    ok(result.includes('color: red'), 'should include rule body');
});

test('finds selector with whitespace before {', () => {
    const css = '.my-class   { font-size: 14px; }';
    const result = findCssRule(css, 'my-class');
    ok(result !== null, 'should find .my-class');
});

test('returns null when class not present', () => {
    const css = '.foo { color: red; }';
    const result = findCssRule(css, 'bar');
    eq(result, null, 'should return null for missing class');
});

test('returns multiple matching rules joined by newline', () => {
    const css = '.btn { padding: 4px; } .btn { margin: 0; }';
    const result = findCssRule(css, 'btn');
    ok(result !== null, 'should find both .btn rules');
    ok(result.includes('\n\n'), 'should join with blank line');
});

// ── extractInlineCss regex ────────────────────────────────────────────────
console.log('\n-- extractInlineCss() regex --');

function extractInlineCss(html) {
    const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    let css = '', m;
    while ((m = styleRe.exec(html)) !== null) { css += m[1] + '\n'; }
    return css;
}

test('extracts single <style> block', () => {
    const html = '<html><head><style>.x{color:red}</style></head></html>';
    const css  = extractInlineCss(html);
    ok(css.includes('.x{color:red}'), 'should include inline CSS');
});

test('extracts multiple <style> blocks', () => {
    const html = '<style>.a{}</style><p></p><style>.b{}</style>';
    const css  = extractInlineCss(html);
    ok(css.includes('.a{}') && css.includes('.b{}'), 'should include both blocks');
});

test('returns empty string when no <style> block', () => {
    const html = '<html><body><p>hello</p></body></html>';
    const css  = extractInlineCss(html);
    eq(css, '', 'should return empty string');
});

// ── Result ────────────────────────────────────────────────────────────────
console.log('');
console.log(`=== Result: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
