'use strict';
/**
 * tests/three-bugs.test.js
 *
 * BUG-A: Open project folder not working
 *   - webview JS posts { command:'openFolder', data: path } ✓ (already tested)
 *   - extension host must handle it — verify handler exists with correct command
 *   - must use forceNewWindow:true so it opens a new window not replaces current
 *
 * BUG-B: NPM failed scripts — no way to copy error to clipboard
 *   - after a failed run, a Copy button must appear
 *   - clicking it posts { command:'copyOutput', id, text } to extension host
 *
 * BUG-C: View-a-doc search still not highlighting yellow
 *   - installed compiled file must have search-match CSS with #ffe066
 *   - installed compiled file must have searchEl.addEventListener
 *   - DOM test: typing adds search-match class to matching links
 *
 * Run: node tests/three-bugs.test.js
 */

const assert  = require('assert');
const fs      = require('fs');
const path    = require('path');
const { JSDOM } = require('jsdom');

const INSTALLED_ROOT = path.join(
    process.env.USERPROFILE || 'C:\\Users\\jwpmi',
    '.vscode-insiders', 'extensions',
    'cielovistasoftware.cielovista-tools-1.0.0'
);

const SOURCE_CMDS = path.join(__dirname, '..', 'src', 'features', 'doc-catalog', 'commands.ts');
const SOURCE_NPM  = path.join(__dirname, '..', 'src', 'features', 'npm-command-launcher.ts');
const INST_CMDS   = path.join(INSTALLED_ROOT, 'out', 'features', 'doc-catalog', 'commands.js');
const INST_NPM    = path.join(INSTALLED_ROOT, 'out', 'features', 'npm-command-launcher.js');

// ── Test runner ───────────────────────────────────────────────────────────
let passed = 0, failed = 0;
const results = [];
function test(name, fn) {
    try { fn(); passed++; results.push({ ok: true, name }); }
    catch(e) { failed++; results.push({ ok: false, name, err: e.message }); }
}

// ═══════════════════════════════════════════════════════════════════════════
// BUG-A: Open project folder
// ═══════════════════════════════════════════════════════════════════════════

const srcCmds     = fs.readFileSync(SOURCE_CMDS, 'utf8');
const instCmds    = fs.existsSync(INST_CMDS) ? fs.readFileSync(INST_CMDS, 'utf8') : '';

test('BUG-A SOURCE: viewSpecificDoc openFolder handler exists', () => {
    assert.ok(
        srcCmds.includes("msg.command === 'openFolder'") ||
        srcCmds.includes('msg.command===\'openFolder\''),
        'openFolder handler missing from viewSpecificDoc in source'
    );
});

test('BUG-A SOURCE: openFolder uses forceNewWindow:true (not false)', () => {
    // Find the openFolder handler in viewSpecificDoc (after "viewSpecificDoc")
    const viewDocIdx = srcCmds.indexOf('viewSpecificDoc(): Promise');
    assert.ok(viewDocIdx !== -1, 'viewSpecificDoc function not found');
    const viewDocSection = srcCmds.slice(viewDocIdx, viewDocIdx + 2000);
    const hasFalse = viewDocSection.includes('forceNewWindow: false');
    const hasTrue  = viewDocSection.includes('forceNewWindow: true');
    assert.ok(
        !hasFalse,
        'BUG-A: viewSpecificDoc openFolder uses forceNewWindow:false — should be true. ' +
        'With false, clicking folder REPLACES current workspace (window disappears). With true, opens new window.'
    );
    assert.ok(
        hasTrue,
        'BUG-A: viewSpecificDoc openFolder must use forceNewWindow:true to open in a new window'
    );
});

test('BUG-A SOURCE: attachMessageHandler openFolder also uses forceNewWindow:true', () => {
    // The Doc Catalog panel (attachMessageHandler) also has an openFolder case
    const attachIdx = srcCmds.indexOf('function attachMessageHandler');
    assert.ok(attachIdx !== -1, 'attachMessageHandler not found');
    const attachSection = srcCmds.slice(attachIdx, attachIdx + 3000);
    assert.ok(
        !attachSection.includes('forceNewWindow: false'),
        'BUG-A: attachMessageHandler openFolder uses forceNewWindow:false — should be true'
    );
});

test('BUG-A INSTALLED: compiled openFolder uses forceNewWindow:true (not false)', () => {
    assert.ok(instCmds.length > 0, 'Installed commands.js not found — run npm run rebuild');
    // tsc compiles false as false, true as true
    const hasTrue  = instCmds.includes('forceNewWindow: true')  || instCmds.includes('forceNewWindow:true');
    const hasFalse = instCmds.includes('forceNewWindow: false') || instCmds.includes('forceNewWindow:false');
    assert.ok(hasTrue,  'BUG-A INSTALLED: forceNewWindow:true not found in compiled output — rebuild needed');
    assert.ok(!hasFalse,'BUG-A INSTALLED: forceNewWindow:false still in compiled output — rebuild needed');
});

// ═══════════════════════════════════════════════════════════════════════════
// BUG-B: NPM copy error to clipboard
// ═══════════════════════════════════════════════════════════════════════════

const srcNpm  = fs.readFileSync(SOURCE_NPM, 'utf8');
const instNpm = fs.existsSync(INST_NPM) ? fs.readFileSync(INST_NPM, 'utf8') : '';

test('BUG-B SOURCE: npm-command-launcher has copy button markup (btn-copy or data-action="copy")', () => {
    assert.ok(
        srcNpm.includes('btn-copy') || srcNpm.includes('data-action="copy"') || srcNpm.includes("data-action='copy'"),
        'BUG-B: No copy button in npm-command-launcher source. ' +
        'After a run (success or failure) a Copy button must appear to copy output to clipboard.'
    );
});

test('BUG-B SOURCE: copy action posts copyOutput message', () => {
    assert.ok(
        srcNpm.includes("command: 'copyOutput'") || srcNpm.includes("command:'copyOutput'") ||
        srcNpm.includes('clipboard') || srcNpm.includes('navigator.clipboard'),
        'BUG-B: Copy button must either post copyOutput message or call navigator.clipboard.writeText'
    );
});

test('BUG-B SOURCE: copy button appears after done (not just on failure)', () => {
    // Copy should be useful after ANY run — success or failure
    const doneSection = srcNpm.slice(srcNpm.indexOf("m.type === 'done'") || 0);
    assert.ok(
        srcNpm.includes('btn-copy'),
        'BUG-B: btn-copy must be present in the JS template to appear after done'
    );
});

// DOM test for copy button
function extractNpmJsTemplate(src) {
    const marker = 'const JS = `';
    const idx    = src.indexOf(marker);
    if (idx === -1) { return null; }
    let i = idx + marker.length;
    let out = '';
    while (i < src.length) {
        if (src[i] === '`' && src[i-1] !== '\\') break;
        out += src[i++];
    }
    return out;
}

const npmJsTemplate = extractNpmJsTemplate(srcNpm);

test('BUG-B DOM: copy button appears after successful run (exit 0)', () => {
    if (!npmJsTemplate) { throw new Error('Could not extract JS template from npm-command-launcher.ts'); }

    const TEST_ID = 'proj-build-001';
    const rendered = npmJsTemplate
        .replace(/\$\{scriptsJson\}/g, JSON.stringify([{id: TEST_ID, folder:'proj', scriptName:'build', cmd:'tsc', packageJsonPath:'C:\\proj\\package.json'}]))
        .replace(/\$\{total\}/g, '1');

    const html = `<!DOCTYPE html><html><head></head><body>
<input id="search" type="text"><span id="stat"></span><div id="empty"></div>
<div class="folder-section">
  <div class="folder-cards">
    <div class="script-card" data-id="${TEST_ID}" data-name="build" data-folder="proj">
      <div class="sc-header"><div class="sc-name">build</div><div class="sc-cmd">tsc</div></div>
      <div class="sc-btns">
        <button class="btn-run"  data-action="run"  data-id="${TEST_ID}">&#9654; Run</button>
        <button class="btn-stop" data-action="stop" data-id="${TEST_ID}" style="display:none">Stop</button>
        <button class="btn-fix"  data-action="fix"  data-id="${TEST_ID}" data-pkg="C:\\proj\\package.json" style="display:none">Fix</button>
        <button class="btn-copy" data-action="copy" data-id="${TEST_ID}" style="display:none">&#128203; Copy</button>
      </div>
      <div class="sc-output" style="display:none"><pre class="sc-pre"></pre><div class="sc-rc"></div></div>
    </div>
  </div>
</div>
<script>${rendered}</script></body></html>`;

    const messages = [];
    const dom = new JSDOM(html, {
        runScripts: 'dangerously',
        pretendToBeVisual: true,
        beforeParse(win) {
            win.acquireVsCodeApi = () => ({ postMessage: m => messages.push(m), getState: () => null, setState: () => {} });
            win.CSS = { escape: s => String(s) }; // IDs are safe alphanum — no escaping needed
            win.requestAnimationFrame = fn => setTimeout(fn, 0);
        },
    });

    // Simulate exit 0
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
        data: { type: 'done', id: TEST_ID, rc: 0 }
    }));

    const card    = dom.window.document.querySelector('.script-card');
    const copyBtn = card && card.querySelector('[data-action="copy"], .btn-copy');
    assert.ok(
        copyBtn,
        'BUG-B DOM: No copy button found after exit 0 — must appear after any run completes'
    );
    assert.ok(
        !copyBtn || copyBtn.style.display !== 'none',
        'BUG-B DOM: Copy button must be visible after exit 0'
    );
});

test('BUG-B DOM: copy button appears after failed run (exit 1)', () => {
    if (!npmJsTemplate) { throw new Error('Could not extract JS template'); }

    const TEST_ID2 = 'proj-clean-002';
    const rendered = npmJsTemplate
        .replace(/\$\{scriptsJson\}/g, JSON.stringify([{id: TEST_ID2, folder:'proj', scriptName:'clean', cmd:'pwsh', packageJsonPath:'C:\\proj\\package.json'}]))
        .replace(/\$\{total\}/g, '1');

    const html = `<!DOCTYPE html><html><head></head><body>
<input id="search" type="text"><span id="stat"></span><div id="empty"></div>
<div class="folder-section">
  <div class="folder-cards">
    <div class="script-card" data-id="${TEST_ID2}" data-name="clean" data-folder="proj">
      <div class="sc-header"><div class="sc-name">clean</div><div class="sc-cmd">pwsh</div></div>
      <div class="sc-btns">
        <button class="btn-run"  data-action="run"  data-id="${TEST_ID2}">Run</button>
        <button class="btn-stop" data-action="stop" data-id="${TEST_ID2}" style="display:none">Stop</button>
        <button class="btn-fix"  data-action="fix"  data-id="${TEST_ID2}" data-pkg="C:\\proj\\package.json" style="display:none">Fix</button>
        <button class="btn-copy" data-action="copy" data-id="${TEST_ID2}" style="display:none">&#128203; Copy</button>
      </div>
      <div class="sc-output" style="display:none"><pre class="sc-pre">pwsh not found</pre><div class="sc-rc"></div></div>
    </div>
  </div>
</div>
<script>${rendered}</script></body></html>`;

    const messages = [];
    const dom = new JSDOM(html, {
        runScripts: 'dangerously', pretendToBeVisual: true,
        beforeParse(win) {
            win.acquireVsCodeApi = () => ({ postMessage: m => messages.push(m), getState: () => null, setState: () => {} });
            win.CSS = { escape: s => String(s) }; // IDs are safe alphanum
            win.requestAnimationFrame = fn => setTimeout(fn, 0);
        },
    });

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
        data: { type: 'done', id: TEST_ID2, rc: 1 }
    }));

    const card    = dom.window.document.querySelector('.script-card');
    const copyBtn = card && card.querySelector('[data-action="copy"], .btn-copy');
    assert.ok(
        copyBtn,
        'BUG-B DOM: No copy button found after exit 1 — must appear after any run completes'
    );
    assert.ok(
        !copyBtn || copyBtn.style.display !== 'none',
        'BUG-B DOM: Copy button must be visible after failed run'
    );
});

// ═══════════════════════════════════════════════════════════════════════════
// BUG-C: View-a-doc search yellow highlight
// ═══════════════════════════════════════════════════════════════════════════

test('BUG-C INSTALLED: commands.js has search-match CSS with #ffe066', () => {
    assert.ok(instCmds.length > 0, 'Installed commands.js not found');
    assert.ok(
        instCmds.includes('ffe066') || instCmds.includes('FFE066'),
        'BUG-C: Yellow #ffe066 search-match color missing from installed commands.js'
    );
});

test('BUG-C INSTALLED: commands.js has searchEl.addEventListener', () => {
    assert.ok(
        instCmds.includes('searchEl.addEventListener'),
        'BUG-C: searchEl.addEventListener missing from installed commands.js — search never wires up'
    );
});

test('BUG-C INSTALLED: commands.js has search-match class assignment', () => {
    assert.ok(
        instCmds.includes('search-match'),
        'BUG-C: search-match class assignment missing from installed commands.js'
    );
});

// DOM test: search actually adds the class and yellow shows
function extractViewDocJsTemplate(src) {
    const fnStart = src.indexOf('function buildViewDocHtml(');
    if (fnStart === -1) { return null; }
    const scope  = src.slice(fnStart);
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

const viewDocJs = extractViewDocJsTemplate(srcCmds);

test('BUG-C DOM: search adds search-match class to matching links', () => {
    assert.ok(viewDocJs, 'Could not extract View Doc JS template from source');

    const rendered = viewDocJs
        .replace(/\$\{totalDocs\}/g, '3')
        .replace(/\$\{totalProjects\}/g, '2');

    const html = `<!DOCTYPE html><html><head></head><body>
<input id="search" type="text"><span id="stat">3 docs</span>
<div id="content">
  <table>
    <thead><tr><th>Folder</th><th>Documents</th></tr></thead>
    <tbody>
      <tr>
        <td class="folder-cell"><span class="folder-name">global</span></td>
        <td class="links-cell">
          <a class="doc-link doc-link-priority" href="#" data-path="C:\\s\\README.md">ReadMe Global</a>
          <a class="doc-link" href="#" data-path="C:\\s\\NOTES.md">Project Notes</a>
        </td>
      </tr>
    </tbody>
  </table>
  <div id="empty">No docs.</div>
</div>
<div id="copy-toast"></div>
<script>${rendered}</script></body></html>`;

    const messages = [];
    const dom = new JSDOM(html, {
        runScripts: 'dangerously', pretendToBeVisual: true,
        beforeParse(win) {
            win.acquireVsCodeApi = () => ({ postMessage: m => messages.push(m), getState: () => null, setState: () => {} });
            win.requestAnimationFrame = fn => setTimeout(fn, 0);
        },
    });

    const doc    = dom.window.document;
    const search = doc.getElementById('search');
    assert.ok(search, 'search input must exist');

    search.value = 'readme';
    search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));

    const readmeLink = [...doc.querySelectorAll('.doc-link')].find(l => l.textContent.includes('ReadMe'));
    assert.ok(readmeLink, 'README link must exist');
    assert.ok(
        readmeLink.classList.contains('search-match'),
        'BUG-C DOM: README link does NOT have search-match class after typing "readme". ' +
        'Search filter not working — link will not show yellow highlight.'
    );
});

test('BUG-C SOURCE: buildViewDocHtml CSS has search-match #ffe066', () => {
    assert.ok(
        srcCmds.includes('ffe066'),
        'BUG-C SOURCE: #ffe066 yellow color missing from buildViewDocHtml CSS'
    );
});

test('BUG-C SOURCE: .searching .doc-link:not(.search-match) display:none present', () => {
    assert.ok(
        srcCmds.includes('.searching .doc-link:not(.search-match)'),
        'BUG-C SOURCE: searching filter CSS missing — non-matching links will not hide'
    );
});

// ═══════════════════════════════════════════════════════════════════════════
// OUTPUT
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n' + '='.repeat(65));
console.log('Three-Bug Regression Tests');
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
