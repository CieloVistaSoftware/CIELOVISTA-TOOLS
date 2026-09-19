// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
'use strict';
/**
 * tests/unit/doc-preview-toolbar.test.js
 *
 * Regression test for #267: doc preview toolbar buttons did nothing. btn-edit
 * posted command:'open', which re-opened the file in the preview instead of
 * in the text editor.
 *
 * Runs the delivered page (#846): the doc preview from out-test/, opened on a
 * real file, its page in jsdom with its script running
 * (tests/utils/webview-harness.js). Each toolbar button is clicked, and the
 * test checks the message the page posts and what the extension then does.
 * Until #846 this test searched doc-preview.ts for strings, and stayed green
 * while the page's script did not parse and no button worked (#841).
 *
 * Run: node scripts/run-unit-tests.js doc-preview-toolbar
 */

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const { createWebviewHarness } = require('../utils/webview-harness');
const { useRegistryHome }      = require('../utils/registry-fixture');

const PREVIEW_OUT = path.join(__dirname, '..', '..', 'out-test', 'shared', 'doc-preview.js');
if (!fs.existsSync(PREVIEW_OUT)) {
    // Not a skip: the runners build out-test/ first, so this is a real failure.
    console.error(`FAIL: out-test build missing: ${PREVIEW_OUT}`);
    process.exit(1);
}

const fx  = useRegistryHome({ 'proj-bar': { 'docs/guide.md': '# Guide\n\nThe toolbar test doc.\n' } });
const DOC = fx.file('proj-bar', 'docs/guide.md');
const DIR = path.dirname(DOC);

const h = createWebviewHarness();
// What the extension does with each message, recorded.
const opened = [], terminals = [];
h.vscode.workspace.openTextDocument = async (target) => { opened.push(typeof target === 'string' ? target : target.fsPath); return {}; };
h.vscode.window.createTerminal = (opts) => { terminals.push(opts); return { show: () => undefined, sendText: () => undefined, dispose: () => undefined }; };
h.install();
const docPreview = require(PREVIEW_OUT);

let passed = 0, failed = 0;
async function test(name, fn) {
    try { await fn(); console.log(`  PASS ${name}`); passed++; }
    catch (e) { console.error(`  FAIL ${name}\n       -> ${e.message}`); failed++; }
}

(async () => {
    console.log('\ndoc-preview toolbar regression — #267\n' + '-'.repeat(50));
    docPreview.openDocPreview(DOC);
    const page = await h.page('docPreview');
    const posted = [];
    const receive = page.panel.receive;
    page.panel.receive = (msg) => { posted.push(JSON.parse(JSON.stringify(msg))); return receive(msg); };  // copied out of the page realm
    const click = async (id) => { posted.length = 0; await page.click(`#${id}`); await h.settle(); return posted.slice(); };

    await test('the page shows all four toolbar buttons', () => {
        for (const id of ['btn-edit', 'btn-vscode', 'btn-terminal', 'btn-explorer']) {
            assert.ok(page.document.getElementById(id), `${id} is not on the page`);
        }
    });

    await test("Edit posts 'edit-file' with the doc's path (not 'open'), and the file opens in the editor", async () => {
        const msgs = await click('btn-edit');
        assert.deepStrictEqual(msgs, [{ command: 'edit-file', path: DOC }]);
        assert.deepStrictEqual(opened.slice(-1), [DOC], 'the extension did not open the doc in a text editor');
    });

    await test("Open in VS Code posts 'open-in-vscode', and the doc opens in the editor", async () => {
        opened.length = 0;
        const msgs = await click('btn-vscode');
        assert.deepStrictEqual(msgs, [{ command: 'open-in-vscode', dir: DIR }]);
        assert.deepStrictEqual(opened, [DOC]);
    });

    await test("Change Working Directory posts 'open-terminal', and a terminal opens in the doc's folder", async () => {
        const msgs = await click('btn-terminal');
        assert.deepStrictEqual(msgs, [{ command: 'open-terminal', dir: DIR }]);
        assert.strictEqual(terminals.length && terminals[terminals.length - 1].cwd, DIR);
    });

    await test("Explorer posts 'reveal-folder-os', and the doc is revealed in the Explorer", async () => {
        const msgs = await click('btn-explorer');
        assert.deepStrictEqual(msgs, [{ command: 'reveal-folder-os', dir: DIR }]);
        const last = h.executed[h.executed.length - 1];
        assert.strictEqual(last[0], 'revealInExplorer');
        assert.strictEqual(last[1].fsPath, DOC);
    });

    h.close();
    docPreview.disposeDocPreview();
    fx.dispose();
    console.log('\n' + '-'.repeat(50));
    console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e && e.stack || String(e)); process.exit(1); });
