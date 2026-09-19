// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
'use strict';

/**
 * tests/unit/doc-catalog-run-button.test.js
 *
 * Issue #322: a Doc Catalog card whose doc belongs to a command has a Run
 * button, and clicking it runs that command.
 *
 * Runs the real code (#838): the doc-catalog feature from out-test/, its
 * cvs.catalog.open command, and the catalog page it opens (catalog.html,
 * with its own script) in jsdom, over a temp registry. The page's messages
 * go to the handler the feature attached, as in VS Code
 * (tests/utils/webview-harness.js). Until #838 this test read html.ts,
 * catalog.html and commands.ts as text and looked for strings in them.
 *
 * A card gets its command two ways: the doc's frontmatter names one, or the
 * doc is the helpDoc of a launcher CATALOG entry.
 *
 * Run: node scripts/run-unit-tests.js doc-catalog-run-button
 */

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const { createWebviewHarness } = require('../utils/webview-harness');
const { useRegistryHome }      = require('../utils/registry-fixture');

const FEATURES    = path.join(__dirname, '..', '..', 'out-test', 'features');
const CATALOG_OUT = path.join(__dirname, '..', '..', 'out-test', 'features', 'doc-catalog', 'index.js');
const LAUNCHER_JS = path.join(FEATURES, 'cvs-command-launcher', 'catalog.js');
for (const f of [CATALOG_OUT, LAUNCHER_JS]) {
    if (!fs.existsSync(f)) {
        // Not a skip: the runners build out-test/ first, so this is a real failure.
        console.error(`FAIL: out-test build missing: ${f}`);
        process.exit(1);
    }
}

// The launcher's helpDoc paths live under the home folder, so the fixture
// project sits where the cielovista-tools checkout would.
const CVT = 'Downloads/VSCode/projects/cielovista-tools';
const FM_COMMAND = 'cvs.test.fixtureFromFrontmatter';
const fx = useRegistryHome({
    [CVT]: {
        'src/features/docs-manager.README.md': '# Docs Manager\n\nHow the docs manager works.\n',
        'docs/with-command.md': `---\ncommand: ${FM_COMMAND}\n---\n# With a command\n\nThis doc runs a command.\n`,
        'docs/plain.md': '# Plain\n\nNo command here.\n',
    },
});

const h = createWebviewHarness();
h.install();
const docCatalog = require(CATALOG_OUT);
const { CATALOG } = require(LAUNCHER_JS);

let passed = 0, failed = 0;
async function test(name, fn) {
    try { await fn(); console.log(`  PASS ${name}`); passed++; }
    catch (e) { console.error(`  FAIL ${name}\n       -> ${e.message}`); failed++; }
}

const HELP_DOC  = fx.file('cielovista-tools', 'src/features/docs-manager.README.md');
const WITH_CMD  = fx.file('cielovista-tools', 'docs/with-command.md');
const PLAIN     = fx.file('cielovista-tools', 'docs/plain.md');

(async () => {
    console.log('\ndoc-catalog Run button (#322)\n' + '-'.repeat(50));
    docCatalog.activate(h.context);
    await h.run('cvs.catalog.open');
    const page = await h.page('docCatalog');
    const doc  = page.document;

    /** The card on the page for a doc file. */
    const cardFor = (file) => [...doc.querySelectorAll('.card')]
        .find(c => (c.querySelector('[data-action="open-preview"]') || {}).dataset?.path === file);

    await test('the catalog page shows a card for each fixture doc', () => {
        for (const f of [HELP_DOC, WITH_CMD, PLAIN]) { assert.ok(cardFor(f), `no card for ${f}`); }
    });

    const entry = CATALOG.find(e => e.helpDoc && path.resolve(e.helpDoc) === HELP_DOC);
    await test('a launcher CATALOG entry has the fixture helpDoc', () => {
        assert.ok(entry, `no CATALOG entry has helpDoc ${HELP_DOC}`);
    });

    await test('a card whose doc is a CATALOG helpDoc has a Run button for that command', () => {
        const btn = cardFor(HELP_DOC).querySelector('.btn-run');
        assert.ok(btn, 'no Run button on the card');
        assert.strictEqual(btn.dataset.commandId, entry.id);
        assert.ok(btn.title.includes(entry.title), `title: ${btn.title}`);
    });

    await test('clicking that Run button runs the command', async () => {
        h.executed.length = 0;
        await page.click(cardFor(HELP_DOC).querySelector('.btn-run'));
        assert.deepStrictEqual(h.executed.map(c => c[0]), [entry.id]);
    });

    await test('a card whose frontmatter names a command has a Run button that runs it', async () => {
        const btn = cardFor(WITH_CMD).querySelector('.btn-run');
        assert.ok(btn, 'no Run button on the card');
        h.executed.length = 0;
        await page.click(btn);
        assert.deepStrictEqual(h.executed.map(c => c[0]), [FM_COMMAND]);
    });

    await test('a card with no command has no Run button', () => {
        assert.strictEqual(cardFor(PLAIN).querySelector('.btn-run'), null);
    });

    h.close();
    fx.dispose();
    console.log('\n' + '-'.repeat(50));
    console.log(`${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e && e.stack || String(e)); process.exit(1); });
