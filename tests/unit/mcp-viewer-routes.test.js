// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
'use strict';

/**
 * tests/unit/mcp-viewer-routes.test.js
 *
 * Every endpoint tab on the MCP Endpoint Viewer page gets an answer from the
 * viewer's server: clicking the tab (and Run, for a tab that needs a query)
 * sends that method to POST /mcp, and the server returns a result, not
 * "Method not found". Each tab's /api/<endpoint> route answers too.
 *
 * Runs the real code (#838): the mcp-viewer feature from out-test/, its
 * cvs.mcp.viewer.open command, which starts the real server over a temp
 * registry, and the page that server serves, in jsdom with its script running
 * and its fetch() going to that server (tests/utils/webview-harness.js).
 * Until #838 this test matched "currentEndpoint === '...'" in html.ts against
 * "'/api/...'" in index.ts, as text.
 *
 * Run: node scripts/run-unit-tests.js mcp-viewer-routes
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

const fx = useRegistryHome({
    'proj-alpha': {
        'README.md': '# Alpha\n\nThe alpha project.\n',
        'src/alpha.ts': 'export function alphaThing(): number { return 1; }\n',
    },
});

const h = createWebviewHarness();
h.install();
const viewer = require(VIEWER_OUT);

/** What a user types before Run, for a tab that needs it. */
const INPUTS = { find_project: { q: 'alpha' }, search_docs: { q: 'alpha' }, find_symbol: { name: 'alphaThing' } };

let passed = 0, failed = 0;
async function test(name, fn) {
    try { await fn(); console.log(`  PASS ${name}`); passed++; }
    catch (e) { console.error(`  FAIL ${name}\n       -> ${e.message}`); failed++; }
}

(async () => {
    console.log('\nmcp-viewer: every endpoint tab has a route on the server\n' + '-'.repeat(50));
    viewer.activate(h.context);
    await h.run('cvs.mcp.viewer.open');
    const url  = await h.openedUrl();
    const page = await loadServedPage(url);
    const doc  = page.document;
    const tabs = [...doc.querySelectorAll('.tab[data-endpoint]')].map(t => t.dataset.endpoint);

    await test('the served page has endpoint tabs', () => {
        assert.strictEqual(page.status, 200);
        assert.ok(tabs.length >= 5, `tabs: ${tabs.join(', ')}`);
    });

    for (const ep of tabs) {
        await test(`the ${ep} tab: the page sends ${ep} to POST /mcp and the server answers with a result`, async () => {
            page.requests.length = 0;
            await page.click(doc.querySelector(`.tab[data-endpoint="${ep}"]`));
            if (INPUTS[ep]) {
                for (const [id, value] of Object.entries(INPUTS[ep])) { doc.getElementById(id).value = value; }
                await page.click(doc.getElementById('btn-run'));
            }
            const sent = page.requests.filter(r => r.method === 'POST' && new URL(r.url).pathname === '/mcp' && r.body && r.body.method === ep);
            assert.ok(sent.length, `the page sent no ${ep} request; sent: ${JSON.stringify(page.requests.map(r => r.body && r.body.method))}`);
            const answer = sent[sent.length - 1];
            assert.strictEqual(answer.status, 200);
            assert.ok(answer.json && answer.json.result && !answer.json.error, `answer: ${JSON.stringify(answer.json).slice(0, 200)}`);
            assert.strictEqual(doc.querySelector('#result .state.err'), null, `the page shows an error: ${doc.getElementById('result').textContent.slice(0, 200)}`);
        });

        await test(`the ${ep} tab: GET /api/${ep} answers with JSON`, async () => {
            const u = new URL(`/api/${ep}`, url);
            u.search = new URL(url).search;
            for (const [k, v] of Object.entries(INPUTS[ep] || {})) { u.searchParams.set(k === 'q' ? 'query' : k, v); }
            const r = await fetch(u);
            assert.strictEqual(r.status, 200, `GET ${u.pathname}: ${r.status}`);
            assert.ok(/json/.test(r.headers.get('content-type') || ''), `content-type: ${r.headers.get('content-type')}`);
            await r.json();
        });
    }

    page.close();
    viewer.disposeMcpViewerServer();
    fx.dispose();
    console.log('\n' + '-'.repeat(50));
    console.log(`${passed} passed, ${failed} failed`);
    // Not process.exit(): the server's sockets are still closing, and exiting
    // under them crashes Node on Windows (#847).
    process.exitCode = failed ? 1 : 0;
})().catch((e) => { console.error(e && e.stack || String(e)); process.exit(1); });
