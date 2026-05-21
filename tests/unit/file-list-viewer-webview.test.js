/**
 * tests/unit/file-list-viewer-webview.test.js
 *
 * Behavioral tests for the FileList webview HTML/JS using JSDOM.
 * Each test builds the real webview HTML via buildHtml(), injects it into
 * a JSDOM window, and simulates user events — proving that click, dblclick,
 * right-click, folder navigation, and update messages all work correctly.
 */
'use strict';

const path   = require('path');
const fs     = require('fs');
const Module = require('module');
const { JSDOM, VirtualConsole } = require('jsdom');
const ts     = require('typescript');

const SRC = path.join(__dirname, '../../src/features/file-list-viewer.ts');
if (!fs.existsSync(SRC)) { console.error('SKIP: source not found'); process.exit(0); }

// ── Transpile TS → CommonJS in-memory ────────────────────────────────────────
const sourceTs   = fs.readFileSync(SRC, 'utf8');
const transpiled = ts.transpileModule(sourceTs, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function loadMod() {
    const vscode = {
        ViewColumn: { One: 1, Beside: 2 },
        Uri: { file: p => ({ fsPath: p }) },
        commands: {
            registerCommand() { return { dispose() {} }; },
            executeCommand() { return Promise.resolve(); },
        },
        env: { clipboard: { writeText() { return Promise.resolve(); } } },
        window: {
            activeTextEditor: undefined,
            showInformationMessage() {},
            showErrorMessage() {},
            showInputBox()       { return Promise.resolve(undefined); },
            showTextDocument()   { return Promise.resolve(); },
            createTerminal()     { return { show() {}, sendText() {} }; },
            createOutputChannel() { return { appendLine() {}, show() {}, dispose() {} }; },
            createWebviewPanel() {
                return {
                    webview: {
                        html: '',
                        onDidReceiveMessage() { return { dispose() {} }; },
                        postMessage()         { return Promise.resolve(); },
                    },
                    onDidDispose() { return { dispose() {} }; },
                    reveal() {},
                };
            },
        },
        workspace: {
            workspaceFolders: [{ uri: { fsPath: 'C:/workspace' } }],
            getWorkspaceFolder: () => ({ uri: { fsPath: 'C:/workspace' } }),
            openTextDocument:  () => Promise.resolve({}),
            getConfiguration:  () => ({ get: () => undefined }),
        },
    };

    const origLoad = Module._load;
    Module._load = function(req, parent, isMain) {
        if (req === 'vscode')                     { return vscode; }
        if (req === '../shared/output-channel')   { return { log() {}, logError() {} }; }
        if (req === '../shared/file-list-sort') {
            return {
                DEFAULT_EXCLUDES: new Set(['node_modules', '.git', 'out', 'dist']),
                sortEntries(entries) {
                    entries.sort((a, b) => String(a.name).localeCompare(String(b.name)));
                },
            };
        }
        if (req === '../shared/webview-utils') {
            return {
                getNonce: () => 'test-nonce',
                esc: s => String(s == null ? '' : s)
                    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
            };
        }
        return origLoad.call(this, req, parent, isMain);
    };
    try {
        const m = new Module(SRC, module.parent || module);
        m.filename = SRC;
        m.paths    = Module._nodeModulePaths(path.dirname(SRC));
        m._compile(transpiled, SRC);
        return m.exports;
    } finally {
        Module._load = origLoad;
    }
}

const mod = loadMod();

const sampleState = {
    dir: 'C:/workspace',
    entries: [
        { name: 'src',       isDir: true,  size: 0,    mtime: Date.now(), type: 'dir' },
        { name: 'readme.md', isDir: false, size: 1024, mtime: Date.now(), type: 'md'  },
        { name: 'index.ts',  isDir: false, size: 512,  mtime: Date.now(), type: 'ts'  },
    ],
    canGoUp: false,
    sortCol: 'name', sortDir: 'asc',
    showHidden: true, showExcludes: false,
    selectedNames: [],
};

/** Build a fresh JSDOM window from the webview HTML and return helpers. */
function makeDOM(state) {
    const html     = mod._test.buildHtml(state || sampleState);
    const messages = [];
    const vc       = new VirtualConsole();
    vc.on('error', () => {}); vc.on('warn', () => {});

    const dom = new JSDOM(html, {
        runScripts: 'dangerously',
        pretendToBeVisual: true,
        virtualConsole: vc,
        beforeParse(win) {
            win.acquireVsCodeApi = () => ({
                postMessage(msg) { messages.push(msg); },
                getState()  { return null; },
                setState()  {},
            });
        },
    });
    const { window: win, window: { document: doc } } = dom;

    function row(name) {
        return [...doc.querySelectorAll('#tbody tr')].find(r => r.dataset.name === name);
    }
    function rightClick(el) {
        el.dispatchEvent(new win.MouseEvent('contextmenu', {
            bubbles: true, cancelable: true, clientX: 100, clientY: 100,
        }));
    }
    function dblClick(el) {
        el.dispatchEvent(new win.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    }

    return { doc, win, messages, row, rightClick, dblClick };
}

// ── Harness ───────────────────────────────────────────────────────────────────
let passed = 0; let failed = 0;
function test(name, fn) {
    try   { fn(); console.log(`  PASS - ${name}`); passed++; }
    catch (e) { console.log(`  FAIL - ${name}: ${e.message}`); failed++; }
}
function ok(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

console.log('\nfile-list-viewer webview behavioral tests\n' + '─'.repeat(60));

// ── Structure ─────────────────────────────────────────────────────────────────
test('buildHtml produces valid HTML with 3 sample rows', () => {
    const { doc } = makeDOM();
    ok(doc.querySelectorAll('#tbody tr').length === 3, 'expected 3 rows');
});

test('folder row has data-is-dir="1"', () => {
    const { row } = makeDOM();
    const r = row('src');
    ok(r, 'src row missing');
    ok(r.dataset.isDir === '1', `isDir="${r.dataset.isDir}"`);
});

test('file row has data-is-dir="0"', () => {
    const { row } = makeDOM();
    const r = row('readme.md');
    ok(r, 'readme.md row missing');
    ok(r.dataset.isDir === '0', `isDir="${r.dataset.isDir}"`);
});

// ── Single-click ──────────────────────────────────────────────────────────────
test('single-click on file row sends open-file message', () => {
    const { row, messages } = makeDOM();
    row('readme.md').click();
    ok(messages.some(m => m.command === 'open-file' && m.name === 'readme.md'),
       `Messages: ${JSON.stringify(messages)}`);
});

test('single-click on folder row sends navigate-to message', () => {
    const { row, messages } = makeDOM();
    row('src').click();
    ok(messages.some(m => m.command === 'navigate-to' && m.name === 'src'),
       `Messages: ${JSON.stringify(messages)}`);
});

test('single-click on runnable file row sends open-file message', () => {
    const { row, messages } = makeDOM();
    row('index.ts').click();
    ok(messages.some(m => m.command === 'open-file' && m.name === 'index.ts'),
       `single-click on runnable file should open in editor. Messages: ${JSON.stringify(messages)}`);
});

// ── Double-click ──────────────────────────────────────────────────────────────
test('double-click on file row sends open-file message', () => {
    const { row, dblClick, messages } = makeDOM();
    dblClick(row('readme.md'));
    ok(messages.some(m => m.command === 'open-file' && m.name === 'readme.md'),
       `dblclick on file sent nothing. Messages: ${JSON.stringify(messages)}`);
});

test('double-click on folder row sends navigate-to message', () => {
    const { row, dblClick, messages } = makeDOM();
    dblClick(row('src'));
    ok(messages.some(m => m.command === 'navigate-to' && m.name === 'src'),
       `dblclick on folder sent nothing. Messages: ${JSON.stringify(messages)}`);
});

test('double-click on runnable file sends run-file message', () => {
    const { row, dblClick, messages } = makeDOM();
    dblClick(row('index.ts'));
    ok(messages.some(m => m.command === 'run-file' && m.name === 'index.ts'),
       `dblclick on runnable file should send run-file. Messages: ${JSON.stringify(messages)}`);
});

// ── Right-click context menu ──────────────────────────────────────────────────
test('right-click on file row makes context menu visible', () => {
    const { doc, row, rightClick } = makeDOM();
    rightClick(row('readme.md'));
    const menu = doc.getElementById('ctx-menu');
    ok(menu.style.display !== 'none',
       `ctx-menu still hidden after right-click. display="${menu.style.display}"`);
});

test('right-click on folder shows ctx-navigate, hides ctx-open', () => {
    const { doc, row, rightClick } = makeDOM();
    rightClick(row('src'));
    ok(doc.getElementById('ctx-menu').style.display !== 'none', 'menu not visible');
    ok(doc.getElementById('ctx-navigate').style.display !== 'none',
       `ctx-navigate hidden for folder. display="${doc.getElementById('ctx-navigate').style.display}"`);
    ok(doc.getElementById('ctx-open').style.display === 'none',
       `ctx-open visible for folder. display="${doc.getElementById('ctx-open').style.display}"`);
});

test('right-click on file shows ctx-open, hides ctx-navigate', () => {
    const { doc, row, rightClick } = makeDOM();
    rightClick(row('readme.md'));
    ok(doc.getElementById('ctx-menu').style.display !== 'none', 'menu not visible');
    ok(doc.getElementById('ctx-open').style.display !== 'none',
       `ctx-open hidden for file. display="${doc.getElementById('ctx-open').style.display}"`);
    ok(doc.getElementById('ctx-navigate').style.display === 'none',
       `ctx-navigate visible for file. display="${doc.getElementById('ctx-navigate').style.display}"`);
});

// ── Context menu actions ──────────────────────────────────────────────────────
test('ctx-open click sends open-file for the right-clicked file', () => {
    const { doc, row, rightClick, messages } = makeDOM();
    rightClick(row('readme.md'));
    doc.getElementById('ctx-open').click();
    ok(messages.some(m => m.command === 'open-file' && m.name === 'readme.md'),
       `Messages: ${JSON.stringify(messages)}`);
});

test('ctx-navigate click sends navigate-to for the right-clicked folder', () => {
    const { doc, row, rightClick, messages } = makeDOM();
    rightClick(row('src'));
    doc.getElementById('ctx-navigate').click();
    ok(messages.some(m => m.command === 'navigate-to' && m.name === 'src'),
       `Messages: ${JSON.stringify(messages)}`);
});

test('ctx-reveal click sends reveal-in-explorer', () => {
    const { doc, row, rightClick, messages } = makeDOM();
    rightClick(row('readme.md'));
    doc.getElementById('ctx-reveal').click();
    ok(messages.some(m => m.command === 'reveal-in-explorer' && m.name === 'readme.md'),
       `Messages: ${JSON.stringify(messages)}`);
});

test('ctx-copy-path click sends copy-path', () => {
    const { doc, row, rightClick, messages } = makeDOM();
    rightClick(row('readme.md'));
    doc.getElementById('ctx-copy-path').click();
    ok(messages.some(m => m.command === 'copy-path'),
       `Messages: ${JSON.stringify(messages)}`);
});

// ── Other controls ────────────────────────────────────────────────────────────
test('Up button sends up message when canGoUp=true', () => {
    const { doc, messages } = makeDOM({ ...sampleState, canGoUp: true });
    const btn = doc.getElementById('up-btn');
    ok(!btn.disabled, 'up-btn is disabled');
    btn.click();
    ok(messages.some(m => m.command === 'up'), `Messages: ${JSON.stringify(messages)}`);
});

test('sort header click sends sort message', () => {
    const { doc, messages } = makeDOM();
    doc.querySelector('th[data-col="name"]').click();
    ok(messages.some(m => m.command === 'sort' && m.col === 'name'),
       `Messages: ${JSON.stringify(messages)}`);
});

// ── Update message re-renders ─────────────────────────────────────────────────
test('window message type=update re-renders with new entries', () => {
    const { doc, win } = makeDOM();
    ok(doc.querySelectorAll('#tbody tr').length === 3, 'expected 3 initial rows');
    const newState = {
        ...sampleState,
        entries: [{ name: 'only.ts', isDir: false, size: 100, mtime: Date.now(), type: 'ts' }],
        selectedNames: [],
    };
    win.dispatchEvent(new win.MessageEvent('message', { data: { type: 'update', state: newState } }));
    ok(doc.querySelectorAll('#tbody tr').length === 1,
       `Expected 1 row after update, got ${doc.querySelectorAll('#tbody tr').length}`);
});

// ── Done ─────────────────────────────────────────────────────────────────────
console.log('');
if (failed > 0) {
    console.log(`FAILED: ${failed} test(s) failed, ${passed} passed`);
    process.exit(1);
}
console.log(`PASSED: ${passed} test(s)`);
process.exit(0);
