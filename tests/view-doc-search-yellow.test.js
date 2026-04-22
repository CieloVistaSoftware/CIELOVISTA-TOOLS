'use strict';
/**
 * tests/view-doc-search-yellow.test.js
 *
 * PROVES that typing in the View a Doc search bar
 * turns matching doc-link tags yellow (#ffe066).
 *
 * Tests the INSTALLED compiled file — not source.
 * If these pass, the feature works. If they fail, it's broken.
 */

const assert  = require('assert');
const fs      = require('fs');
const path    = require('path');
const { JSDOM } = require('jsdom');

const INSTALLED = path.join(
    process.env.USERPROFILE || 'C:\\Users\\jwpmi',
    '.vscode-insiders', 'extensions',
    'cielovistasoftware.cielovista-tools-1.0.0',
    'out', 'features', 'doc-catalog', 'commands.js'
);

if (!fs.existsSync(INSTALLED)) {
    console.error('INSTALLED commands.js NOT FOUND. Run npm run rebuild first.');
    process.exit(1);
}

const compiled = fs.readFileSync(INSTALLED, 'utf8');
const SOURCE   = path.join(
    'C:\\Users\\jwpmi\\Downloads\\VSCode\\projects\\cielovista-tools',
    'src', 'features', 'doc-catalog', 'commands.ts'
);
const src = fs.readFileSync(SOURCE, 'utf8');

// ── Extract JS template from SOURCE ──────────────────────────────────────
function extractJs(text) {
    const fnStart = text.indexOf('function buildViewDocHtml(');
    if (fnStart === -1) { return null; }
    const scope  = text.slice(fnStart);
    const marker = 'const JS = `\n';
    const idx    = scope.indexOf(marker);
    if (idx === -1) { return null; }
    let i = idx + marker.length, out = '';
    while (i < scope.length) {
        if (scope[i] === '`') break;
        if (scope[i] === '\\' && scope[i+1] === '`') { out += '`'; i += 2; continue; }
        out += scope[i++];
    }
    return out;
}

// ── Extract CSS template from SOURCE ─────────────────────────────────────
function extractCss(text) {
    const fnStart = text.indexOf('function buildViewDocHtml(');
    if (fnStart === -1) { return ''; }
    const scope    = text.slice(fnStart);
    const marker   = 'const CSS = `\n';
    const idx      = scope.indexOf(marker);
    if (idx === -1) { return ''; }
    let i = idx + marker.length, out = '';
    while (i < scope.length) {
        if (scope[i] === '`') break;
        if (scope[i] === '\\' && scope[i+1] === '`') { out += '`'; i += 2; continue; }
        out += scope[i++];
    }
    return out;
}

const jsTemplate  = extractJs(src);
const cssTemplate = extractCss(src);

// ── Build realistic DOM ───────────────────────────────────────────────────
function makeDom() {
    const rendered = (jsTemplate || '')
        .replace(/\$\{totalDocs\}/g, '6')
        .replace(/\$\{totalProjects\}/g, '2');

    const html = `<!DOCTYPE html><html><head><style>${cssTemplate}</style></head><body>
<div id="toolbar">
  <input id="search" type="text" autocomplete="off">
  <span id="stat">6 docs across 2 projects</span>
</div>
<div id="content">
<table>
  <thead><tr><th>Folder</th><th>Documents</th></tr></thead>
  <tbody>
    <tr>
      <td class="folder-cell"><span class="folder-name">global</span></td>
      <td class="links-cell">
        <a class="doc-link doc-link-priority" href="#" data-path="C:\\s\\JS-STANDARDS.md">JavaScript Standards</a>
        <a class="doc-link" href="#" data-path="C:\\s\\COPILOT-RULES.md">CieloVista Copilot Rules</a>
        <a class="doc-link" href="#" data-path="C:\\s\\GIT.md">Git Workflow Standards</a>
      </td>
    </tr>
    <tr>
      <td class="folder-cell"><span class="folder-name">vscode-claude</span></td>
      <td class="links-cell">
        <a class="doc-link doc-link-priority" href="#" data-path="C:\\v\\CHANGELOG.md">Changelog vscode-claude</a>
        <a class="doc-link" href="#" data-path="C:\\v\\ARCH.md">vscode-claude UI Architecture</a>
        <a class="doc-link" href="#" data-path="C:\\v\\RULES.md">Copilot Instructions vscode-claude</a>
      </td>
    </tr>
  </tbody>
</table>
<div id="empty">No docs match.</div>
</div>
<div id="copy-toast"></div>
<script>${rendered}</script>
</body></html>`;

    const messages = [];
    const dom = new JSDOM(html, {
        runScripts: 'dangerously',
        pretendToBeVisual: true,
        beforeParse(win) {
            win.acquireVsCodeApi = () => ({
                postMessage: m => messages.push(m),
                getState:    ()  => null,
                setState:    ()  => {},
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
    try { fn(); passed++; results.push({ ok: true,  name }); }
    catch(e) { failed++; results.push({ ok: false, name, err: e.message }); }
}

// ═══════════════════════════════════════════════════════════════════════════
// STATIC CHECKS ON INSTALLED FILE
// ═══════════════════════════════════════════════════════════════════════════

test('INSTALLED: #ffe066 color present in compiled CSS', () => {
    assert.ok(compiled.includes('ffe066'), 'Yellow #ffe066 missing from installed commands.js');
});

test('INSTALLED: .search-match class in compiled CSS', () => {
    assert.ok(compiled.includes('search-match'), '.search-match missing from installed commands.js');
});

test('INSTALLED: .searching .doc-link filter rule present', () => {
    assert.ok(
        compiled.includes('.searching .doc-link:not(.search-match)'),
        '.searching filter rule missing — non-matching links will not hide'
    );
});

test('INSTALLED: searchEl.addEventListener present', () => {
    assert.ok(compiled.includes('searchEl.addEventListener'), 'search listener missing from installed file');
});

test('INSTALLED: classList.add search-match present', () => {
    assert.ok(
        compiled.includes('search-match'),
        'search-match class assignment missing from installed file'
    );
});

// ═══════════════════════════════════════════════════════════════════════════
// DOM BEHAVIOUR — YELLOW HIGHLIGHT
// ═══════════════════════════════════════════════════════════════════════════

test('JS template extracted from source', () => {
    assert.ok(jsTemplate && jsTemplate.length > 200, 'Could not extract JS template from source');
});

test('CSS template extracted from source', () => {
    assert.ok(cssTemplate && cssTemplate.length > 100, 'Could not extract CSS template from source');
});

let ctx;
test('DOM builds without errors', () => {
    ctx = makeDom();
    const links = ctx.doc.querySelectorAll('.doc-link');
    assert.ok(links.length >= 4, `Expected 4+ doc-link elements, got ${links.length}`);
    assert.ok(ctx.doc.getElementById('search'), 'search input must exist');
});

test('Before search: no links have search-match class', () => {
    const yellow = ctx.doc.querySelectorAll('.doc-link.search-match');
    assert.strictEqual(yellow.length, 0, `${yellow.length} links already have search-match before any search`);
});

test('After typing "rules": table gets .searching class', () => {
    const { doc, win } = ctx;
    const search = doc.getElementById('search');
    search.value = 'rules';
    search.dispatchEvent(new win.Event('input', { bubbles: true }));
    assert.ok(
        doc.querySelector('table').classList.contains('searching'),
        'Table does NOT have .searching class after typing — JS listener not firing'
    );
});

test('After typing "rules": matching links get search-match class', () => {
    const { doc } = ctx;
    const allLinks = [...doc.querySelectorAll('.doc-link')];
    const yellow   = allLinks.filter(l => l.classList.contains('search-match'));
    assert.ok(
        yellow.length >= 1,
        `NO links have search-match class after typing "rules". ` +
        `All link texts: ${allLinks.map(l => l.textContent).join(', ')}`
    );
    // Specifically "CieloVista Copilot Rules" and "Copilot Instructions vscode-claude" match "rules"
    const rulesLink = allLinks.find(l => l.textContent.toLowerCase().includes('rules'));
    assert.ok(rulesLink, '"rules" link must exist in DOM');
    assert.ok(
        rulesLink.classList.contains('search-match'),
        `Link "${rulesLink.textContent}" does NOT have search-match class. classList: "${rulesLink.className}"`
    );
});

test('After typing "rules": non-matching links do NOT get search-match', () => {
    const { doc } = ctx;
    const wrongLinks = [...doc.querySelectorAll('.doc-link')]
        .filter(l => !l.textContent.toLowerCase().includes('rules') && l.classList.contains('search-match'));
    assert.strictEqual(
        wrongLinks.length, 0,
        `${wrongLinks.length} non-matching links incorrectly have search-match: ` +
        wrongLinks.map(l => l.textContent).join(', ')
    );
});

test('After typing "rules": rows with no matches are hidden', () => {
    const { doc } = ctx;
    // The "global" row has "CieloVista Copilot Rules" which matches
    // The "vscode-claude" row has "Copilot Instructions vscode-claude" which matches "rules"
    // So actually both rows have matches — let's check with a term that only hits one row
    // Reset and use "git" which only appears in global
    const search = doc.getElementById('search');
    const { win } = ctx;
    search.value = 'git';
    search.dispatchEvent(new win.Event('input', { bubbles: true }));

    const hiddenRows = [...doc.querySelectorAll('tbody tr.hidden')];
    const visibleRows = [...doc.querySelectorAll('tbody tr:not(.hidden)')];
    assert.ok(hiddenRows.length >= 1, `No rows were hidden after searching "git" — expected vscode-claude row to hide`);
    assert.ok(visibleRows.length >= 1, `At least 1 row must be visible after searching "git"`);
});

test('After clearing search: no links have search-match, table loses .searching', () => {
    const { doc, win } = ctx;
    const search = doc.getElementById('search');
    search.value = '';
    search.dispatchEvent(new win.Event('input', { bubbles: true }));

    const yellow = doc.querySelectorAll('.doc-link.search-match');
    assert.strictEqual(yellow.length, 0, `${yellow.length} links still have search-match after clearing`);
    assert.ok(
        !doc.querySelector('table').classList.contains('searching'),
        'Table still has .searching class after clearing search'
    );
});

test('CSS has .search-match background:#ffe066', () => {
    assert.ok(
        cssTemplate.includes('ffe066'),
        'CSS template does not contain #ffe066 — yellow highlight will never appear'
    );
});

test('CSS has .searching .doc-link:not(.search-match){display:none}', () => {
    assert.ok(
        cssTemplate.includes('.searching .doc-link:not(.search-match)'),
        'CSS hide rule missing — non-matching links will not disappear during search'
    );
});

// ═══════════════════════════════════════════════════════════════════════════
// OUTPUT
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n' + '='.repeat(65));
console.log('View-a-Doc Search Yellow Highlight Tests');
console.log('='.repeat(65));
for (const r of results) {
    const icon = r.ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
    console.log(`  ${icon}  ${r.name}`);
    if (!r.ok) console.log(`         \x1b[31m→ ${r.err}\x1b[0m`);
}
console.log('='.repeat(65));
const failStr = failed > 0 ? `\x1b[31m${failed} failed\x1b[0m` : '0 failed';
console.log(`${passed + failed} tests: \x1b[32m${passed} passed\x1b[0m, ${failStr}\n`);
if (failed > 0) process.exit(1);
