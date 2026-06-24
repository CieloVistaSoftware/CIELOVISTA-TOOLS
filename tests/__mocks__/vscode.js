'use strict';
// Minimal vscode stub for tests running outside VS Code.
module.exports = {
    window: {
        showTextDocument: () => Promise.resolve({}),
        showInformationMessage: () => Promise.resolve(),
        showErrorMessage: () => Promise.resolve(),
        createWebviewPanel: () => ({ webview: { html: '', onDidReceiveMessage: () => {}, postMessage: () => {} }, onDidDispose: () => {}, dispose: () => {}, reveal: () => {} }),
        createOutputChannel: () => ({ appendLine: () => {}, show: () => {}, dispose: () => {} }),
    },
    commands: {
        registerCommand: () => ({ dispose: () => {} }),
        executeCommand: () => Promise.resolve(),
        getCommands: () => Promise.resolve([]),
    },
    workspace: {
        workspaceFolders: [],
        getConfiguration: () => ({ get: (_k, d) => d }),
        openTextDocument: () => Promise.resolve({}),
        fs: { readFile: () => Promise.resolve(Buffer.from('')) },
    },
    env: { clipboard: { writeText: () => Promise.resolve() } },
    Uri: { file: (p) => ({ fsPath: p, toString: () => p }), parse: (s) => ({ toString: () => s }) },
    ViewColumn: { One: 1, Two: 2, Beside: -2, Active: -1 },
    Position: class { constructor(l, c) { this.line = l; this.character = c; } },
    Range: class { constructor(s, e) { this.start = s; this.end = e; } },
    Selection: class { constructor(a, b) { this.anchor = a; this.active = b; } },
    TextEditorRevealType: { InCenter: 2 },
    WebviewPanel: class {},
    EventEmitter: class { event = () => {}; fire() {} dispose() {} },
    ExtensionContext: class {},
};
