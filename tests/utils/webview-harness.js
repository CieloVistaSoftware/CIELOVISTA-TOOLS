// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * webview-harness.js — run a feature's real webview pages outside VS Code (#838).
 *
 * A stub vscode module whose webview panels are real pages: the HTML the
 * extension sets on a panel is loaded into jsdom with its scripts running,
 * the page's vscode.postMessage() reaches the handler the extension attached
 * with onDidReceiveMessage(), and the extension's webview.postMessage()
 * reaches the page as a 'message' event. commands.executeCommand() runs a
 * command the extension registered, so a Back button that re-runs
 * cvs.catalog.open runs the real one.
 *
 * Nothing here is a copy of extension code: the test requires the module from
 * out-test/ itself, after install(), and drives it through its commands.
 *
 *   const h = createWebviewHarness();
 *   h.install();                          // before requiring the module
 *   const feature = require(OUT_INDEX);
 *   feature.activate(h.context);
 *   await h.run('cvs.catalog.open');
 *   const page = await h.page('docCatalog');
 *   page.click('[data-action="run-command"]');
 */
'use strict';

const Module    = require('module');
const path      = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

/** Let pending promises and 0 ms timers run. */
function settle(rounds = 5) {
    let p = Promise.resolve();
    for (let i = 0; i < rounds; i++) { p = p.then(() => new Promise(r => setTimeout(r, 0))); }
    return p;
}

function createWebviewHarness() {
    const commands = new Map();
    /** Every executeCommand call, in order: [id, ...args]. */
    const executed = [];
    /** Every panel created, in order. */
    const panels   = [];
    /** Every URI passed to env.openExternal, as a string. */
    const opened   = [];
    let openedFirst;
    const firstOpened = new Promise(r => { openedFirst = r; });
    const noop = () => undefined;
    const disposable = { dispose: noop };

    function inert() {
        return new Proxy(function () { return inert(); }, {
            get: (_t, k) => (k === 'then' ? undefined : inert()),
            apply: () => inert(),
        });
    }

    function createPanel(viewType, title) {
        const handlers = [];
        const disposeHandlers = [];
        const panel = {
            viewType, title,
            revealed: 0,
            /** Messages the extension posted to the page, in order. */
            posted: [],
            /** The jsdom window the page is loaded in, once page() loaded it. */
            window: undefined,
            loadedHtml: undefined,
            webview: {
                html: '',
                options: {},
                cspSource: 'vscode-webview://harness',
                asWebviewUri: (uri) => ({ toString: () => `vscode-webview://harness/${String(uri.fsPath).replace(/\\/g, '/')}` }),
                onDidReceiveMessage: (fn) => { handlers.push(fn); return disposable; },
                postMessage: (msg) => {
                    panel.posted.push(msg);
                    if (panel.window && panel.loadedHtml === panel.webview.html) {
                        panel.window.dispatchEvent(new panel.window.MessageEvent('message', { data: msg }));
                    }
                    return Promise.resolve(true);
                },
            },
            onDidDispose: (fn) => { disposeHandlers.push(fn); return disposable; },
            onDidChangeViewState: () => disposable,
            reveal: () => { panel.revealed++; },
            dispose: () => { disposeHandlers.forEach(fn => fn()); },
            /** Deliver a message from the page to the extension's handlers. */
            receive: (msg) => Promise.all(handlers.map(fn => fn(msg))),
        };
        panels.push(panel);
        return panel;
    }

    const vscode = {
        commands: {
            registerCommand: (id, fn) => { commands.set(id, fn); return disposable; },
            executeCommand: async (id, ...args) => {
                executed.push([id, ...args]);
                const fn = commands.get(id);
                return fn ? fn(...args) : undefined;
            },
            getCommands: async () => [...commands.keys()],
        },
        window: {
            createWebviewPanel: (viewType, title) => createPanel(viewType, title),
            registerWebviewPanelSerializer: () => disposable,
            withProgress: async (_opts, task) => task({ report: noop }, { isCancellationRequested: false, onCancellationRequested: () => disposable }),
            showInformationMessage: async () => undefined,
            showWarningMessage: async () => undefined,
            showErrorMessage: async () => undefined,
            showTextDocument: async () => undefined,
            createOutputChannel: () => ({ appendLine: noop, append: noop, show: noop, dispose: noop, clear: noop }),
            createTerminal: () => ({ show: noop, sendText: noop, dispose: noop }),
        },
        workspace: {
            workspaceFolders: [],
            getConfiguration: () => ({ get: (_k, d) => d, update: async () => undefined }),
            openTextDocument: async () => ({}),
            onDidChangeConfiguration: () => disposable,
        },
        env: { openExternal: async (uri) => { opened.push(String(uri)); openedFirst(String(uri)); return true; }, clipboard: { writeText: async () => undefined } },
        Uri: {
            file: (p) => ({ fsPath: p, path: p, scheme: 'file', toString: () => `file:///${String(p).replace(/\\/g, '/')}` }),
            parse: (s) => ({ fsPath: s, toString: () => s }),
        },
        ViewColumn: { One: 1, Two: 2, Beside: -2, Active: -1 },
        ProgressLocation: { Notification: 15 },
    };
    const vscodeProxy = new Proxy(vscode, { get: (t, k) => (k in t ? t[k] : inert()) });

    /** Load the panel's current HTML into jsdom, with its scripts running. */
    async function load(panel) {
        const html = panel.webview.html;
        if (panel.window) { panel.window.close(); }
        // A page script that throws, or does not parse, fails the test: in
        // VS Code that page would be dead, every button on it inert (#841).
        const errors = [];
        const failIfErrors = (when) => {
            if (!errors.length) { return; }
            const why = errors.map(e => (e.cause && e.cause.message) || e.message).join('; ');
            throw new Error(`the ${panel.viewType} page script failed ${when}: ${why}`);
        };
        const virtualConsole = new VirtualConsole();
        virtualConsole.forwardTo(console, { jsdomErrors: 'none' });
        virtualConsole.on('jsdomError', e => errors.push(e));
        const dom = new JSDOM(html, {
            runScripts: 'dangerously',
            virtualConsole,
            url: 'https://webview.harness/',
            pretendToBeVisual: true,
            beforeParse(window) {
                // Set before the page's script runs: it posts 'ready' while it
                // loads, and the reply must reach it.
                panel.window = window;
                panel.loadedHtml = html;
                window.acquireVsCodeApi = () => ({
                    postMessage: (msg) => { void panel.receive(msg); },
                    getState: () => undefined,
                    setState: noop,
                });
                window.scrollTo = noop;
                window.HTMLElement.prototype.scrollIntoView = noop;
            },
        });
        await settle();
        failIfErrors('while loading');
        const doc = dom.window.document;
        return {
            window: dom.window,
            document: doc,
            /** Click an element, or the first one matching a selector, as a user would. */
            async click(target) {
                const el = typeof target === 'string' ? doc.querySelector(target) : target;
                if (!el) { throw new Error(`nothing on the page matches ${target}`); }
                el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
                await settle();
                failIfErrors('on the click');
                return el;
            },
        };
    }

    return {
        vscode: vscodeProxy,
        commands,
        executed,
        panels,
        opened,
        context: { subscriptions: [], extensionPath: path.resolve(__dirname, '..', '..') },
        settle,
        /** Make require('vscode') return this harness's stub. Call before requiring the module. */
        install() {
            const origLoad = Module._load;
            Module._load = function (request) {
                if (request === 'vscode') { return vscodeProxy; }
                return origLoad.apply(this, arguments);
            };
        },
        /** Run a registered command. */
        async run(id, ...args) {
            const fn = commands.get(id);
            if (!fn) { throw new Error(`${id} is not registered; registered: ${[...commands.keys()].join(', ')}`); }
            const r = await fn(...args);
            await settle();
            return r;
        },
        /**
         * The first URL the extension opened with env.openExternal. A command
         * that starts a server opens its page only once the server listens;
         * this resolves when it does, and fails if 5 s pass without it.
         */
        openedUrl() {
            let timer;
            const timeout = new Promise((_r, reject) => {
                timer = setTimeout(() => reject(new Error('the command opened no URL within 5 s')), 5000);
            });
            return Promise.race([firstOpened, timeout]).finally(() => clearTimeout(timer));
        },
        /** The latest panel of this view type, with its current HTML loaded as a page. */
        async page(viewType) {
            const panel = [...panels].reverse().find(p => p.viewType === viewType);
            if (!panel) { throw new Error(`no ${viewType} panel was opened; opened: ${panels.map(p => p.viewType).join(', ')}`); }
            return Object.assign(await load(panel), { panel });
        },
        /** Close every page. */
        close() { panels.forEach(p => p.window && p.window.close()); },
    };
}

/**
 * Load a page a local server serves (the MCP Endpoint Viewer) into jsdom,
 * scripts running, with the page's fetch() going to that real server.
 * Every request the page makes is recorded with the server's answer, and
 * idle() resolves once none is in flight. A page script that throws fails
 * the load, and failIfErrors() reports one that throws later.
 */
async function loadServedPage(url) {
    const res  = await fetch(url);
    const html = await res.text();
    const requests = [];
    const inflight = new Set();
    const errors   = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.forwardTo(console, { jsdomErrors: 'none' });
    virtualConsole.on('jsdomError', e => errors.push(e));
    const failIfErrors = (when) => {
        if (!errors.length) { return; }
        throw new Error(`the page script failed ${when}: ${errors.map(e => (e.cause && e.cause.message) || e.message).join('; ')}`);
    };
    const dom = new JSDOM(html, {
        url, runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole,
        beforeParse(window) {
            window.scrollTo = () => undefined;
            window.fetch = (input, init = {}) => {
                const target = new URL(String(input), url).toString();
                const entry  = { url: target, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : undefined };
                requests.push(entry);
                const p = fetch(target, { method: entry.method, headers: init.headers, body: init.body })
                    .then(async r => {
                        const text = await r.text();
                        entry.status = r.status;
                        try { entry.json = JSON.parse(text); } catch { entry.json = undefined; }
                        return { ok: r.ok, status: r.status, text: async () => text, json: async () => JSON.parse(text) };
                    });
                inflight.add(p);
                p.finally(() => inflight.delete(p)).catch(() => undefined);
                return p;
            };
        },
    });
    /** Resolves once the page has no request in flight and its handlers have run. */
    async function idle() {
        while (inflight.size) { await Promise.allSettled([...inflight]); await settle(); }
        await settle();
    }
    await idle();
    failIfErrors('while loading');
    return {
        status: res.status, html, requests, idle, failIfErrors,
        window: dom.window, document: dom.window.document,
        async click(el) {
            el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
            await idle();
            failIfErrors('on the click');
        },
        close() { dom.window.close(); },
    };
}

module.exports = { createWebviewHarness, loadServedPage, settle };
