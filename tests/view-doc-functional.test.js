#!/usr/bin/env node
// Copyright (c) CieloVista Software. All rights reserved.
/**
 * View a Doc Server — functional test
 *
 * Drives the REAL View a Doc server: viewSpecificDoc() from the out-test build
 * of src/features/doc-catalog/commands.ts, on an ephemeral port, over a temp
 * registry naming one temp project. Verifies:
 *   - the server starts on 127.0.0.1 and opens its page
 *   - the home page lists every doc in the project
 *   - each listed doc opens, rendered from its markdown
 *   - a path with spaces resolves
 *   - a relative link in a doc is rewritten to a working /doc link
 *   - a missing doc returns 404
 *
 * Until #823 this test built its own http.createServer with its own catalog
 * page and escapeHtml() and tested that, so no code from src/ ran; and it
 * printed a cross for a failure but still exited 0. REG-152 covers the same
 * server's refusals (token, host, paths outside every project).
 *
 * Run: node tests/view-doc-functional.test.js
 */
'use strict';

const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const http   = require('http');
const Module = require('module');

const COMMANDS_JS = path.join(__dirname, '..', 'out-test', 'features', 'doc-catalog', 'commands.js');

let passed = 0, failed = 0;
function check(name, ok, detail) {
    if (ok) { console.log(`  ✓ ${name}`); passed++; }
    else    { console.error(`  ✗ ${name}${detail ? `\n    ${detail}` : ''}`); failed++; }
}

console.log('\n📄 View a Doc Server — Functional Test');
console.log('═'.repeat(70));

if (!fs.existsSync(COMMANDS_JS)) {
    // Not a skip: the runners build out-test/ first, so this is a real failure.
    console.error(`  ✗ out-test build missing: ${COMMANDS_JS}`);
    process.exit(1);
}

// ── Temp home: a registry naming one project with three docs ────────────────
const TMP     = fs.mkdtempSync(path.join(os.tmpdir(), 'cvt-viewdoc-'));
const HOME    = path.join(TMP, 'home');
const PROJECT = path.join(TMP, 'proj-view');
const SPACED  = path.join(PROJECT, 'docs with spaces');
const GLOBAL  = path.join(TMP, 'global-docs');
for (const d of [HOME, SPACED, GLOBAL]) { fs.mkdirSync(d, { recursive: true }); }
const DOCS = {
    readme:    [path.join(PROJECT, 'README.md'),    '# Proj View\n\nThe readme body. See [the changelog](CHANGELOG.md).\n'],
    changelog: [path.join(PROJECT, 'CHANGELOG.md'), '# Changelog\n\n## 1.0.0\n\n- First release entry.\n'],
    spaced:    [path.join(SPACED, 'view a doc.md'),  '# View a Doc Guide\n\nGuide text from a spaced path.\n'],
};
for (const [file, text] of Object.values(DOCS)) { fs.writeFileSync(file, text, 'utf8'); }
const REG_DIR = path.join(HOME, 'Downloads', 'CieloVistaStandards');
fs.mkdirSync(REG_DIR, { recursive: true });
fs.writeFileSync(path.join(REG_DIR, 'project-registry.json'), JSON.stringify({
    globalDocsPath: GLOBAL,
    projects: [{ name: 'proj-view', path: PROJECT, type: 'app', description: 'fixture' }],
}, null, 2), 'utf8');
process.env.USERPROFILE = HOME;
process.env.HOME        = HOME;

// ── vscode mock: records the page the server opens; the rest is inert ──────
const opened = [];
function anyObject() {
    return new Proxy(function () { return anyObject(); }, {
        get: (_t, k) => (k === 'then' ? undefined : anyObject()),
        apply: () => anyObject(),
    });
}
const vscodeMock = new Proxy({
    env:       { openExternal: (uri) => { opened.push(String(uri)); return Promise.resolve(true); } },
    Uri:       { parse: (s) => ({ toString: () => s, fsPath: s }), file: (p) => ({ fsPath: p, toString: () => 'file://' + p }) },
    window:    {
        withProgress: (_o, fn) => Promise.resolve(fn({ report() {} }, { isCancellationRequested: false })),
        showErrorMessage() {}, showInformationMessage() {}, showWarningMessage() {},
        createOutputChannel: () => ({ appendLine() {}, append() {}, show() {}, dispose() {}, clear() {} }),
    },
    workspace: { workspaceFolders: [], getConfiguration: () => ({ get: (_k, d) => d, update: () => Promise.resolve() }) },
    ProgressLocation: { Notification: 15 },
    ViewColumn: { One: 1, Two: 2, Beside: -2, Active: -1 },
},{ get: (t, k) => (k in t ? t[k] : anyObject()) });
const origLoad = Module._load;
Module._load = function (req) { return req === 'vscode' ? vscodeMock : origLoad.apply(this, arguments); };

function get(port, pathAndQuery) {
    return new Promise((resolve) => {
        const req = http.request({ host: '127.0.0.1', port, path: pathAndQuery, method: 'GET', timeout: 5000 }, (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (c) => { body += c; });
            res.on('end', () => resolve({ status: res.statusCode, body }));
        });
        req.on('timeout', () => req.destroy(new Error('timeout')));
        req.on('error', (e) => resolve({ status: 0, body: String(e) }));
        req.end();
    });
}
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

let mod;
(async () => {
    mod = require(COMMANDS_JS);
    await mod.viewSpecificDoc();
    for (let i = 0; i < 100 && !opened.length; i++) { await new Promise(r => setTimeout(r, 50)); }
    const port = Number(((opened[0] || '').match(/^http:\/\/127\.0\.0\.1:(\d+)/) || [])[1]);
    check('the server starts on 127.0.0.1 and opens its page', port > 0, `openExternal calls: ${JSON.stringify(opened)}`);
    if (!(port > 0)) { return; }

    const home = await get(port, '/');
    check('the home page is served', home.status === 200, `status ${home.status}`);
    const token  = (home.body.match(/[?&]t=([0-9a-f]{64})/) || [])[1] || '';
    const listed = [...home.body.matchAll(/class="doc-link[^"]*"[^>]*data-path="([^"]*)"/g)].map(m => path.resolve(unesc(m[1])));
    for (const [key, [file]] of Object.entries(DOCS)) {
        check(`the home page lists ${key} (${path.relative(TMP, file)})`, listed.includes(path.resolve(file)),
            `listed: ${JSON.stringify(listed)}`);
    }

    // Open each doc the way the page does: BASE + /doc?path=<encoded> + token.
    const open = (file) => get(port, `/doc?path=${encodeURIComponent(file)}&t=${token}`);
    const readme = await open(DOCS.readme[0]);
    check('README.md opens, rendered from its markdown',
        readme.status === 200 && /<h1[^>]*>\s*Proj View\s*<\/h1>/.test(readme.body) && readme.body.includes('The readme body.'),
        `status ${readme.status}: ${readme.body.slice(0, 200)}`);
    const changelog = await open(DOCS.changelog[0]);
    check('CHANGELOG.md opens, rendered from its markdown',
        changelog.status === 200 && changelog.body.includes('First release entry.') && /<h2[^>]*>\s*1\.0\.0/.test(changelog.body),
        `status ${changelog.status}`);
    const spaced = await open(DOCS.spaced[0]);
    check('a doc under a folder with spaces opens',
        spaced.status === 200 && spaced.body.includes('Guide text from a spaced path.'), `status ${spaced.status}`);

    const link = (readme.body.match(/href="(http:\/\/127\.0\.0\.1:\d+\/doc\?[^"]*)"/) || [])[1];
    check('a relative link in a doc is rewritten to a /doc link on this server', !!link, 'no /doc link in README.md');
    if (link) {
        const followed = await get(port, unesc(link).replace(/^http:\/\/127\.0\.0\.1:\d+/, ''));
        check('following the rewritten link opens the linked doc',
            followed.status === 200 && followed.body.includes('First release entry.'), `status ${followed.status}`);
    }

    const missing = await open(path.join(PROJECT, 'no-such-doc.md'));
    check('a missing doc returns 404', missing.status === 404, `status ${missing.status}`);
})().catch((e) => check('the test ran to completion', false, (e && e.stack) || String(e)))
    .finally(() => {
        Module._load = origLoad;
        try { mod && mod.disposeViewServer && mod.disposeViewServer(); } catch { /* ignore */ }
        try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ }
        console.log('═'.repeat(70));
        console.log(`${passed} passed, ${failed} failed\n`);
        process.exit(failed ? 1 : 0);
    });
