// Copyright (c) 2026 CieloVista Software. All rights reserved.
'use strict';
/**
 * tests/view-doc-click-opens.test.js
 *
 * Tests that clicking a doc link sets the iframe src (browser-server architecture).
 * Updated for buildViewDocBrowserHtml.
 *
 * Run: node tests/view-doc-click-opens.test.js
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
const DOC_PATH  = 'C:\\standards\\README.md';
const scriptContent = extractBrowserScript(src, TEST_PORT, TEST_DOCS);

function makeDom() {
    const html = `<!DOCTYPE html><html><head></head><body>
<div id="topbar">
  <h1>View a Doc</h1>
  <input id="search" type="text" autocomplete="off">
  <select id="proj-filter"><option value="">All Projects</option></select>
  <span id="stat">${TEST_DOCS} docs</span>
</div>
<div id="split">
  <div id="index">
    <div class="proj-group" data-proj="global">
      <div class="proj-hd"><span class="dw">000</span><span class="fn">global</span>
        <button class="folder-btn" data-folder="C:\\standards"></button>
      </div>
      <div class="proj-links">
        <a class="doc-link" href="#" data-path="${DOC_PATH}">README Global</a>
        <a class="doc-link" href="#" data-path="C:\\standards\\COPILOT.md">CieloVista Copilot Rules</a>
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
    assert.ok(src.includes('function buildViewDocBrowserHtml('), 'function not found');
});
test('Script extracted successfully', () => {
    assert.ok(scriptContent && scriptContent.length > 200, 'script extraction failed');
});
test('Source uses iframe for doc viewing (doc?path= route)', () => {
    assert.ok(src.includes('doc?path=') || src.includes("'/doc'") || src.includes('doc-frame'), 'iframe doc loading missing');
});
test('Source does NOT use postMessage for doc open (browser arch has no vscode postMessage)', () => {
    // In the browser arch, the script uses fetch/iframe, not acquireVsCodeApi().postMessage
    // The script content should not have acquireVsCodeApi
    assert.ok(!scriptContent || !scriptContent.includes('acquireVsCodeApi'), 'script still uses acquireVsCodeApi — old arch?');
});
test('Source has openfolder route for folder button', () => {
    assert.ok(src.includes('openfolder'), 'openfolder route missing');
});

// DOM behavior
let ctx;
test('DOM builds without errors', () => {
    ctx = makeDom();
    assert.ok(ctx.doc.querySelector('.doc-link'), '.doc-link must exist');
    assert.ok(ctx.doc.getElementById('doc-frame'), '#doc-frame must exist');
    assert.ok(ctx.doc.getElementById('welcome'), '#welcome must exist');
});
test('Click doc-link: frame.src set (contains /doc)', () => {
    const { doc, win } = ctx;
    const lnk = doc.querySelector('.doc-link[data-path]');
    assert.ok(lnk, 'No doc-link with data-path found');
    lnk.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    const frame = doc.getElementById('doc-frame');
    assert.ok(frame.src && frame.src !== 'about:blank' && frame.src.includes('doc'),
        `frame.src should contain "doc" after click. Got: "${frame.src}"`);
});
test('Click doc-link: path encoded in frame.src', () => {
    const { doc } = ctx;
    const frame = doc.getElementById('doc-frame');
    // README.md path should be encoded in the src
    const encoded = encodeURIComponent(DOC_PATH);
    assert.ok(frame.src.includes(encoded) || frame.src.includes('README'),
        `DOC_PATH not encoded in frame.src. Got: "${frame.src}"`);
});
test('Click second doc-link: frame.src updates to new path', () => {
    const { doc, win } = ctx;
    const links = doc.querySelectorAll('.doc-link[data-path]');
    assert.ok(links.length >= 2, 'Need 2+ doc-links for this test');
    links[1].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    const frame = doc.getElementById('doc-frame');
    assert.ok(frame.src.includes('COPILOT') || frame.src.includes('copilot'),
        `frame.src should reference second link. Got: "${frame.src}"`);
});
test('Folder button click: fetch called with openfolder URL', () => {
    const { doc, win, fetchCalls } = ctx;
    fetchCalls.length = 0;
    const btn = doc.querySelector('.folder-btn[data-folder]');
    if (!btn) { return; }
    btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    assert.ok(fetchCalls.length >= 1, `fetch not called. Calls: ${fetchCalls.length}`);
    assert.ok(fetchCalls[0].includes('openfolder'), `fetch URL should include openfolder. Got: "${fetchCalls[0]}"`);
});

// Output
console.log('\n' + '='.repeat(60));
console.log('View-a-Doc Click-Opens Tests');
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

