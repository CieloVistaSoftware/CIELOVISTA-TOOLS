"use strict";
// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.showFixBugsPanel = showFixBugsPanel;
exports.activate = activate;
exports.deactivate = deactivate;
/**
 * background-health-runner.ts
 *
 * Runs a slow, continuous health check in the background from extension activate.
 * Each check runs one at a time with a gap between them so it never blocks the UI.
 * Results are written to data/bg-health.json and surfaced via the Fix Bugs card.
 *
 * Architecture:
 *   activate() → starts the loop via setTimeout chains (not setInterval)
 *   Each iteration: pick next check → run it → save result → wait → repeat
 *   The "Fix Bugs" webview reads data/bg-health.json and shows prioritised bugs
 *   Clicking "Auto-Fix" on a bug runs the associated VS Code command
 */
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const output_channel_1 = require("../shared/output-channel");
const registry_1 = require("../shared/registry");
const catalog_1 = require("./cvs-command-launcher/catalog");
const FEATURE = 'bg-health-runner';
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const HEALTH_FILE = path.join(DATA_DIR, 'bg-health.json');
const CHECK_GAP_MS = 8000; // 8 seconds between checks — slow and steady
// ── Persistent state ─────────────────────────────────────────────────────────
let _state = {
    lastRun: '', totalChecks: 0, bugs: [], checkIndex: 0,
};
let _timer;
let _running = false;
let _panel;
function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}
function loadState() {
    try {
        if (fs.existsSync(HEALTH_FILE)) {
            _state = JSON.parse(fs.readFileSync(HEALTH_FILE, 'utf8'));
        }
    }
    catch { /* start fresh */ }
}
function saveState() {
    try {
        ensureDataDir();
        _state.lastRun = new Date().toISOString();
        fs.writeFileSync(HEALTH_FILE, JSON.stringify(_state, null, 2), 'utf8');
    }
    catch (e) {
        (0, output_channel_1.logError)(FEATURE, 'Failed to save health state', e);
    }
}
function addBug(bug) {
    // Don't duplicate — update existing if same id
    const existing = _state.bugs.findIndex(b => b.id === bug.id);
    if (existing !== -1) {
        _state.bugs[existing] = { ..._state.bugs[existing], ...bug, fixed: false };
    }
    else {
        _state.bugs.push({ ...bug, detectedAt: new Date().toISOString(), fixed: false });
    }
}
function clearBug(id) {
    const b = _state.bugs.find(b => b.id === id);
    if (b) {
        b.fixed = true;
    }
}
const CHECKS = [
    {
        id: 'chk-catalog-registered',
        name: 'All catalog commands registered',
        async run() {
            // Get all registered commands from VS Code
            const registered = await vscode.commands.getCommands(false);
            const regSet = new Set(registered);
            const missing = catalog_1.CATALOG
                .map(c => c.id)
                .filter(id => !regSet.has(id));
            if (missing.length > 0) {
                addBug({
                    id: 'bug-catalog-registered',
                    checkId: 'chk-catalog-registered',
                    title: `${missing.length} catalog command(s) not registered`,
                    detail: `Commands exist in catalog but have no registerCommand(): ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ` +${missing.length - 5} more` : ''}`,
                    priority: 'critical',
                    category: 'Commands',
                    fixCommandId: 'cvs.audit.codebase',
                    fixLabel: 'Run Codebase Audit',
                });
            }
            else {
                clearBug('bug-catalog-registered');
            }
        }
    },
    {
        id: 'chk-registry-exists',
        name: 'Project registry accessible',
        async run() {
            const registry = (0, registry_1.loadRegistry)();
            if (!registry) {
                addBug({
                    id: 'bug-registry-missing',
                    checkId: 'chk-registry-exists',
                    title: 'Project registry not found',
                    detail: 'project-registry.json is missing or malformed. Many tools will fail.',
                    priority: 'high',
                    category: 'Configuration',
                    fixCommandId: 'cvs.docs.openRegistry',
                    fixLabel: 'Open Registry',
                });
            }
            else {
                clearBug('bug-registry-missing');
            }
        }
    },
    {
        id: 'chk-registry-paths',
        name: 'Registry project paths exist on disk',
        async run() {
            const registry = (0, registry_1.loadRegistry)();
            if (!registry) {
                return;
            }
            const missing = registry.projects
                .filter(p => !fs.existsSync(p.path))
                .map(p => p.name);
            if (missing.length > 0) {
                addBug({
                    id: 'bug-registry-paths',
                    checkId: 'chk-registry-paths',
                    title: `${missing.length} registry project path(s) not found on disk`,
                    detail: `Projects not found: ${missing.slice(0, 5).join(', ')}`,
                    priority: 'medium',
                    category: 'Configuration',
                    fixCommandId: 'cvs.docs.openRegistry',
                    fixLabel: 'Open Registry',
                });
            }
            else {
                clearBug('bug-registry-paths');
            }
        }
    },
    {
        id: 'chk-claude-md',
        name: 'All projects have CLAUDE.md',
        async run() {
            const registry = (0, registry_1.loadRegistry)();
            if (!registry) {
                return;
            }
            const missing = registry.projects
                .filter(p => fs.existsSync(p.path))
                .filter(p => !fs.existsSync(path.join(p.path, 'CLAUDE.md')))
                .map(p => p.name);
            if (missing.length > 0) {
                addBug({
                    id: 'bug-claude-md',
                    checkId: 'chk-claude-md',
                    title: `${missing.length} project(s) missing CLAUDE.md`,
                    detail: `Missing: ${missing.slice(0, 5).join(', ')}`,
                    priority: 'medium',
                    category: 'Documentation',
                    fixCommandId: 'cvs.docs.syncCheck',
                    fixLabel: 'Run Sync Check',
                });
            }
            else {
                clearBug('bug-claude-md');
            }
        }
    },
    {
        id: 'chk-duplicate-commands',
        name: 'No duplicate command IDs in catalog',
        async run() {
            const ids = catalog_1.CATALOG.map(c => c.id);
            const seen = new Set();
            const dupes = [];
            for (const id of ids) {
                if (seen.has(id)) {
                    dupes.push(id);
                }
                else {
                    seen.add(id);
                }
            }
            if (dupes.length > 0) {
                addBug({
                    id: 'bug-duplicate-commands',
                    checkId: 'chk-duplicate-commands',
                    title: `${dupes.length} duplicate command ID(s) in catalog`,
                    detail: `Duplicates: ${dupes.join(', ')}`,
                    priority: 'high',
                    category: 'Commands',
                });
            }
            else {
                clearBug('bug-duplicate-commands');
            }
        }
    },
    {
        id: 'chk-health-file',
        name: 'Health data directory writable',
        async run() {
            try {
                ensureDataDir();
                const testFile = path.join(DATA_DIR, '.write-test');
                fs.writeFileSync(testFile, 'ok');
                fs.unlinkSync(testFile);
                clearBug('bug-health-dir');
            }
            catch {
                addBug({
                    id: 'bug-health-dir',
                    checkId: 'chk-health-file',
                    title: 'data/ directory not writable',
                    detail: `Cannot write to ${DATA_DIR}. Health logs and fixes will not persist.`,
                    priority: 'low',
                    category: 'Infrastructure',
                });
            }
        }
    },
    {
        id: 'chk-untagged-code-blocks',
        name: 'Docs have tagged code blocks',
        async run() {
            const registry = (0, registry_1.loadRegistry)();
            if (!registry) {
                return;
            }
            let untagged = 0;
            const scan = (dir, depth = 0) => {
                if (depth > 3) {
                    return;
                }
                try {
                    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                        if (entry.name === 'node_modules' || entry.name === '.git') {
                            continue;
                        }
                        const full = path.join(dir, entry.name);
                        if (entry.isDirectory()) {
                            scan(full, depth + 1);
                        }
                        else if (entry.name.endsWith('.md')) {
                            const lines = fs.readFileSync(full, 'utf8').split('\n');
                            for (const line of lines) {
                                if (line.trim() === '```') {
                                    untagged++;
                                }
                            }
                        }
                    }
                }
                catch { /* skip */ }
            };
            for (const p of registry.projects) {
                if (fs.existsSync(p.path)) {
                    scan(p.path);
                }
            }
            if (untagged > 0) {
                addBug({
                    id: 'bug-untagged-code',
                    checkId: 'chk-untagged-code-blocks',
                    title: `${untagged} untagged fenced code block(s) across all docs`,
                    detail: 'Code blocks without language tags will not get syntax highlighting.',
                    priority: 'low',
                    category: 'Documentation',
                    fixCommandId: 'cvs.audit.codeHighlight',
                    fixLabel: 'Open Code Highlight Audit',
                });
            }
            else {
                clearBug('bug-untagged-code');
            }
        }
    },
    {
        id: 'chk-workspace-open',
        name: 'Workspace is open',
        async run() {
            if (!vscode.workspace.workspaceFolders?.length) {
                addBug({
                    id: 'bug-no-workspace',
                    checkId: 'chk-workspace-open',
                    title: 'No workspace folder open',
                    detail: 'Many CieloVista Tools commands require an open workspace folder.',
                    priority: 'medium',
                    category: 'Environment',
                });
            }
            else {
                clearBug('bug-no-workspace');
            }
        }
    },
];
// ── Runner loop ───────────────────────────────────────────────────────────────
async function runNextCheck() {
    if (!_running) {
        return;
    }
    const check = CHECKS[_state.checkIndex % CHECKS.length];
    _state.checkIndex = (_state.checkIndex + 1) % CHECKS.length;
    _state.totalChecks++;
    try {
        (0, output_channel_1.log)(FEATURE, `Check: ${check.name}`);
        await check.run();
    }
    catch (e) {
        (0, output_channel_1.logError)(FEATURE, `Check failed: ${check.id}`, e);
    }
    saveState();
    // Notify Fix Bugs panel if open
    if (_panel) {
        _panel.webview.postMessage({ type: 'update', state: _state });
    }
    // Schedule next check
    _timer = setTimeout(runNextCheck, CHECK_GAP_MS);
}
// ── Fix Bugs webview ──────────────────────────────────────────────────────────
function buildFixBugsHtml(state) {
    const activeBugs = state.bugs.filter(b => !b.fixed);
    const fixedBugs = state.bugs.filter(b => b.fixed);
    const PRIORITY_ORDER = ['critical', 'high', 'medium', 'low'];
    const PRIORITY_COLOR = {
        critical: '#f48771', high: '#cca700', medium: '#58a6ff', low: '#888'
    };
    const sorted = [...activeBugs].sort((a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority));
    const bugRows = sorted.map(b => {
        const color = PRIORITY_COLOR[b.priority] ?? '#888';
        const fixBtn = b.fixCommandId
            ? `<button class="fix-btn" data-action="fix" data-cmd="${b.fixCommandId}" data-id="${b.id}">${b.fixLabel ?? '🔧 Fix'}</button>`
            : '';
        return `<div class="bug-card" data-id="${b.id}">
  <div class="bug-header">
    <span class="bug-priority" style="background:${color};color:${b.priority === 'high' ? '#000' : '#fff'}">${b.priority.toUpperCase()}</span>
    <span class="bug-title">${b.title}</span>
    <span class="bug-cat">${b.category}</span>
  </div>
  <div class="bug-detail">${b.detail}</div>
  <div class="bug-footer">
    <span class="bug-time">Detected: ${new Date(b.detectedAt).toLocaleString()}</span>
    ${fixBtn}
    <button class="dismiss-btn" data-action="dismiss" data-id="${b.id}">Dismiss</button>
  </div>
</div>`;
    }).join('');
    const totalChecks = CHECKS.length;
    const doneChecks = state.checkIndex % totalChecks;
    const pct = Math.round((doneChecks / totalChecks) * 100);
    const nextCheck = CHECKS[state.checkIndex % totalChecks]?.name ?? '';
    const stateJson = JSON.stringify(state);
    const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);font-size:13px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background)}
#toolbar{position:sticky;top:0;z-index:10;background:var(--vscode-editor-background);border-bottom:1px solid var(--vscode-panel-border);padding:10px 16px;display:flex;align-items:center;gap:12px}
#toolbar h1{font-size:1.05em;font-weight:700;flex:1}
.stat{font-size:11px;color:var(--vscode-descriptionForeground);white-space:nowrap}
.stat strong{color:var(--vscode-editor-foreground)}
#progress-bar-wrap{height:3px;background:var(--vscode-panel-border);border-radius:2px;overflow:hidden;margin:0 16px 0}
#progress-bar{height:100%;background:var(--vscode-focusBorder);transition:width 0.5s ease;border-radius:2px}
#next-check{font-size:10px;color:var(--vscode-descriptionForeground);padding:3px 16px 6px;font-style:italic}
#content{padding:12px 16px 40px}
.section-heading{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--vscode-descriptionForeground);margin:16px 0 8px;padding-bottom:4px;border-bottom:1px solid var(--vscode-panel-border)}
.bug-card{background:var(--vscode-textCodeBlock-background);border:1px solid var(--vscode-panel-border);border-radius:4px;padding:10px 12px;margin-bottom:8px;display:flex;flex-direction:column;gap:6px}
.bug-card:hover{border-color:var(--vscode-focusBorder)}
.bug-header{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.bug-priority{font-size:9px;font-weight:700;padding:2px 7px;border-radius:3px;flex-shrink:0}
.bug-title{font-weight:700;font-size:0.9em;flex:1}
.bug-cat{font-size:10px;color:var(--vscode-descriptionForeground);background:var(--vscode-editor-background);border:1px solid var(--vscode-panel-border);border-radius:3px;padding:1px 6px}
.bug-detail{font-size:11px;color:var(--vscode-descriptionForeground);line-height:1.5}
.bug-footer{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.bug-time{font-size:10px;color:var(--vscode-descriptionForeground);flex:1}
.fix-btn{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;padding:3px 10px;border-radius:3px;cursor:pointer;font-size:11px;font-weight:600}
.fix-btn:hover{background:var(--vscode-button-hoverBackground)}
.dismiss-btn{background:transparent;border:1px solid var(--vscode-panel-border);color:var(--vscode-descriptionForeground);padding:3px 8px;border-radius:3px;cursor:pointer;font-size:11px}
.dismiss-btn:hover{border-color:var(--vscode-focusBorder)}
.empty{padding:40px;text-align:center;color:var(--vscode-descriptionForeground)}
.spin{display:inline-block;animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
`;
    const JS = `
(function(){
'use strict';
const vscode = acquireVsCodeApi();

document.addEventListener('click', function(e) {
  var btn = e.target.closest('[data-action]');
  if (!btn) return;
  if (btn.dataset.action === 'fix') {
    vscode.postMessage({ command: 'fix', cmdId: btn.dataset.cmd, bugId: btn.dataset.id });
    btn.textContent = '\\u23f3 Running\\u2026';
    btn.disabled = true;
  }
  if (btn.dataset.action === 'dismiss') {
    vscode.postMessage({ command: 'dismiss', bugId: btn.dataset.id });
    var card = btn.closest('.bug-card');
    if (card) { card.style.opacity = '0.3'; card.style.pointerEvents = 'none'; }
  }
});

window.addEventListener('message', function(e) {
  var m = e.data;
  if (m.type === 'update') {
    // Reload the page with fresh state
    vscode.postMessage({ command: 'reload' });
  }
  if (m.type === 'progress') {
    var bar = document.getElementById('progress-bar');
    if (bar) bar.style.width = m.pct + '%';
    var next = document.getElementById('next-check');
    if (next) next.textContent = '\\u23f3 Next: ' + (m.nextCheck || '');
  }
});
})();`;
    const emptyHtml = activeBugs.length === 0
        ? `<div class="empty">&#10003; No bugs found across ${state.totalChecks} checks. Background runner is active.</div>`
        : '';
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${CSS}</style></head><body>
<div id="toolbar">
  <h1>&#128027; Fix Bugs</h1>
  <span class="stat"><strong>${activeBugs.length}</strong> active &nbsp;|&nbsp; <strong>${fixedBugs.length}</strong> fixed &nbsp;|&nbsp; <strong>${state.totalChecks}</strong> checks run</span>
  <span class="stat"><span class="spin">&#9696;</span> Running</span>
</div>
<div id="progress-bar-wrap"><div id="progress-bar" style="width:${pct}%"></div></div>
<div id="next-check">&#9203; Next: ${nextCheck}</div>
<div id="content">
  ${emptyHtml}
  ${sorted.length > 0 ? `<div class="section-heading">Active bugs (${sorted.length})</div>${bugRows}` : ''}
  ${fixedBugs.length > 0 ? `<div class="section-heading">Fixed this session (${fixedBugs.length})</div>
  ${fixedBugs.map(b => `<div class="bug-card" style="opacity:0.4"><div class="bug-header"><span class="bug-title">&#10003; ${b.title}</span></div></div>`).join('')}` : ''}
</div>
<script>${JS}</script>
</body></html>`;
}
async function showFixBugsPanel() {
    const html = buildFixBugsHtml(_state);
    if (_panel) {
        _panel.webview.html = html;
        _panel.reveal(vscode.ViewColumn.Beside, true);
    }
    else {
        _panel = vscode.window.createWebviewPanel('fixBugs', '🐛 Fix Bugs', vscode.ViewColumn.Beside, { enableScripts: true, retainContextWhenHidden: true });
        _panel.webview.html = html;
        _panel.onDidDispose(() => { _panel = undefined; });
    }
    _panel.webview.onDidReceiveMessage(async (msg) => {
        if (msg.command === 'fix' && msg.cmdId) {
            try {
                await vscode.commands.executeCommand(msg.cmdId);
                clearBug(msg.bugId);
                saveState();
            }
            catch (e) {
                (0, output_channel_1.logError)(FEATURE, `Fix command failed: ${msg.cmdId}`, e);
            }
        }
        if (msg.command === 'dismiss') {
            clearBug(msg.bugId);
            saveState();
        }
        if (msg.command === 'reload') {
            if (_panel) {
                _panel.webview.html = buildFixBugsHtml(_state);
            }
        }
    });
}
// ── Activate / Deactivate ─────────────────────────────────────────────────────
function activate(context) {
    (0, output_channel_1.log)(FEATURE, 'Background health runner starting');
    loadState();
    _running = true;
    // Start the first check after a short delay so activation isn't blocked
    _timer = setTimeout(runNextCheck, 5000);
    context.subscriptions.push(vscode.commands.registerCommand('cvs.health.fixBugs', showFixBugsPanel));
    (0, output_channel_1.log)(FEATURE, `Background runner active — ${CHECKS.length} checks, ${CHECK_GAP_MS}ms gap`);
}
function deactivate() {
    _running = false;
    if (_timer) {
        clearTimeout(_timer);
        _timer = undefined;
    }
    _panel?.dispose();
    _panel = undefined;
    (0, output_channel_1.log)(FEATURE, 'Background health runner stopped');
}
//# sourceMappingURL=background-health-runner.js.map