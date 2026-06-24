/**
 * tests/regression/REG-062-filelist-navigate-to-preserves-folder.test.js
 *
 * Guards issue #388 with runtime behavior: invoking
 * cvs.tools.fileList.navigateTo on a closed panel must open FileList at the
 * selected folder, not overwrite that folder with the workspace root.
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
                const messageHandlers = [];
                panel = {
                    viewType,
                    title,
                    column,
                    options,
                    revealCount: 0,
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
                        postMessage() { return Promise.resolve(true); },
                        onDidReceiveMessage(handler) {
                            messageHandlers.push(handler);
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
        if (request === './home-page') { return { ensureHomeIsLeftmost() {} }; }
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
        return { exports: mod.exports, registered, getPanel: () => panel };
    } finally {
        Module._load = origLoad;
    }
}

console.log('\nREG-062: FileList navigateTo preserves pre-set folder\n' + '─'.repeat(60));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cvt-reg-062-'));
const rootDir = path.join(tmp, 'workspace-root');
const targetDir = path.join(rootDir, 'PickedFolder');
fs.mkdirSync(targetDir, { recursive: true });
fs.writeFileSync(path.join(targetDir, 'notes.md'), '# test\n', 'utf8');

const loaded = loadFileListViewer(rootDir);
const mod = loaded.exports;
mod.activate({ subscriptions: [] });

const navigateCommand = loaded.registered.get('cvs.tools.fileList.navigateTo');
check('cvs.tools.fileList.navigateTo command is registered', typeof navigateCommand === 'function');

navigateCommand({ fsPath: targetDir });

const panel = loaded.getPanel();
const debugState = loaded.registered.get('cvs.tools.fileList._debugState')();

check('navigateTo opens the FileList panel when it was previously closed', !!panel);
check('new panel title uses the picked folder name instead of workspace root', !!panel && panel.title === `FileList — ${path.basename(targetDir)}`);
check('debug state directory is the picked folder path', debugState.dir === targetDir);
check('initial webview HTML path display contains the picked folder path', !!panel && panel.webview.html.includes(targetDir));
check('initial webview HTML does not show the workspace root as the active path', !!panel && !panel.webview.html.includes(`title="${rootDir}"`));

console.log('');
if (failed > 0) {
    console.log(`FAILED ${failed} / ${passed + failed}`);
    process.exit(1);
}
console.log(`PASSED ${passed} / ${passed}`);
process.exit(0);
