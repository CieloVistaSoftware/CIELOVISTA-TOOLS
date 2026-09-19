// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
'use strict';

/**
 * tests/unit/doc-catalog-preview-restore-state.test.js
 *
 * A doc opened from the Doc Catalog has a Back button, and Back returns to
 * the catalog: it re-runs cvs.catalog.open, which shows the same catalog
 * panel again with every card.
 *
 * Runs the real code (#838): the doc-catalog feature from out-test/, the
 * catalog page (catalog.html) and the doc preview page it opens, both in
 * jsdom, messages routed to the handlers the extension attached
 * (tests/utils/webview-harness.js). The user's path: open the catalog, click
 * a card's title, click Back in the preview. Until #838 this test checked
 * that four source files contained certain strings.
 *
 * Run: node scripts/run-unit-tests.js doc-catalog-preview-restore-state
 */

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const { createWebviewHarness } = require('../utils/webview-harness');
const { useRegistryHome }      = require('../utils/registry-fixture');

const CATALOG_OUT = path.join(__dirname, '..', '..', 'out-test', 'features', 'doc-catalog', 'index.js');
if (!fs.existsSync(CATALOG_OUT)) {
    // Not a skip: the runners build out-test/ first, so this is a real failure.
    console.error(`FAIL: out-test build missing: ${CATALOG_OUT}`);
    process.exit(1);
}

const fx = useRegistryHome({
    'proj-alpha': {
        'README.md': '# Alpha\n\nThe alpha project.\n',
        'docs/guide.md': '# Alpha Guide\n\nHow to use alpha.\n',
    },
});
const GUIDE = fx.file('proj-alpha', 'docs/guide.md');

const h = createWebviewHarness();
h.install();
const docCatalog = require(CATALOG_OUT);

let passed = 0, failed = 0;
async function test(name, fn) {
    try { await fn(); console.log(`  PASS ${name}`); passed++; }
    catch (e) { console.error(`  FAIL ${name}\n       -> ${e.message}`); failed++; }
}
const cardCount = (html) => (html.match(/<article class="card"/g) || []).length;

(async () => {
    console.log('\ndoc-catalog preview Back returns to the catalog\n' + '-'.repeat(50));
    docCatalog.activate(h.context);

    await test('the feature registers cvs.catalog.open', () => {
        assert.ok(h.commands.has('cvs.catalog.open'), `registered: ${[...h.commands.keys()].join(', ')}`);
    });

    await h.run('cvs.catalog.open');
    const catalog = await h.page('docCatalog');
    const firstInit = catalog.panel.posted.find(m => m.command === 'init');

    await test('the catalog shows the fixture docs', () => {
        assert.ok(firstInit, 'no init message was posted to the catalog page');
        assert.ok(catalog.document.querySelectorAll('.card').length >= 2, `cards: ${catalog.document.querySelectorAll('.card').length}`);
    });

    const title = [...catalog.document.querySelectorAll('.card-title')].find(t => t.dataset.path === GUIDE);
    await test('clicking a card title opens the doc in the preview', async () => {
        assert.ok(title, `no card title for ${GUIDE}`);
        await catalog.click(title);
        const preview = h.panels.find(p => p.viewType === 'docPreview');
        assert.ok(preview, `panels opened: ${h.panels.map(p => p.viewType).join(', ')}`);
        assert.ok(preview.webview.html.includes('How to use alpha.'), 'the preview does not show the doc');
    });

    const catalogPanel = catalog.panel;
    const postedBefore = catalogPanel.posted.length;
    const revealedBefore = catalogPanel.revealed;
    h.executed.length = 0;

    await test('the preview has a Back button, and clicking it re-runs cvs.catalog.open', async () => {
        const preview = await h.page('docPreview');
        const back = preview.document.getElementById('btn-back-source');
        assert.ok(back, 'no Back button in a preview opened from the catalog');
        await preview.click(back);
        assert.deepStrictEqual(h.executed.map(c => c[0]), ['cvs.catalog.open']);
    });

    await test('Back shows the same catalog panel again, not a new one', () => {
        assert.strictEqual(h.panels.filter(p => p.viewType === 'docCatalog').length, 1, 'a second catalog panel was created');
        assert.ok(catalogPanel.revealed > revealedBefore, 'the catalog panel was not revealed');
    });

    await test('Back restores every card: the catalog page is re-initialised with them', async () => {
        const reinit = catalogPanel.posted.slice(postedBefore).find(m => m.command === 'init');
        assert.ok(reinit, 'no init message after Back');
        assert.strictEqual(cardCount(reinit.html), cardCount(firstInit.html));
        assert.ok([...catalog.document.querySelectorAll('.card-title')].some(t => t.dataset.path === GUIDE),
            'the catalog page does not show the card after Back');
    });

    h.close();
    fx.dispose();
    console.log('\n' + '-'.repeat(50));
    console.log(`${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e && e.stack || String(e)); process.exit(1); });
