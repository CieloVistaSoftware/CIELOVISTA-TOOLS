// Copyright (c) CieloVista Software. All rights reserved.
/**
 * launcher-test-coverage.test.js
 *
 * The command launcher lists the three test coverage commands, tagged 'test'
 * and 'playwright', and its search box finds them.
 *
 * Runs the real code (#823): CATALOG from the out-test build of
 * src/features/cvs-command-launcher/catalog.ts, and the launcher page that
 * buildLauncherHtml() renders, with its own search script, in jsdom. Until
 * #823 this test held a hand-written 3-entry catalog and its own search
 * function; the real catalog had since moved the commands to another group
 * and the test never noticed.
 *
 * Run: node tests/launcher-test-coverage.test.js
 */
'use strict';

const assert    = require('assert');
const fs        = require('fs');
const path      = require('path');
const { JSDOM } = require('jsdom');

const LAUNCHER = path.join(__dirname, '..', 'out-test', 'features', 'cvs-command-launcher');
const CATALOG_JS = path.join(LAUNCHER, 'catalog.js');
const HTML_JS    = path.join(LAUNCHER, 'html.js');
for (const f of [CATALOG_JS, HTML_JS]) {
    if (!fs.existsSync(f)) {
        // Not a skip: the runners build out-test/ first, so this is a real failure.
        console.error(`FAIL: out-test build missing: ${f}. Run through node scripts/run-unit-tests.js, which builds it.`);
        process.exit(1);
    }
}
const { CATALOG }           = require(CATALOG_JS);
const { buildLauncherHtml } = require(HTML_JS);

const COVERAGE_IDS = ['cvs.audit.testCoverage', 'cvs.audit.testCoverage.refresh', 'cvs.audit.testCoverage.export'];

let testsPassed = 0;
let testsFailed = 0;
function test(name, fn) {
    try { fn(); console.log(`  ✓ ${name}`); testsPassed++; }
    catch (err) { console.log(`  ✗ ${name}\n    Error: ${err.message}`); testsFailed++; }
}

// ── The real launcher page, every catalog command registered ────────────────
const html = buildLauncherHtml(null, undefined, [], [], new Set(CATALOG.map(c => c.id)));
const dom  = new JSDOM(html, {
    runScripts: 'dangerously',
    beforeParse(window) { window.acquireVsCodeApi = () => ({ postMessage() {}, getState() { return undefined; }, setState() {} }); },
});
const doc = dom.window.document;

/** Ids of the cards the page shows after typing `query` into its search box. */
function search(query) {
    const box = doc.getElementById('search');
    box.value = query;
    box.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    return [...doc.querySelectorAll('.cmd-card:not(.hidden)')].map(c => c.dataset.id);
}
const coverageShown = ids => COVERAGE_IDS.filter(id => ids.includes(id));

console.log('\n📋 Test Coverage Launcher Commands\n');

for (const id of COVERAGE_IDS) {
    test(`CATALOG has ${id}, tagged 'test' and 'playwright'`, () => {
        const cmd = CATALOG.find(c => c.id === id);
        assert.ok(cmd, `${id} not found in CATALOG`);
        assert.ok(cmd.tags.includes('test'), `${id} tags: ${cmd.tags.join(', ')}`);
        assert.ok(cmd.tags.includes('playwright'), `${id} tags: ${cmd.tags.join(', ')}`);
    });
}

test('the three test coverage commands share one group', () => {
    const groups = new Set(COVERAGE_IDS.map(id => (CATALOG.find(c => c.id === id) || {}).group));
    assert.strictEqual(groups.size, 1, `groups: ${[...groups].join(', ')}`);
});

test('the launcher page renders a card for each test coverage command', () => {
    const cards = [...doc.querySelectorAll('.cmd-card')].map(c => c.dataset.id);
    assert.deepStrictEqual(coverageShown(cards), COVERAGE_IDS);
});

for (const q of ['playwright', 'test coverage', 'test']) {
    test(`searching "${q}" shows all 3 test coverage commands`, () => {
        assert.deepStrictEqual(coverageShown(search(q)), COVERAGE_IDS);
    });
}

test('searching "dashboard" shows the primary test coverage command', () => {
    assert.ok(search('dashboard').includes('cvs.audit.testCoverage'));
});

test('searching for text no command has hides them all', () => {
    assert.deepStrictEqual(search('zq-no-command-has-this-xj'), []);
});

console.log(`\n📊 Results: ${testsPassed} passed, ${testsFailed} failed\n`);
dom.window.close();
process.exit(testsFailed ? 1 : 0);
