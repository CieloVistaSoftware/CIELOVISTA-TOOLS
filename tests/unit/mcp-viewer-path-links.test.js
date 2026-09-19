// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
'use strict';

/**
 * tests/unit/mcp-viewer-path-links.test.js
 *
 * Issue #329: a Windows file path written in a doc the MCP Endpoint Viewer
 * previews (/md-preview) becomes a link when it names a .md file, and opens
 * that doc in the preview, token included, with a Back to the page it came
 * from. A path to any other file is marked up, not linked.
 *
 * Runs the real code (#838): the mcp-viewer feature from out-test/, the real
 * server its cvs.mcp.viewer.open command starts over a temp registry, and the
 * /md-preview page that server serves, in jsdom with its script running
 * (tests/utils/webview-harness.js). The link is followed the way a click
 * would. Until #838 this test searched index.ts for strings such as 'pathRe'.
 *
 * Run: node scripts/run-unit-tests.js mcp-viewer-path-links
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

// Absolute Windows paths inside the project. The fixture is in os.tmpdir(),
// so on a non-Windows machine the paths are written with a drive letter here.
const fx  = useRegistryHome({
    'proj-alpha': {
        'docs/other.md': '# Other Doc\n\nThe linked doc.\n',
        'docs/setup.ps1': 'Write-Output ok\n',
        'docs/guide.md': '',   // written below, once the paths are known
    },
});
const winPath = (p) => (/^[A-Za-z]:\\/.test(p) ? p : `C:${p.replace(/\//g, '\\')}`);
const OTHER_MD  = winPath(fx.file('proj-alpha', 'docs/other.md'));
const SCRIPT    = winPath(fx.file('proj-alpha', 'docs/setup.ps1'));
const GUIDE     = fx.file('proj-alpha', 'docs/guide.md');
fs.writeFileSync(GUIDE, `# Guide\n\nSee ${OTHER_MD} for more.\n\nRun ${SCRIPT} first.\n`, 'utf8');

const h = createWebviewHarness();
h.install();
const viewer = require(VIEWER_OUT);

let passed = 0, failed = 0;
async function test(name, fn) {
    try { await fn(); console.log(`  PASS ${name}`); passed++; }
    catch (e) { console.error(`  FAIL ${name}\n       -> ${e.message}`); failed++; }
}

(async () => {
    console.log('\nmcp-viewer md-preview path links (#329)\n' + '-'.repeat(50));
    viewer.activate(h.context);
    await h.run('cvs.mcp.viewer.open');
    const viewerUrl = new URL(await h.openedUrl());
    const token     = viewerUrl.searchParams.get('t');
    const previewUrl = new URL('/md-preview', viewerUrl);
    previewUrl.searchParams.set('t', token);
    previewUrl.searchParams.set('path', GUIDE);
    const page = await loadServedPage(previewUrl.toString());
    const main = page.document.querySelector('main');

    await test('the md-preview page renders the doc', () => {
        assert.strictEqual(page.status, 200);
        assert.ok(main && main.textContent.includes('See'), 'no rendered doc');
    });

    const link = main && [...main.querySelectorAll('a')].find(a => a.textContent === OTHER_MD);
    await test('a .md path in the doc becomes a link to /md-preview for that file, token included', () => {
        assert.ok(link, `no link for ${OTHER_MD}; main: ${main && main.innerHTML.slice(0, 300)}`);
        const href = new URL(link.getAttribute('href'), previewUrl);
        assert.strictEqual(href.pathname, '/md-preview');
        assert.strictEqual(href.searchParams.get('t'), token);
        assert.strictEqual(href.searchParams.get('path'), OTHER_MD);
    });

    await test('the link carries Back to the page it was on', () => {
        const href = new URL(link.getAttribute('href'), previewUrl);
        assert.strictEqual(href.searchParams.get('back'), previewUrl.toString());
    });

    await test('following the link opens the linked doc in the preview', async () => {
        if (!/^[A-Za-z]:\\/.test(fx.tmp)) { console.log('       (not Windows: the drive-letter path names no real file; checked the link only)'); return; }
        const next = await loadServedPage(new URL(link.getAttribute('href'), previewUrl).toString());
        assert.strictEqual(next.status, 200);
        assert.ok(next.document.querySelector('main').textContent.includes('The linked doc.'), 'the linked doc is not shown');
        next.close();
    });

    await test('a path to a file that is not .md is marked up but not linked', () => {
        assert.ok(![...main.querySelectorAll('a')].some(a => a.textContent === SCRIPT), 'the .ps1 path is a link');
        const span = [...main.querySelectorAll('span')].find(s => s.textContent === SCRIPT);
        assert.ok(span, `no span for ${SCRIPT}`);
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
