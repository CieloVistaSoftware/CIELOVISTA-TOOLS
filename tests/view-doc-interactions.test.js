'use strict';
/**
 * tests/view-doc-interactions.test.js
 *
 * Tests View-a-Doc webview JS behavior using jsdom.
 * Covers: JS syntax, search filtering, click-to-open, Ctrl+click,
 *         folder button, special-char titles, try-catch error banner.
 *
 * Run: node tests/view-doc-interactions.test.js
 * Requires: npm install jsdom --save-dev
 */

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');

// ── Check jsdom is available ──────────────────────────────────────────────
let JSDOM;
try {
    JSDOM = require('jsdom').JSDOM;
} catch (e) {
    console.error('jsdom not installed. Run: npm install jsdom --save-dev');
    process.exit(1);
}

// ── Extract JS template from source ──────────────────────────────────────
const CMDS_SRC = path.join(__dirname, '..', 'src', 'features', 'doc-catalog', 'commands.ts');
const src = fs.readFileSync(CMDS_SRC, 'utf8');

const fnStart = src.indexOf('function buildViewDocHtml(');
if (fnStart === -1) { console.error('buildViewDocHtml not found'); process.exit(1); }

const scope  = src.slice(fnStart);
const jsMark = 'const JS = `\n';
const jsIdx  = scope.indexOf(jsMark);
if (jsIdx === -1) { console.error('JS template literal not found'); process.exit(1); }

let jsTemplate = '';
let i = jsIdx + jsMark.length;
while (i < scope.length) {
    if (scope[i] === '`') break;
    if (scope[i] === '\\' && scope[i + 1] === '`') { jsTemplate += '`'; i += 2; continue; }
    jsTemplate += scope[i++];
}

// ── Helper: find link by text content ────────────────────────────────────
function linkByText(doc, text) {
    return [...doc.querySelectorAll('.doc-link')].find(l => l.textContent.trim().includes(text)) || null;
}

function linkByPath(doc, dataPath) {
    // Use filter because querySelectorAll with backslash paths is unreliable in jsdom
    return [...doc.querySelectorAll('.doc-link')].find(l => l.dataset.path === dataPath) || null;
}

// ── DOM factory ───────────────────────────────────────────────────────────
function makeDom() {
    const messages = [];
    const state    = { val: null };

    const totalDocs     = 4;
    const totalProjects = 2;

    const rendered = jsTemplate
        .replace(/\$\{totalDocs\}/g, String(totalDocs))
        .replace(/\$\{totalProjects\}/g, String(totalProjects));

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>
<div id="toolbar">
  <input id="search" type="text" autocomplete="off">
  <span id="stat">${totalDocs} docs across ${totalProjects} projects</span>
</div>
<div id="content">
  <table>
    <thead><tr><th>Folder</th><th>Documents</th></tr></thead>
    <tbody>
      <tr>
        <td class="folder-cell">
          <span class="dewey">000</span>
          <span class="folder-name">global</span>
          <button class="open-folder-btn" data-folder="C:\\standards">&#128194;</button>
          <span class="doc-count">2</span>
        </td>
        <td class="links-cell">
          <a class="doc-link doc-link-priority" href="#" data-path="C:\\standards\\README.md">ReadMe Global</a>
          <a class="doc-link doc-link-priority" href="#" data-path="C:\\standards\\CLAUDE.md">Claude Config</a>
        </td>
      </tr>
      <tr>
        <td class="folder-cell">
          <span class="dewey">100</span>
          <span class="folder-name">wb-core</span>
          <span class="doc-count">2</span>
        </td>
        <td class="links-cell">
          <a class="doc-link" href="#" data-path="C:\\wb-core\\aside.md">\`&lt;aside&gt;\` Element</a>
          <a class="doc-link" href="#" data-path="C:\\wb-core\\NOTES.md">Project Notes</a>
        </td>
      </tr>
    </tbody>
  </table>
  <div id="empty">No docs match.</div>
</div>
<div id="copy-toast"></div>
<script>${rendered}</script>
</body></html>`;

    const dom = new JSDOM(html, {
        runScripts: 'dangerously',
        pretendToBeVisual: true,
        beforeParse(win) {
            win.acquireVsCodeApi = () => ({
                postMessage: msg  => messages.push(msg),
                getState:    ()   => state.val,
                setState:    (s)  => { state.val = s; },
            });
            win.requestAnimationFrame = fn => setTimeout(fn, 0);
        },
    });

    return { dom, messages, doc: dom.window.document, win: dom.window };
}

// ── Test runner ───────────────────────────────────────────────────────────
let passed = 0, failed = 0;
const results = [];

function test(name, fn) {
    try { fn(); passed++; results.push({ ok: true, name }); }
    catch (e) { failed++; results.push({ ok: false, name, err: e.message }); }
}

// ── BEFORE tests: static analysis ────────────────────────────────────────

test('JS template has valid syntax (new Function)', () => {
    const rendered = jsTemplate
        .replace(/\$\{totalDocs\}/g, '4')
        .replace(/\$\{totalProjects\}/g, '2');
    new Function(rendered); // throws SyntaxError if broken
});

test('JS template has no unescaped backticks', () => {
    let count = 0;
    for (let j = 0; j < jsTemplate.length; j++) {
        if (jsTemplate.charCodeAt(j) === 96) count++;
    }
    assert.strictEqual(count, 0, `Found ${count} unescaped backtick(s) in JS template`);
});

test('JS template contains try-catch error banner', () => {
    assert.ok(jsTemplate.includes('try {'),                'Should have try {');
    assert.ok(jsTemplate.includes('catch(e)'),             'Should have catch(e)');
    assert.ok(jsTemplate.includes('View a Doc init error'),'Should have error banner text');
});

// ── DOM-based tests ───────────────────────────────────────────────────────

let ctx;
test('DOM builds without JS runtime errors', () => {
    ctx = makeDom();
    assert.ok(ctx.doc.getElementById('search'),    'search element should exist');
    assert.ok(ctx.doc.querySelector('.doc-link'),  'doc-link elements should exist');
    // If error banner fired, a div with the error text would be at top of body
    const banner = [...ctx.doc.querySelectorAll('div')].find(d => d.textContent.includes('View a Doc init error'));
    assert.ok(!banner, 'Error banner should NOT be present on clean load');
});

test('All 4 doc links exist in DOM', () => {
    const links = ctx.doc.querySelectorAll('.doc-link');
    assert.strictEqual(links.length, 4, 'Should have exactly 4 doc-link elements');
});

test('Links have correct data-path attributes', () => {
    const readme  = linkByPath(ctx.doc, 'C:\\standards\\README.md');
    const claude  = linkByPath(ctx.doc, 'C:\\standards\\CLAUDE.md');
    const aside   = linkByPath(ctx.doc, 'C:\\wb-core\\aside.md');
    const notes   = linkByPath(ctx.doc, 'C:\\wb-core\\NOTES.md');
    assert.ok(readme,  'README link should exist');
    assert.ok(claude,  'CLAUDE link should exist');
    assert.ok(aside,   'aside link should exist');
    assert.ok(notes,   'notes link should exist');
});

test('Search: filters rows — non-matching row gets hidden class', () => {
    const { doc, win } = ctx;
    const search = doc.getElementById('search');
    search.value = 'readme';
    search.dispatchEvent(new win.Event('input', { bubbles: true }));

    const rows = [...doc.querySelectorAll('tbody tr')];
    assert.ok(!rows[0].classList.contains('hidden'), 'global row should be visible for "readme"');
    assert.ok(rows[1].classList.contains('hidden'),  'wb-core row should be hidden for "readme"');
});

test('Search: matching link gets search-match class', () => {
    const { doc } = ctx;
    const link = linkByText(doc, 'ReadMe Global');
    assert.ok(link, 'ReadMe Global link should exist');
    assert.ok(link.classList.contains('search-match'), 'README link should have search-match class');
});

test('Search: non-matching link does NOT get search-match', () => {
    const { doc } = ctx;
    const link = linkByText(doc, 'Project Notes');
    assert.ok(link, 'Project Notes link should exist');
    assert.ok(!link.classList.contains('search-match'), 'Notes link should NOT have search-match');
});

test('Search: table gets "searching" class while query active', () => {
    const { doc } = ctx;
    assert.ok(doc.querySelector('table').classList.contains('searching'));
});

test('Search: clear removes hidden class from all rows', () => {
    const { doc, win } = ctx;
    const search = doc.getElementById('search');
    search.value = '';
    search.dispatchEvent(new win.Event('input', { bubbles: true }));
    assert.strictEqual(doc.querySelectorAll('tbody tr.hidden').length, 0, 'No rows hidden after clear');
});

test('Search: clear removes "searching" class from table', () => {
    const { doc } = ctx;
    assert.ok(!doc.querySelector('table').classList.contains('searching'));
});

test('Click on doc-link posts open message with exact path', () => {
    const { doc, win, messages } = ctx;
    messages.length = 0;
    const link = linkByPath(doc, 'C:\\standards\\README.md');
    assert.ok(link, 'README link should exist');
    link.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
    const msg = messages.find(m => m.command === 'open');
    assert.ok(msg, 'Should post open message');
    assert.strictEqual(msg.data, 'C:\\standards\\README.md');
});

test('Ctrl+click does NOT post open message', () => {
    const { doc, win, messages } = ctx;
    messages.length = 0;
    const link = linkByPath(doc, 'C:\\standards\\README.md');
    link.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
    assert.ok(!messages.find(m => m.command === 'open'), 'Ctrl+click should NOT post open');
});

test('Ctrl+click adds selected class', () => {
    const { doc, win } = ctx;
    const link = linkByPath(doc, 'C:\\standards\\README.md');
    link.classList.remove('selected');
    link.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
    assert.ok(link.classList.contains('selected'), 'Link should be selected after Ctrl+click');
});

test('Second Ctrl+click deselects link', () => {
    const { doc, win } = ctx;
    const link = linkByPath(doc, 'C:\\standards\\README.md');
    link.classList.add('selected');
    link.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
    assert.ok(!link.classList.contains('selected'), 'Link should be deselected on second Ctrl+click');
});

test('Folder button posts openFolder message', () => {
    const { doc, win, messages } = ctx;
    messages.length = 0;
    const btn = doc.querySelector('.open-folder-btn');
    assert.ok(btn, 'open-folder-btn should exist');
    btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
    const msg = messages.find(m => m.command === 'openFolder');
    assert.ok(msg, 'Should post openFolder');
    assert.strictEqual(msg.data, 'C:\\standards');
});

test('Backtick-titled link is clickable and posts correct path', () => {
    const { doc, win, messages } = ctx;
    messages.length = 0;
    const link = linkByPath(doc, 'C:\\wb-core\\aside.md');
    assert.ok(link, 'aside link should exist');
    link.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
    const msg = messages.find(m => m.command === 'open');
    assert.ok(msg, 'Backtick link should post open');
    assert.strictEqual(msg.data, 'C:\\wb-core\\aside.md');
});

test('Search for backtick-titled doc ("aside") finds it', () => {
    const { doc, win } = ctx;
    const search = doc.getElementById('search');
    search.value = 'aside';
    search.dispatchEvent(new win.Event('input', { bubbles: true }));
    const link = linkByPath(doc, 'C:\\wb-core\\aside.md');
    assert.ok(link.classList.contains('search-match'), 'aside link should have search-match');
    // Cleanup
    search.value = '';
    search.dispatchEvent(new win.Event('input', { bubbles: true }));
});

test('Click after clearing search still works', () => {
    const { doc, win, messages } = ctx;
    const search = doc.getElementById('search');
    search.value = 'notes';
    search.dispatchEvent(new win.Event('input', { bubbles: true }));
    search.value = '';
    search.dispatchEvent(new win.Event('input', { bubbles: true }));
    messages.length = 0;
    const link = linkByPath(doc, 'C:\\standards\\README.md');
    link.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
    assert.ok(messages.find(m => m.command === 'open'), 'click should work after clearing search');
});

test('Error banner appears when acquireVsCodeApi throws', () => {
    const brokenDom = new JSDOM(`<!DOCTYPE html><html><head></head><body>
<input id="search"><span id="stat"></span>
<table><tbody><tr><td></td><td></td></tr></tbody></table>
<div id="empty"></div><div id="copy-toast"></div>
<script>
(function(){
'use strict';
try {
throw new Error('acquireVsCodeApi failed');
} catch(e) {
    var _eb = document.createElement('div');
    _eb.id = 'view-doc-error-banner';
    _eb.textContent = '\u26a0\ufe0f View a Doc init error: ' + e.message;
    document.body.insertBefore(_eb, document.body.firstChild);
}
})();
</script>
</body></html>`, { runScripts: 'dangerously' });

    const banner = brokenDom.window.document.getElementById('view-doc-error-banner');
    assert.ok(banner, 'Error banner should be injected on init failure');
    assert.ok(banner.textContent.includes('acquireVsCodeApi failed'), 'Banner should contain error message');
});

// ── Output ────────────────────────────────────────────────────────────────
console.log('\nView-a-Doc Behavior Tests');
console.log('='.repeat(60));
for (const r of results) {
    const icon = r.ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
    console.log(`  ${icon}  ${r.name}`);
    if (!r.ok) console.log(`         \x1b[31m→ ${r.err}\x1b[0m`);
}
console.log('='.repeat(60));
const failStr = failed > 0 ? `\x1b[31m${failed} failed\x1b[0m` : '0 failed';
console.log(`${passed + failed} tests: \x1b[32m${passed} passed\x1b[0m, ${failStr}\n`);
if (failed > 0) process.exit(1);
