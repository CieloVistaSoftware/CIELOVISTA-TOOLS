// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * REG-149: Issue #741 — View a Doc and the content viewer show the images
 * stored next to a document, and View a Doc serves nothing else.
 *
 * Part 1, View a Doc. Starts the REAL server (viewSpecificDoc from the
 * per-module build in out-test/) against a fake project registry in
 * os.tmpdir(), on the ephemeral port it picks, and talks to it over HTTP:
 *
 *   - the rendered doc's relative images point at the server's /img route,
 *     and fetching them returns the right bytes with an image Content-Type
 *   - https: and data: images are left as written
 *   - the rewritten srcs carry the server's random token, and /img refuses a
 *     request without it, with an empty, wrong or truncated one (#752: any
 *     web page can reach 127.0.0.1, only this server's pages have the token)
 *   - with the token, the /img route still refuses: ../ traversal (raw, URL-encoded, %2e%2e,
 *     double-encoded), absolute paths outside the registered projects,
 *     relative paths, NUL bytes, non-image files inside a project (.env, .ts,
 *     .txt, the .md itself), a junction/symlink whose target escapes the
 *     project, and non-GET methods — and a refusal never carries the file
 *   - image responses are nosniff and carry no Access-Control-Allow-Origin
 *
 * Part 2, content viewer. Calls the real showContentViewer with a stub
 * webview: given the file path, relative images become webview URIs of the
 * resolved files and their folders become localResourceRoots, and the roots
 * follow the document when the panel is reused. docs-manager passes the path.
 *
 * Fixtures live in os.tmpdir(); nothing is written to the repo tree.
 */
'use strict';

const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const http   = require('http');
const Module = require('module');

const ROOT         = path.resolve(__dirname, '..', '..');
const COMMANDS_MOD = path.join(ROOT, 'out-test', 'features', 'doc-catalog', 'commands.js');
const VIEWER_MOD   = path.join(ROOT, 'out-test', 'shared', 'content-viewer.js');

let passed = 0;
let failed = 0;
function check(label, condition, detail) {
    if (condition) { console.log(`  PASS - ${label}`); passed++; }
    else { console.log(`  FAIL - ${label}${detail ? `\n         ${detail}` : ''}`); failed++; }
}

for (const mod of [COMMANDS_MOD, VIEWER_MOD]) {
    if (!fs.existsSync(mod)) {
        // Not a skip: the runners build out-test/ before any test starts (#734).
        console.error(`FAIL: ${path.relative(ROOT, mod)} is missing — run node scripts/build-test-modules.mjs`);
        process.exit(1);
    }
}

// ── Fixtures ─────────────────────────────────────────────────────────────────
const tmp      = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'reg149-')));
const home     = path.join(tmp, 'home');
const globalD  = path.join(tmp, 'global-docs');
const proj     = path.join(tmp, 'proj');
const docsDir  = path.join(proj, 'docs');
const imgDir   = path.join(proj, 'images');
const outside  = path.join(tmp, 'outside');
for (const d of [path.join(home, 'Downloads', 'CieloVistaStandards'), globalD, docsDir, imgDir,
    path.join(proj, 'src'), outside]) {
    fs.mkdirSync(d, { recursive: true });
}

const PNG    = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from('diagram-bytes')]);
const LOGO   = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from('logo-bytes')]);
const SPACED = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from('spaced-bytes')]);
const SECRET = 'TOP-SECRET-REG149';

fs.writeFileSync(path.join(docsDir, 'diagram.png'), PNG);
fs.writeFileSync(path.join(docsDir, 'my pic.png'), SPACED);
fs.writeFileSync(path.join(imgDir, 'logo.png'), LOGO);
fs.writeFileSync(path.join(outside, 'secret.png'), SECRET);
fs.writeFileSync(path.join(proj, '.env'), `API_KEY=${SECRET}`);
fs.writeFileSync(path.join(proj, 'src', 'code.ts'), `export const k = '${SECRET}';`);
fs.writeFileSync(path.join(docsDir, 'notes.txt'), SECRET);
fs.writeFileSync(path.join(globalD, 'GLOBAL.md'), '# Global\n');

// A directory link inside the project whose target is outside it. 'junction'
// needs no privilege on Windows and is ignored (plain dir symlink) elsewhere.
const escapeLink = path.join(docsDir, 'escape');
fs.symlinkSync(outside, escapeLink, 'junction');

const DATA_URI = 'data:image/png;base64,iVBORw0KGgo=';
const REMOTE   = 'https://example.com/remote.png';
const guideDoc = path.join(docsDir, 'guide.md');
fs.writeFileSync(guideDoc, [
    '# Guide',
    '',
    `![remote](${REMOTE})`,
    '',
    `![inline](${DATA_URI})`,
    '',
    '![relative](./diagram.png)',
    '',
    '![parent](../images/logo.png)',
    '',
    '![spaced](./my%20pic.png)',
    '',
    '![escape](../../outside/secret.png)',
    '',
].join('\n'));

fs.writeFileSync(path.join(home, 'Downloads', 'CieloVistaStandards', 'project-registry.json'), JSON.stringify({
    globalDocsPath: globalD,
    projects: [{ name: 'reg149proj', path: proj, type: 'app', description: 'REG-149 fixture' }],
}, null, 2));

// REGISTRY_PATH is computed from os.homedir() when registry.js loads.
process.env.HOME        = home;
process.env.USERPROFILE = home;

// ── Stub vscode ──────────────────────────────────────────────────────────────
const CSP_SOURCE = 'vscode-resource://stub';
function toWebviewUri(fsPath) {
    return `${CSP_SOURCE}/file/${fsPath.replace(/\\/g, '/').replace(/^\/+/, '')}`;
}
const state = { externalUrl: undefined, onExternal: undefined, panel: undefined, panelsCreated: 0 };
const noop  = () => ({ dispose() {} });
const vscodeStub = {
    ViewColumn: { One: 1, Two: 2, Beside: -2 },
    ProgressLocation: { Notification: 15 },
    Uri: {
        file: (p) => ({ fsPath: p, scheme: 'file', toString: () => `file:///${p.replace(/\\/g, '/')}` }),
        parse: (s) => ({ toString: () => s }),
    },
    env: {
        openExternal: async (uri) => {
            state.externalUrl = uri.toString();
            if (state.onExternal) { state.onExternal(state.externalUrl); }
            return true;
        },
    },
    commands: { executeCommand: async () => undefined, registerCommand: noop },
    workspace: { workspaceFolders: [], getConfiguration: () => ({ get: () => undefined }), openTextDocument: async () => ({}) },
    window: {
        showWarningMessage() {}, showInformationMessage() {}, showErrorMessage() {},
        showTextDocument: async () => undefined,
        withProgress: async (_opts, fn) => fn({ report() {} }),
        createOutputChannel: () => ({ appendLine() {}, append() {}, show() {}, dispose() {} }),
        createWebviewPanel(viewType, title, column, options) {
            state.panelsCreated++;
            const webview = {
                html: '',
                options,
                cspSource: CSP_SOURCE,
                asWebviewUri: (uri) => ({ toString: () => toWebviewUri(uri.fsPath) }),
                onDidReceiveMessage: noop,
                postMessage: async () => true,
            };
            state.panel = { viewType, title, webview, reveal() {}, dispose() {}, onDidDispose: noop };
            return state.panel;
        },
    },
};

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') { return vscodeStub; }
    return origLoad.call(this, request, parent, isMain);
};
const commands = require(COMMANDS_MOD);
const viewer   = require(VIEWER_MOD);

// ── HTTP helpers ─────────────────────────────────────────────────────────────
let PORT = 0;
function request(rawPath, method = 'GET') {
    return new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port: PORT, path: rawPath, method }, (res) => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
        });
        req.on('error', reject);
        req.setTimeout(10000, () => req.destroy(new Error(`timeout: ${rawPath}`)));
        req.end();
    });
}
// The server's token, learned the way a browser learns it: from the rendered page.
let TOKEN = '';
const withToken = (q, token = TOKEN) => `${q}&t=${encodeURIComponent(token)}`;
const imgPath = (p, token) => withToken(`/img?path=${encodeURIComponent(p)}`, token);
/** Put a raw string in the query, escaping only what an HTTP request line cannot carry. */
const rawQuery = (p) => withToken(`/img?path=${p.replace(/ /g, '%20').replace(/#/g, '%23').replace(/\?/g, '%3F').replace(/&/g, '%26')}`);

function imgSrcs(html) {
    const content = html.split('<div id="content">')[1] || '';
    return [...content.matchAll(/<img\b[^>]*\ssrc="([^"]*)"/gi)].map(m => m[1].replace(/&amp;/g, '&'));
}
function samePath(a, b) { return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase(); }

async function refused(label, rawPath, expectStatus) {
    const r = await request(rawPath);
    const leaked = r.body.includes(SECRET);
    check(`${label} is refused with ${expectStatus}`, r.status === expectStatus && !leaked,
        `status ${r.status}, leaked secret: ${leaked}, request ${rawPath}`);
}

async function partViewADoc() {
    console.log('\n  -- View a Doc (real HTTP server) --');
    const opened = new Promise((resolve) => { state.onExternal = resolve; });
    await commands.viewSpecificDoc();
    const url = await Promise.race([opened, new Promise(r => setTimeout(() => r(undefined), 15000))]);
    check('viewSpecificDoc started the server and opened it in the browser', !!url, `url: ${url}`);
    if (!url) { return; }
    PORT = Number(new URL(url).port);
    const origin = `http://127.0.0.1:${PORT}`;

    const page = await request(`/doc?path=${encodeURIComponent(guideDoc)}`);
    check('/doc renders the guide', page.status === 200, `status ${page.status}`);
    const srcs = imgSrcs(page.body.toString('utf8'));
    check('all six images were rendered as <img>', srcs.length === 6, `srcs: ${JSON.stringify(srcs)}`);
    check('https: image src is left as written', srcs.includes(REMOTE));
    check('data: image src is left as written', srcs.includes(DATA_URI));
    check('no image src is left as a bare relative path',
        !srcs.some(s => !/^[a-z][a-z0-9+.-]*:/i.test(s)), `srcs: ${JSON.stringify(srcs)}`);

    const routed = srcs.filter(s => s.startsWith(`${origin}/img?`));
    TOKEN = routed.length ? (new URL(routed[0]).searchParams.get('t') || '') : '';
    check('rewritten image srcs carry a server token of at least 32 hex chars', /^[0-9a-f]{32,}$/.test(TOKEN), `token: ${TOKEN}`);
    check('every rewritten image src carries the same token',
        routed.length > 0 && routed.every(s => new URL(s).searchParams.get('t') === TOKEN));

    const expected = [
        ['./diagram.png', path.join(docsDir, 'diagram.png'), PNG],
        ['../images/logo.png', path.join(imgDir, 'logo.png'), LOGO],
        ['./my%20pic.png', path.join(docsDir, 'my pic.png'), SPACED],
    ];
    for (const [label, abs, bytes] of expected) {
        const want = `${origin}${imgPath(abs)}`;
        check(`${label} is rewritten to the server's image route for the resolved file`,
            srcs.includes(want), `want ${want}\n         srcs: ${JSON.stringify(srcs)}`);
        const src = srcs.find(s => s === want) || want;
        const r = await request(src.slice(origin.length));
        check(`fetching ${label} through the route returns the file's bytes`,
            r.status === 200 && r.body.equals(bytes), `status ${r.status}, ${r.body.length} bytes`);
        check(`${label} is served as image/png`, r.headers['content-type'] === 'image/png', `content-type ${r.headers['content-type']}`);
        check(`${label} is served with X-Content-Type-Options: nosniff`, r.headers['x-content-type-options'] === 'nosniff');
        check(`${label} carries no Access-Control-Allow-Origin`, r.headers['access-control-allow-origin'] === undefined,
            `ACAO ${r.headers['access-control-allow-origin']}`);
    }

    // The doc's own ../../outside image resolves outside every registered project.
    const escSrc = srcs.find(s => s.includes(encodeURIComponent(path.join(outside, 'secret.png'))));
    check('../../outside/secret.png is rewritten to the route (so the server can judge it)', !!escSrc, `srcs: ${JSON.stringify(srcs)}`);
    if (escSrc) { await refused("the doc's own ../../outside image", escSrc.slice(origin.length), 403); }

    // ── Token: another web page does not have it ─────────────────────────────
    const allowed = path.join(docsDir, 'diagram.png');
    await refused('an allowed image requested without the token', `/img?path=${encodeURIComponent(allowed)}`, 403);
    await refused('an allowed image requested with an empty token', imgPath(allowed, ''), 403);
    const wrong = TOKEN ? (TOKEN[0] === 'a' ? 'b' : 'a') + TOKEN.slice(1) : 'x'.repeat(64);
    await refused('an allowed image requested with a wrong token of the right length', imgPath(allowed, wrong), 403);
    await refused('an allowed image requested with a truncated token', imgPath(allowed, TOKEN.slice(0, -1)), 403);
    const noTok = await request(`/img?path=${encodeURIComponent(allowed)}`);
    check('a refused request does not return the image bytes', !noTok.body.includes(PNG), `status ${noTok.status}`);

    // ── Traversal and scope attacks against /img directly (with the token, so
    //    the path checks themselves are what refuses them) ─────────────────────
    const secret = path.join(outside, 'secret.png');
    const viaDots = `${docsDir}${path.sep}..${path.sep}..${path.sep}outside${path.sep}secret.png`;
    await refused('raw ../../.. traversal from inside the project', rawQuery(viaDots), 403);
    await refused('URL-encoded ../../.. traversal', imgPath(viaDots), 403);
    await refused('%2e%2e traversal', rawQuery(`${docsDir}/%2e%2e/%2e%2e/outside/secret.png`), 403);
    await refused('%2E%2E%2F traversal (encoded slashes)', rawQuery(`${docsDir}/%2E%2E%2F%2E%2E%2Foutside%2Fsecret.png`), 403);
    const dbl = await request(rawQuery(`${docsDir}/%252e%252e/%252e%252e/outside/secret.png`));
    check('double-encoded %252e%252e traversal does not serve the file',
        dbl.status !== 200 && !dbl.body.includes(SECRET), `status ${dbl.status}`);
    await refused('an absolute path outside the registered projects', imgPath(secret), 403);
    await refused('an absolute path to the OS root', imgPath(path.resolve('/etc/passwd.png')), 403);
    await refused('a relative path', imgPath('docs/diagram.png'), 400);
    await refused('a relative ../ path', imgPath('../outside/secret.png'), 400);
    await refused('a NUL byte in the path', imgPath(`${path.join(docsDir, 'diagram.png')}\0.png`), 400);
    await refused('an empty path', withToken('/img?path='), 400);
    await refused('no path parameter', `/img?t=${encodeURIComponent(TOKEN)}`, 400);
    await refused('.env inside the project', imgPath(path.join(proj, '.env')), 403);
    await refused('a .ts file inside the project', imgPath(path.join(proj, 'src', 'code.ts')), 403);
    await refused('a .txt file next to the doc', imgPath(path.join(docsDir, 'notes.txt')), 403);
    await refused('the markdown document itself', imgPath(guideDoc), 403);
    await refused('a link inside the project whose target is outside it', imgPath(path.join(escapeLink, 'secret.png')), 403);
    await refused('a missing image inside the project', imgPath(path.join(docsDir, 'nope.png')), 404);
    await refused('a folder inside the project', imgPath(path.join(docsDir, 'escape')), 403);

    const post = await request(imgPath(path.join(docsDir, 'diagram.png')), 'POST');
    check('POST to the image route is refused with 405', post.status === 405, `status ${post.status}`);
    const head = await request(imgPath(path.join(docsDir, 'diagram.png')), 'HEAD');
    check('HEAD on an allowed image answers 200 with no body', head.status === 200 && head.body.length === 0, `status ${head.status}`);

    commands.disposeViewServer();
}

function partContentViewer() {
    console.log('\n  -- Content viewer (webview) --');
    const md = fs.readFileSync(guideDoc, 'utf8');
    state.panel = undefined;
    viewer.showContentViewer({ title: 'guide.md', content: md, isHtml: false, filePath: guideDoc });
    const panel = state.panel;
    check('showContentViewer created a webview panel', !!panel);
    if (!panel) { return; }
    const srcs = imgSrcs(panel.webview.html);
    check('https: image src is left as written', srcs.includes(REMOTE));
    check('data: image src is left as written', srcs.includes(DATA_URI));
    check('./diagram.png becomes the webview URI of the file next to the doc',
        srcs.includes(toWebviewUri(path.join(docsDir, 'diagram.png'))), `srcs: ${JSON.stringify(srcs)}`);
    check('../images/logo.png becomes the webview URI of the resolved file',
        srcs.includes(toWebviewUri(path.join(imgDir, 'logo.png'))), `srcs: ${JSON.stringify(srcs)}`);
    check('no image src is left as a bare relative path',
        !srcs.some(s => !/^[a-z][a-z0-9+.-]*:/i.test(s)), `srcs: ${JSON.stringify(srcs)}`);

    const roots = ((panel.webview.options && panel.webview.options.localResourceRoots) || []).map(u => u.fsPath);
    check("the doc's folder is a localResourceRoot", roots.some(r => samePath(r, docsDir)), `roots: ${JSON.stringify(roots)}`);
    check("the ../images folder is a localResourceRoot", roots.some(r => samePath(r, imgDir)), `roots: ${JSON.stringify(roots)}`);
    check('scripts stay enabled', !!(panel.webview.options && panel.webview.options.enableScripts));

    // Reuse the panel for a doc elsewhere: the roots must follow it.
    const otherDoc = path.join(globalD, 'OTHER.md');
    fs.writeFileSync(path.join(globalD, 'g.png'), PNG);
    fs.writeFileSync(otherDoc, '# Other\n\n![g](g.png)\n');
    viewer.showContentViewer({ title: 'OTHER.md', content: fs.readFileSync(otherDoc, 'utf8'), filePath: otherDoc });
    check('the second document reuses the same panel', state.panel === panel && state.panelsCreated >= 1);
    const srcs2 = imgSrcs(panel.webview.html);
    check("the second doc's image is rewritten against ITS folder",
        srcs2.includes(toWebviewUri(path.join(globalD, 'g.png'))), `srcs: ${JSON.stringify(srcs2)}`);
    const roots2 = ((panel.webview.options && panel.webview.options.localResourceRoots) || []).map(u => u.fsPath);
    check("the second doc's folder is now a root", roots2.some(r => samePath(r, globalD)), `roots: ${JSON.stringify(roots2)}`);
    check("the first doc's folders are no longer roots",
        !roots2.some(r => samePath(r, docsDir) || samePath(r, imgDir)), `roots: ${JSON.stringify(roots2)}`);
    viewer.disposeContentViewer();

    // docs-manager is the caller that reads the file; it must hand over the path.
    const dmSrc = fs.readFileSync(path.join(ROOT, 'src', 'features', 'docs-manager.ts'), 'utf8');
    const call  = (dmSrc.match(/showContentViewer\(\{[^}]*\}\)/) || [''])[0];
    check('docs-manager passes the file path to showContentViewer', /\bfilePath\b/.test(call), `call: ${call}`);
}

(async () => {
    try {
        await partViewADoc();
        partContentViewer();
    } catch (err) {
        check('no unexpected error', false, err && err.stack ? err.stack : String(err));
    } finally {
        try { commands.disposeViewServer(); } catch { /* already closed */ }
        Module._load = origLoad;
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
    }
    console.log(`\nREG-149: ${passed} passed, ${failed} failed`);
    process.exit(failed === 0 ? 0 : 1);
})();
