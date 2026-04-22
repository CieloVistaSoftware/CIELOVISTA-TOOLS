/**
 * launcher-script.test.js
 *
 * Validates the webview JS embedded in cvs-command-launcher/html.ts.
 * Reads the TypeScript source directly — no compilation needed.
 *
 * What it checks:
 *  1.  No stale _activeTag (single variable) — replaced by _activeTags Set
 *  2.  _activeTags declared as new Set()
 *  3.  No getElementById('chips') — element removed
 *  4.  No querySelectorAll('.chip') — removed
 *  5.  selectAllTopics function defined
 *  6.  clearTopics function defined
 *  7.  applyFilters uses _activeTags.size
 *  8.  Run button posts { command: 'run', id } via vscode.postMessage
 *  9.  IIFE wrapper present
 * 10.  'use strict' inside the script
 * 11.  updateBadge function defined
 * 12.  dd-select-all button wired up
 * 13.  dd-clear button wired up
 * 14.  acquireVsCodeApi() called
 * 15.  Group bar handler does not reference old _activeTag (singular)
 *
 * Run: node tests/launcher-script.test.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// The launcher was split — the webview script lives in html.ts, not the monolith stub
const HTML_TS = path.join(__dirname, '..', 'src', 'features', 'cvs-command-launcher', 'html.ts');

if (!fs.existsSync(HTML_TS)) {
    console.error('FAIL: html.ts not found at', HTML_TS);
    process.exit(1);
}

const src = fs.readFileSync(HTML_TS, 'utf8');

// Extract the JS template literal (the `const JS = \`...\`` block)
const jsStart = src.indexOf('const JS = `');
if (jsStart === -1) {
    console.error('FAIL: Could not find "const JS = `" block in html.ts');
    process.exit(1);
}
// Find the closing backtick — it ends with "})\n();\n`" based on source inspection
const jsEnd = src.indexOf('\n`;\n', jsStart);
if (jsEnd === -1) {
    console.error('FAIL: Could not find closing backtick of JS template literal');
    process.exit(1);
}
const scriptBlock = src.slice(jsStart, jsEnd);

// ── Runner ────────────────────────────────────────────────────────────────────

let passed = 0, failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log('  PASS:', name);
        passed++;
    } catch (e) {
        console.error('  FAIL:', name, '-', e.message);
        failed++;
    }
}

function assert(condition, msg) { if (!condition) { throw new Error(msg); } }
function assertContains(src, needle, msg) { assert(src.includes(needle), msg || `Must contain: ${needle}`); }
function assertNotContains(src, needle, msg) { assert(!src.includes(needle), msg || `Must NOT contain: ${needle}`); }

console.log('\nRunning CieloVista Launcher Script Tests...\n');

// 1. No stale _activeTag (non-Set singular variable)
test('No _activeTag variable (replaced by _activeTags Set)', () => {
    // _activeTags is fine — reject _activeTag NOT followed by 's'
    const matches = [...scriptBlock.matchAll(/_activeTag(?!s)/g)];
    assert(matches.length === 0, `Found ${matches.length} reference(s) to singular _activeTag — should be _activeTags`);
});

// 2. _activeTags Set declared
test('_activeTags declared as new Set()', () => {
    assertContains(scriptBlock, '_activeTags = new Set()');
});

// 3. No getElementById('chips')
test('No getElementById("chips") — element was removed', () => {
    assertNotContains(scriptBlock, "getElementById('chips')");
    assertNotContains(scriptBlock, 'getElementById("chips")');
});

// 4. No querySelectorAll('.chip')
test('No querySelectorAll(".chip") — chip elements were removed', () => {
    assertNotContains(scriptBlock, "querySelectorAll('.chip')");
    assertNotContains(scriptBlock, 'querySelectorAll(".chip")');
});

// 5. selectAllTopics function
test('selectAllTopics function defined', () => {
    assertContains(scriptBlock, 'function selectAllTopics()');
});

// 6. clearTopics function
test('clearTopics function defined', () => {
    assertContains(scriptBlock, 'function clearTopics()');
});

// 7. applyFilters uses _activeTags.size
test('applyFilters uses _activeTags.size for topic matching', () => {
    assertContains(scriptBlock, '_activeTags.size');
});

// 8. Run button posts message with command:run
test('Run button calls vscode.postMessage with command:run', () => {
    assertContains(scriptBlock, "command: 'run'");
    assertContains(scriptBlock, 'postMessage');
});

// 9. IIFE wrapper
test('Script wrapped in IIFE to prevent global scope pollution', () => {
    assertContains(scriptBlock, '(function(){');
});

// 10. use strict
test("Script uses 'use strict'", () => {
    assertContains(scriptBlock, "'use strict';");
});

// 11. updateBadge function
test('updateBadge function defined', () => {
    assertContains(scriptBlock, 'function updateBadge()');
});

// 12. dd-select-all wired up
test('dd-select-all button has event listener', () => {
    assertContains(scriptBlock, "getElementById('dd-select-all')");
});

// 13. dd-clear wired up
test('dd-clear button has event listener', () => {
    assertContains(scriptBlock, "getElementById('dd-clear')");
});

// 14. acquireVsCodeApi called
test('acquireVsCodeApi() called to get VS Code messaging bridge', () => {
    assertContains(scriptBlock, 'acquireVsCodeApi()');
});

// 15. Group bar handler does not reference singular _activeTag
test('Group bar handler does not reference stale singular _activeTag', () => {
    const groupBarIdx = scriptBlock.indexOf("getElementById('group-bar')");
    if (groupBarIdx !== -1) {
        const groupBlock = scriptBlock.slice(groupBarIdx, groupBarIdx + 500);
        const matches = [...groupBlock.matchAll(/_activeTag(?!s)/g)];
        assert(matches.length === 0, `group-bar handler still references singular _activeTag`);
    }
    // If group-bar not found, check is moot — pass
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
    console.error('TESTS FAILED — launcher script has regressions');
    process.exit(1);
} else {
    console.log('ALL TESTS PASSED — launcher script is clean');
    process.exit(0);
}
