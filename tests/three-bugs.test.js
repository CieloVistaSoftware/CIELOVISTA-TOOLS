// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
'use strict';
/**
 * tests/three-bugs.test.js
 *
 * Regression tests for three original bugs, updated for current
 * implementation after multiple refactors (issue #256).
 *
 * BUG-A: Open project folder opens the project in VS Code without replacing
 *   the current workspace
 *   - openProjectFolderSmart uses vscode.openFolder with forceNewWindow true.
 *     This was "forceNewWindow false" until #261 (bebb9aa) changed it on
 *     purpose; REG-029 (#76) locks the new-window behaviour (#736).
 *   - HTTP /openfolder endpoint calls openProjectFolderSmart
 *   - attachMessageHandler openFolder case calls openProjectFolderSmart
 *
 * BUG-B (NPM output Copy to Chat button) is no longer tested here: e29f04c
 *   (#453) deliberately replaced npm-command-launcher.ts and its output
 *   webview with npm-scripts-tree.ts, which runs each script in a real VS Code
 *   terminal (#293). There is no output panel to put the button on (#736).
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
// The compiled checks read the build this checkout produces (esbuild.mjs ->
// out/), never the copy installed on the developer's machine: that made the
// result depend on whatever version happened to be installed, and on a clean
// machine the checks silently skipped (#736). The unit runner builds out/.
const BUILT_CMDS = path.join(__dirname, '..', 'out', 'features', 'doc-catalog', 'commands.js');
const builtCmds  = fs.existsSync(BUILT_CMDS) ? fs.readFileSync(BUILT_CMDS, 'utf8') : '';

const srcCmds = fs.readFileSync(SOURCE_CMDS, 'utf8').replace(/\r\n/g, '\n');

let passed = 0, failed = 0;
const results = [];
function test(name, fn) {
    try { fn(); passed++; results.push({ ok: true, name }); }
    catch(e) { failed++; results.push({ ok: false, name, err: e.message }); }
}

// ═════════════════════════════════════════════════════════════════════════════
// BUG-A: Open project folder → VS Code, current workspace kept
// ═════════════════════════════════════════════════════════════════════════════

test('BUG-A SOURCE: openProjectFolderSmart function exists', () => {
    assert.ok(srcCmds.includes('async function openProjectFolderSmart('));
});

test('BUG-A SOURCE: openProjectFolderSmart uses vscode.openFolder with forceNewWindow true', () => {
    const idx = srcCmds.indexOf('async function openProjectFolderSmart(');
    assert.ok(idx !== -1, 'function not found');
    const slice = srcCmds.slice(idx, idx + 500);
    assert.ok(slice.includes("'vscode.openFolder'"), 'must call vscode.openFolder');
    assert.ok(slice.includes('forceNewWindow: true'), 'must open in a new window, never replace the current workspace (REG-029)');
});

test('BUG-A SOURCE: attachMessageHandler openFolder calls openProjectFolderSmart', () => {
    const idx = srcCmds.indexOf('function attachMessageHandler');
    assert.ok(idx !== -1, 'attachMessageHandler not found');
    const slice = srcCmds.slice(idx, idx + 3000);
    assert.ok(slice.includes("case 'openFolder':"), 'openFolder case missing');
    assert.ok(slice.includes('openProjectFolderSmart'), 'openFolder must delegate to openProjectFolderSmart');
});

// /openfolder now passes the token + registered-project gate first and is
// dispatched by runViewServerAction() (#752).
test('BUG-A SOURCE: HTTP openfolder endpoint calls openProjectFolderSmart', () => {
    const idx = srcCmds.indexOf('function runViewServerAction(');
    assert.ok(idx !== -1, 'runViewServerAction missing from HTTP server');
    const slice = srcCmds.slice(idx, idx + 400);
    assert.ok(slice.includes("route === '/openfolder'"), '/openfolder not dispatched');
    assert.ok(slice.includes('openProjectFolderSmart'), '/openfolder must call openProjectFolderSmart');
});

test('BUG-A COMPILED: out/features/doc-catalog/commands.js has openProjectFolderSmart', () => {
    assert.ok(builtCmds, BUILT_CMDS + ' was not built');
    assert.ok(builtCmds.includes('openProjectFolderSmart'));
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

test('BUG-C COMPILED: out/features/doc-catalog/commands.js has ffe066 and index-searching', () => {
    assert.ok(builtCmds, BUILT_CMDS + ' was not built');
    assert.ok(builtCmds.includes('ffe066') || builtCmds.includes('FFE066'), '#ffe066 missing from compiled');
    assert.ok(builtCmds.includes('index-searching'), 'index-searching missing from compiled');
});

// BUG-C DOM: search adds .hi to matching links
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
