// Copyright (c) 2026 CieloVista Software. All rights reserved.
'use strict';
/**
 * tests/view-doc-e2e.test.js
 *
 * End-to-end tests for View-a-Doc webview JS behavior.
 * Updated for browser-server architecture (buildViewDocBrowserHtml).
 * Tests SOURCE directly — no need for installed extension.
 *
 * Run: node tests/view-doc-e2e.test.js
 */

const assert  = require('assert');
const fs      = require('fs');
const path    = require('path');
const { JSDOM } = require('jsdom');

const SOURCE = path.join(__dirname, '..', 'src', 'features', 'doc-catalog', 'commands.ts');
if (!fs.existsSync(SOURCE)) {
    console.error('Source commands.ts not found at:', SOURCE);
    process.exit(1);
}
const src = fs.readFileSync(SOURCE, 'utf8');
console.log('\nSource found:', SOURCE);
console.log('Source size:', src.length, 'chars');

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
const TEST_DOCS = 6;
const scriptContent = extractBrowserScript(src, TEST_PORT, TEST_DOCS);
if (scriptContent) {
    console.log('Script extracted: ' + scriptContent.length + ' chars\n');
} else {
    console.error('Failed to extract script from buildViewDocBrowserHtml');
}

function makeDom(extraLinks) {
    const links = extraLinks || [
        { proj: 'global', dw: '000', folder: 'C:\\standards', path: 'C:\\standards\\README.md', label: 'README Global' },
        { proj: 'global', dw: '000', folder: 'C:\\standards', path: 'C:\\standards\\COPILOT.md', label: 'CieloVista Copilot Rules' },
        { proj: 'global', dw: '000', folder: 'C:\\standards', path: 'C:\\standards\\GIT.md', label: 'Git Workflow Standards' },
        { proj: 'wb-core', dw: '100', folder: 'C:\\wb-core', path: 'C:\\wb-core\\NOTES.md', label: 'Project Notes wb-core' },
        { proj: 'wb-core', dw: '100', folder: 'C:\\wb-core', path: 'C:\\wb-core\\ARCH.md', label: 'Architecture wb-core' },
        { proj: 'cielovista-tools', dw: '200', folder: 'C:\\cvtools', path: 'C:\\cvtools\\README.md', label: 'CieloVista Tools README' },
    ];

    const byProj = {};
    for (const l of links) {
        if (!byProj[l.proj]) { byProj[l.proj] = []; }
        byProj[l.proj].push(l);
    }

    const projGroups = Object.entries(byProj).map(([proj, items]) => `
    <div class="proj-group" data-proj="${proj}">
      <div class="proj-hd"><span class="dw">${items[0].dw}</span><span class="fn">${proj}</span>
        <button class="folder-btn" data-folder="${items[0].folder}"></button>
        <span class="cnt">${items.length}</span>
      </div>
      <div class="proj-links">
        ${items.map(i => `<a class="doc-link" href="#" data-path="${i.path}">${i.label}</a>`).join('\n        ')}
      </div>
    </div>`).join('\n');

    const html = `<!DOCTYPE html><html><head></head><body>
<div id="topbar">
  <h1>View a Doc</h1>
  <input id="search" type="text" autocomplete="off">
  <select id="proj-filter"><option value="">All Projects</option>
    ${Object.keys(byProj).map(p => `<option value="${p}">${p}</option>`).join('\n    ')}
  </select>
  <span id="stat">${TEST_DOCS} docs</span>
</div>
<div id="split">
  <div id="index">
    ${projGroups}
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

// Static source checks
test('buildViewDocBrowserHtml present in source', () => {
    assert.ok(src.includes('function buildViewDocBrowserHtml('));
});
test('Script extraction succeeded', () => {
    assert.ok(scriptContent && scriptContent.length > 200, 'script extraction failed');
});
test('Source CSS has #ffe066 yellow highlight', () => {
    assert.ok(src.includes('ffe066'), '#ffe066 missing');
});
test('Source has index-searching class', () => {
    assert.ok(src.includes('index-searching'), 'index-searching missing');
});
test('Source has .hi class for matches', () => {
    assert.ok(src.includes("'hi'") || src.includes('"hi"') || src.includes('.hi'), '.hi class missing');
});
test('Source has doc?path= route for iframe', () => {
    assert.ok(src.includes('doc?path=') || src.includes("'/doc'"), 'doc route missing');
});
test('Source has openfolder route', () => {
    assert.ok(src.includes('openfolder'), 'openfolder route missing');
});
test('Source has viewSpecificDoc export', () => {
    assert.ok(src.includes('viewSpecificDoc'), 'viewSpecificDoc not found');
});

// DOM behavior E2E
let ctx;
test('DOM builds: 6 links present', () => {
    ctx = makeDom();
    assert.strictEqual(ctx.doc.querySelectorAll('.doc-link').length, 6, 'Expected 6 .doc-link elements');
});

// E2E: BUG-1 — Search bar
test('E2E BUG-1: Search "readme" highlights matching links with .hi', () => {
    const { doc, win } = ctx;
    const search = doc.getElementById('search');
    assert.ok(search, '#search element must exist');
    search.value = 'readme';
    search.dispatchEvent(new win.Event('input', { bubbles: true }));
    const hi = doc.querySelectorAll('.doc-link.hi');
    assert.ok(hi.length >= 1, `No .hi links after searching "readme". Available texts: ${[...doc.querySelectorAll('.doc-link')].map(l => l.textContent).join(', ')}`);
});
test('E2E BUG-1: #index gets .index-searching on search', () => {
    const idx = ctx.doc.getElementById('index');
    assert.ok(idx.classList.contains('index-searching'), '#index missing .index-searching');
});
test('E2E BUG-1: Search "readme" only highlights README links', () => {
    const wrong = [...ctx.doc.querySelectorAll('.doc-link')]
        .filter(l => !l.textContent.toLowerCase().includes('readme') && l.classList.contains('hi'));
    assert.strictEqual(wrong.length, 0, `Wrong links have .hi: ${wrong.map(l => l.textContent).join(', ')}`);
});
test('E2E BUG-1: Clearing search removes .hi and .index-searching', () => {
    const { doc, win } = ctx;
    const search = doc.getElementById('search');
    search.value = '';
    search.dispatchEvent(new win.Event('input', { bubbles: true }));
    assert.strictEqual(doc.querySelectorAll('.doc-link.hi').length, 0, '.hi still present after clear');
    assert.ok(!doc.getElementById('index').classList.contains('index-searching'), '.index-searching still present');
});

// E2E: BUG-2 — Clicking a doc
test('E2E BUG-2: Clicking a doc-link sets frame.src', () => {
    const { doc, win } = ctx;
    const lnk = doc.querySelector('.doc-link[data-path]');
    assert.ok(lnk, 'No .doc-link with data-path');
    lnk.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    const frame = doc.getElementById('doc-frame');
    assert.ok(frame.src && frame.src !== 'about:blank' && frame.src.includes('doc'),
        `frame.src not set correctly. Got: "${frame.src}"`);
});
test('E2E BUG-2: Folder button calls fetch with openfolder', () => {
    const { doc, win, fetchCalls } = ctx;
    fetchCalls.length = 0;
    const btn = doc.querySelector('.folder-btn[data-folder]');
    if (!btn) { console.log('  (no folder-btn found, skipping fetch test)'); return; }
    btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    assert.ok(fetchCalls.length >= 1, 'fetch not called after folder button click');
    assert.ok(fetchCalls[0].includes('openfolder'), `fetch URL missing "openfolder". Got: "${fetchCalls[0]}"`);
});

// Output
console.log('\n' + '='.repeat(60));
console.log('View-a-Doc E2E Tests');
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

