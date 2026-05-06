// Copyright (c) 2026 CieloVista Software. All rights reserved.
'use strict';
/**
 * tests/view-doc-search-yellow.test.js
 *
 * Proves that typing in the View-a-Doc search bar turns matching links yellow (#ffe066).
 * Updated for browser-server architecture (buildViewDocBrowserHtml).
 *
 * Run: node tests/view-doc-search-yellow.test.js
 */

const assert  = require('assert');
const fs      = require('fs');
const path    = require('path');
const { JSDOM } = require('jsdom');

const SOURCE = path.join(__dirname, '..', 'src', 'features', 'doc-catalog', 'commands.ts');
const src    = fs.readFileSync(SOURCE, 'utf8');

// Extract inline script from buildViewDocBrowserHtml
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

const TEST_PORT    = 9999;
const TEST_DOCS    = 4;
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
      <div class="proj-hd"><span class="dw">000</span><span class="fn">global</span></div>
      <div class="proj-links">
        <a class="doc-link" href="#" data-path="C:\\standards\\README.md">README Global</a>
        <a class="doc-link" href="#" data-path="C:\\standards\\COPILOT.md">CieloVista Copilot Rules</a>
        <a class="doc-link" href="#" data-path="C:\\standards\\GIT.md">Git Workflow Standards</a>
      </div>
    </div>
    <div class="proj-group" data-proj="wb-core">
      <div class="proj-hd"><span class="dw">100</span><span class="fn">wb-core</span></div>
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

    const dom = new JSDOM(html, {
        runScripts: 'dangerously',
        pretendToBeVisual: true,
        beforeParse(win) {
            win.fetch = () => Promise.resolve({ ok: true, text: () => Promise.resolve('OK') });
            try { Object.defineProperty(win, 'localStorage', { value: { getItem: () => null, setItem: () => {} }, configurable: true }); } catch(e) {}
        },
    });
    return { dom, doc: dom.window.document, win: dom.window };
}

let passed = 0, failed = 0;
const results = [];
function test(name, fn) {
    try   { fn(); passed++; results.push({ ok: true,  name }); }
    catch (e) { failed++; results.push({ ok: false, name, err: e.message }); }
}

// Static source checks
test('Source has buildViewDocBrowserHtml function', () => {
    assert.ok(src.includes('function buildViewDocBrowserHtml('), 'function not found in commands.ts');
});
test('Script extracted from source', () => {
    assert.ok(scriptContent && scriptContent.length > 200, 'Could not extract script from buildViewDocBrowserHtml');
});
test('SOURCE CSS has #ffe066 yellow', () => {
    assert.ok(src.includes('ffe066'), '#ffe066 missing from commands.ts');
});
test('SOURCE CSS has .index-searching rule', () => {
    assert.ok(src.includes('index-searching'), '.index-searching missing from source');
});

// DOM behavior
let ctx;
test('DOM builds without errors', () => {
    ctx = makeDom();
    const links = ctx.doc.querySelectorAll('.doc-link');
    assert.ok(links.length >= 4, `Expected 4+ .doc-link elements, got ${links.length}`);
    assert.ok(ctx.doc.getElementById('search'), '#search must exist');
});
test('Before search: no links have .hi class', () => {
    const hi = ctx.doc.querySelectorAll('.doc-link.hi');
    assert.strictEqual(hi.length, 0, `${hi.length} links already have .hi before any search`);
});
test('After typing "readme": matching link gets .hi class', () => {
    const { doc, win } = ctx;
    const search = doc.getElementById('search');
    search.value = 'readme';
    search.dispatchEvent(new win.Event('input', { bubbles: true }));
    const hi = doc.querySelectorAll('.doc-link.hi');
    assert.ok(hi.length >= 1, 'No links got .hi class after typing "readme"');
    assert.ok([...hi].some(l => l.textContent.toLowerCase().includes('readme')),
        'README link should have .hi class');
});
test('After typing "readme": non-matching links do NOT have .hi', () => {
    const wrong = [...ctx.doc.querySelectorAll('.doc-link')]
        .filter(l => !l.textContent.toLowerCase().includes('readme') && l.classList.contains('hi'));
    assert.strictEqual(wrong.length, 0,
        `${wrong.length} non-matching links incorrectly have .hi: ${wrong.map(l => l.textContent).join(', ')}`);
});
test('After typing "readme": #index gets .index-searching class', () => {
    const idx = ctx.doc.getElementById('index');
    assert.ok(idx.classList.contains('index-searching'),
        '#index does NOT have .index-searching class');
});
test('After clearing search: .hi removed, .index-searching removed', () => {
    const { doc, win } = ctx;
    const search = doc.getElementById('search');
    search.value = '';
    search.dispatchEvent(new win.Event('input', { bubbles: true }));
    assert.strictEqual(ctx.doc.querySelectorAll('.doc-link.hi').length, 0, 'Links still have .hi');
    assert.ok(!ctx.doc.getElementById('index').classList.contains('index-searching'),
        '#index still has .index-searching');
});

// Output
console.log('\n' + '='.repeat(60));
console.log('View-a-Doc Search Yellow Highlight Tests');
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

