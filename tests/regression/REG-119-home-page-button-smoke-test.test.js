/**
 * tests/regression/REG-119-home-page-button-smoke-test.test.js
 *
 * Guards issue #654: the home page's "Start" button silently did nothing
 * because a hardcoded tooltip string used an escaped apostrophe (`\'`)
 * INSIDE the outer TS template literal that builds the webview's injected
 * <script> block. Template-literal evaluation processes `\'` as an escape
 * sequence, collapsing it to a bare `'` before the text ever reached the
 * browser -- so the actual JS shipped to the webview had an unescaped
 * apostrophe inside a single-quoted string, throwing a SyntaxError that
 * killed the ENTIRE inline <script> block (every button's click wiring,
 * not just the one line) the moment it was parsed.
 *
 * Every other REG-11x home-page test only greps the raw .ts source for
 * expected substrings -- none of them execute the actual JS payload that
 * gets embedded in the webview, so all 133 of them stayed green while the
 * button was completely dead. This test actually renders the real built
 * HTML in a live DOM (jsdom, runScripts: 'dangerously', same pattern as
 * REG-063-mcp-viewer-json-rpc-runtime) and clicks every header/quick-launch
 * button, so a SyntaxError anywhere in the injected script -- or any button
 * that quietly does nothing -- fails this test immediately.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');

const SRC = path.join(__dirname, '../../src/features/home-page.ts');
const sourceTs = fs.readFileSync(SRC, 'utf8');
const transpiled = ts.transpileModule(sourceTs, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

let passed = 0;
let failed = 0;
function check(label, condition) {
  if (condition) { console.log(`  PASS - ${label}`); passed++; }
  else { console.log(`  FAIL - ${label}`); failed++; }
}

// Mock 'vscode' and every one of home-page.ts's own relative imports --
// Node's plain require() (no ts-node/register in this test runner) can't
// resolve a bare ".ts" sibling file the way the real extension host does,
// so even dependency-free ones (webview-utils, catalog) need a stand-in
// here, not just the vscode-dependent ones. esc() mirrors the real
// implementation in src/shared/webview-utils.ts exactly, since it's used
// throughout buildDashboardHtml's actual output.
function loadHomePageModule() {
  const vscode = {
    ExtensionMode: { Production: 1, Development: 2, Test: 3 },
    Uri: { file(fsPath) { return { fsPath }; }, parse(s) { return { toString() { return s; } }; } },
    ViewColumn: { One: 1, Beside: 2 },
    window: {
      createWebviewPanel() {
        return {
          title: '', reveal() {}, dispose() {},
          onDidDispose() { return { dispose() {} }; },
          webview: { html: '', postMessage() { return Promise.resolve(true); }, onDidReceiveMessage() { return { dispose() {} }; }, asWebviewUri(u) { return u; }, cspSource: '' },
        };
      },
      createOutputChannel() { return { appendLine() {}, show() {}, dispose() {} }; },
      createTerminal() { return { show() {}, sendText() {} }; },
      showInformationMessage() {}, showErrorMessage() {}, showWarningMessage() {},
    },
    env: { openExternal() { return Promise.resolve(true); }, clipboard: { writeText() { return Promise.resolve(); } } },
    workspace: { workspaceFolders: [], getConfiguration() { return { get() { return undefined; } }; } },
    commands: { registerCommand() { return { dispose() {} }; }, executeCommand() { return Promise.resolve(); } },
  };

  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'vscode') { return vscode; }
    if (request === './cvs-command-launcher/command-history') { return { getHistory() { return []; } }; }
    if (request === './cvs-command-launcher/recent-projects') {
      return { getDisplayProjects() { return []; }, addPinnedProject() {}, removeFromDisplay() {} };
    }
    if (request === './mcp-server-status') {
      return {
        startMcpServer() {}, getMcpServerStatus() { return 'down'; },
        onMcpServerStatusChange() {}, offMcpServerStatusChange() {},
      };
    }
    if (request === '../shared/doc-preview') { return { openDocPreview() {} }; }
    if (request === '../shared/github-issues-view') { return { showGithubIssues() {} }; }
    if (request === '../shared/cvt-registry') {
      return { loadRegistry() { return []; }, registryPathSet() { return new Set(); }, addToRegistry() {}, removeFromRegistry() { return 0; } };
    }
    if (request === './cvs-command-launcher/catalog') { return { CATALOG: [] }; }
    if (request === '../shared/webview-utils') {
      return {
        esc(s) {
          return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
        },
      };
    }
    if (request === '../shared/dev-server-config') {
      return {
        getDevServerConfig() { return { port: 4000, landingPage: 'index.html' }; },
        buildPreviewUrl(cfg, now) { return `http://127.0.0.1:${cfg.port}/${cfg.landingPage}?cvtPreview=${(now ?? 0).toString(36)}`; },
      };
    }
    if (request === '../shared/port-check') { return { isPortOpen() { return Promise.resolve(false); } }; }
    return origLoad.call(this, request, parent, isMain);
  };

  try {
    const mod = new Module(SRC, module.parent);
    mod.filename = SRC;
    mod.paths = Module._nodeModulePaths(path.dirname(SRC));
    mod._compile(transpiled, SRC);
    return mod.exports;
  } finally {
    Module._load = origLoad;
  }
}

console.log('\nREG-119: home page button smoke test\n' + '─'.repeat(60));

const { buildDashboardHtml } = loadHomePageModule();
check('buildDashboardHtml is exported', typeof buildDashboardHtml === 'function');

// buildDashboardHtml's own quickLaunch list only renders a tile if its
// command is in `registered` (Issue Viewer is the one exception, always
// shown) -- an empty Set here would silently drop 7 of the 8 tiles and
// isn't representative of a real activated extension.
const QUICK_LAUNCH_COMMANDS = new Set([
  'cvs.commands.showAll',
  'cvs.catalog.open',
  'cvs.npm.tree',
  'cvs.terminal.pasteLastCommandToChat',
  'cvs.audit.runDaily',
  'cvs.mcp.viewer.open',
  'cvs.tools.fileList',
]);

const html = buildDashboardHtml(
  'guitar-chord-theory',
  'C:/Users/jwpmi/Downloads/AI/guitar-chord-theory',
  false, // mcpRunning: false -- exercises the mcp-badge's click-to-start branch
  [],    // history
  [],    // recents
  {},    // grouped
  new Set(), // cvtPaths
  QUICK_LAUNCH_COMMANDS, // registered
  true,  // hasStartScript -- renders the Start button + devserver badge
);

const messages = [];
const errors = [];

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  resources: 'usable',
  url: 'http://localhost/',
  beforeParse(window) {
    window.acquireVsCodeApi = () => ({
      postMessage(msg) { messages.push(msg); return Promise.resolve(true); },
      getState() { return undefined; },
      setState() {},
    });
  },
});

const win = dom.window;
const doc = win.document;
win.addEventListener('error', (e) => { errors.push(e.error || e.message); });

function flush() { return new Promise((resolve) => setTimeout(resolve, 0)); }
function click(el) { el.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); }

(async () => {
  await flush();

  // The exact failure mode of issue #654: a SyntaxError anywhere in the
  // injected <script> silently kills every handler below it. If this check
  // fails, every other check in this file will cascade-fail too -- that
  // cascade IS the point, since it's exactly what happened in production
  // while all 133 string-matching tests stayed green.
  check('the injected webview <script> parses and runs with no errors', errors.length === 0);
  if (errors.length) { console.error('  ' + errors.map(String).join('\n  ')); }

  const qlButtons = Array.from(doc.querySelectorAll('.ql-btn'));
  check('quick-launch tiles are rendered (Issue Viewer, Guided Launcher, Doc Catalog, ...)', qlButtons.length >= 8);
  qlButtons.forEach((btn) => {
    const cmd = btn.dataset.cmd;
    messages.length = 0;
    click(btn);
    check(`quick-launch tile "${cmd}" posts runCommand`, messages.some((m) => m.type === 'runCommand' && m.command === cmd));
  });

  const reloadBtn = doc.getElementById('btn-reload');
  check('#btn-reload exists', !!reloadBtn);
  messages.length = 0;
  click(reloadBtn);
  check('#btn-reload posts workbench.action.reloadWindow', messages.some((m) => m.type === 'runCommand' && m.command === 'workbench.action.reloadWindow'));

  const configureBtn = doc.getElementById('btn-configure');
  const overlay = doc.getElementById('cfg-overlay');
  check('#btn-configure and #cfg-overlay exist', !!configureBtn && !!overlay);
  click(configureBtn);
  check('#btn-configure opens the settings overlay', overlay.style.display === 'flex');

  const startBtn = doc.getElementById('btn-npm-start');
  check('#btn-npm-start (Start) is rendered when hasStartScript is true', !!startBtn);
  messages.length = 0;
  click(startBtn);
  check('#btn-npm-start posts devServerAction', messages.some((m) => m.type === 'devServerAction'));

  const mcpBadge = doc.getElementById('mcp-badge');
  check('#mcp-badge exists', !!mcpBadge);
  messages.length = 0;
  click(mcpBadge);
  check('#mcp-badge (stopped) posts startMcp on click', messages.some((m) => m.type === 'startMcp'));

  const dcBadge = doc.getElementById('dc-badge');
  check('#dc-badge exists', !!dcBadge);
  messages.length = 0;
  click(dcBadge);
  check('#dc-badge posts startDiskCleanUp on click', messages.some((m) => m.type === 'startDiskCleanUp'));

  console.log(`\nREG-119: ${passed} passed, ${failed} failed`);
  if (failed) { process.exit(1); }
})().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
