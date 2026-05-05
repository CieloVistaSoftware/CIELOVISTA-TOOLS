// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
'use strict';
/**
 * tests/view-doc-toolbar.test.js
 *
 * Regression tests for issue #261 — View-a-Doc toolbar buttons non-functional.
 *
 * Buttons added to viewer-bar (shown when a doc is open):
 *   📂 VS Code   — fetch /open-in-vscode?path=<file>  → opens folder in new window
 *   📄 Set CWD   — fetch /set-cwd?path=<file>         → sends cd to active terminal
 *   🔍 Explorer  — fetch /reveal?path=<file>          → reveals file in VS Code Explorer
 *   📋 Copy Path — navigator.clipboard.writeText(path) (unchanged)
 *
 * Run: node tests/view-doc-toolbar.test.js
 */

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const { JSDOM } = require('jsdom');

const SOURCE = path.join(__dirname, '..', 'src', 'features', 'doc-catalog', 'commands.ts');
const src    = fs.readFileSync(SOURCE, 'utf8').replace(/\r\n/g, '\n');

let passed = 0, failed = 0;
const results = [];
function test(name, fn) {
    try { fn(); passed++; results.push({ ok: true, name }); }
    catch(e) { failed++; results.push({ ok: false, name, err: e.message }); }
}

// ─── Static source checks ────────────────────────────────────────────────────

test('SOURCE: btn-open-vscode button in viewer-bar HTML', () => {
    assert.ok(src.includes('btn-open-vscode'), 'btn-open-vscode missing from HTML');
});
test('SOURCE: btn-set-cwd button in viewer-bar HTML', () => {
    assert.ok(src.includes('btn-set-cwd'), 'btn-set-cwd missing from HTML');
});
test('SOURCE: btn-explorer button in viewer-bar HTML', () => {
    assert.ok(src.includes('btn-explorer'), 'btn-explorer missing from HTML');
});

test('SOURCE: /open-in-vscode HTTP route exists', () => {
    assert.ok(src.includes("pathname === '/open-in-vscode'"), '/open-in-vscode route missing');
});
test('SOURCE: /set-cwd HTTP route exists', () => {
    assert.ok(src.includes("pathname === '/set-cwd'"), '/set-cwd route missing');
});
test('SOURCE: /reveal HTTP route exists', () => {
    assert.ok(src.includes("pathname === '/reveal'"), '/reveal route missing');
});

test('SOURCE: /open-in-vscode calls openProjectFolderSmart with dirname', () => {
    const idx = src.indexOf("pathname === '/open-in-vscode'");
    assert.ok(idx !== -1);
    const slice = src.slice(idx, idx + 300);
    assert.ok(slice.includes('openProjectFolderSmart'), '/open-in-vscode must call openProjectFolderSmart');
    assert.ok(slice.includes('path.dirname'), 'must use path.dirname to get the folder');
});
test('SOURCE: /set-cwd sends cd to terminal', () => {
    const idx = src.indexOf("pathname === '/set-cwd'");
    assert.ok(idx !== -1);
    const slice = src.slice(idx, idx + 700);
    assert.ok(slice.includes('sendText'), '/set-cwd must call terminal.sendText');
    assert.ok(slice.includes('cd "'), 'must send cd command');
});
test('SOURCE: /reveal calls revealInExplorer', () => {
    const idx = src.indexOf("pathname === '/reveal'");
    assert.ok(idx !== -1);
    const slice = src.slice(idx, idx + 600);
    assert.ok(slice.includes('revealInExplorer'), '/reveal must call revealInExplorer');
});

test('SOURCE: browser JS fetches /open-in-vscode on button click', () => {
    assert.ok(src.includes("BASE + '/open-in-vscode?path='"), 'browser fetch for /open-in-vscode missing');
});
test('SOURCE: browser JS fetches /set-cwd on button click', () => {
    assert.ok(src.includes("BASE + '/set-cwd?path='"), 'browser fetch for /set-cwd missing');
});
test('SOURCE: browser JS fetches /reveal on button click', () => {
    assert.ok(src.includes("BASE + '/reveal?path='"), 'browser fetch for /reveal missing');
});

test('SOURCE: buttons shown when a doc is opened (openDoc function)', () => {
    const fnIdx = src.indexOf('function openDoc(');
    assert.ok(fnIdx !== -1, 'openDoc not found');
    const slice = src.slice(fnIdx, fnIdx + 600);
    assert.ok(slice.includes('btnVSCode.style.display'), 'openDoc must show btnVSCode');
    assert.ok(slice.includes('btnCwd.style.display'), 'openDoc must show btnCwd');
    assert.ok(slice.includes('btnExplorer.style.display'), 'openDoc must show btnExplorer');
});

// ─── DOM behavioral test ─────────────────────────────────────────────────────

function extractBrowserScript(src) {
    const fnStart = src.indexOf('function buildViewDocBrowserHtml(');
    if (fnStart === -1) { return null; }
    const scope  = src.slice(fnStart);
    const sStart = scope.indexOf('<script>');
    const sEnd   = scope.indexOf('</script>');
    if (sStart === -1 || sEnd === -1) { return null; }
    return scope.slice(sStart + '<script>'.length, sEnd)
        .replace(/\$\{port\}/g, '9999')
        .replace(/\$\{totalDocs\}/g, '2');
}

const script = extractBrowserScript(src);

function makeDom() {
    assert.ok(script, 'Could not extract browser script');
    const html = `<!DOCTYPE html><html><head></head><body>
<div id="topbar">
  <input id="search" type="text" autocomplete="off">
  <select id="proj-filter"><option value="">All</option></select>
  <span id="stat">2 docs</span>
</div>
<div id="split">
  <div id="index">
    <div class="proj-group" data-proj="global">
      <div class="proj-hd"><span class="dw">000</span><span class="fn">global</span></div>
      <div class="proj-links">
        <a class="doc-link" href="#" data-path="C:\\s\\README.md">ReadMe</a>
        <a class="doc-link" href="#" data-path="C:\\s\\NOTES.md">Notes</a>
      </div>
    </div>
    <div id="idx-empty">No matches</div>
  </div>
  <div id="resize-handle"></div>
  <div id="viewer">
    <div id="viewer-bar">
      <span id="viewer-path">Select a doc</span>
      <button id="btn-open-vscode" style="display:none">VS Code</button>
      <button id="btn-set-cwd"     style="display:none">Set CWD</button>
      <button id="btn-explorer"    style="display:none">Explorer</button>
      <button id="btn-copy-path"   style="display:none">Copy Path</button>
    </div>
    <div id="welcome">Welcome</div>
    <iframe id="doc-frame" style="display:none"></iframe>
  </div>
</div>
<div id="toast"></div>
<script>${script}</script>
</body></html>`;
    const fetchCalls = [];
    const dom = new JSDOM(html, {
        runScripts: 'dangerously',
        pretendToBeVisual: true,
        beforeParse(win) {
            win.fetch = (url) => { fetchCalls.push(url); return Promise.resolve({ ok: true }); };
            try { Object.defineProperty(win, 'localStorage', { value: { getItem: () => null, setItem: () => {} }, configurable: true }); } catch(e) {}
        },
    });
    return { dom, doc: dom.window.document, win: dom.window, fetchCalls };
}

test('DOM: toolbar buttons hidden before any doc opened', () => {
    const { doc } = makeDom();
    assert.strictEqual(doc.getElementById('btn-open-vscode').style.display, 'none', 'btn-open-vscode must start hidden');
    assert.strictEqual(doc.getElementById('btn-set-cwd').style.display, 'none', 'btn-set-cwd must start hidden');
    assert.strictEqual(doc.getElementById('btn-explorer').style.display, 'none', 'btn-explorer must start hidden');
});

test('DOM: toolbar buttons visible after clicking a doc link', () => {
    const { doc, win } = makeDom();
    const link = doc.querySelector('.doc-link');
    link.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    assert.notStrictEqual(doc.getElementById('btn-open-vscode').style.display, 'none', 'btn-open-vscode must show after click');
    assert.notStrictEqual(doc.getElementById('btn-set-cwd').style.display, 'none', 'btn-set-cwd must show after click');
    assert.notStrictEqual(doc.getElementById('btn-explorer').style.display, 'none', 'btn-explorer must show after click');
    assert.notStrictEqual(doc.getElementById('btn-copy-path').style.display, 'none', 'btn-copy-path must show after click');
});

test('DOM: clicking VS Code button fetches /open-in-vscode', () => {
    const { doc, win, fetchCalls } = makeDom();
    const link = doc.querySelector('.doc-link');
    link.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    fetchCalls.length = 0;
    doc.getElementById('btn-open-vscode').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    assert.ok(fetchCalls.length >= 1, 'fetch not called on VS Code button click');
    assert.ok(fetchCalls[0].includes('/open-in-vscode'), `expected /open-in-vscode in fetch URL, got: ${fetchCalls[0]}`);
    assert.ok(fetchCalls[0].includes('README'), 'path must be encoded in the fetch URL');
});

test('DOM: clicking Set CWD button fetches /set-cwd', () => {
    const { doc, win, fetchCalls } = makeDom();
    const link = doc.querySelector('.doc-link');
    link.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    fetchCalls.length = 0;
    doc.getElementById('btn-set-cwd').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    assert.ok(fetchCalls.length >= 1, 'fetch not called on Set CWD button click');
    assert.ok(fetchCalls[0].includes('/set-cwd'), `expected /set-cwd in fetch URL, got: ${fetchCalls[0]}`);
});

test('DOM: clicking Explorer button fetches /reveal', () => {
    const { doc, win, fetchCalls } = makeDom();
    const link = doc.querySelector('.doc-link');
    link.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    fetchCalls.length = 0;
    doc.getElementById('btn-explorer').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    assert.ok(fetchCalls.length >= 1, 'fetch not called on Explorer button click');
    assert.ok(fetchCalls[0].includes('/reveal'), `expected /reveal in fetch URL, got: ${fetchCalls[0]}`);
});

// ─── Output ──────────────────────────────────────────────────────────────────

console.log('\n' + '='.repeat(60));
console.log('View-a-Doc Toolbar Buttons Tests (issue #261)');
console.log('='.repeat(60));
for (const r of results) {
    const icon = r.ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
    console.log(`  ${icon}  ${r.name}`);
    if (!r.ok) console.log(`         \x1b[31m→ ${r.err}\x1b[0m`);
}
console.log('='.repeat(60));
const failStr = failed > 0 ? `\x1b[31m${failed} failed\x1b[0m` : '0 failed';
console.log(`${passed + failed} tests: \x1b[32m${passed} passed\x1b[0m, ${failStr}\n`);
if (failed > 0) { process.exit(1); }
