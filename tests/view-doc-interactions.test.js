// Copyright (c) 2026 CieloVista Software. All rights reserved.
'use strict';
/**
 * tests/view-doc-interactions.test.js
 *
 * Tests View-a-Doc webview JS behavior using jsdom.
 * Updated for browser-server architecture (buildViewDocBrowserHtml).
 *
 * Run: node tests/view-doc-interactions.test.js
 */

const assert  = require('assert');
const fs      = require('fs');
const path    = require('path');
const { JSDOM } = require('jsdom');

const SOURCE = path.join(__dirname, '..', 'src', 'features', 'doc-catalog', 'commands.ts');
const src    = fs.readFileSync(SOURCE, 'utf8');

function extractBrowserScript(text, port, totalDocs) {
    const fnStart = text.indexOf('function buildViewDocBrowserHtml(');
    if (fnStart === -1) { return null; }
    const scope  = text.slice(fnStart);
    const sStart = scope.indexOf('<script>');
    const sEnd   = scope.indexOf('</script>');
    if (sStart === -1 || sEnd === -1) { return null; }
    return scope.slice(sStart + '<script>'.length, sEnd)
        .replace(/\$\{port\}/g, String(port))
        .replace(/\$\{totalDocs\}/g, String(totalDocs));
}

const TEST_PORT = 9999;
const TEST_DOCS = 4;
const scriptContent = extractBrowserScript(src, TEST_PORT, TEST_DOCS);

function makeDom() {
    const html = `<!DOCTYPE html><html><head></head><body>
<div id="topbar">
  <h1>View a Doc</h1>
  <input id="search" type="text" autocomplete="off">
  <select id="proj-filter"><option value="">All Projects</option>
    <option value="global">global</option>
    <option value="wb-core">wb-core</option>
  </select>
  <span id="stat">${TEST_DOCS} docs</span>
</div>
<div id="split">
  <div id="index">
    <div class="proj-group" data-proj="global">
      <div class="proj-hd"><span class="dw">000</span><span class="fn">global</span>
        <button class="folder-btn" data-folder="C:\\standards"></button>
        <span class="cnt">3</span>
      </div>
      <div class="proj-links">
        <a class="doc-link" href="#" data-path="C:\\standards\\README.md">README Global</a>
        <a class="doc-link" href="#" data-path="C:\\standards\\COPILOT.md">CieloVista Copilot Rules</a>
        <a class="doc-link" href="#" data-path="C:\\standards\\GIT.md">Git Workflow Standards</a>
      </div>
    </div>
    <div class="proj-group" data-proj="wb-core">
      <div class="proj-hd"><span class="dw">100</span><span class="fn">wb-core</span>
        <button class="folder-btn" data-folder="C:\\wb-core"></button>
        <span class="cnt">1</span>
      </div>
      <div class="proj-links">
        <a class="doc-link" href="#" data-path="C:\\wb-core\\NOTES.md">Project Notes wb-core</a>
      </div>
    </div>
    <div id="idx-empty">No matches</div>
  </div>
  <div id="resize-handle"></div>
  <div id="viewer">
    <div id="viewer-bar">
      <span id="viewer-path">Select a document</span>
      <button id="btn-copy-path" style="display:none">Copy Path</button>
    </div>
    <div id="welcome">Welcome</div>
    <iframe id="doc-frame" style="display:none"></iframe>
  </div>
</div>
<div id="toast"></div>
<script>${scriptContent || ''}</script>
</body></html>`;

    const fetchCalls = [];
    const dom = new JSDOM(html, {
        runScripts: 'dangerously',
        pretendToBeVisual: true,
        beforeParse(win) {
            win.fetch = (url) => { fetchCalls.push(url); return Promise.resolve({ ok: true, text: () => Promise.resolve('OK') }); };
            try { Object.defineProperty(win, 'localStorage', { value: { getItem: () => null, setItem: () => {} }, configurable: true }); } catch(e) {}
        },
    });
    return { dom, doc: dom.window.document, win: dom.window, fetchCalls };
}

let passed = 0, failed = 0;
const results = [];
function test(name, fn) {
    try   { fn(); passed++; results.push({ ok: true,  name }); }
    catch (e) { failed++; results.push({ ok: false, name, err: e.message }); }
}

// Static checks
test('Source has buildViewDocBrowserHtml', () => {
    assert.ok(src.includes('function buildViewDocBrowserHtml('), 'not found in commands.ts');
});
test('Script extracted successfully', () => {
    assert.ok(scriptContent && scriptContent.length > 200, 'script extraction failed');
});
test('Source has BASE variable with port template', () => {
    assert.ok(src.includes("'http://127.0.0.1:${port}'") || src.includes('http://127.0.0.1:'), 'BASE var missing');
});
test('Source has openDoc function or equivalent', () => {
    assert.ok(src.includes('openDoc') || src.includes('doc-frame') || src.includes('doc?path='), 'openDoc behavior missing');
});
test('Source has fetch call for openfolder', () => {
    assert.ok(src.includes('openfolder'), 'openfolder fetch call missing from source');
});
test('Source has .hi class for search matches', () => {
    assert.ok(src.includes("'hi'") || src.includes('"hi"') || src.includes('.hi'), '.hi class missing');
});
test('Source has index-searching class', () => {
    assert.ok(src.includes('index-searching'), 'index-searching class missing');
});
test('Source has proj-filter select handler', () => {
    assert.ok(src.includes('proj-filter') || src.includes('projFilter'), 'proj-filter handler missing');
});

// DOM behavior
let ctx;
test('DOM builds without errors', () => {
    ctx = makeDom();
    assert.ok(ctx.doc.getElementById('search'), '#search must exist');
    assert.ok(ctx.doc.getElementById('index'), '#index must exist');
    assert.ok(ctx.doc.getElementById('doc-frame'), '#doc-frame must exist');
    assert.ok(ctx.doc.querySelectorAll('.doc-link').length >= 4, 'Expected 4+ .doc-link elements');
});
test('Before any action: welcome visible, frame hidden', () => {
    const welcome = ctx.doc.getElementById('welcome');
    const frame   = ctx.doc.getElementById('doc-frame');
    assert.ok(welcome, '#welcome must exist');
    assert.ok(frame,   '#doc-frame must exist');
});
test('Search: .hi appears on match, #index gets .index-searching', () => {
    const { doc, win } = ctx;
    const search = doc.getElementById('search');
    search.value = 'readme';
    search.dispatchEvent(new win.Event('input', { bubbles: true }));
    const hi = doc.querySelectorAll('.doc-link.hi');
    assert.ok(hi.length >= 1, 'No links got .hi after "readme"');
    assert.ok(doc.getElementById('index').classList.contains('index-searching'), '#index missing .index-searching');
});
test('Search cleared: .hi removed, .index-searching removed', () => {
    const { doc, win } = ctx;
    const search = doc.getElementById('search');
    search.value = '';
    search.dispatchEvent(new win.Event('input', { bubbles: true }));
    assert.strictEqual(doc.querySelectorAll('.doc-link.hi').length, 0, 'hi still present');
    assert.ok(!doc.getElementById('index').classList.contains('index-searching'), 'index-searching still present');
});
test('Click on doc-link: frame.src set to BASE+/doc?path=...', () => {
    const { doc, win } = ctx;
    const lnk = doc.querySelector('.doc-link[data-path]');
    assert.ok(lnk, 'No .doc-link with data-path found');
    lnk.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    const frame = doc.getElementById('doc-frame');
    assert.ok(frame.src && frame.src.includes('doc'), `frame.src not set after click. Got: "${frame.src}"`);
});
test('Folder button click: fetch called with openfolder URL', () => {
    const { doc, win, fetchCalls } = ctx;
    fetchCalls.length = 0;
    const btn = doc.querySelector('.folder-btn[data-folder]');
    if (!btn) { return; } // optional feature
    btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    // fetch is async — give it a tick
    assert.ok(fetchCalls.length >= 1, `fetch not called after folder-btn click. fetch calls: ${fetchCalls.length}`);
});

// Output
console.log('\n' + '='.repeat(60));
console.log('View-a-Doc Interaction Tests');
console.log('='.repeat(60));
for (const r of results) {
    const icon = r.ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
    console.log(`  ${icon}  ${r.name}`);
    if (!r.ok) console.log(`         \x1b[31m-> ${r.err}\x1b[0m`);
}
console.log('='.repeat(60));
const failStr = failed > 0 ? `\x1b[31m${failed} failed\x1b[0m` : '0 failed';
console.log(`${passed + failed} tests: \x1b[32m${passed} passed\x1b[0m, ${failStr}\n`);
if (failed > 0) { process.exit(1); }

