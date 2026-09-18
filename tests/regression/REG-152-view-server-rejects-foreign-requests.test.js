// Copyright (c) CieloVista Software. All rights reserved.
// REG-152: Issues #752 and #758 — the View-a-Doc server acts and reads only
// for its own page
//
// Run: node tests/regression/REG-152-view-server-rejects-foreign-requests.test.js
//
// The View-a-Doc server listens on 127.0.0.1, but any web page the user has
// open can send it requests. Its /set-cwd route typed
//     cd "<folder from the query string>"
// into the user's terminal, so a path such as  x"; <cmd>; echo "/a.md  ran
// <cmd>. /openfolder, /open-in-vscode and /reveal acted for any page too.
// And /doc (#758) returned ANY file on disk, with Access-Control-Allow-Origin: *
// on every response, so any web page could read SSH keys and .env files.
//
// This test drives the REAL server (out-test build of
// src/features/doc-catalog/commands.ts) on an ephemeral port, with a mocked
// vscode that records every terminal and command call, and a temp registry
// (via a temp home folder) naming one temp project. It asserts:
//   1. the page the server renders carries a token, and sends no CORS header;
//   2. no token -> 403 and nothing happens;
//   3. a wrong token -> 403 and nothing happens;
//   4. a foreign Host header (DNS rebinding) -> 403;
//   5. a quote / semicolon injection in path never reaches sendText (it is
//      never called at all) and never opens a terminal outside the project;
//   6. a folder outside every registered project is refused on every route;
//   7. a valid token + an in-project path works on every route;
//   8. /doc serves only .md files inside a registered project, with the token:
//      a file outside every project, a non-.md file inside one, a missing or
//      wrong token, and a symlink inside a project pointing outside are all
//      refused, and no response carries Access-Control-Allow-Origin, so a
//      cross-origin reader cannot obtain a doc or the token.

'use strict';

const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const http   = require('http');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..', '..');
const COMMANDS_JS = path.join(ROOT, 'out-test', 'features', 'doc-catalog', 'commands.js');

let passed = 0;
let failed = 0;
function check(name, ok, detail) {
    if (ok) { console.log(`  PASS ${name}`); passed += 1; }
    else    { console.error(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`); failed += 1; }
}

console.log('REG-152: the View-a-Doc server acts and reads only for its own page (#752, #758)');
console.log('-'.repeat(64));

if (!fs.existsSync(COMMANDS_JS)) {
    // Not a skip: the runners build out-test/ first, so this is a real failure.
    console.error(`  FAIL out-test build missing: ${COMMANDS_JS}`);
    process.exit(1);
}

// ── Temp home: registry, one project, one folder outside every project ──────
const TMP      = fs.mkdtempSync(path.join(os.tmpdir(), 'cvt-reg152-'));
const HOME     = path.join(TMP, 'home');
const PROJECT  = path.join(TMP, 'proj-alpha');
const SUBDIR   = path.join(PROJECT, 'docs');
const OUTSIDE  = path.join(TMP, 'outside');
const SIBLING  = path.join(TMP, 'proj-alpha-evil');   // shares a name prefix
const GLOBAL   = path.join(TMP, 'global-docs');
for (const d of [HOME, SUBDIR, OUTSIDE, SIBLING, GLOBAL]) { fs.mkdirSync(d, { recursive: true }); }
fs.writeFileSync(path.join(PROJECT, 'README.md'), '# Alpha\n\nA project.\n', 'utf8');
fs.writeFileSync(path.join(SUBDIR, 'guide.md'), '# Guide\n\nText.\n', 'utf8');
fs.writeFileSync(path.join(OUTSIDE, 'secret.md'), '# Outside\n', 'utf8');
fs.writeFileSync(path.join(SIBLING, 'x.md'), '# Sibling\n', 'utf8');
const SECRET = 'REG152-SECRET-VALUE-9f3a';
fs.writeFileSync(path.join(PROJECT, '.env'), `API_KEY=${SECRET}\n`, 'utf8');
fs.writeFileSync(path.join(OUTSIDE, 'secret.md'), `# Outside\n\n${SECRET}\n`, 'utf8');
fs.writeFileSync(path.join(SUBDIR, 'guide.md'), '# Guide\n\nIn-project guide text. See [the readme](../README.md).\n', 'utf8');
const REG_DIR = path.join(HOME, 'Downloads', 'CieloVistaStandards');
fs.mkdirSync(REG_DIR, { recursive: true });
fs.writeFileSync(path.join(REG_DIR, 'project-registry.json'), JSON.stringify({
    globalDocsPath: GLOBAL,
    projects: [{ name: 'proj-alpha', path: PROJECT, type: 'app', description: 'fixture' }],
}, null, 2), 'utf8');
process.env.USERPROFILE = HOME;
process.env.HOME        = HOME;

// ── Mocked vscode that records what the server makes it do ──────────────────
const calls = { sendText: [], createTerminal: [], executeCommand: [], openExternal: [] };
const fakeTerminal = {
    name: 'existing',
    sendText: (t) => { calls.sendText.push(t); },
    show: () => {},
    dispose: () => {},
};
function noop() { return undefined; }
function anyObject() {
    // Anything the module touches that this test does not care about.
    return new Proxy(function () { return anyObject(); }, {
        get: (_t, k) => (k === 'then' ? undefined : anyObject()),
        apply: () => anyObject(),
    });
}
const vscodeMock = {
    window: {
        terminals: [fakeTerminal],
        createTerminal: (opts) => {
            calls.createTerminal.push(opts);
            return { ...fakeTerminal, name: opts && opts.name, sendText: (t) => { calls.sendText.push(t); } };
        },
        withProgress: (_o, fn) => Promise.resolve(fn({ report: noop }, { isCancellationRequested: false })),
        showErrorMessage: noop, showInformationMessage: noop, showWarningMessage: noop,
        createOutputChannel: () => ({ appendLine: noop, append: noop, show: noop, dispose: noop, clear: noop }),
        createWebviewPanel: () => anyObject(),
        onDidCloseTerminal: () => ({ dispose: noop }),
    },
    commands: {
        executeCommand: (...args) => { calls.executeCommand.push(args); return Promise.resolve(); },
        registerCommand: () => ({ dispose: noop }),
    },
    env: {
        openExternal: (uri) => { calls.openExternal.push(String(uri)); return Promise.resolve(true); },
        clipboard: { writeText: () => Promise.resolve() },
    },
    workspace: {
        workspaceFolders: [], getConfiguration: () => ({ get: (_k, d) => d, update: () => Promise.resolve() }),
        onDidChangeConfiguration: () => ({ dispose: noop }),
    },
    Uri: {
        file:  (p) => ({ fsPath: p, path: p, scheme: 'file', toString: () => 'file://' + p }),
        parse: (s) => ({ toString: () => s, fsPath: s }),
        joinPath: (u, ...p) => ({ fsPath: path.join(u.fsPath || '', ...p) }),
    },
    ProgressLocation: { Notification: 15 },
    ViewColumn: { One: 1, Two: 2, Beside: -2, Active: -1 },
    StatusBarAlignment: { Left: 1, Right: 2 },
    EventEmitter: class { constructor() { this.event = () => ({ dispose: noop }); } fire() {} dispose() {} },
};
const vscodeProxy = new Proxy(vscodeMock, { get: (t, k) => (k in t ? t[k] : anyObject()) });

const stubPath = path.join(TMP, 'vscode-stub.js');
fs.writeFileSync(stubPath, 'module.exports = globalThis.__reg152Vscode;', 'utf8');
globalThis.__reg152Vscode = vscodeProxy;
const realResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
    if (request === 'vscode') { return stubPath; }
    return realResolve.call(this, request, parent, ...rest);
};

// ── HTTP helper ─────────────────────────────────────────────────────────────
function get(port, pathAndQuery, host, origin) {
    return new Promise((resolve) => {
        const headers = host ? { Host: host } : {};
        if (origin) { headers.Origin = origin; }
        const req = http.request({ host: '127.0.0.1', port, path: pathAndQuery, method: 'GET', headers }, (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (c) => { body += c; });
            res.on('end', () => { const r = { status: res.statusCode, headers: res.headers, body, path: pathAndQuery }; responses.push(r); resolve(r); });
        });
        req.on('error', (e) => resolve({ status: 0, headers: {}, body: String(e) }));
        req.end();
    });
}
const q = (route, p, token) => `${route}?path=${encodeURIComponent(p)}${token === undefined ? '' : `&t=${encodeURIComponent(token)}`}`;
const responses = [];   // every response, to check none carries a CORS header
const settle = () => new Promise((r) => setTimeout(r, 50));
function reset() { for (const k of Object.keys(calls)) { if (k !== 'openExternal') { calls[k].length = 0; } } }
const nothingHappened = () => calls.sendText.length === 0 && calls.createTerminal.length === 0 && calls.executeCommand.length === 0;
const describeCalls = () => JSON.stringify({ sendText: calls.sendText, createTerminal: calls.createTerminal, executeCommand: calls.executeCommand.map(a => [a[0], a[1] && (a[1].fsPath || String(a[1]))]) });

(async () => {
    const mod = require(COMMANDS_JS);
    await mod.viewSpecificDoc();
    for (let i = 0; i < 100 && !calls.openExternal.length; i++) { await settle(); }
    const url = calls.openExternal[0] || '';
    const port = Number((url.match(/:(\d+)/) || [])[1]);
    check('the server starts and opens its page', port > 0, `openExternal calls: ${JSON.stringify(calls.openExternal)}`);
    if (!(port > 0)) { finish(); return; }

    // 1 ── the page carries a token; no CORS header
    const page = await get(port, '/');
    const m = page.body.match(/[?&]t=([0-9a-f]{64})/);
    const token = m ? m[1] : '';
    check('the page this server renders carries a 64-hex-char token', !!token, 'no t=<64 hex> in the page');
    check('the page response sends no Access-Control-Allow-Origin header',
        page.headers['access-control-allow-origin'] === undefined,
        `got: ${page.headers['access-control-allow-origin']}`);

    const routes = ['/openfolder', '/open-in-vscode', '/set-cwd', '/reveal'];
    const inProjectPath = (route) => (route === '/openfolder' ? SUBDIR : path.join(SUBDIR, 'guide.md'));

    // 2 ── no token
    for (const route of routes) {
        reset();
        const r = await get(port, q(route, inProjectPath(route)));
        await settle();
        check(`${route} without a token: 403 and nothing happens`, r.status === 403 && nothingHappened(),
            `status ${r.status}; ${describeCalls()}`);
    }

    // 3 ── wrong token (same length and different length)
    const wrong = token ? token.replace(/^./, token[0] === 'a' ? 'b' : 'a') : 'a'.repeat(64);
    for (const bad of [wrong, 'deadbeef']) {
        for (const route of routes) {
            reset();
            const r = await get(port, q(route, inProjectPath(route), bad));
            await settle();
            check(`${route} with a wrong token (${bad.length} chars): 403 and nothing happens`,
                r.status === 403 && nothingHappened(), `status ${r.status}; ${describeCalls()}`);
        }
    }

    // 4 ── foreign Host header (DNS rebinding)
    reset();
    const rebound = await get(port, q('/openfolder', SUBDIR, token), `evil.example:${port}`);
    await settle();
    check('a request with a foreign Host header: 403 and nothing happens',
        rebound.status === 403 && nothingHappened(), `status ${rebound.status}; ${describeCalls()}`);
    const reboundPage = await get(port, '/', `evil.example:${port}`);
    check('a foreign Host cannot read the page (and so the token)',
        reboundPage.status === 403 && !/[?&]t=[0-9a-f]{64}/.test(reboundPage.body), `status ${reboundPage.status}`);

    // 5 ── injection in path
    const injections = [
        path.join(SUBDIR, 'x"; echo PWNED; echo "', 'a.md'),
        'x"; calc.exe; echo "/a.md',
        `${SUBDIR}"; rm -rf ~; echo "/a.md`,
        `${SUBDIR}\n echo PWNED /a.md`,
    ];
    for (const inj of injections) {
        reset();
        const r = await get(port, q('/set-cwd', inj, token));
        await settle();
        const outside = calls.createTerminal.filter(o => !o || !o.cwd || path.resolve(o.cwd) !== path.resolve(SUBDIR));
        check(`/set-cwd injection ${JSON.stringify(inj.slice(-28))}: sendText never called, no terminal outside the project`,
            calls.sendText.length === 0 && outside.length === 0 && r.status === 403,
            `status ${r.status}; ${describeCalls()}`);
    }

    // 6 ── outside every registered project
    const outsideCases = [
        ['/openfolder', OUTSIDE], ['/openfolder', SIBLING], ['/openfolder', TMP],
        ['/open-in-vscode', path.join(OUTSIDE, 'secret.md')], ['/open-in-vscode', path.join(SIBLING, 'x.md')],
        ['/set-cwd', path.join(OUTSIDE, 'secret.md')], ['/set-cwd', path.join(SIBLING, 'x.md')],
        ['/reveal', path.join(OUTSIDE, 'secret.md')], ['/reveal', path.join(PROJECT, '..', 'outside', 'secret.md')],
    ];
    for (const [route, p] of outsideCases) {
        reset();
        const r = await get(port, q(route, p, token));
        await settle();
        check(`${route} with a valid token, path outside every project (${path.relative(TMP, p) || '.'}): 403, nothing happens`,
            r.status === 403 && nothingHappened(), `status ${r.status}; ${describeCalls()}`);
    }

    // 7 ── the real page's clicks still work
    reset();
    let r = await get(port, q('/openfolder', SUBDIR, token)); await settle();
    check('/openfolder with the token, in-project folder: opens it',
        r.status === 200 && calls.executeCommand.some(a => a[0] === 'vscode.openFolder' && path.resolve(a[1].fsPath) === path.resolve(SUBDIR)),
        `status ${r.status}; ${describeCalls()}`);

    reset();
    r = await get(port, q('/openfolder', GLOBAL, token)); await settle();
    check('/openfolder with the token, the registry global docs folder: opens it',
        r.status === 200 && calls.executeCommand.some(a => a[0] === 'vscode.openFolder'), `status ${r.status}; ${describeCalls()}`);

    reset();
    r = await get(port, q('/open-in-vscode', path.join(SUBDIR, 'guide.md'), token)); await settle();
    check('/open-in-vscode with the token, in-project doc: opens its folder',
        r.status === 200 && calls.executeCommand.some(a => a[0] === 'vscode.openFolder' && path.resolve(a[1].fsPath) === path.resolve(SUBDIR)),
        `status ${r.status}; ${describeCalls()}`);

    reset();
    r = await get(port, q('/set-cwd', path.join(SUBDIR, 'guide.md'), token)); await settle();
    check('/set-cwd with the token, in-project doc: opens a terminal in its folder, types nothing',
        r.status === 200 && calls.sendText.length === 0 && calls.createTerminal.length === 1
            && path.resolve(calls.createTerminal[0].cwd) === path.resolve(SUBDIR),
        `status ${r.status}; ${describeCalls()}`);

    reset();
    r = await get(port, q('/reveal', path.join(SUBDIR, 'guide.md'), token)); await settle();
    check('/reveal with the token, in-project doc: reveals it',
        r.status === 200 && calls.executeCommand.some(a => a[0] === 'revealInExplorer' && path.resolve(a[1].fsPath) === path.resolve(SUBDIR, 'guide.md')),
        `status ${r.status}; ${describeCalls()}`);

    // 8 ── /doc (#758)
    const guide = path.join(SUBDIR, 'guide.md');
    const doc = async (label, p, tok, expect) => {
        const r = await get(port, q('/doc', p, tok));
        const leaked = r.body.includes(SECRET);
        check(`/doc ${label}: ${expect}${expect === 403 ? ', nothing leaked' : ''}`,
            r.status === expect && !leaked, `status ${r.status}, leaked secret: ${leaked}`);
        return r;
    };
    const ok = await doc('with the token, an in-project .md', guide, token, 200);
    check('/doc serves the in-project doc', ok.body.includes('In-project guide text'), ok.body.slice(0, 200));
    const docLink = (ok.body.match(/href="(http:\/\/127\.0\.0\.1:\d+\/doc\?[^"]*)"/) || [])[1];
    check('links in a served doc carry the token, so the page keeps working',
        !!docLink && new RegExp('[?&](amp;)?t=' + token).test(docLink), `link: ${docLink}`);
    if (docLink) {
        const followed = await get(port, docLink.replace(/^http:\/\/127\.0\.0\.1:\d+/, '').replace(/&amp;/g, '&'));
        check('following a link in a served doc opens the linked doc', followed.status === 200 && followed.body.includes('Alpha'),
            `status ${followed.status}`);
    }
    await doc('without a token', guide, undefined, 403);
    await doc('with a wrong token', guide, wrong, 403);
    await doc('with a short wrong token', guide, 'deadbeef', 403);
    await doc('with the token, a file outside every project', path.join(OUTSIDE, 'secret.md'), token, 403);
    await doc('with the token, a sibling folder sharing the project name prefix', path.join(SIBLING, 'x.md'), token, 403);
    await doc('with the token, ../ out of the project', path.join(PROJECT, '..', 'outside', 'secret.md'), token, 403);
    await doc('with the token, a non-.md file inside the project', path.join(PROJECT, '.env'), token, 403);
    await doc('with the token, the double-encoded path of an outside file',
        encodeURIComponent(path.join(OUTSIDE, 'secret.md')), token, 400);

    // symlink inside the project pointing outside
    const link = path.join(SUBDIR, 'link-to-outside.md');
    let linked = false;
    try { fs.symlinkSync(path.join(OUTSIDE, 'secret.md'), link, 'file'); linked = true; }
    catch (e) {
        console.log(`  SKIP /doc symlink case: this platform cannot create a symlink without privileges (${e.code || e.message}); every other /doc case still ran`);
    }
    if (linked) {
        await doc('with the token, an in-project symlink pointing outside', link, token, 403);
    }

    // No response of any kind carries a CORS header, so a page on another
    // origin can read neither a doc nor the token in any page.
    await get(port, '/', undefined, 'https://evil.example');
    await get(port, q('/doc', guide, token), undefined, 'https://evil.example');
    await get(port, '/no-such-route');
    const withCors = responses.filter(r => r.headers['access-control-allow-origin'] !== undefined);
    check(`no response (of ${responses.length}) carries Access-Control-Allow-Origin, so another origin cannot read a doc or the token`,
        withCors.length === 0, withCors.map(r => `${r.path} -> ${r.headers['access-control-allow-origin']}`).slice(0, 5).join('\n       '));

    finish(mod);
})().catch((e) => { check('the test ran to completion', false, e && e.stack || String(e)); finish(); });

function finish(mod) {
    try { mod && mod.disposeViewServer && mod.disposeViewServer(); } catch { /* ignore */ }
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ }
    console.log('-'.repeat(64));
    console.log(`${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
}
