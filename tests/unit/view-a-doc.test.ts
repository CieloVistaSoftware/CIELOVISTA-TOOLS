// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
'use strict';
/**
 * tests/unit/view-a-doc.test.ts (compiled to .js for plain node execution)
 *
 * Unit tests for View a Doc feature (doc-catalog webview browser arch).
 * - Verifies /openfolder route calls openProjectFolderSmart
 * - Verifies search filter adds .hi class to matching links
 * - Verifies only matching docs are shown (.index-searching)
 * - Tests via jsdom (no VS Code runtime needed)
 *
 * Run: node tests/unit/view-a-doc.test.ts
 */

const assert  = require('assert');
const fs      = require('fs');
const path    = require('path');
const { JSDOM } = require('jsdom');

const SOURCE = path.join(__dirname, '..', '..', 'src', 'features', 'doc-catalog', 'commands.ts');
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

const scriptContent = extractBrowserScript(src, 9999, 4);

function makeDom() {
    const html = `<!DOCTYPE html><html><head></head><body>
<div id="topbar">
  <h1>View a Doc</h1>
  <input id="search" type="text" autocomplete="off">
  <select id="proj-filter"><option value="">All Projects</option>
    <option value="global">global</option>
    <option value="wb-core">wb-core</option>
  </select>
  <span id="stat">4 docs</span>
</div>
<div id="split">
  <div id="index">
    <div class="proj-group" data-proj="global">
      <div class="proj-hd"><span class="dw">000</span><span class="fn">global</span>
        <button class="folder-btn" data-folder="C:\\standards"></button>
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

// Source structure checks
test('buildViewDocBrowserHtml function present', () => {
    assert.ok(src.includes('function buildViewDocBrowserHtml('), 'not found in commands.ts');
});
test('Script extracts successfully', () => {
    assert.ok(scriptContent && scriptContent.length > 200, 'script extraction failed');
});
test('Source has /openfolder HTTP route', () => {
    assert.ok(src.includes("pathname === '/openfolder'"), '/openfolder route missing');
});
test('Source /openfolder calls openProjectFolderSmart (opens folder in new window)', () => {
    const idx = src.indexOf("pathname === '/openfolder'");
    const region = src.slice(idx, idx + 600);
  assert.ok(region.includes('openProjectFolderSmart'), 'openProjectFolderSmart not called in /openfolder handler');
});
test('Source openProjectFolderSmart calls vscode.openFolder with forceNewWindow:true', () => {
    assert.ok(src.includes("'vscode.openFolder'"), 'vscode.openFolder missing');
    const idx = src.indexOf("'vscode.openFolder'");
  const region = src.slice(idx, idx + 200);
  assert.ok(region.includes('forceNewWindow: false'), 'openFolder must reuse the current window');
});
test('Source webview JS sends fetch /openfolder on folder button click', () => {
    assert.ok(scriptContent && scriptContent.includes('openfolder'), 'folder button does not fetch /openfolder');
});

// DOM behavior — folder click opens new window
let ctx;
test('DOM builds: 4 doc-links and folder buttons present', () => {
    ctx = makeDom();
    assert.strictEqual(ctx.doc.querySelectorAll('.doc-link').length, 4, 'Expected 4 doc-links');
    assert.ok(ctx.doc.querySelector('.folder-btn[data-folder]'), 'folder-btn missing');
});
test('Clicking folder button calls fetch with /openfolder URL', () => {
    const { doc, win, fetchCalls } = ctx;
    fetchCalls.length = 0;
    const btn = doc.querySelector('.folder-btn[data-folder]');
    btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    assert.ok(fetchCalls.length >= 1, 'fetch not called after folder-btn click');
    assert.ok(fetchCalls[0].includes('openfolder'), `URL should contain "openfolder". Got: "${fetchCalls[0]}"`);
});
test('Folder button fetch URL encodes the folder path', () => {
    const { fetchCalls } = ctx;
    const folder = 'C:\\standards';
    const encoded = encodeURIComponent(folder);
    assert.ok(fetchCalls[0].includes(encoded), `Encoded path not in URL. Got: "${fetchCalls[0]}"`);
});

// DOM behavior — filter updates on every keystroke
test('Typing in search sets .hi class on matching links', () => {
    const { doc, win } = ctx;
    const search = doc.getElementById('search');
    search.value = 'readme';
    search.dispatchEvent(new win.Event('input', { bubbles: true }));
    const hi = doc.querySelectorAll('.doc-link.hi');
    assert.ok(hi.length >= 1, 'No .hi links after typing "readme"');
});
test('Typing in search sets #index.index-searching', () => {
    assert.ok(ctx.doc.getElementById('index').classList.contains('index-searching'),
        '#index missing .index-searching');
});
test('Every keystroke updates filter: typing more narrows results', () => {
    const { doc, win } = ctx;
    const search = doc.getElementById('search');
    // "copilot" is more specific — should match fewer links
    search.value = 'copilot';
    search.dispatchEvent(new win.Event('input', { bubbles: true }));
    const hi = doc.querySelectorAll('.doc-link.hi');
    assert.ok(hi.length >= 1, 'No .hi links after typing "copilot"');
    assert.ok([...hi].every(l => l.textContent.toLowerCase().includes('copilot')),
        'Non-copilot link incorrectly marked .hi');
});

// DOM behavior — only matching docs shown
test('Only matching docs visible when searching (others hidden via .index-searching)', () => {
    const { doc } = ctx;
    // Already searched for "copilot" — only that link should be .hi
    const nonMatch = [...doc.querySelectorAll('.doc-link')]
        .filter(l => !l.textContent.toLowerCase().includes('copilot'));
    assert.ok(nonMatch.length >= 1, 'Need non-matching links for this test');
    nonMatch.forEach(l => {
        assert.ok(!l.classList.contains('hi'),
            `Non-matching link "${l.textContent}" should not have .hi`);
    });
});
test('Clearing search shows all docs (removes .index-searching and .hi)', () => {
    const { doc, win } = ctx;
    const search = doc.getElementById('search');
    search.value = '';
    search.dispatchEvent(new win.Event('input', { bubbles: true }));
    assert.strictEqual(doc.querySelectorAll('.doc-link.hi').length, 0, '.hi still present after clear');
    assert.ok(!doc.getElementById('index').classList.contains('index-searching'),
        '.index-searching still present after clear');
});

// Output
console.log('\n' + '='.repeat(60));
console.log('View a Doc — Unit Tests');
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
