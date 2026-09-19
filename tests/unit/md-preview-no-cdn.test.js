// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
'use strict';
/**
 * tests/unit/md-preview-no-cdn.test.js
 *
 * Regression for #326: md-preview must not load marked.js from a CDN. The
 * VS Code webview CSP (default-src 'none') and Edge Tracking Prevention both
 * block external script sources. Markdown is rendered on the server with
 * src/shared/md-renderer.ts before the page is sent.
 *
 * Runs the delivered page (#846): the mcp-viewer feature from out-test/, the
 * real server its cvs.mcp.viewer.open command starts over a temp registry,
 * and the /md-preview page it serves, in jsdom with its script running
 * (tests/utils/webview-harness.js). Until #846 this test searched index.ts
 * for strings.
 *
 * Run: node scripts/run-unit-tests.js md-preview-no-cdn
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

const fx    = useRegistryHome({
    'proj-cdn': { 'docs/guide.md': '# Guide Title\n\nSome **bold** text.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n' },
});
const GUIDE = fx.file('proj-cdn', 'docs/guide.md');

const h = createWebviewHarness();
h.install();
const viewer = require(VIEWER_OUT);

let passed = 0, failed = 0;
async function test(name, fn) {
    try { await fn(); console.log(`  PASS ${name}`); passed++; }
    catch (e) { console.error(`  FAIL ${name}\n       -> ${e.message}`); failed++; }
}

(async () => {
    console.log('\nmd-preview CDN regression — #326\n' + '-'.repeat(50));
    viewer.activate(h.context);
    await h.run('cvs.mcp.viewer.open');
    const viewerUrl = new URL(await h.openedUrl());
    const url = new URL('/md-preview', viewerUrl);
    url.searchParams.set('t', viewerUrl.searchParams.get('t'));
    url.searchParams.set('path', GUIDE);
    const page = await loadServedPage(url.toString());
    const main = page.document.querySelector('main');

    await test('the markdown arrives rendered: heading, bold and table are HTML in the page as sent', () => {
        assert.strictEqual(page.status, 200);
        assert.ok(/<h1[^>]*>Guide Title<\/h1>/.test(page.html), 'no <h1> in the HTML the server sent');
        assert.ok(main.querySelector('strong') && main.querySelector('strong').textContent === 'bold', 'no <strong>');
        assert.ok(main.querySelector('table'), 'no <table>');
    });

    await test('the page loads no script from another origin', () => {
        const external = [...page.document.querySelectorAll('script[src]')]
            .map(s => s.getAttribute('src'))
            .filter(src => new URL(src, url).origin !== url.origin);
        assert.deepStrictEqual(external, []);
    });

    await test('the page does not use the marked library', () => {
        assert.strictEqual(typeof page.window.marked, 'undefined');
        assert.ok(!/\bmarked\b/.test(page.html), 'the page mentions marked');
    });

    await test('every request the page made went to its own server', () => {
        const foreign = page.requests.filter(r => new URL(r.url).origin !== url.origin).map(r => r.url);
        assert.deepStrictEqual(foreign, []);
    });

    page.close();
    viewer.disposeMcpViewerServer();
    fx.dispose();
    console.log('\n' + '-'.repeat(50));
    console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
    // Not process.exit(): the server's sockets are still closing, and exiting
    // under them crashes Node on Windows (#847).
    process.exitCode = failed ? 1 : 0;
})().catch((e) => { console.error(e && e.stack || String(e)); process.exit(1); });
