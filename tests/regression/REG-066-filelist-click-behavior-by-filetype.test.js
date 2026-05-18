// Copyright (c) CieloVista Software. All rights reserved.
// REG-066: FileList click and double-click behavior per file type.
//
// Runs the actual webview script in jsdom and fires real DOM events.
// Asserts exact postMessage output for each file type and click count.
//
// Rules verified:
//  1) Single-click on .js/.ts/.ps1 — only selects, NO postMessage.
//  2) Single-click on .html — posts open-file.
//  3) Double-click on .js/.ts/variants — posts run-file.
//  4) Double-click on .ps1 — posts run-file.
//  5) Double-click on .html — posts run-file.
//  6) Single-click on a non-runnable file (.json, .md) — posts open-file.
//  7) Double-click on a non-runnable file — posts open-file.
//  8) Single-click on a folder — posts navigate-to.
//  9) Double-click on a folder — posts navigate-to.

'use strict';

const fs   = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'features', 'file-list-viewer.ts'),
    'utf8'
);

// ---------------------------------------------------------------------------
// Extract the webview script body from the template literal in buildHtml().
// The script starts after `<script nonce="${nonce}">(function(){` and ends
// before `})();</script>`.
// ---------------------------------------------------------------------------
function extractWebviewScript() {
    const startMarker = '<script nonce="${nonce}">(function(){';
    const endMarker   = '})();</script></body></html>';
    const start = SRC.indexOf(startMarker);
    const end   = SRC.indexOf(endMarker);
    if (start < 0 || end < 0) {
        throw new Error(`Could not locate webview script markers in source. start=${start} end=${end}`);
    }
    return SRC.slice(start + startMarker.length, end);
}

// ---------------------------------------------------------------------------
// Build a minimal HTML page with all the required DOM elements and the
// test entries pre-populated so the script can attach event listeners.
// ---------------------------------------------------------------------------
function buildTestHtml(entries) {
    const rows = entries.map(e => {
        const isDir = e.isDir ? '1' : '0';
        return `<tr data-name="${e.name}" data-is-dir="${isDir}"><td class="col-name">${e.name}</td><td></td><td></td><td></td></tr>`;
    }).join('\n');

    return `<!DOCTYPE html><html><head></head><body>
<button id="up-btn"></button>
<span id="path-display"></span>
<button id="new-folder-btn"></button>
<button id="toggle-hidden" class="toggle-btn on"></button>
<button id="toggle-excludes" class="toggle-btn"></button>
<div id="ctx-menu">
  <button id="ctx-open"></button>
  <button id="ctx-navigate"></button>
  <button id="ctx-reveal"></button>
  <button id="ctx-copy-path"></button>
  <button id="ctx-run"></button>
  <div id="ctx-sep"></div>
  <button id="ctx-run-test"></button>
</div>
<table><thead><tr>
  <th data-col="name"><span class="arrow"></span></th>
  <th data-col="date"><span class="arrow"></span></th>
  <th data-col="type"><span class="arrow"></span></th>
  <th data-col="size"><span class="arrow"></span></th>
</tr></thead>
<tbody id="tbody">${rows}</tbody></table>
<div id="empty"></div>
</body></html>`;
}

// ---------------------------------------------------------------------------
// Run the webview script in a jsdom instance; return a postMessage spy.
// ---------------------------------------------------------------------------
function createWebviewEnv(entries, dir = '/workspace') {
    const posted = [];
    const mockVsc = {
        postMessage: (msg) => posted.push(JSON.parse(JSON.stringify(msg))),
        getState: () => ({}),
        setState: () => {},
    };

    const bootstrapState = JSON.stringify({
        dir,
        entries,
        canGoUp: false,
        sortCol: 'name',
        sortDir: 'asc',
        showHidden: true,
        showExcludes: false,
        selectedNames: [],
    });

    const scriptBody = extractWebviewScript()
        .replace('${bootstrapState}', bootstrapState)
        .replace('${nonce}', 'testnonce');

    const html = buildTestHtml(entries);
    const dom = new JSDOM(html, {
        runScripts: 'dangerously',
        pretendToBeVisual: true,
        url: 'http://localhost/',
        beforeParse(window) {
            window.acquireVsCodeApi = () => mockVsc;
        },
    });

    // Execute the webview script in the jsdom window context
    dom.window.eval(scriptBody);

    // Clear the ready handshake message fired during initialization
    posted.length = 0;

    return { dom, posted };
}

// ---------------------------------------------------------------------------
// Helpers to fire events on a named row
// ---------------------------------------------------------------------------
function getRow(dom, name) {
    const tr = dom.window.document.querySelector(`tr[data-name="${name}"]`);
    if (!tr) { throw new Error(`Row not found for: ${name}`); }
    return tr;
}

function click(dom, name) {
    const tr = getRow(dom, name);
    const td = tr.querySelector('td');
    const evt = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true });
    td.dispatchEvent(evt);
}

function dblclick(dom, name) {
    const tr = getRow(dom, name);
    const td = tr.querySelector('td');
    const evt = new dom.window.MouseEvent('dblclick', { bubbles: true, cancelable: true });
    td.dispatchEvent(evt);
}

// ---------------------------------------------------------------------------
// Test scaffold
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;

function assert(condition, msg) {
    if (condition) {
        console.log(`  PASS ${msg}`);
        passed += 1;
    } else {
        console.error(`  FAIL ${msg}`);
        failed += 1;
    }
}

const ENTRIES = [
    { name: 'script.js',    isDir: false, type: 'js',   size: 100, mtime: 0 },
    { name: 'types.ts',     isDir: false, type: 'ts',   size: 100, mtime: 0 },
    { name: 'deploy.ps1',   isDir: false, type: 'ps1',  size: 100, mtime: 0 },
    { name: 'index.html',   isDir: false, type: 'html', size: 100, mtime: 0 },
    { name: 'data.json',    isDir: false, type: 'json', size: 100, mtime: 0 },
    { name: 'README.md',    isDir: false, type: 'md',   size: 100, mtime: 0 },
    { name: 'src',          isDir: true,  type: 'dir',  size: 0,   mtime: 0 },
];

// ---------------------------------------------------------------------------
// Tests: single-click on runnable non-HTML files — no postMessage (only selection)
// ---------------------------------------------------------------------------
console.log('\nSingle-click on runnable non-HTML files (should NOT post any message):');
(function testSingleClickRunnable() {
    const runnableFiles = ['script.js', 'types.ts', 'deploy.ps1'];
    for (const name of runnableFiles) {
        const { dom, posted } = createWebviewEnv(ENTRIES);
        click(dom, name);
        assert(posted.length === 0,
            `single-click on ${name} → no postMessage (got: ${JSON.stringify(posted)})`);
    }
})();

// ---------------------------------------------------------------------------
// Tests: single-click on HTML file — open-file posted
// ---------------------------------------------------------------------------
console.log('\nSingle-click on HTML file (should post open-file):');
(function testSingleClickHtml() {
    const { dom, posted } = createWebviewEnv(ENTRIES);
    click(dom, 'index.html');
    assert(posted.length === 1 && posted[0].command === 'open-file' && posted[0].name === 'index.html',
        `single-click on index.html → open-file (got: ${JSON.stringify(posted)})`);
})();

// ---------------------------------------------------------------------------
// Tests: double-click on runnable files — run-file posted
// ---------------------------------------------------------------------------
console.log('\nDouble-click on runnable files (should post run-file):');
(function testDblClickRunnableFiles() {
    const runnableFiles = ['script.js', 'types.ts', 'deploy.ps1', 'index.html'];
    for (const name of runnableFiles) {
        const { dom, posted } = createWebviewEnv(ENTRIES);
        dblclick(dom, name);
        assert(posted.length === 1 && posted[0].command === 'run-file' && posted[0].name === name,
            `double-click on ${name} → run-file (got: ${JSON.stringify(posted)})`);
    }
})();

// ---------------------------------------------------------------------------
// Tests: single-click on non-runnable files — open-file posted
// ---------------------------------------------------------------------------
console.log('\nSingle-click on non-runnable files (should post open-file):');
(function testSingleClickNonRunnable() {
    const plainFiles = ['data.json', 'README.md'];
    for (const name of plainFiles) {
        const { dom, posted } = createWebviewEnv(ENTRIES);
        click(dom, name);
        assert(posted.length === 1 && posted[0].command === 'open-file' && posted[0].name === name,
            `single-click on ${name} → open-file (got: ${JSON.stringify(posted)})`);
    }
})();

// ---------------------------------------------------------------------------
// Tests: double-click on non-runnable files — open-file posted
// ---------------------------------------------------------------------------
console.log('\nDouble-click on non-runnable files (should post open-file):');
(function testDblClickNonRunnable() {
    const plainFiles = ['data.json', 'README.md'];
    for (const name of plainFiles) {
        const { dom, posted } = createWebviewEnv(ENTRIES);
        dblclick(dom, name);
        assert(posted.length === 1 && posted[0].command === 'open-file' && posted[0].name === name,
            `double-click on ${name} → open-file (got: ${JSON.stringify(posted)})`);
    }
})();

// ---------------------------------------------------------------------------
// Tests: single-click on folder — navigate-to posted
// ---------------------------------------------------------------------------
console.log('\nSingle-click on folder (should post navigate-to):');
(function testSingleClickFolder() {
    const { dom, posted } = createWebviewEnv(ENTRIES);
    click(dom, 'src');
    assert(posted.length === 1 && posted[0].command === 'navigate-to' && posted[0].name === 'src',
        `single-click on folder src → navigate-to (got: ${JSON.stringify(posted)})`);
})();

// ---------------------------------------------------------------------------
// Tests: double-click on folder — navigate-to posted
// ---------------------------------------------------------------------------
console.log('\nDouble-click on folder (should post navigate-to):');
(function testDblClickFolder() {
    const { dom, posted } = createWebviewEnv(ENTRIES);
    dblclick(dom, 'src');
    assert(posted.length === 1 && posted[0].command === 'navigate-to' && posted[0].name === 'src',
        `double-click on folder src → navigate-to (got: ${JSON.stringify(posted)})`);
})();

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n----------------------------------------------------------------`);
console.log(`REG-066: FileList click behavior by file type`);
console.log(`${passed + failed} checks: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
