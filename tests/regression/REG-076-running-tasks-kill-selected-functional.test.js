'use strict';
/**
 * REG-076 — Kill Selected: functional DOM test
 *
 * Executes the webview JS inside jsdom to verify the actual runtime behavior,
 * not just source patterns.  Previous REG-075 only did text matching — it never
 * ran anything and would not have caught the real bug.
 *
 * Root cause of the "Kill Selected doesn't work" bug:
 *   dispatchEvent(new Event('change'))  ← bubbles: false (default)
 *   The change handler is on #tbody via event delegation.
 *   A non-bubbling event never reaches #tbody, so updateKillBtn() is never
 *   called when a row is clicked, and the kill button stays disabled forever.
 *
 * Fix: new Event('change', { bubbles: true })
 *
 * Checks (all executed against real DOM + real JS):
 *  1. Kill button starts disabled
 *  2. Directly clicking a checkbox enables the kill button
 *  3. Clicking a ROW (not the checkbox itself) also enables the kill button
 *  4. Un-checking all checkboxes disables the kill button again
 *  5. Kill button click sends kill-confirm message (not the old 'kill' command)
 *  6. kill-confirm carries the correct PIDs
 *  7. kill-cancelled message restores _paused / status bar
 */

const { JSDOM } = require('jsdom');
const fs   = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function check(desc, cond) {
    if (cond) { console.log(`  ✓ ${desc}`); passed++; }
    else       { console.error(`  ✗ ${desc}`); failed++; }
}

// ── Extract the webview JS from the source ────────────────────────────────────

const SRC = fs.readFileSync(
    path.join(__dirname, '../../src/features/running-tasks.ts'), 'utf8'
);

// Pull the JS string literal (between `const JS = \`` and the matching close)
const jsStart = SRC.indexOf('const JS = `\n(function(){');
const jsEnd   = SRC.indexOf('\n`;\n', jsStart);
if (jsStart < 0 || jsEnd < 0) {
    console.error('FATAL: Could not locate the JS template literal in running-tasks.ts');
    process.exit(1);
}
let jsCode = SRC.slice(jsStart + 'const JS = `'.length, jsEnd);

// The template literal uses ${...} for server-side interpolation; those have
// already run when buildHtml() would execute them.  For our test we just stub
// them out with empty strings since we supply our own HTML.
jsCode = jsCode.replace(/\$\{[^}]+\}/g, '');

// ── Build minimal HTML matching what buildHtml() produces ────────────────────

function makeHtml(rows) {
    return `<!DOCTYPE html><html><body>
<input id="filter-input" value="">
<select id="safety-select"><option value="all">All</option></select>
<div id="status-bar"></div>
<button id="btn-kill" disabled>Kill Selected</button>
<button id="btn-refresh">Refresh</button>
<input type="checkbox" id="check-all">
<table>
  <thead><tr>
    <th></th><th data-col="pid">PID</th><th data-col="name">NAME</th>
    <th data-col="mem">MEM</th><th data-col="threads">THR</th>
    <th data-col="company">CO</th><th data-col="desc">DESC</th>
    <th data-col="wintitle">WIN</th><th data-col="path">PATH</th>
  </tr></thead>
  <tbody id="tbody">${rows}</tbody>
</table>
<script>
// acquireVsCodeApi stub — captures all postMessage calls
var _postedMessages = [];
var _vsState = {};
window.acquireVsCodeApi = function() {
    return {
        postMessage: function(msg) { _postedMessages.push(msg); },
        getState:    function()    { return _vsState; },
        setState:    function(s)   { _vsState = Object.assign(_vsState, s); }
    };
};
</script>
</body></html>`;
}

function makeRow(pid, safety) {
    return `<tr data-pid="${pid}" data-safety="${safety}" data-mem="100" data-threads="4">
  <td class="col-check"><input type="checkbox" class="row-check" data-pid="${pid}"></td>
  <td class="col-dot"></td>
  <td class="col-pid">${pid}</td>
  <td class="col-name">proc${pid}</td>
  <td class="col-wintitle"></td>
  <td class="col-mem">100 MB</td>
  <td class="col-threads">4</td>
  <td class="col-company">Test Co</td>
  <td class="col-desc">Test Proc</td>
  <td class="col-path">C:\\test\\proc${pid}.exe</td>
</tr>`;
}

// ── Set up jsdom with the webview JS ──────────────────────────────────────────

function makeDOM(rowHtml) {
    const html = makeHtml(rowHtml);
    const dom = new JSDOM(html, {
        runScripts: 'dangerously',
        resources:  'usable',
        pretendToBeVisual: true,
    });
    const { window } = dom;
    // Run the webview IIFE
    try { window.eval(jsCode); } catch (e) {
        console.error('  ERROR running webview JS:', e.message);
    }
    return { window, document: window.document };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('REG-076: Running Tasks — Kill Selected functional tests');
console.log('');

// Test 1: kill button starts disabled
{
    const { document } = makeDOM(makeRow(1234, 'safe') + makeRow(5678, 'safe'));
    check('Kill button starts disabled', document.getElementById('btn-kill').disabled === true);
}

// Test 2: directly clicking a checkbox enables the kill button
{
    const { window, document } = makeDOM(makeRow(1234, 'safe'));
    const cb = document.querySelector('.row-check');
    cb.checked = true;
    cb.dispatchEvent(new window.Event('change', { bubbles: true }));
    check('Direct checkbox click enables kill button', document.getElementById('btn-kill').disabled === false);
}

// Test 3: clicking a ROW (not the checkbox) also enables the kill button
// This was the bug — dispatchEvent(new Event('change')) without bubbles:true
{
    const { window, document } = makeDOM(makeRow(1234, 'safe'));
    const tr = document.querySelector('#tbody tr');   // tbody row, not thead
    const td = tr.querySelectorAll('td')[2];          // col-pid cell (not a checkbox)
    if (td) {
        td.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    }
    check('Row click enables kill button (bubbles fix)', document.getElementById('btn-kill').disabled === false);
}

// Test 4: un-checking restores disabled state
{
    const { window, document } = makeDOM(makeRow(1234, 'safe'));
    const cb = document.querySelector('.row-check');
    // Check it
    cb.checked = true;
    cb.dispatchEvent(new window.Event('change', { bubbles: true }));
    // Uncheck it
    cb.checked = false;
    cb.dispatchEvent(new window.Event('change', { bubbles: true }));
    check('Un-checking all checkboxes disables kill button', document.getElementById('btn-kill').disabled === true);
}

// Test 5 & 6: kill button click posts kill-confirm with correct PIDs
{
    const { window, document } = makeDOM(makeRow(1234, 'safe') + makeRow(5678, 'safe'));
    // Check both rows via direct checkbox click
    document.querySelectorAll('.row-check').forEach(function(cb) {
        cb.checked = true;
        cb.dispatchEvent(new window.Event('change', { bubbles: true }));
    });
    // Click kill button
    document.getElementById('btn-kill').dispatchEvent(
        new window.MouseEvent('click', { bubbles: true, cancelable: true })
    );
    const msgs = window._postedMessages;
    const killMsg = msgs.find(function(m) { return m.command === 'kill-confirm'; });
    check("Kill button click posts 'kill-confirm' (not bare 'kill')", !!killMsg);
    check('kill-confirm carries correct PIDs [1234, 5678]',
        killMsg && killMsg.pids && killMsg.pids.length === 2 &&
        killMsg.pids.includes(1234) && killMsg.pids.includes(5678)
    );
}

// Test 7: kill-cancelled message restores status bar
{
    const { window, document } = makeDOM(makeRow(1234, 'safe'));
    const cb = document.querySelector('.row-check');
    cb.checked = true;
    cb.dispatchEvent(new window.Event('change', { bubbles: true }));
    document.getElementById('btn-kill').dispatchEvent(
        new window.MouseEvent('click', { bubbles: true, cancelable: true })
    );
    // Simulate extension sending kill-cancelled back
    window.dispatchEvent(new window.MessageEvent('message', {
        data: { command: 'kill-cancelled' }
    }));
    const statusBar = document.getElementById('status-bar');
    check("kill-cancelled updates status bar", statusBar.textContent.includes('cancelled'));
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('');
if (failed > 0) {
    console.error(`REG-076 FAILED: ${failed} check(s) failed`);
    process.exit(1);
} else {
    console.log(`REG-076 passed (${passed} checks)`);
}
