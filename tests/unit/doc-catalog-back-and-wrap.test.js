// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
'use strict';

/**
 * tests/unit/doc-catalog-back-and-wrap.test.js
 *
 * Two Doc Catalog behaviours:
 *   - a doc previewed from the catalog has a Back button, and it posts
 *     navigate-source; a doc previewed from nowhere has none;
 *   - long text on a card wraps instead of running off the card: title,
 *     description, file name and path break anywhere, and the path is not
 *     cut to one line with an ellipsis.
 *
 * Runs the real code (#838): the doc-catalog feature and the doc preview
 * from out-test/, their pages in jsdom (tests/utils/webview-harness.js), and
 * the styles the page actually computes for a rendered card. Until #838 this
 * test searched doc-preview.ts and catalog.html for strings.
 *
 * What Back does after it posts is in doc-catalog-preview-restore-state.test.js.
 *
 * Run: node scripts/run-unit-tests.js doc-catalog-back-and-wrap
 */

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const { createWebviewHarness } = require('../utils/webview-harness');
const { useRegistryHome }      = require('../utils/registry-fixture');

const OUT_TEST    = path.join(__dirname, '..', '..', 'out-test');
const CATALOG_OUT = path.join(__dirname, '..', '..', 'out-test', 'features', 'doc-catalog', 'index.js');
const PREVIEW_OUT = path.join(OUT_TEST, 'shared', 'doc-preview.js');
for (const f of [CATALOG_OUT, PREVIEW_OUT]) {
    if (!fs.existsSync(f)) {
        // Not a skip: the runners build out-test/ first, so this is a real failure.
        console.error(`FAIL: out-test build missing: ${f}`);
        process.exit(1);
    }
}

const LONG = 'a-very-long-unbroken-folder-name-that-would-overflow-the-card'.repeat(3);
const fx = useRegistryHome({
    'proj-wrap': {
        [`docs/${LONG}/guide.md`]: `# ${LONG}\n\n${LONG} described without a single space in it.\n`,
    },
});
const GUIDE = fx.file('proj-wrap', `docs/${LONG}/guide.md`);

const h = createWebviewHarness();
h.install();
const docCatalog = require(CATALOG_OUT);
const docPreview = require(PREVIEW_OUT);

let passed = 0, failed = 0;
async function test(name, fn) {
    try { await fn(); console.log(`  PASS ${name}`); passed++; }
    catch (e) { console.error(`  FAIL ${name}\n       -> ${e.message}`); failed++; }
}

(async () => {
    console.log('\ndoc-catalog Back button and card text wrapping\n' + '-'.repeat(50));
    docCatalog.activate(h.context);
    await h.run('cvs.catalog.open');
    const catalog = await h.page('docCatalog');
    const card = [...catalog.document.querySelectorAll('.card')]
        .find(c => (c.querySelector('.card-title') || {}).dataset?.path === GUIDE);

    await test('the catalog shows a card for the long-named doc', () => { assert.ok(card, `no card for ${GUIDE}`); });

    const style = (sel) => catalog.window.getComputedStyle(card.querySelector(sel));
    for (const sel of ['.card-title', '.card-desc', '.card-filename', '.card-path']) {
        await test(`${sel} breaks long words (overflow-wrap:anywhere, word-break:break-word)`, () => {
            const s = style(sel);
            assert.strictEqual(s.overflowWrap, 'anywhere');
            assert.strictEqual(s.wordBreak, 'break-word');
        });
    }
    await test('.card-path wraps onto more lines instead of one line cut with an ellipsis', () => {
        const s = style('.card-path');
        assert.strictEqual(s.whiteSpace, 'normal');
        assert.strictEqual(s.textOverflow, 'clip');
    });

    await test('a doc previewed from the catalog has a Back button that posts navigate-source', async () => {
        await catalog.click(card.querySelector('.card-title'));
        const preview = await h.page('docPreview');
        const back = preview.document.getElementById('btn-back-source');
        assert.ok(back, 'no Back button');
        const posted = [];
        const origReceive = preview.panel.receive;
        preview.panel.receive = (msg) => { posted.push(msg); return Promise.resolve(); };
        try { await preview.click(back); } finally { preview.panel.receive = origReceive; }
        assert.deepStrictEqual(JSON.parse(JSON.stringify(posted)), [{ command: 'navigate-source' }]);   // page objects are from another realm
    });

    await test('a doc previewed from nowhere has no Back button', async () => {
        docPreview.disposeDocPreview();
        docPreview.openDocPreview(GUIDE);
        const preview = await h.page('docPreview');
        assert.ok(preview.document.getElementById('btn-edit'), 'the preview page did not render');
        assert.strictEqual(preview.document.getElementById('btn-back-source'), null);
    });

    h.close();
    fx.dispose();
    console.log('\n' + '-'.repeat(50));
    console.log(`${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e && e.stack || String(e)); process.exit(1); });
