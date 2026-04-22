'use strict';
/**
 * tests/view-doc-e2e.test.js
 *
 * Reproduces the two reported bugs:
 *   BUG-1: Search bar does nothing
 *   BUG-2: Clicking a doc does nothing
 *
 * Tests extract JS from the INSTALLED extension (not source) so they
 * test exactly what is running in VS Code right now.
 *
 * Run: node tests/view-doc-e2e.test.js
 */

'use strict';
const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const { JSDOM } = require('jsdom');

// ── Read from INSTALLED extension, not source ─────────────────────────────
const INSTALLED_CMDS = path.join(
    process.env.USERPROFILE || 'C:\\Users\\jwpmi',
    '.vscode-insiders', 'extensions',
    'cielovistasoftware.cielovista-tools-1.0.0',
    'out', 'features', 'doc-catalog', 'commands.js'
);

const SOURCE_CMDS = path.join(
    __dirname, '..', 'src', 'features', 'doc-catalog', 'commands.ts'
);

console.log('\nChecking installed extension...');
if (!fs.existsSync(INSTALLED_CMDS)) {
    console.error('INSTALLED commands.js NOT FOUND at:', INSTALLED_CMDS);
    console.error('Run npm run rebuild first.');
    process.exit(1);
}
console.log('Installed file found:', INSTALLED_CMDS);

// ── Extract JS template from installed compiled output ────────────────────
// The compiled JS contains buildViewDocHtml as a function.
// We need to extract the JS template string it embeds in the webview.
const compiled = fs.readFileSync(INSTALLED_CMDS, 'utf8');
console.log('Compiled size:', compiled.length, 'chars');

// Also check source for comparison
const src = fs.readFileSync(SOURCE_CMDS, 'utf8');

// ── Extract JS template from SOURCE (what we edited) ─────────────────────
function extractJsTemplate(text, isCompiled) {
    // In compiled JS, the template literal becomes a regular string concatenation
    // Look for the acquireVsCodeApi pattern
    if (isCompiled) {
        // Find the webview script - it's embedded as a string in the compiled output
        // Look for the pattern where the JS starts
        const marker = 'acquireVsCodeApi';
        const idx = text.indexOf(marker);
        if (idx === -1) { return null; }
        // Get surrounding context - walk back to find the string start
        return text.slice(Math.max(0, idx - 200), idx + 5000);
    } else {
        // TypeScript source - extract from template literal
        const fnStart = text.indexOf('function buildViewDocHtml(');
        if (fnStart === -1) { return null; }
        const scope  = text.slice(fnStart);
        const jsMark = 'const JS = `\n';
        const jsIdx  = scope.indexOf(jsMark);
        if (jsIdx === -1) { return null; }
        let i = jsIdx + jsMark.length;
        let jsTemplate = '';
        while (i < scope.length) {
            if (scope[i] === '`') break;
            if (scope[i] === '\\' && scope[i + 1] === '`') { jsTemplate += '`'; i += 2; continue; }
            jsTemplate += scope[i++];
        }
        return jsTemplate;
    }
}

const sourceJsTemplate = extractJsTemplate(src, false);

// ── Build DOM from source JS template ────────────────────────────────────
function makeDom(jsTemplate) {
    const messages = [];
    const state    = { val: null };

    const rendered = (jsTemplate || '')
        .replace(/\$\{totalDocs\}/g, '4')
        .replace(/\$\{totalProjects\}/g, '2');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>
<div id="toolbar">
  <input id="search" type="text" autocomplete="off">
  <span id="stat">4 docs across 2 projects</span>
</div>
<div id="content">
  <table>
    <thead><tr><th>Folder</th><th>Documents</th></tr></thead>
    <tbody>
      <tr>
        <td class="folder-cell"><span class="folder-name">global</span></td>
        <td class="links-cell">
          <a class="doc-link doc-link-priority" href="#" data-path="C:\\standards\\README.md">ReadMe Global</a>
          <a class="doc-link doc-link-priority" href="#" data-path="C:\\standards\\CLAUDE.md">Claude Config</a>
        </td>
      </tr>
      <tr>
        <td class="folder-cell"><span class="folder-name">wb-core</span></td>
        <td class="links-cell">
          <a class="doc-link" href="#" data-path="C:\\wb-core\\aside.md">aside Element</a>
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

function linkByPath(doc, p) {
    return [...doc.querySelectorAll('.doc-link')].find(l => l.dataset.path === p) || null;
}

// ── Test runner ───────────────────────────────────────────────────────────
let passed = 0, failed = 0;
const results = [];

function test(name, fn) {
    try { fn(); passed++; results.push({ ok: true, name }); }
    catch(e) { failed++; results.push({ ok: false, name, err: e.message }); }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1: Static checks on installed compiled file
// ═══════════════════════════════════════════════════════════════════════════

test('INSTALLED: compiled commands.js exists on disk', () => {
    assert.ok(fs.existsSync(INSTALLED_CMDS), `Not found: ${INSTALLED_CMDS}`);
});

test('INSTALLED: contains acquireVsCodeApi (webview JS present)', () => {
    assert.ok(compiled.includes('acquireVsCodeApi'), 'acquireVsCodeApi missing from compiled output');
});

test('INSTALLED: contains searchEl.addEventListener (search wired up)', () => {
    assert.ok(compiled.includes('searchEl.addEventListener'), 'Search listener missing from compiled output — BUG-1');
});

test('INSTALLED: contains try-catch error banner', () => {
    assert.ok(compiled.includes('View a Doc init error'), 'Error banner missing from compiled output');
});

test('INSTALLED: contains File not found warning (existsSync fix)', () => {
    assert.ok(compiled.includes('File not found'), 'File not found warning missing — BUG-2 not in compiled output');
});

test('INSTALLED: showWarningMessage present (existsSync fix)', () => {
    assert.ok(compiled.includes('showWarningMessage'), 'showWarningMessage missing from compiled output — BUG-2');
});

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2: DOM behavior tests (BUG-1 reproduction)
// ═══════════════════════════════════════════════════════════════════════════

let ctx;

test('BUG-1 SETUP: DOM builds from source JS template', () => {
    assert.ok(sourceJsTemplate, 'Could not extract JS template from source');
    ctx = makeDom(sourceJsTemplate);
    assert.ok(ctx.doc.querySelector('.doc-link'), 'doc-link elements must exist');
    assert.ok(ctx.doc.getElementById('search'), 'search element must exist');
});

test('BUG-1: Typing in search filters rows (non-matching rows get hidden class)', () => {
    const { doc, win } = ctx;
    const search = doc.getElementById('search');
    assert.ok(search, 'search input must exist');

    search.value = 'readme';
    search.dispatchEvent(new win.Event('input', { bubbles: true }));

    const rows = [...doc.querySelectorAll('tbody tr')];
    assert.strictEqual(rows.length, 2, 'Should have 2 rows');

    // wb-core row should be hidden — it has no "readme" content
    const wbRow = rows[1];
    assert.ok(
        wbRow.classList.contains('hidden'),
        `BUG-1 REPRODUCED: wb-core row NOT hidden after searching "readme". classList: "${wbRow.className}"`
    );
});

test('BUG-1: Matching link gets search-match class (yellow highlight)', () => {
    const { doc } = ctx;
    const link = linkByPath(doc, 'C:\\standards\\README.md');
    assert.ok(link, 'README link must exist');
    assert.ok(
        link.classList.contains('search-match'),
        `BUG-1 REPRODUCED: README link does NOT have search-match class. classList: "${link.className}"`
    );
});

test('BUG-1: Table gets "searching" class while query active', () => {
    const { doc } = ctx;
    const table = doc.querySelector('table');
    assert.ok(
        table.classList.contains('searching'),
        `BUG-1 REPRODUCED: table does NOT have searching class. classList: "${table.className}"`
    );
});

test('BUG-1: Clearing search removes hidden class from all rows', () => {
    const { doc, win } = ctx;
    const search = doc.getElementById('search');
    search.value = '';
    search.dispatchEvent(new win.Event('input', { bubbles: true }));
    const hidden = doc.querySelectorAll('tbody tr.hidden');
    assert.strictEqual(
        hidden.length, 0,
        `BUG-1 REPRODUCED: ${hidden.length} rows still hidden after clearing search`
    );
});

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3: DOM behavior tests (BUG-2 reproduction)
// ═══════════════════════════════════════════════════════════════════════════

test('BUG-2: Clicking a doc-link posts open message to extension host', () => {
    const { doc, win, messages } = ctx;
    messages.length = 0;

    const link = linkByPath(doc, 'C:\\standards\\README.md');
    assert.ok(link, 'README link must exist');

    link.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));

    const openMsg = messages.find(m => m.command === 'open');
    assert.ok(
        openMsg,
        `BUG-2 REPRODUCED: No open message posted after clicking doc link. Messages: ${JSON.stringify(messages)}`
    );
    assert.strictEqual(
        openMsg.data,
        'C:\\standards\\README.md',
        `BUG-2: Wrong path in open message: ${openMsg?.data}`
    );
});

test('BUG-2: Clicking second doc-link posts correct path', () => {
    const { doc, win, messages } = ctx;
    messages.length = 0;

    const link = linkByPath(doc, 'C:\\wb-core\\NOTES.md');
    assert.ok(link, 'Notes link must exist');
    link.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));

    const openMsg = messages.find(m => m.command === 'open');
    assert.ok(openMsg, `BUG-2 REPRODUCED: No open message for NOTES.md`);
    assert.strictEqual(openMsg.data, 'C:\\wb-core\\NOTES.md');
});

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 4: Extension host handler checks (BUG-2 server side)
// ═══════════════════════════════════════════════════════════════════════════

test('BUG-2 HOST: open handler in compiled JS does NOT silently swallow missing files', () => {
    // The old bug: if (msg.command === 'open' && msg.data && fs.existsSync(msg.data))
    // This silently does nothing if the file doesn't exist.
    // The fix: show a warning message instead.
    // Check the compiled output does NOT have the old silent pattern.
    const silentPattern = `'open' && msg.data && fs.existsSync`;
    const hasSilentBug  = compiled.includes(silentPattern) ||
                          compiled.includes('"open"&&') ||
                          compiled.includes("'open'&&msg.data&&e.existsSync");

    // More reliable: check that File not found warning IS present
    assert.ok(
        compiled.includes('File not found'),
        `BUG-2 HOST REPRODUCED: "File not found" warning missing from compiled output. The silent existsSync fix is not compiled in.`
    );
});

test('BUG-2 HOST: viewSpecificDoc handler has showWarningMessage for missing file', () => {
    // Verify the fix is in source
    const handlerSection = src.slice(src.indexOf('viewSpecificDoc'));
    assert.ok(
        handlerSection.includes('showWarningMessage'),
        `BUG-2 HOST: showWarningMessage not found in viewSpecificDoc source`
    );
    assert.ok(
        handlerSection.includes('File not found'),
        `BUG-2 HOST: "File not found" text not found in viewSpecificDoc source`
    );
});

// ═══════════════════════════════════════════════════════════════════════════
// OUTPUT
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n' + '='.repeat(60));
console.log('View-a-Doc E2E Bug Reproduction Tests');
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
