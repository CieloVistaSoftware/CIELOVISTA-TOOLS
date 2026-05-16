/**
 * tests/regression/REG-065-filelist-activate-idempotent.test.js
 *
 * Guards issue #84 symptom: FileList activation must not throw
 * "command 'cvs.tools.fileList' already exists" when activate() is
 * called more than once in the same extension host session.
 */
'use strict';

const fs = require('fs');
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

function loadModuleWithStrictRegister() {
  const commands = new Map();
  const registeredCalls = [];

  const vscode = {
    ViewColumn: { One: 1, Beside: 2 },
    Uri: { file(fsPath) { return { fsPath }; } },
    commands: {
      registerCommand(name, handler) {
        if (commands.has(name)) {
          throw new Error(`command '${name}' already exists`);
        }
        commands.set(name, handler);
        registeredCalls.push(name);
        return {
          dispose() {
            commands.delete(name);
          },
        };
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
      createTerminal() { return { show() {}, sendText() {} }; },
      createOutputChannel() { return { appendLine() {}, show() {}, dispose() {} }; },
      createWebviewPanel() {
        return {
          title: 'FileList',
          reveal() {},
          onDidDispose() { return { dispose() {} }; },
          dispose() {},
          webview: {
            html: '',
            postMessage() { return Promise.resolve(true); },
            onDidReceiveMessage() { return { dispose() {} }; },
          },
        };
      },
    },
    workspace: {
      workspaceFolders: [],
      getWorkspaceFolder() { return undefined; },
      openTextDocument() { return Promise.resolve({}); },
      getConfiguration() { return { get() { return undefined; } }; },
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
        esc(value) {
          return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\"/g, '&quot;');
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
    return { exports: mod.exports, commands, registeredCalls };
  } finally {
    Module._load = origLoad;
  }
}

console.log('\nREG-065: FileList activate idempotence\n' + '─'.repeat(60));

const loaded = loadModuleWithStrictRegister();
const mod = loaded.exports;

const ctx1 = { subscriptions: [] };
const ctx2 = { subscriptions: [] };

let firstError = null;
let secondError = null;

try { mod.activate(ctx1); } catch (err) { firstError = err; }
try { mod.activate(ctx2); } catch (err) { secondError = err; }

check('first activate() call does not throw', firstError === null);
check('second activate() call does not throw duplicate command error', secondError === null);
check('commands are registered exactly once during first activation', loaded.registeredCalls.filter(n => n === 'cvs.tools.fileList').length === 1);
check('navigateTo command is registered exactly once', loaded.registeredCalls.filter(n => n === 'cvs.tools.fileList.navigateTo').length === 1);

mod.deactivate();

check('deactivate() disposes registrations (command map cleared)', loaded.commands.size === 0);

console.log('');
if (failed > 0) {
  console.log(`FAILED ${failed} / ${passed + failed}`);
  process.exit(1);
}
console.log(`PASSED ${passed} / ${passed}`);
process.exit(0);
