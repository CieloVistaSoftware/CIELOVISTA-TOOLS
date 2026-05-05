// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
'use strict';
/**
 * tests/three-bugs.test.js
 *
 * Regression tests for three original bugs, updated for current
 * implementation after multiple refactors (issue #256).
 *
 * BUG-A: Open project folder opens a new window
 *   - openProjectFolderSmart uses positional true (not false)
 *   - HTTP /openfolder endpoint calls openProjectFolderSmart
 *   - attachMessageHandler openFolder case calls openProjectFolderSmart
 *
 * BUG-B: NPM output has a Copy to Chat button (btn-chat / copy-to-chat)
 *   - btn-chat class in npm-command-launcher.ts
 *   - Clicking posts { command:'copy-to-chat' } to extension host
 *   - Extension host calls sendToCopilotChat + showInformationMessage
 *
 * BUG-C: View-a-doc search highlights matching links with #ffe066 yellow
 *   - CSS uses .hi class and .index-searching (not old .search-match / .searching)
 *   - buildViewDocBrowserHtml is the current function name
 *   - DOM: typing adds .hi to matching links
 *
 * Run: node tests/three-bugs.test.js
 */

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const { JSDOM } = require('jsdom');

const SOURCE_CMDS = path.join(__dirname, '..', 'src', 'features', 'doc-catalog', 'commands.ts');
const SOURCE_NPM  = path.join(__dirname, '..', 'src', 'features', 'npm-command-launcher.ts');

// Resolve installed extension dynamically
const extDir       = path.join(process.env.USERPROFILE || 'C:\\Users\\jwpmi', '.vscode-insiders', 'extensions');
const installedExt = fs.existsSync(extDir)
    ? fs.readdirSync(extDir).find(d => d.startsWith('cielovistasoftware.cielovista-tools-'))
    : null;
function installedFilePath(...parts) {
    return installedExt ? path.join(extDir, installedExt, ...parts) : null;
}
const instCmdsPath = installedFilePath('out', 'features', 'doc-catalog', 'commands.js');
const instCmds     = (instCmdsPath && fs.existsSync(instCmdsPath)) ? fs.readFileSync(instCmdsPath, 'utf8') : '';

const srcCmds = fs.readFileSync(SOURCE_CMDS, 'utf8').replace(/\r\n/g, '\n');
const srcNpm  = fs.readFileSync(SOURCE_NPM,  'utf8').replace(/\r\n/g, '\n');

let passed = 0, failed = 0;
const results = [];
function test(name, fn) {
    try { fn(); passed++; results.push({ ok: true, name }); }
    catch(e) { failed++; results.push({ ok: false, name, err: e.message }); }
}

// ═════════════════════════════════════════════════════════════════════════════
// BUG-A: Open project folder → new window
// ═════════════════════════════════════════════════════════════════════════════

test('BUG-A SOURCE: openProjectFolderSmart function exists', () => {
    assert.ok(srcCmds.includes('async function openProjectFolderSmart('));
});

test('BUG-A SOURCE: openProjectFolderSmart uses positional true (new-window)', () => {
    const idx = srcCmds.indexOf('async function openProjectFolderSmart(');
    assert.ok(idx !== -1, 'function not found');
    const slice = srcCmds.slice(idx, idx + 500);
    assert.ok(slice.includes("'vscode.openFolder'"), 'must call vscode.openFolder');
    assert.ok(slice.includes(', true)'), 'positional true required to open in new window');
    assert.ok(!slice.includes(', false)'), 'positional false would replace current window');
});

test('BUG-A SOURCE: attachMessageHandler openFolder calls openProjectFolderSmart', () => {
    const idx = srcCmds.indexOf('function attachMessageHandler');
    assert.ok(idx !== -1, 'attachMessageHandler not found');
    const slice = srcCmds.slice(idx, idx + 3000);
    assert.ok(slice.includes("case 'openFolder':"), 'openFolder case missing');
    assert.ok(slice.includes('openProjectFolderSmart'), 'openFolder must delegate to openProjectFolderSmart');
});

test('BUG-A SOURCE: HTTP openfolder endpoint calls openProjectFolderSmart', () => {
    const serverPattern = "pathname === '/openfolder'";
    const idx = srcCmds.indexOf(serverPattern);
    assert.ok(idx !== -1, "Server handler \"pathname === '/openfolder'\" missing from HTTP server");
    const slice = srcCmds.slice(idx, idx + 400);
    assert.ok(slice.includes('openProjectFolderSmart'), '/openfolder server handler must call openProjectFolderSmart');
});

test('BUG-A INSTALLED: compiled commands.js has openProjectFolderSmart', () => {
    if (!instCmds) { console.log('    (SKIP: not installed)'); return; }
    assert.ok(instCmds.includes('openProjectFolderSmart'));
});

// ═════════════════════════════════════════════════════════════════════════════
// BUG-B: NPM Copy to Chat button
// ═════════════════════════════════════════════════════════════════════════════

test('BUG-B SOURCE: btn-chat class present (replaces old btn-copy / btn-ask)', () => {
    assert.ok(srcNpm.includes('btn-chat'), 'btn-chat missing from source');
    assert.ok(!srcNpm.includes('btn-copy'), 'old btn-copy still present');
});

test('BUG-B SOURCE: copy-to-chat command posted on click', () => {
    assert.ok(
        srcNpm.includes("command:'copy-to-chat'") || srcNpm.includes("command: 'copy-to-chat'"),
        'copy-to-chat command missing'
    );
});

test('BUG-B SOURCE: extension host handles copy-to-chat', () => {
    assert.ok(
        srcNpm.includes("msg.command === 'copy-to-chat'") || srcNpm.includes("'copy-to-chat'"),
        'copy-to-chat handler missing from extension host'
    );
});

test('BUG-B SOURCE: handler calls sendToCopilotChat (clipboard + chat integration)', () => {
    assert.ok(
        srcNpm.includes('sendToCopilotChat') || srcNpm.includes('clipboard.writeText'),
        'handler must call sendToCopilotChat or clipboard.writeText'
    );
});

test('BUG-B SOURCE: btn-chat gets .show class after job done', () => {
    assert.ok(srcNpm.includes("classList.add('show')"), 'btn-chat must get .show on done');
});

// ═════════════════════════════════════════════════════════════════════════════
// BUG-C: View-a-doc yellow search highlight
// ═════════════════════════════════════════════════════════════════════════════

test('BUG-C SOURCE: buildViewDocBrowserHtml function exists', () => {
    assert.ok(srcCmds.includes('function buildViewDocBrowserHtml('), 'old buildViewDocHtml was renamed');
});

test('BUG-C SOURCE: #ffe066 yellow in CSS', () => {
    assert.ok(srcCmds.includes('ffe066'), '#ffe066 missing from search-match CSS');
});

test('BUG-C SOURCE: .hi class used for matches (not old .search-match)', () => {
    assert.ok(srcCmds.includes('.hi') || srcCmds.includes("'hi'"), '.hi class missing');
    assert.ok(!srcCmds.includes('.search-match'), 'old .search-match still present — should be .hi');
});

test('BUG-C SOURCE: .index-searching used (not old .searching)', () => {
    assert.ok(srcCmds.includes('index-searching'), '.index-searching missing');
    assert.ok(
        !srcCmds.includes('.searching .doc-link:not(.search-match)'),
        'old .searching/.search-match CSS still present'
    );
});

test('BUG-C INSTALLED: compiled commands.js has ffe066 and index-searching', () => {
    if (!instCmds) { console.log('    (SKIP: not installed)'); return; }
    assert.ok(instCmds.includes('ffe066') || instCmds.includes('FFE066'), '#ffe066 missing from compiled');
    assert.ok(instCmds.includes('index-searching'), 'index-searching missing from compiled');
});

// BUG-C DOM: search adds .hi class to matching links
function extractBrowserViewScript(src) {
    const fnStart = src.indexOf('function buildViewDocBrowserHtml(');
    if (fnStart === -1) { return null; }
    const scope  = src.slice(fnStart);
    const sStart = scope.indexOf('<script>');
    const sEnd   = scope.indexOf('</script>');
    if (sStart === -1 || sEnd === -1) { return null; }
    return scope.slice(sStart + '<script>'.length, sEnd)
        .replace(/\$\{port\}/g, '9999')
        .replace(/\$\{totalDocs\}/g, '3');
}

const viewScript = extractBrowserViewScript(srcCmds);

test('BUG-C DOM: search adds .hi class to matching links', () => {
    assert.ok(viewScript, 'Could not extract View-Doc browser script');

    const html = `<!DOCTYPE html><html><head></head><body>
<div id="topbar">
  <input id="search" type="text" autocomplete="off">
  <select id="proj-filter"><option value="">All</option></select>
  <span id="stat">3 docs</span>
</div>
<div id="split">
  <div id="index">
    <div class="proj-group" data-proj="global">
      <div class="proj-hd"><span class="dw">000</span><span class="fn">global</span></div>
      <div class="proj-links">
        <a class="doc-link" href="#" data-path="C:\\s\\README.md">ReadMe Global</a>
        <a class="doc-link" href="#" data-path="C:\\s\\NOTES.md">Project Notes</a>
      </div>
    </div>
    <div id="idx-empty">No matches</div>
  </div>
  <div id="resize-handle"></div>
  <div id="viewer">
    <div id="viewer-bar"><span id="viewer-path">Select a doc</span>
      <button id="btn-copy-path" style="display:none">Copy</button></div>
    <div id="welcome">Welcome</div>
    <iframe id="doc-frame" style="display:none"></iframe>
  </div>
</div>
<div id="toast"></div>
<script>${viewScript}</script>
</body></html>`;

    const dom = new JSDOM(html, {
        runScripts: 'dangerously',
        pretendToBeVisual: true,
        beforeParse(win) {
            win.fetch = () => Promise.resolve({ ok: true, text: () => Promise.resolve('') });
            try { Object.defineProperty(win, 'localStorage', { value: { getItem: () => null, setItem: () => {} }, configurable: true }); } catch(e) {}
        },
    });

    const doc    = dom.window.document;
    const search = doc.getElementById('search');
    assert.ok(search, '#search input must exist');

    search.value = 'readme';
    search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));

    const hiLinks = doc.querySelectorAll('.doc-link.hi');
    assert.ok(hiLinks.length >= 1, 'No .doc-link got .hi class after typing "readme"');

    const index = doc.getElementById('index');
    assert.ok(index && index.classList.contains('index-searching'), '#index must have .index-searching class during search');

    const readmeLink = [...doc.querySelectorAll('.doc-link')].find(l => l.textContent.includes('ReadMe'));
    assert.ok(readmeLink && readmeLink.classList.contains('hi'), 'README link must have .hi class after search');
});

// ═════════════════════════════════════════════════════════════════════════════
// OUTPUT
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n' + '='.repeat(65));
console.log('Three-Bug Regression Tests (updated for current architecture)');
console.log('='.repeat(65));
for (const r of results) {
    const icon = r.ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
    console.log(`  ${icon}  ${r.name}`);
    if (!r.ok) console.log(`         \x1b[31m→ ${r.err}\x1b[0m`);
}
console.log('='.repeat(65));
const failStr = failed > 0 ? `\x1b[31m${failed} failed\x1b[0m` : '0 failed';
console.log(`${passed + failed} tests: \x1b[32m${passed} passed\x1b[0m, ${failStr}\n`);
if (failed > 0) { process.exit(1); }
