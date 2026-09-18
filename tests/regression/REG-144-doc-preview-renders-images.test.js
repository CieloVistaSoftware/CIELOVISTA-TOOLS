// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * REG-144: Issue #737 — the doc preview shows the images in a document.
 *
 * Since e29f04c the preview's Content-Security-Policy had no img-src, so
 * default-src 'none' blocked every image, and a relative image path was left
 * as a bare path the webview cannot load.
 *
 * This test opens real markdown files through the real openDocPreview (the
 * per-module build in out-test/, with a stub vscode that behaves like a
 * webview) and checks what the webview would actually do:
 *
 *   - every <img> in the page is allowed by the page's own CSP
 *     (https:, data: and local files; plain http: is not allowed)
 *   - https: and data: sources are left as written
 *   - relative sources (./x.png and ../y.png) become webview URIs of the
 *     right absolute file, and each file's folder is a localResourceRoot
 *   - navigating to a second document in another folder moves the roots
 *     and rewrites that document's images too (the reused-panel path)
 *
 * Fixtures live in os.tmpdir(); nothing is written to the repo tree.
 */
'use strict';

const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const Module = require('module');

const ROOT    = path.resolve(__dirname, '..', '..');
const OUT_MOD = path.join(ROOT, 'out-test', 'shared', 'doc-preview.js');

let passed = 0;
let failed = 0;
function check(label, condition, detail) {
    if (condition) { console.log(`  PASS - ${label}`); passed++; }
    else { console.log(`  FAIL - ${label}${detail ? `\n         ${detail}` : ''}`); failed++; }
}

if (!fs.existsSync(OUT_MOD)) {
    // Not a skip: the runners build out-test/ before any test starts (#734).
    console.error(`FAIL: ${path.relative(ROOT, OUT_MOD)} is missing — run node scripts/build-test-modules.mjs`);
    process.exit(1);
}

// ── Stub vscode: just enough webview behaviour to observe the preview ────────
// A non-https scheme on purpose: local images must be allowed by cspSource
// itself, not only by the https: that also covers the real VS Code origin.
const CSP_SOURCE = 'vscode-resource://stub';
function toWebviewUri(fsPath) {
    return `${CSP_SOURCE}/file/${fsPath.replace(/\\/g, '/').replace(/^\/+/, '')}`;
}

const state = { panel: undefined, createOptions: undefined };
const vscodeStub = {
    ViewColumn: { One: 1, Beside: 2 },
    Uri: {
        file: (p) => ({ fsPath: p, scheme: 'file', toString: () => `file:///${p.replace(/\\/g, '/')}` }),
        parse: (s) => ({ toString: () => s }),
    },
    env: { openExternal: async () => true },
    commands: { executeCommand: async () => undefined, registerCommand: () => ({ dispose() {} }) },
    workspace: { workspaceFolders: [], openTextDocument: async () => ({}) },
    window: {
        showWarningMessage() {}, showInformationMessage() {}, showErrorMessage() {},
        showTextDocument: async () => undefined,
        createTerminal: () => ({ show() {}, sendText() {} }),
        createOutputChannel: () => ({ appendLine() {}, append() {}, show() {}, dispose() {} }),
        createWebviewPanel(viewType, title, column, options) {
            state.createOptions = options;
            const webview = {
                html: '',
                options: options,
                cspSource: CSP_SOURCE,
                asWebviewUri: (uri) => ({ toString: () => toWebviewUri(uri.fsPath) }),
                onDidReceiveMessage: () => ({ dispose() {} }),
                postMessage: async () => true,
            };
            state.panel = {
                viewType, title, webview,
                reveal() {}, dispose() {},
                onDidDispose: () => ({ dispose() {} }),
            };
            return state.panel;
        },
    },
};

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') { return vscodeStub; }
    return origLoad.call(this, request, parent, isMain);
};
const { openDocPreview } = require(OUT_MOD);

// ── Fixtures ─────────────────────────────────────────────────────────────────
const tmp     = fs.mkdtempSync(path.join(os.tmpdir(), 'reg144-'));
const docDir  = path.join(tmp, 'docs', 'guide');
const shared  = path.join(tmp, 'docs', 'shared');
const other   = path.join(tmp, 'elsewhere');
for (const d of [docDir, shared, other]) { fs.mkdirSync(d, { recursive: true }); }
const PNG = Buffer.from('89504e470d0a1a0a', 'hex');
fs.writeFileSync(path.join(docDir, 'diagram.png'), PNG);
fs.writeFileSync(path.join(shared, 'logo.png'), PNG);
fs.writeFileSync(path.join(other, 'second.png'), PNG);

const DATA_URI  = 'data:image/png;base64,iVBORw0KGgo=';
const REMOTE    = 'https://example.com/remote.png';
const firstDoc  = path.join(docDir, 'README.md');
const secondDoc = path.join(other, 'NOTES.md');
fs.writeFileSync(firstDoc, [
    '# Images',
    '',
    `![remote](${REMOTE})`,
    '',
    `![inline](${DATA_URI})`,
    '',
    '![relative](./diagram.png)',
    '',
    '![parent](../shared/logo.png)',
    '',
].join('\n'));
fs.writeFileSync(secondDoc, '# Second\n\n![second](second.png)\n');

// ── Helpers that read the page the way the webview would ─────────────────────
function cspOf(html) {
    const m = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/i);
    return m ? m[1] : '';
}
function directive(csp, name) {
    for (const part of csp.split(';')) {
        const tokens = part.trim().split(/\s+/).filter(Boolean);
        if (tokens[0] === name) { return tokens.slice(1); }
    }
    return undefined;
}
/** Would a CSP with these img-src (or default-src) sources load this URL? */
function cspAllowsImage(csp, url) {
    const sources = directive(csp, 'img-src') ?? directive(csp, 'default-src') ?? [];
    if (sources.includes("'none'")) { return false; }
    const scheme = (url.match(/^([a-z][a-z0-9+.-]*):/i) || [])[1];
    if (!scheme) { return false; }   // a bare path has no origin the webview can serve
    return sources.some(s => {
        if (/^[a-z][a-z0-9+.-]*:$/i.test(s)) { return s.toLowerCase() === `${scheme.toLowerCase()}:`; }
        if (s.startsWith("'")) { return false; }
        return url.startsWith(s.replace(/\/$/, '') + '/');
    });
}
function imgSrcs(html) {
    const content = html.split('<div id="content">')[1] || '';
    return [...content.matchAll(/<img\b[^>]*\ssrc="([^"]*)"/gi)].map(m => m[1].replace(/&amp;/g, '&'));
}
function rootsNow() {
    const opts = state.panel && state.panel.webview.options;
    return ((opts && opts.localResourceRoots) || []).map(u => path.resolve(u.fsPath));
}
function samePath(a, b) { return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase(); }

try {
    // ── 1. First document ────────────────────────────────────────────────────
    openDocPreview(firstDoc);
    check('openDocPreview created a webview panel', !!state.panel);
    const html1 = state.panel ? state.panel.webview.html : '';
    const csp1  = cspOf(html1);
    const srcs1 = imgSrcs(html1);

    check('the page has a Content-Security-Policy', csp1.length > 0);
    const imgSrc = directive(csp1, 'img-src');
    check('the CSP has an img-src directive', !!imgSrc, `CSP: ${csp1}`);
    check('img-src allows the webview resource origin (cspSource)', !!imgSrc && imgSrc.includes(CSP_SOURCE), `img-src: ${imgSrc}`);
    check('img-src does not allow plain http:', !!imgSrc && !imgSrc.includes('http:'), `img-src: ${imgSrc}`);
    check('all four images were rendered as <img>', srcs1.length === 4, `srcs: ${JSON.stringify(srcs1)}`);

    for (const src of srcs1) {
        check(`CSP allows image ${src.slice(0, 70)}`, cspAllowsImage(csp1, src), `CSP: ${csp1}`);
    }
    check('https: image src is left as written', srcs1.includes(REMOTE));
    check('data: image src is left as written', srcs1.includes(DATA_URI));
    check('./diagram.png is rewritten to the webview URI of the file next to the doc',
        srcs1.includes(toWebviewUri(path.join(docDir, 'diagram.png'))), `srcs: ${JSON.stringify(srcs1)}`);
    check('../shared/logo.png is rewritten to the webview URI of the resolved file',
        srcs1.includes(toWebviewUri(path.join(shared, 'logo.png'))), `srcs: ${JSON.stringify(srcs1)}`);
    check('no image src is left as a bare relative path',
        !srcs1.some(s => !/^[a-z][a-z0-9+.-]*:/i.test(s)), `srcs: ${JSON.stringify(srcs1)}`);

    const roots1 = rootsNow();
    check("the document's folder is a localResourceRoot", roots1.some(r => samePath(r, docDir)), `roots: ${JSON.stringify(roots1)}`);
    check("the ../shared image's folder is a localResourceRoot", roots1.some(r => samePath(r, shared)), `roots: ${JSON.stringify(roots1)}`);
    check('scripts are still enabled after setting the roots',
        !!(state.panel && state.panel.webview.options && state.panel.webview.options.enableScripts));

    // ── 2. Navigate the same panel to a document in another folder ───────────
    const panelBefore = state.panel;
    openDocPreview(secondDoc);
    check('the second document reuses the same panel', state.panel === panelBefore);
    const html2 = state.panel ? state.panel.webview.html : '';
    const srcs2 = imgSrcs(html2);
    check('the second document\'s relative image is rewritten against ITS folder',
        srcs2.includes(toWebviewUri(path.join(other, 'second.png'))), `srcs: ${JSON.stringify(srcs2)}`);
    check('the CSP on the second document still allows its image',
        srcs2.length === 1 && cspAllowsImage(cspOf(html2), srcs2[0]), `CSP: ${cspOf(html2)}`);
    const roots2 = rootsNow();
    check("after navigating, the second document's folder is a localResourceRoot",
        roots2.some(r => samePath(r, other)), `roots: ${JSON.stringify(roots2)}`);
} catch (err) {
    check(`no exception while opening the preview (${err && err.message})`, false, err && err.stack);
} finally {
    Module._load = origLoad;
    fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\nREG-144: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
