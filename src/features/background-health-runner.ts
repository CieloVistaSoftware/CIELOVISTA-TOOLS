// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
// FILE REMOVED BY REQUEST
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

import * as vscode from 'vscode';
import * as fs     from 'fs';
import * as net    from 'net';
import * as path   from 'path';
import { log, logError } from '../shared/output-channel';
import { loadRegistry }  from '../shared/registry';
import { CATALOG }       from './cvs-command-launcher/catalog';

function isPortOpen(port: number): Promise<boolean> {
    return new Promise(resolve => {
        const socket = new net.Socket();
        socket.setTimeout(400);
        socket.once('connect', () => { socket.destroy(); resolve(true); });
        socket.once('error',   () => { socket.destroy(); resolve(false); });
        socket.once('timeout', () => { socket.destroy(); resolve(false); });
        socket.connect(port, '127.0.0.1');
    });
}

const FEATURE    = 'bg-health-runner';
const DATA_DIR   = path.join(__dirname, '..', '..', 'data');
const HEALTH_FILE = path.join(DATA_DIR, 'bg-health.json');
const CHECK_GAP_MS = 8000;   // 8 seconds between checks — slow and steady

export interface HealthBug {
    id:          string;
    checkId:     string;
    title:       string;
    detail:      string;
    priority:    'critical' | 'high' | 'medium' | 'low';
    category:    string;
    fixCommandId?: string;
    fixLabel?:   string;
    detectedAt:  string;
    fixed:       boolean;
}

interface HealthState {
    lastRun:    string;
    totalChecks: number;
    bugs:       HealthBug[];
    checkIndex: number;   // which check runs next (round-robin)
}

// ── Persistent state ─────────────────────────────────────────────────────────

let _state: HealthState = {
    lastRun: '', totalChecks: 0, bugs: [], checkIndex: 0,
};
let _timer: NodeJS.Timeout | undefined;
let _running = false;
let _panel: vscode.WebviewPanel | undefined;

// Singleton guard — prevents duplicate runners when extension re-activates
// without a clean deactivate (e.g. window reload while runner was live).
const SINGLETON_KEY = 'cvt.bg-health-runner.active';
declare const global: Record<string, unknown>;
function isAlreadyRunning(): boolean  { return !!(global as any)[SINGLETON_KEY]; }
function claimSingleton(): void        { (global as any)[SINGLETON_KEY] = true; }
function releaseSingleton(): void      { delete (global as any)[SINGLETON_KEY]; }

function ensureDataDir(): void {
    if (!fs.existsSync(DATA_DIR)) { fs.mkdirSync(DATA_DIR, { recursive: true }); }
}

function loadState(): void {
    try {
        if (fs.existsSync(HEALTH_FILE)) {
            _state = JSON.parse(fs.readFileSync(HEALTH_FILE, 'utf8'));
        }
    } catch { /* start fresh */ }
}

function saveState(): void {
    try {
        ensureDataDir();
        _state.lastRun = new Date().toISOString();
        fs.writeFileSync(HEALTH_FILE, JSON.stringify(_state, null, 2), 'utf8');
    } catch (e) {
        logError('Failed to save health state', e instanceof Error ? e.stack || String(e) : String(e), FEATURE);
    }
}

function addBug(bug: Omit<HealthBug, 'detectedAt' | 'fixed'>): void {
    // Don't duplicate — update existing if same id
    const existing = _state.bugs.findIndex(b => b.id === bug.id);
    if (existing !== -1) {
        _state.bugs[existing] = { ..._state.bugs[existing], ...bug, fixed: false };
    } else {
        _state.bugs.push({ ...bug, detectedAt: new Date().toISOString(), fixed: false });
    }
}

function clearBug(id: string): void {
    const b = _state.bugs.find(b => b.id === id);
    if (b) { b.fixed = true; }
}

// ── Individual health checks ──────────────────────────────────────────────────

interface Check {
    id:    string;
    name:  string;
    run:   () => Promise<void>;
}

const CHECKS: Check[] = [

    {
        id: 'chk-catalog-registered',
        name: 'All catalog commands registered',
        async run() {
            // Get all registered commands from VS Code
            const registered = await vscode.commands.getCommands(false);
            const regSet = new Set(registered);
            const missing = CATALOG
                .map(c => c.id)
                .filter(id => !regSet.has(id));
            if (missing.length > 0) {
                addBug({
                    id: 'bug-catalog-registered',
                    checkId: 'chk-catalog-registered',
                    title: `${missing.length} catalog command(s) not registered`,
                    detail: `Commands exist in catalog but have no registerCommand(): ${missing.slice(0,5).join(', ')}${missing.length > 5 ? ` +${missing.length-5} more` : ''}`,
                    priority: 'critical',
                    category: 'Commands',
                    fixCommandId: 'cvs.audit.codebase',
                    fixLabel: 'Run Codebase Audit',
                });
            } else {
                clearBug('bug-catalog-registered');
            }
        }
    },

    {
        id: 'chk-registry-exists',
        name: 'Project registry accessible',
        async run() {
            const registry = loadRegistry();
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
            } else {
                clearBug('bug-registry-missing');
            }
        }
    },

    {
        id: 'chk-registry-paths',
        name: 'Registry project paths exist on disk',
        async run() {
            const registry = loadRegistry();
            if (!registry) { return; }
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
            } else {
                clearBug('bug-registry-paths');
            }
        }
    },

    {
        id: 'chk-claude-md',
        name: 'All projects have CLAUDE.md',
        async run() {
            const registry = loadRegistry();
            if (!registry) { return; }
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
            } else {
                clearBug('bug-claude-md');
            }
        }
    },

    {
        id: 'chk-duplicate-commands',
        name: 'No duplicate command IDs in catalog',
        async run() {
            const ids = CATALOG.map(c => c.id);
            const seen = new Set<string>();
            const dupes: string[] = [];
            for (const id of ids) {
                if (seen.has(id)) { dupes.push(id); } else { seen.add(id); }
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
            } else {
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
            } catch {
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
            const registry = loadRegistry();
            if (!registry) { return; }
            let untagged = 0;
            const scan = (dir: string, depth = 0) => {
                if (depth > 3) { return; }
                try {
                    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                        if (entry.name === 'node_modules' || entry.name === '.git') { continue; }
                        const full = path.join(dir, entry.name);
                        if (entry.isDirectory()) { scan(full, depth + 1); }
                        else if (entry.name.endsWith('.md')) {
                            const lines = fs.readFileSync(full, 'utf8').split('\n');
                            for (const line of lines) {
                                if (line.trim() === '```') { untagged++; }
                            }
                        }
                    }
                } catch { /* skip */ }
            };
            for (const p of registry.projects) {
                if (fs.existsSync(p.path)) { scan(p.path); }
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
            } else {
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
            } else {
                clearBug('bug-no-workspace');
            }
        }
    },

];

// ── Runner loop ───────────────────────────────────────────────────────────────

async function runNextCheck(): Promise<void> {
    if (!_running) { return; }

    const check = CHECKS[_state.checkIndex % CHECKS.length];
    _state.checkIndex = (_state.checkIndex + 1) % CHECKS.length;
    _state.totalChecks++;

    try {
        log(FEATURE, `Check: ${check.name}`);
        await check.run();
    } catch (e) {
        logError(`Check failed: ${check.id}`, e instanceof Error ? e.stack || String(e) : String(e), FEATURE);
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

function buildFixBugsHtml(state: HealthState): string {
    const activeBugs = state.bugs.filter(b => !b.fixed);
    const fixedBugs  = state.bugs.filter(b => b.fixed);

    const PRIORITY_ORDER: HealthBug['priority'][] = ['critical', 'high', 'medium', 'low'];
    const PRIORITY_COLOR: Record<string, string> = {
        critical: '#f48771', high: '#cca700', medium: '#58a6ff', low: '#888'
    };

    const sorted = [...activeBugs].sort((a, b) =>
        PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority)
    );

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

    const totalChecks  = CHECKS.length;
    const doneChecks   = state.checkIndex % totalChecks;
    const pct          = Math.round((doneChecks / totalChecks) * 100);
    const nextCheck    = CHECKS[state.checkIndex % totalChecks]?.name ?? '';
    const stateJson    = JSON.stringify(state);

    let CSS = `
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
    .mcp-dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;vertical-align:middle}
    .mcp-dot.green{background:#3fb950;box-shadow:0 0 6px #3fb950}
    .mcp-dot.red{background:#f85149;box-shadow:0 0 6px #f85149}
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

        // MCP status indicator (async, so we use a placeholder and update via script)
        const mcpStatusHtml = `<span id="mcp-status-dot" class="mcp-dot red"></span><span id="mcp-status-text">MCP Checking...</span>`;

        return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${CSS}</style></head><body>
<div id="toolbar">
    <h1>&#128027; Fix Bugs</h1>
    <span class="stat"><strong>${activeBugs.length}</strong> active &nbsp;|&nbsp; <strong>${fixedBugs.length}</strong> fixed &nbsp;|&nbsp; <strong>${state.totalChecks}</strong> checks run</span>
    <span class="stat" id="mcp-status">${mcpStatusHtml}</span>
</div>
<div id="progress-bar-wrap"><div id="progress-bar" style="width:${pct}%"></div></div>
<div id="next-check">&#9203; Next: ${nextCheck}</div>
<div id="content">
    ${emptyHtml}
    ${sorted.length > 0 ? `<div class="section-heading">Active bugs (${sorted.length})</div>${bugRows}` : ''}
    ${fixedBugs.length > 0 ? `<div class="section-heading">Fixed this session (${fixedBugs.length})</div>
    ${fixedBugs.map(b => `<div class="bug-card" style="opacity:0.4"><div class="bug-header"><span class="bug-title">&#10003; ${b.title}</span></div></div>`).join('')}` : ''}
</div>
<script>
${JS}
(function(){
    // Check MCP port status and update dot
    const vscode = acquireVsCodeApi();
    vscode.postMessage({ command: 'checkMcpPort' });
    window.addEventListener('message', function(e) {
        if (e.data && e.data.type === 'mcpPortStatus') {
            var dot = document.getElementById('mcp-status-dot');
            var txt = document.getElementById('mcp-status-text');
            if (dot && txt) {
                if (e.data.open) {
                    dot.className = 'mcp-dot green';
                    txt.textContent = 'MCP Running';
                } else {
                    dot.className = 'mcp-dot red';
                    txt.textContent = 'MCP Stopped';
                }
            }
        }
    });
})();
</script>
</body></html>`;
}

export async function showFixBugsPanel(): Promise<void> {
    const html = buildFixBugsHtml(_state);

    if (_panel) {
        _panel.webview.html = html;
        _panel.reveal(vscode.ViewColumn.Beside, true);
    } else {
        _panel = vscode.window.createWebviewPanel(
            'fixBugs', '🐛 Fix Bugs', vscode.ViewColumn.Beside,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        _panel.webview.html = html;
        _panel.onDidDispose(() => { _panel = undefined; });
    }

    _panel.webview.onDidReceiveMessage(async msg => {
        if (msg.command === 'fix' && msg.cmdId) {
            try {
                await vscode.commands.executeCommand(msg.cmdId);
                clearBug(msg.bugId);
                saveState();
            } catch (e) {
                logError(`Fix command failed: ${msg.cmdId}`, e instanceof Error ? e.stack || String(e) : String(e), FEATURE);
            }
        }
        if (msg.command === 'dismiss') {
            clearBug(msg.bugId);
            saveState();
        }
        if (msg.command === 'reload') {
            if (_panel) { _panel.webview.html = buildFixBugsHtml(_state); }
        }
        if (msg.command === 'checkMcpPort') {
            // Check MCP port and post result
            const open = await isPortOpen(3000);
            _panel?.webview.postMessage({ type: 'mcpPortStatus', open });
        }
    });
}

// ── Activate / Deactivate ─────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
    if (isAlreadyRunning()) {
        log(FEATURE, 'Runner already active — skipping duplicate activation');
        // Still register the command so the panel can be opened
        context.subscriptions.push(
            vscode.commands.registerCommand('cvs.health.fixBugs', showFixBugsPanel)
        );
        return;
    }

    log(FEATURE, 'Background health runner starting');
    loadState();
    _running = true;
    claimSingleton();

    // Start the first check after a short delay so activation isn't blocked
    _timer = setTimeout(runNextCheck, 5000);

    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.health.fixBugs', showFixBugsPanel)
    );

    log(FEATURE, `Background runner active — ${CHECKS.length} checks, ${CHECK_GAP_MS}ms gap`);
}

export function deactivate(): void {
    _running = false;
    if (_timer) { clearTimeout(_timer); _timer = undefined; }
    _panel?.dispose();
    _panel = undefined;
    releaseSingleton();
    log(FEATURE, 'Background health runner stopped');
}

/** @internal — exported for unit testing only, not part of the public API */
export const _test = { get state() { return _state; }, set state(v) { _state = v; }, addBug, clearBug, saveState };
