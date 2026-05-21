/**
 * tests/regression/REG-064-filelist-open-panel-navigate-refresh.test.js
 *
 * Guards the remaining blind spot from issue #388: when FileList is already
 * open, invoking cvs.tools.fileList.navigateTo must update the active folder,
 * refresh the webview state, and reveal the existing panel.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const SRC = path.join(__dirname, '../../src/features/file-list-viewer.ts');
const sourceTs = fs.readFileSync(SRC, 'utf8');
const transpiled = ts.transpileModule(sourceTs, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

let passed = 0;
let failed = 0;

function check(label, condition) {
    if (condition) {
        console.log(`  PASS - ${label}`);
        passed++;
    } else {
        console.log(`  FAIL - ${label}`);
        failed++;
    }
}

function loadFileListViewer(rootDir) {
    const registered = new Map();
    let panel;
    let panelMessageHandlers = [];

    const vscode = {
        ViewColumn: { One: 1, Beside: 2 },
        Uri: {
            file(filePath) {
                return { fsPath: filePath };
            },
        },
        commands: {
            registerCommand(name, handler) {
                registered.set(name, handler);
                return { dispose() {} };
            },
            executeCommand() {
                return Promise.resolve();
            },
        },
        env: {
            clipboard: {
                writeText() {
                    return Promise.resolve();
                },
            },
        },
        window: {
            activeTextEditor: undefined,
            showInformationMessage() {},
            showErrorMessage() {},
            showInputBox() { return Promise.resolve(undefined); },
            showTextDocument() { return Promise.resolve(); },
            createTerminal() {
                return { show() {}, sendText() {} };
            },
            createOutputChannel() {
                return { appendLine() {}, show() {}, dispose() {} };
            },
            createWebviewPanel(viewType, title, column, options) {
                const disposeHandlers = [];
                panelMessageHandlers = [];
                panel = {
                    viewType,
                    title,
                    column,
                    options,
                    revealCount: 0,
                    messages: [],
                    reveal() { this.revealCount++; },
                    onDidDispose(handler) {
                        disposeHandlers.push(handler);
                        return { dispose() {} };
                    },
                    dispose() {
                        for (const handler of disposeHandlers) { handler(); }
                    },
                    webview: {
                        html: '',
                        postMessage(message) {
                            panel.messages.push(message);
                            return Promise.resolve(true);
                        },
                        onDidReceiveMessage(handler) {
                            panelMessageHandlers.push(handler);
                            return { dispose() {} };
                        },
                    },
                };
                return panel;
            },
        },
        workspace: {
            workspaceFolders: [{ uri: { fsPath: rootDir } }],
            getWorkspaceFolder() {
                return { uri: { fsPath: rootDir } };
            },
            openTextDocument() {
                return Promise.resolve({});
            },
            getConfiguration() {
                return { get() { return undefined; } };
            },
            createFileSystemWatcher() {
                return {
                    onDidCreate() { return { dispose() {} }; },
                    onDidDelete() { return { dispose() {} }; },
                    onDidChange() { return { dispose() {} }; },
                    dispose() {},
                };
            },
        },
        RelativePattern: class {
            constructor(base, pattern) { this.base = base; this.pattern = pattern; }
        },
    };

    const origLoad = Module._load;
    Module._load = function(request, parent, isMain) {
        if (request === 'vscode') { return vscode; }
        if (request === '../shared/output-channel') {
            return { log() {}, logError() {} };
        }
        if (request === '../shared/file-list-sort') {
            return {
                DEFAULT_EXCLUDES: new Set(),
                sortEntries(entries) {
                    entries.sort((a, b) => String(a.name).localeCompare(String(b.name)));
                },
            };
        }
        if (request === '../shared/webview-utils') {
            return {
                getNonce() { return 'testnonce'; },
                esc(value) {
                    return String(value == null ? '' : value)
                        .replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;')
                        .replace(/"/g, '&quot;');
                },
            };
        }
        return origLoad.call(this, request, parent, isMain);
    };

    try {
        const mod = new Module(SRC, module.parent);
        mod.filename = SRC;
        mod.paths = Module._nodeModulePaths(path.dirname(SRC));
        mod._compile(transpiled, SRC);
        return { exports: mod.exports, registered, getPanel: () => panel, getPanelMessageHandlers: () => panelMessageHandlers };
    } finally {
        Module._load = origLoad;
    }
}

console.log('\nREG-064: FileList open panel navigate refresh\n' + '─'.repeat(60));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cvt-reg-064-'));
const rootDir = path.join(tmp, 'workspace-root');
const startDir = path.join(rootDir, 'StartFolder');
const targetDir = path.join(rootDir, 'TargetFolder');
fs.mkdirSync(startDir, { recursive: true });
fs.mkdirSync(targetDir, { recursive: true });
fs.writeFileSync(path.join(startDir, 'start.md'), '# start\n', 'utf8');
fs.writeFileSync(path.join(targetDir, 'target.md'), '# target\n', 'utf8');

const loaded = loadFileListViewer(rootDir);
const mod = loaded.exports;
mod.activate({ subscriptions: [] });

const openCommand = loaded.registered.get('cvs.tools.fileList');
const navigateCommand = loaded.registered.get('cvs.tools.fileList.navigateTo');
const debugStateCommand = loaded.registered.get('cvs.tools.fileList._debugState');

check('FileList open command is registered', typeof openCommand === 'function');
check('FileList navigateTo command is registered', typeof navigateCommand === 'function');

openCommand();
const panel = loaded.getPanel();
check('opening FileList creates a panel', !!panel);
check('initial panel title uses workspace root name', !!panel && panel.title === `FileList — ${path.basename(rootDir)}`);

panel.messages.length = 0;
navigateCommand({ fsPath: targetDir });

const debugState = debugStateCommand();
const lastMessage = panel.messages[panel.messages.length - 1];

check('navigateTo on an open panel updates debug state directory', debugState.dir === targetDir);
check('navigateTo on an open panel updates panel title to target folder name', panel.title === `FileList — ${path.basename(targetDir)}`);
check('navigateTo on an open panel reveals the existing panel', panel.revealCount === 1);
check('navigateTo on an open panel posts an update message to the webview', !!lastMessage && lastMessage.type === 'update');
check('posted update message carries the target directory', !!lastMessage && lastMessage.state && lastMessage.state.dir === targetDir);

console.log('');
if (failed > 0) {
    console.log(`FAILED ${failed} / ${passed + failed}`);
    process.exit(1);
}
console.log(`PASSED ${passed} / ${passed}`);
process.exit(0);