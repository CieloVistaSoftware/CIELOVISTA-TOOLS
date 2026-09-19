// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
'use strict';

/**
 * tests/unit/mcp-markdown-preview-back.test.js
 *
 * The MCP Endpoint Viewer's markdown preview (/md-preview) has a Back button
 * that returns to the page given in its back= parameter, when that page is on
 * the viewer's own server (#780).
 *
 * Runs the delivered page (#846): the mcp-viewer feature from out-test/, the
 * real server its cvs.mcp.viewer.open command starts over a temp registry,
 * and the /md-preview page it serves, in jsdom with its script running
 * (tests/utils/webview-harness.js). Back is clicked the way a user would.
 * Until #846 this test searched index.ts for strings.
 *
 * Run: node scripts/run-unit-tests.js mcp-markdown-preview-back
 */

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const { createWebviewHarness, loadServedPage } = require('../utils/webview-harness');
const { useRegistryHome }                      = require('../utils/registry-fixture');

const VIEWER_OUT = path.join(__dirname, '..', '..', 'out-test', 'features', 'mcp-viewer', 'index.js');
if (!fs.existsSync(VIEWER_OUT)) {
    // Not a skip: the runners build out-test/ first, so this is a real failure.
    console.error(`FAIL: out-test build missing: ${VIEWER_OUT}`);
    process.exit(1);
}

const fx    = useRegistryHome({ 'proj-back': { 'docs/guide.md': '# Guide\n\nThe Back test doc.\n' } });
const GUIDE = fx.file('proj-back', 'docs/guide.md');

const h = createWebviewHarness();
h.install();
const viewer = require(VIEWER_OUT);

let passed = 0, failed = 0;
async function test(name, fn) {
    try { await fn(); console.log(`  PASS ${name}`); passed++; }
    catch (e) { console.error(`  FAIL ${name}\n       -> ${e.message}`); failed++; }
}

(async () => {
    console.log('\nmcp-viewer md-preview Back button\n' + '-'.repeat(50));
    viewer.activate(h.context);
    await h.run('cvs.mcp.viewer.open');
    const viewerUrl = new URL(await h.openedUrl());
    const previewUrl = (back) => {
        const u = new URL('/md-preview', viewerUrl);
        u.searchParams.set('t', viewerUrl.searchParams.get('t'));
        u.searchParams.set('path', GUIDE);
        if (back) { u.searchParams.set('back', back); }
        return u.toString();
    };

    const back = previewUrl();   // a page on this server
    const page = await loadServedPage(previewUrl(back));

    await test('the md-preview page renders the doc with a Back button', () => {
        assert.strictEqual(page.status, 200);
        assert.ok(page.document.querySelector('main').textContent.includes('The Back test doc.'), 'the doc is not shown');
        assert.ok(page.document.getElementById('btn-back'), 'no #btn-back on the page');
    });

    await test("the page's Back target is the back= page", () => {
        assert.strictEqual(page.window.backUrl, back);
    });

    await test('clicking Back goes to the Back target', async () => {
        // jsdom carries out only same-document navigation, so the target is
        // pointed at a #hash of this page; the click handler is the page's own.
        page.window.backUrl = `${page.window.location.href}#came-back`;
        await page.click(page.document.getElementById('btn-back'));
        assert.strictEqual(page.window.location.hash, '#came-back');
    });
    page.close();

    await test('a back= page on another origin is dropped, so Back cannot leave the viewer', async () => {
        const foreign = await loadServedPage(previewUrl('https://example.com/elsewhere'));
        assert.strictEqual(foreign.window.backUrl, '', `the page kept back=${foreign.window.backUrl}`);
        foreign.close();
    });

    viewer.disposeMcpViewerServer();
    fx.dispose();
    console.log('\n' + '-'.repeat(50));
    console.log(`${passed} passed, ${failed} failed`);
    // Not process.exit(): the server's sockets are still closing, and exiting
    // under them crashes Node on Windows (#847).
    process.exitCode = failed ? 1 : 0;
})().catch((e) => { console.error(e && e.stack || String(e)); process.exit(1); });
