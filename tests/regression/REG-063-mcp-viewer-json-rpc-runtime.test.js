// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * tests/regression/REG-063-mcp-viewer-json-rpc-runtime.test.js
 *
 * Guards issue #390: the MCP viewer's active UI flows must use JSON-RPC
 * POST /mcp rather than legacy REST /api/... endpoints.
 *
 * Runs the delivered page (#846): the mcp-viewer feature from out-test/, the
 * real server its cvs.mcp.viewer.open command starts over a temp registry,
 * and the page that server serves, in jsdom with its script running and its
 * fetch() going to that server (tests/utils/webview-harness.js). Until #846
 * this test transpiled html.ts itself and answered the page's requests with
 * a stand-in.
 *
 * Run: node tests/regression/REG-063-mcp-viewer-json-rpc-runtime.test.js
 */
'use strict';

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const { createWebviewHarness, loadServedPage } = require('../utils/webview-harness');
const { useRegistryHome }                      = require('../utils/registry-fixture');

const VIEWER_OUT = path.join(__dirname, '..', '..', 'out-test', 'features', 'mcp-viewer', 'index.js');
if (!fs.existsSync(VIEWER_OUT)) {
    // Not a skip: the runner builds out-test/ first, so this is a real failure.
    console.error(`FAIL: out-test build missing: ${VIEWER_OUT}`);
    process.exit(1);
}

const fx = useRegistryHome({
    'DiskCleanUp':     { 'README.md': '# DiskCleanUp\n', 'docs/usage.md': '# Usage\n' },
    'cielovista-tools': { 'README.md': '# Tools\n' },
});

const h = createWebviewHarness();
h.install();
const viewer = require(VIEWER_OUT);

let passed = 0, failed = 0;
async function test(name, fn) {
    try { await fn(); console.log(`  PASS ${name}`); passed++; }
    catch (e) { console.error(`  FAIL ${name}\n       -> ${e.message}`); failed++; }
}

(async () => {
    console.log('\nREG-063: MCP viewer flows use JSON-RPC POST /mcp (#390)\n' + '-'.repeat(50));
    viewer.activate(h.context);
    await h.run('cvs.mcp.viewer.open');
    const url   = new URL(await h.openedUrl());
    const token = url.searchParams.get('t');
    const page  = await loadServedPage(url.toString());
    const doc   = page.document;
    const rpc   = (method) => page.requests.filter(r => r.method === 'POST' && new URL(r.url).pathname === '/mcp'
        && new URL(r.url).searchParams.get('t') === token && r.body && r.body.method === method);
    const legacy = () => page.requests.filter(r => new URL(r.url).pathname.startsWith('/api/')).map(r => r.url);

    await test('on load the page asks for list_projects through POST /mcp, with its token, and gets a result', () => {
        const sent = rpc('list_projects');
        assert.ok(sent.length, `no list_projects request; sent: ${page.requests.map(r => r.url).join(', ')}`);
        assert.ok(sent[0].json && sent[0].json.result, `answer: ${JSON.stringify(sent[0].json).slice(0, 200)}`);
    });

    await test('loading the page calls no legacy /api endpoint', () => {
        assert.deepStrictEqual(legacy(), []);
    });

    await test('choosing a project on the get_catalog tab sends get_catalog for it through POST /mcp', async () => {
        await page.click(doc.querySelector('.tab[data-endpoint="get_catalog"]'));
        const proj = doc.getElementById('proj');
        assert.ok(proj, 'no project dropdown on the get_catalog tab');
        assert.ok([...proj.options].some(o => o.value === 'DiskCleanUp'), `options: ${[...proj.options].map(o => o.value).join(', ')}`);
        proj.value = 'DiskCleanUp';
        proj.dispatchEvent(new page.window.Event('change', { bubbles: true }));
        await page.idle();
        page.failIfErrors('on the project change');
        const sent = rpc('get_catalog').filter(r => r.body.params && r.body.params.projectName === 'DiskCleanUp');
        assert.ok(sent.length, `no get_catalog for DiskCleanUp; sent: ${JSON.stringify(page.requests.map(r => r.body))}`);
        assert.ok(sent[sent.length - 1].json.result, 'get_catalog had no result');
    });

    await test('the list_cvt_commands tab sends list_cvt_commands through POST /mcp', async () => {
        await page.click(doc.querySelector('.tab[data-endpoint="list_cvt_commands"]'));
        assert.ok(rpc('list_cvt_commands').length, 'no list_cvt_commands request');
    });

    await test('no flow tested called a legacy /api endpoint', () => {
        assert.deepStrictEqual(legacy(), []);
    });

    page.close();
    viewer.disposeMcpViewerServer();
    fx.dispose();
    console.log('\n' + '-'.repeat(50));
    console.log(`${passed} passed, ${failed} failed`);
    // Not process.exit(): the server's sockets are still closing, and exiting
    // under them crashes Node on Windows (#847).
    process.exitCode = failed ? 1 : 0;
})().catch((e) => { console.error(e && e.stack || String(e)); process.exit(1); });
