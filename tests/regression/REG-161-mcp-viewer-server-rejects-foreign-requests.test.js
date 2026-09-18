// Copyright (c) CieloVista Software. All rights reserved.
// REG-161: Issue #780 — the MCP Endpoint Viewer server answers only its own page
//
// Run: node tests/regression/REG-161-mcp-viewer-server-rejects-foreign-requests.test.js
//
// The MCP Endpoint Viewer (src/features/mcp-viewer/index.ts) listens on
// 127.0.0.1, but any web page the user has open can send it requests. Every
// JSON response carried Access-Control-Allow-Origin: *, and no route checked
// the caller, so any page could read project paths and doc contents, make
// /api/reveal open any path in the OS file manager, and have /md-preview
// render any .md file on disk.
//
// This test drives the REAL server (out-test build of
// src/features/mcp-viewer/index.ts) on an ephemeral port, with a mocked
// vscode that records every command call, and a temp registry (via a temp
// home folder) naming one temp project. It asserts:
//   1. the URL the command opens, and the page the server renders, carry a
//      64-hex token, and the page's fetches and links send it;
//   2. no token -> 403 on every route, and nothing is revealed or read;
//   3. a wrong token (same length, and short) -> 403 on every route;
//   4. a foreign Host header (DNS rebinding) -> 403, even with the token;
//   5. no response of any kind carries Access-Control-Allow-Origin, so a
//      cross-origin page cannot read a response (or the token in the page);
//   6. /api/reveal and /md-preview refuse a path outside every registered
//      project (outside folder, sibling sharing a name prefix, ../, a
//      double-encoded path, an in-project symlink pointing out), and nothing
//      is revealed or leaked;
//   7. /md-preview refuses a non-.md file inside the project;
//   8. a valid token + an in-project path works: /api/reveal reveals it,
//      /md-preview renders it, the JSON routes and POST /mcp answer.

'use strict';

const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const http   = require('http');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..', '..');
const VIEWER_JS = path.join(ROOT, 'out-test', 'features', 'mcp-viewer', 'index.js');

let passed = 0;
let failed = 0;
function check(name, ok, detail) {
    if (ok) { console.log(`  PASS ${name}`); passed += 1; }
    else    { console.error(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`); failed += 1; }
}

console.log('REG-161: the MCP Endpoint Viewer server answers only its own page (#780)');
console.log('-'.repeat(64));

if (!fs.existsSync(VIEWER_JS)) {
    // Not a skip: the runners build out-test/ first, so this is a real failure.
    console.error(`  FAIL out-test build missing: ${VIEWER_JS}`);
    process.exit(1);
}

// ── Temp home: registry, one project, folders outside every project ─────────
const TMP      = fs.mkdtempSync(path.join(os.tmpdir(), 'cvt-reg161-'));
const HOME     = path.join(TMP, 'home');
const PROJECT  = path.join(TMP, 'proj-alpha');
const SUBDIR   = path.join(PROJECT, 'docs');
const OUTSIDE  = path.join(TMP, 'outside');
const SIBLING  = path.join(TMP, 'proj-alpha-evil');   // shares a name prefix
const GLOBAL   = path.join(TMP, 'global-docs');
for (const d of [HOME, SUBDIR, OUTSIDE, SIBLING, GLOBAL]) { fs.mkdirSync(d, { recursive: true }); }
const SECRET = 'REG161-SECRET-VALUE-4c7e';
fs.writeFileSync(path.join(PROJECT, 'README.md'), '# Alpha\n\nA project.\n', 'utf8');
fs.writeFileSync(path.join(SUBDIR, 'guide.md'), '# Guide\n\nIn-project guide text.\n', 'utf8');
fs.writeFileSync(path.join(PROJECT, '.env'), `API_KEY=${SECRET}\n`, 'utf8');
fs.writeFileSync(path.join(OUTSIDE, 'secret.md'), `# Outside\n\n${SECRET}\n`, 'utf8');
fs.writeFileSync(path.join(SIBLING, 'x.md'), `# Sibling\n\n${SECRET}\n`, 'utf8');
fs.writeFileSync(path.join(GLOBAL, 'standards.md'), '# Standards\n', 'utf8');
const REG_DIR = path.join(HOME, 'Downloads', 'CieloVistaStandards');
fs.mkdirSync(REG_DIR, { recursive: true });
fs.writeFileSync(path.join(REG_DIR, 'project-registry.json'), JSON.stringify({
    globalDocsPath: GLOBAL,
    projects: [{ name: 'proj-alpha', path: PROJECT, type: 'app', description: 'fixture' }],
}, null, 2), 'utf8');
process.env.USERPROFILE = HOME;
process.env.HOME        = HOME;

// ── Mocked vscode that records what the server makes it do ──────────────────
const calls = { executeCommand: [], openExternal: [] };
const registered = new Map();
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
        activeTextEditor: undefined,
        terminals: [],
        withProgress: (_o, fn) => Promise.resolve(fn({ report: noop }, { isCancellationRequested: false })),
        showErrorMessage: noop, showInformationMessage: noop, showWarningMessage: noop,
        createOutputChannel: () => ({ appendLine: noop, append: noop, show: noop, dispose: noop, clear: noop }),
        createWebviewPanel: () => anyObject(),
        onDidCloseTerminal: () => ({ dispose: noop }),
    },
    commands: {
        executeCommand: (...args) => { calls.executeCommand.push(args); return Promise.resolve(); },
        registerCommand: (id, fn) => { registered.set(id, fn); return { dispose: noop }; },
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
fs.writeFileSync(stubPath, 'module.exports = globalThis.__reg161Vscode;', 'utf8');
globalThis.__reg161Vscode = vscodeProxy;
const realResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
    if (request === 'vscode') { return stubPath; }
    return realResolve.call(this, request, parent, ...rest);
};

// ── HTTP helper ─────────────────────────────────────────────────────────────
const responses = [];   // every response, to check none carries a CORS header
function request(port, method, pathAndQuery, opts = {}) {
    return new Promise((resolve) => {
        const headers = {};
        if (opts.host)   { headers.Host = opts.host; }
        if (opts.origin) { headers.Origin = opts.origin; }
        let body;
        if (opts.json !== undefined) {
            body = JSON.stringify(opts.json);
            headers['Content-Type'] = 'application/json';
            headers['Content-Length'] = Buffer.byteLength(body);
        }
        const req = http.request({ host: '127.0.0.1', port, path: pathAndQuery, method, headers }, (res) => {
            let text = '';
            res.setEncoding('utf8');
            res.on('data', (c) => { text += c; });
            res.on('end', () => {
                const r = { status: res.statusCode, headers: res.headers, body: text, path: `${method} ${pathAndQuery}` };
                responses.push(r); resolve(r);
            });
        });
        req.on('error', (e) => resolve({ status: 0, headers: {}, body: String(e), path: pathAndQuery }));
        if (body) { req.write(body); }
        req.end();
    });
}
const get  = (port, p, opts) => request(port, 'GET', p, opts);
const post = (port, p, json, opts) => request(port, 'POST', p, { ...(opts || {}), json });
const withToken = (p, token) => (token === undefined ? p : `${p}${p.includes('?') ? '&' : '?'}t=${encodeURIComponent(token)}`);
const pathQ = (route, p, token) => withToken(`${route}?path=${encodeURIComponent(p)}`, token);
const settle = () => new Promise((r) => setTimeout(r, 50));
function reset() { calls.executeCommand.length = 0; }
const nothingRevealed = () => calls.executeCommand.length === 0;
const describeCalls = () => JSON.stringify(calls.executeCommand.map(a => [a[0], a[1] && (a[1].fsPath || String(a[1]))]));
const leaks = (r) => r.body.includes(SECRET) || r.body.includes(PROJECT);
const rpc = (method, params) => ({ jsonrpc: '2.0', id: 1, method, params: params || {} });

(async () => {
    const mod = require(VIEWER_JS);
    mod.activate({ subscriptions: [] });
    const open = registered.get('cvs.mcp.viewer.open');
    check('the viewer command is registered', typeof open === 'function');
    if (typeof open !== 'function') { finish(mod); return; }
    open();
    for (let i = 0; i < 100 && !calls.openExternal.length; i++) { await settle(); }
    const opened = calls.openExternal[0] || '';
    const port = Number((opened.match(/:(\d+)\//) || [])[1]);
    check('the server starts and opens its page', port > 0, `openExternal calls: ${JSON.stringify(calls.openExternal)}`);
    if (!(port > 0)) { finish(mod); return; }

    // 1 ── the opened URL and the page carry the token; the page sends it
    const tm = opened.match(/[?&]t=([0-9a-f]{64})(?:&|$)/);
    const token = tm ? tm[1] : '';
    check('the URL the command opens carries a 64-hex-char token', !!token, `opened: ${opened}`);
    const page = await get(port, withToken('/', token));
    check('the page, opened with the token, loads', page.status === 200, `status ${page.status}`);
    check('the page this server renders carries the token', !!token && page.body.includes(token), 'token not in the page');
    const pageToken = (page.body.match(/var TOKEN = '([0-9a-f]{64})'/) || [])[1];
    check('the page script sends the token on every request (MCP_URL and md-preview links use it)',
        pageToken === token
            && /var MCP_URL = BASE \+ '\/mcp\?t=' \+ TOKEN;/.test(page.body)
            && !/fetch\(BASE \+ '\/mcp'/.test(page.body)
            && /\/md-preview\?t=' \+ TOKEN/.test(page.body),
        `page token matches: ${pageToken === token}`);

    const guide = path.join(SUBDIR, 'guide.md');
    const guarded = [
        ['GET',  '/'],
        ['GET',  '/api/list_projects'],
        ['GET',  '/api/find_project?query=alpha'],
        ['GET',  '/api/search_docs?query=guide'],
        ['GET',  '/api/get_catalog'],
        // /api/active_markdown and /api/list_markdown_paths were deleted with the
        // Dewey forms that used them (#707 stage 3); /no-such-route below still
        // proves an unknown path is refused before routing.
        ['GET',  '/api/list_symbols'],
        ['GET',  '/api/list_cvt_commands'],
        ['GET',  `/api/reveal?path=${encodeURIComponent(guide)}`],
        ['GET',  `/md-preview?path=${encodeURIComponent(guide)}`],
        ['POST', '/mcp'],
        ['GET',  '/no-such-route'],
    ];
    const send = (method, p, tok, opts) => (method === 'POST'
        ? post(port, withToken(p, tok), rpc('list_projects'), opts)
        : get(port, withToken(p, tok), opts));

    // 2 ── no token
    for (const [method, p] of guarded) {
        reset();
        const r = await send(method, p, undefined);
        await settle();
        check(`${method} ${p.split('?')[0]} without a token: 403, nothing revealed, nothing read`,
            r.status === 403 && nothingRevealed() && !leaks(r), `status ${r.status}; ${describeCalls()}; body ${r.body.slice(0, 120)}`);
    }

    // 3 ── wrong token (same length and different length)
    const wrong = token ? token.replace(/^./, token[0] === 'a' ? 'b' : 'a') : 'a'.repeat(64);
    for (const bad of [wrong, 'deadbeef']) {
        for (const [method, p] of guarded) {
            reset();
            const r = await send(method, p, bad);
            await settle();
            check(`${method} ${p.split('?')[0]} with a wrong token (${bad.length} chars): 403, nothing revealed, nothing read`,
                r.status === 403 && nothingRevealed() && !leaks(r), `status ${r.status}; ${describeCalls()}`);
        }
    }

    // 4 ── foreign Host header (DNS rebinding), even with the right token
    for (const [method, p] of [['GET', '/'], ['GET', '/api/list_projects'], ['GET', `/api/reveal?path=${encodeURIComponent(guide)}`],
                               ['GET', `/md-preview?path=${encodeURIComponent(guide)}`], ['POST', '/mcp']]) {
        reset();
        const r = await send(method, p, token, { host: `evil.example:${port}` });
        await settle();
        check(`${method} ${p.split('?')[0]} with a foreign Host header and the token: 403, nothing happens`,
            r.status === 403 && nothingRevealed() && !leaks(r) && !r.body.includes(token), `status ${r.status}; ${describeCalls()}`);
    }

    // 6 ── /api/reveal and /md-preview: paths outside every registered project
    const outsidePaths = [
        ['a file outside every project', path.join(OUTSIDE, 'secret.md'), 403],
        ['a folder outside every project', OUTSIDE, 403],
        ['a sibling folder sharing the project name prefix', path.join(SIBLING, 'x.md'), 403],
        ['../ out of the project', path.join(PROJECT, '..', 'outside', 'secret.md'), 403],
        ['the temp root above the project', TMP, 403],
        ['a relative path', 'secret.md', 400],
        ['the double-encoded path of an outside file', encodeURIComponent(path.join(OUTSIDE, 'secret.md')), 400],
    ];
    for (const [label, p, expect] of outsidePaths) {
        reset();
        const r = await get(port, pathQ('/api/reveal', p, token));
        await settle();
        check(`/api/reveal with the token, ${label}: ${expect}, nothing revealed`,
            r.status === expect && nothingRevealed(), `status ${r.status}; ${describeCalls()}`);
    }
    for (const [label, p, expect] of outsidePaths) {
        if (!/\.md$/i.test(p) && expect === 403) { continue; }   // folders are refused as non-.md below
        const r = await get(port, pathQ('/md-preview', p, token));
        check(`/md-preview with the token, ${label}: ${expect}, nothing leaked`,
            r.status === expect && !r.body.includes(SECRET), `status ${r.status}, leaked secret: ${r.body.includes(SECRET)}`);
    }
    reset();
    const missing = await get(port, pathQ('/api/reveal', path.join(SUBDIR, 'no-such.md'), token));
    await settle();
    check('/api/reveal with the token, a missing in-project path: 404, nothing revealed',
        missing.status === 404 && nothingRevealed(), `status ${missing.status}; ${describeCalls()}`);

    // symlink inside the project pointing outside
    const link = path.join(SUBDIR, 'link-to-outside.md');
    let linked = false;
    try { fs.symlinkSync(path.join(OUTSIDE, 'secret.md'), link, 'file'); linked = true; }
    catch (e) {
        console.log(`  SKIP symlink cases: this platform cannot create a symlink without privileges (${e.code || e.message}); every other case still ran`);
    }
    if (linked) {
        reset();
        const rr = await get(port, pathQ('/api/reveal', link, token));
        await settle();
        check('/api/reveal with the token, an in-project symlink pointing outside: 403, nothing revealed',
            rr.status === 403 && nothingRevealed(), `status ${rr.status}; ${describeCalls()}`);
        const rm = await get(port, pathQ('/md-preview', link, token));
        check('/md-preview with the token, an in-project symlink pointing outside: 403, nothing leaked',
            rm.status === 403 && !rm.body.includes(SECRET), `status ${rm.status}`);
    }

    // 7 ── /md-preview serves only .md files
    for (const [label, p] of [['a non-.md file inside the project', path.join(PROJECT, '.env')], ['an in-project folder', SUBDIR]]) {
        const r = await get(port, pathQ('/md-preview', p, token));
        check(`/md-preview with the token, ${label}: 403, nothing leaked`,
            r.status === 403 && !r.body.includes(SECRET), `status ${r.status}, leaked secret: ${r.body.includes(SECRET)}`);
    }

    // 8 ── the real page keeps working
    reset();
    let r = await get(port, pathQ('/api/reveal', guide, token)); await settle();
    check('/api/reveal with the token, an in-project doc: reveals it',
        r.status === 200 && calls.executeCommand.some(a => a[0] === 'revealFileInOS' && path.resolve(a[1].fsPath) === fs.realpathSync(guide)),
        `status ${r.status}; ${describeCalls()}`);
    reset();
    r = await get(port, pathQ('/api/reveal', path.join(GLOBAL, 'standards.md'), token)); await settle();
    check('/api/reveal with the token, a doc in the registry global docs folder: reveals it',
        r.status === 200 && calls.executeCommand.some(a => a[0] === 'revealFileInOS'), `status ${r.status}; ${describeCalls()}`);

    const back = `http://127.0.0.1:${port}/?t=${token}`;
    const preview = await get(port, `${pathQ('/md-preview', guide, token)}&back=${encodeURIComponent(back)}`);
    check('/md-preview with the token, an in-project .md: renders it',
        preview.status === 200 && preview.body.includes('In-project guide text'), `status ${preview.status}`);
    check('the md-preview page sends the token on its reveal call and its .md links',
        new RegExp(`var TOKEN = ["']${token}["']`).test(preview.body)
            && /fetch\('\/api\/reveal\?t=' \+ TOKEN \+ '&path='/.test(preview.body)
            && /'\/md-preview\?t=' \+ TOKEN \+ '&path='/.test(preview.body),
        'token not wired into the md-preview page script');
    check('the md-preview Back button returns to the viewer page, token included',
        preview.body.includes(JSON.stringify(back)), 'back URL missing');
    const jsBack = await get(port, `${pathQ('/md-preview', guide, token)}&back=${encodeURIComponent('javascript:alert(document.domain)')}`);
    check('/md-preview drops a back URL that is not this server (no javascript: navigation)',
        jsBack.status === 200 && !jsBack.body.includes('javascript:alert'), `status ${jsBack.status}`);

    const list = await get(port, withToken('/api/list_projects', token));
    let listJson = {};
    try { listJson = JSON.parse(list.body); } catch { /* checked below */ }
    check('/api/list_projects with the token: 200 and lists the registered project',
        list.status === 200 && (listJson.projects || []).some(p => p.name === 'proj-alpha'), `status ${list.status}`);

    const viaRpc = await post(port, withToken('/mcp', token), rpc('list_projects'));
    let rpcJson = {};
    try { rpcJson = JSON.parse(viaRpc.body); } catch { /* checked below */ }
    check('POST /mcp with the token: list_projects answers',
        viaRpc.status === 200 && ((rpcJson.result || {}).projects || []).some(p => p.name === 'proj-alpha'), `status ${viaRpc.status}`);

    // 5 ── no response of any kind carries a CORS header, so a page on
    // another origin can read neither the data nor the token in the page.
    await get(port, withToken('/', token), { origin: 'https://evil.example' });
    await get(port, withToken('/api/list_projects', token), { origin: 'https://evil.example' });
    await post(port, withToken('/mcp', token), rpc('list_projects'), { origin: 'https://evil.example' });
    await request(port, 'OPTIONS', withToken('/mcp', token), { origin: 'https://evil.example' });
    const withCors = responses.filter(x => x.headers['access-control-allow-origin'] !== undefined);
    check(`no response (of ${responses.length}) carries Access-Control-Allow-Origin, so another origin cannot read data or the token`,
        withCors.length === 0, withCors.map(x => `${x.path} -> ${x.headers['access-control-allow-origin']}`).slice(0, 5).join('\n       '));

    finish(mod);
})().catch((e) => { check('the test ran to completion', false, e && e.stack || String(e)); finish(); });

function finish(mod) {
    try { mod && mod.disposeMcpViewerServer && mod.disposeMcpViewerServer(); } catch { /* ignore */ }
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ }
    console.log('-'.repeat(64));
    console.log(`${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
}
