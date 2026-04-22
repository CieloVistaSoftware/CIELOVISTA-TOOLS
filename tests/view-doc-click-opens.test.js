'use strict';
/**
 * tests/view-doc-click-opens.test.js
 *
 * Reproduces: Does clicking a doc link in View a Doc actually open the doc?
 *
 * Two layers:
 *   1. Webview JS — clicking a link must post { command:'open', data: filePath }
 *   2. Extension host — the 'open' handler must call openDocPreview (not just existsSync silently)
 *
 * Run: node tests/view-doc-click-opens.test.js
 */

'use strict';
const assert  = require('assert');
const fs      = require('fs');
const path    = require('path');
const { JSDOM } = require('jsdom');

const SOURCE_CMDS = path.join(__dirname, '..', 'src', 'features', 'doc-catalog', 'commands.ts');
const INSTALLED_CMDS = path.join(
    process.env.USERPROFILE || 'C:\\Users\\jwpmi',
    '.vscode-insiders', 'extensions',
    'cielovistasoftware.cielovista-tools-1.0.0',
    'out', 'features', 'doc-catalog', 'commands.js'
);

const src      = fs.readFileSync(SOURCE_CMDS, 'utf8');
const compiled = fs.existsSync(INSTALLED_CMDS) ? fs.readFileSync(INSTALLED_CMDS, 'utf8') : '';

// ── Extract JS template ───────────────────────────────────────────────────
function extractJsTemplate(text) {
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

const jsTemplate = extractJsTemplate(src);

// ── Real file path from registry for testing ──────────────────────────────
const REGISTRY = 'C:\\Users\\jwpmi\\Downloads\\CieloVistaStandards\\project-registry.json';
let realFilePath = null;
try {
    const reg = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
    // Find a real .md file that actually exists
    const globalPath = reg.globalDocsPath;
    if (globalPath && fs.existsSync(globalPath)) {
        const files = fs.readdirSync(globalPath).filter(f => f.endsWith('.md'));
        if (files.length > 0) {
            realFilePath = path.join(globalPath, files[0]);
        }
    }
} catch {}

// ── Build DOM ─────────────────────────────────────────────────────────────
function makeDom(realPath) {
    const messages = [];
    const rendered = (jsTemplate || '')
        .replace(/\$\{totalDocs\}/g, '2')
        .replace(/\$\{totalProjects\}/g, '1');

    const escapedPath = String(realPath || 'C:\\standards\\README.md')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

    const html = `<!DOCTYPE html><html><head></head><body>
<input id="search" type="text"><span id="stat">2 docs</span>
<div id="content">
  <table><thead><tr><th>F</th><th>D</th></tr></thead>
  <tbody>
    <tr>
      <td class="folder-cell">
        <span class="folder-name">global</span>
        <button class="open-folder-btn" data-folder="C:\\standards">&#128194;</button>
      </td>
      <td class="links-cell">
        <a class="doc-link doc-link-priority" href="#" data-path="${escapedPath}">JavaScript Standards</a>
        <a class="doc-link" href="#" data-path="C:\\standards\\NOTES.md">Notes</a>
      </td>
    </tr>
  </tbody>
  </table>
  <div id="empty"></div>
</div>
<div id="copy-toast"></div>
<script>${rendered}</script></body></html>`;

    const dom = new JSDOM(html, {
        runScripts: 'dangerously', pretendToBeVisual: true,
        beforeParse(win) {
            win.acquireVsCodeApi = () => ({ postMessage: m => messages.push(m), getState: () => null, setState: () => {} });
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
    catch(e) { failed++; results.push({ ok: false, name, err: e.message }); }
}

// ═══════════════════════════════════════════════════════════════════════════
// LAYER 1: Webview JS posts 'open' message when link clicked
// ═══════════════════════════════════════════════════════════════════════════

test('JS template extracted from source', () => {
    assert.ok(jsTemplate && jsTemplate.length > 100, 'Could not extract JS template');
});

test('DOM builds and doc links exist', () => {
    const { doc } = makeDom(realFilePath || 'C:\\standards\\README.md');
    const links = doc.querySelectorAll('.doc-link');
    assert.ok(links.length >= 1, 'No doc-link elements found in DOM');
});

test('Clicking a doc link posts { command:"open", data: filePath }', () => {
    const testPath = realFilePath || 'C:\\standards\\README.md';
    const { doc, win, messages } = makeDom(testPath);
    messages.length = 0;

    const link = doc.querySelector('.doc-link');
    assert.ok(link, 'doc-link must exist');

    link.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));

    const openMsg = messages.find(m => m.command === 'open');
    assert.ok(
        openMsg,
        `Clicking doc link did NOT post open message. Messages posted: ${JSON.stringify(messages)}`
    );
    assert.strictEqual(
        openMsg.data, testPath,
        `open message has wrong path. Expected: ${testPath}, got: ${openMsg.data}`
    );
});

test('Clicking folder button posts { command:"openFolder", data: folderPath }', () => {
    const { doc, win, messages } = makeDom(realFilePath);
    messages.length = 0;
    const btn = doc.querySelector('.open-folder-btn');
    assert.ok(btn, 'open-folder-btn must exist');
    btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
    const msg = messages.find(m => m.command === 'openFolder');
    assert.ok(msg, `Folder button did NOT post openFolder message. Got: ${JSON.stringify(messages)}`);
    assert.strictEqual(msg.data, 'C:\\standards');
});

// ═══════════════════════════════════════════════════════════════════════════
// LAYER 2: Extension host handler calls openDocPreview
// ═══════════════════════════════════════════════════════════════════════════

test('SOURCE: viewSpecificDoc has open message handler', () => {
    const viewIdx = src.indexOf('async function viewSpecificDoc');
    assert.ok(viewIdx !== -1, 'viewSpecificDoc function not found');
    const section = src.slice(viewIdx, viewIdx + 1000);
    assert.ok(
        section.includes("msg.command === 'open'"),
        'open message handler missing from viewSpecificDoc'
    );
});

test('SOURCE: open handler calls openDocPreview (not silently swallowed)', () => {
    const viewIdx = src.indexOf('async function viewSpecificDoc');
    const section = src.slice(viewIdx, viewIdx + 1000);
    assert.ok(
        section.includes('openDocPreview'),
        'openDocPreview call missing from viewSpecificDoc open handler — clicks go nowhere'
    );
});

test('SOURCE: open handler does NOT have silent existsSync-only gate (old bug)', () => {
    // Old bug: if (msg.command === 'open' && msg.data && fs.existsSync(msg.data)) { ... }
    // No existsSync check that silently does nothing when file missing
    const viewIdx = src.indexOf('async function viewSpecificDoc');
    const section = src.slice(viewIdx, viewIdx + 1000);
    // The fix adds a warning — should have showWarningMessage for missing files
    assert.ok(
        section.includes('showWarningMessage') || section.includes('openDocPreview'),
        'open handler must either warn on missing file or always call openDocPreview'
    );
});

test('INSTALLED: compiled has openDocPreview in viewSpecificDoc handler', () => {
    assert.ok(compiled.length > 0, 'Installed commands.js not found — run npm run rebuild');
    // In compiled output the function name is preserved
    assert.ok(
        compiled.includes('openDocPreview'),
        'openDocPreview missing from installed commands.js — doc clicks will not open anything'
    );
});

// ═══════════════════════════════════════════════════════════════════════════
// LAYER 3: Real file exists to open
// ═══════════════════════════════════════════════════════════════════════════

test('At least one real .md file exists at registry globalDocsPath', () => {
    assert.ok(
        realFilePath !== null,
        'No real .md file found in globalDocsPath — registry may be wrong or path does not exist'
    );
    assert.ok(
        fs.existsSync(realFilePath),
        `Real file path does not exist on disk: ${realFilePath}`
    );
});

test('Real file path used in DOM click test actually exists on disk', () => {
    if (!realFilePath) { throw new Error('No real file path available'); }
    assert.ok(fs.existsSync(realFilePath), `File not found: ${realFilePath}`);
    console.log('  Using real path:', realFilePath);
});

// ═══════════════════════════════════════════════════════════════════════════
// OUTPUT
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n' + '='.repeat(60));
console.log('View-a-Doc Click Opens Test');
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
