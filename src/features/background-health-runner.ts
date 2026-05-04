// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
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
import { fileHealthBugAsIssue, fetchAutoFiledIssueMap } from '../shared/github-issue-filer';
import { loadRegistry }  from '../shared/registry';
import { scanFile }      from './code-highlight-audit';
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
    recommendation?: string;
    evidence?:    string[];
    priority:    'critical' | 'high' | 'medium' | 'low';
    category:    string;
    fixCommandId?: string;
    fixLabel?:   string;
    detectedAt:  string;
    fixed:       boolean;
    githubIssueNumber?: number;
    githubIssueUrl?:    string;
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

function esc(s: string): string {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function parseEvidenceLocation(line: string): { filePath: string; line: number; column: number } | null {
    const match = line.match(/^([A-Za-z]:[\\/].*?|\/.+?):(\d+)(?::(\d+))?$/);
    if (!match) { return null; }

    const filePath = match[1];
    try {
        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
            return null;
        }
    } catch {
        return null;
    }

    return {
        filePath,
        line: Number(match[2]),
        column: Number(match[3] ?? '1'),
    };
}

function resolveCommandEvidenceLocation(line: string): { filePath: string; line: number; column: number } | null {
    const entry = CATALOG.find((item) => item.id === line);
    if (!entry?.location) { return null; }

    const sourcePath = path.resolve(__dirname, '..', '..', 'src', entry.location);
    try {
        if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
            return null;
        }
        const lines = fs.readFileSync(sourcePath, 'utf8').split('\n');
        const foundIndex = lines.findIndex((text) => text.includes(line));
        return {
            filePath: sourcePath,
            line: foundIndex >= 0 ? foundIndex + 1 : 1,
            column: 1,
        };
    } catch {
        return null;
    }
}

function renderEvidenceHtml(evidence: string[]): string {
    const rows = evidence.map((line) => {
        const loc = parseEvidenceLocation(line) ?? resolveCommandEvidenceLocation(line);
        if (loc) {
            return `<div class="bug-evidence-line"><a class="bug-evidence-link" href="#" data-action="open-evidence" data-path="${esc(loc.filePath)}" data-line="${loc.line}" data-col="${loc.column}">${esc(line)}</a></div>`;
        }
        return `<div class="bug-evidence-line">${esc(line)}</div>`;
    }).join('');

    return `<details class="bug-evidence"><summary>What's wrong (${evidence.length})</summary><div class="bug-evidence-list">${rows}</div></details>`;
}

function defaultRecommendation(bug: HealthBug): string {
    if (bug.recommendation && bug.recommendation.trim()) { return bug.recommendation.trim(); }
    if (bug.fixLabel && bug.fixCommandId) { return `${bug.fixLabel}, then verify this card clears on the next health pass.`; }
    return 'Inspect the evidence below, fix the underlying cause, and rerun the relevant check.';
}

function buildIssueUrl(bug: HealthBug): string {
    const title = `[${bug.category}] ${bug.title}`;
    const bodyLines = [
        '## Background Health Runner report',
        '',
        `**Check ID:** \`${bug.checkId}\``,
        `**Priority:** \`${bug.priority}\``,
        `**Category:** ${bug.category}`,
        `**Detected:** ${bug.detectedAt}`,
        '',
        '### What\'s wrong',
        bug.detail,
        '',
        '### Recommended fix',
        defaultRecommendation(bug),
    ];

    if (bug.evidence && bug.evidence.length > 0) {
        bodyLines.push('', '### Evidence', '```text', ...bug.evidence, '```');
    }

    bodyLines.push('', '---', '*Filed from CVT Background Health Runner*');

    const params = new URLSearchParams({
        title,
        body: bodyLines.join('\n'),
        labels: `type:bug,status:triage,area:${bug.category.toLowerCase().replace(/\s+/g, '-')}`,
    });
    return `https://github.com/CieloVistaSoftware/CIELOVISTA-TOOLS/issues/new?${params.toString()}`;
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
                    recommendation: 'Register each missing command in its owning feature activate() function, or remove stale entries from the launcher catalog if the command was intentionally deleted.',
                    evidence: missing,
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
            const offenders: string[] = [];
            const scan = (dir: string, depth = 0) => {
                if (depth > 3) { return; }
                try {
                    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                        if (entry.name === 'node_modules' || entry.name === '.git') { continue; }
                        const full = path.join(dir, entry.name);
                        if (entry.isDirectory()) { scan(full, depth + 1); }
                        else if (entry.name.endsWith('.md')) {
                            const matches = scanFile(full, 'health-runner');
                            untagged += matches.length;
                            for (const m of matches) {
                                if (offenders.length >= 50) { break; }
                                offenders.push(`${full}:${m.lineNumber}`);
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
                    detail: `Code blocks without language tags will not get syntax highlighting. Showing ${Math.min(offenders.length, 50)} example location(s).`,
                    recommendation: 'Replace bare fences with tagged fences such as ```ts, ```js, ```powershell, ```json, or ```bash so docs render with the right syntax highlighting.',
                    evidence: offenders,
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
        // VS Code cancels in-flight promises on extension host shutdown — not a real error.
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === 'Canceled' || msg.startsWith('Canceled:')) { return; }
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
                const recommendation = defaultRecommendation(b);
                const evidenceHtml = b.evidence && b.evidence.length > 0
                        ? renderEvidenceHtml(b.evidence)
                        : '';
        return `<div class="bug-card" data-id="${b.id}">
  <div class="bug-header">
    <span class="bug-priority" style="background:${color};color:${b.priority === 'high' ? '#000' : '#fff'}">${b.priority.toUpperCase()}</span>
        <span class="bug-title">${esc(b.title)}</span>
        <span class="bug-cat">${esc(b.category)}</span>
  </div>
    <div class="bug-detail">${esc(b.detail)}</div>
    <div class="bug-recommendation"><strong>Recommended fix:</strong> ${esc(recommendation)}</div>
    ${evidenceHtml}
  <div class="bug-footer">
    <span class="bug-time">Detected: ${new Date(b.detectedAt).toLocaleString()}</span>
    ${fixBtn}
        ${b.githubIssueNumber
            ? `<a class="issue-filed-badge" href="#" data-action="open-issue" data-url="${esc(b.githubIssueUrl ?? '')}" title="View on GitHub">#${b.githubIssueNumber} Filed</a>`
            : `<button class="issue-btn" data-action="file-issue" data-id="${b.id}">Create Issue</button>`}
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
.bug-recommendation{font-size:11px;line-height:1.5;padding:7px 8px;border-radius:4px;background:rgba(88,166,255,.08);border:1px solid rgba(88,166,255,.22)}
.bug-evidence{font-size:11px}
.bug-evidence summary{cursor:pointer;color:var(--vscode-textLink-foreground);user-select:none}
.bug-evidence-list{margin-top:6px;padding:8px;border-radius:4px;max-height:200px;overflow:auto;background:var(--vscode-editor-background);border:1px solid var(--vscode-panel-border);font-size:10px;line-height:1.45}
.bug-evidence-line{font-family:var(--vscode-editor-font-family,monospace);white-space:pre-wrap;word-break:break-word}
.bug-evidence-line + .bug-evidence-line{margin-top:2px}
.bug-evidence-link{color:var(--vscode-textLink-foreground);text-decoration:none}
.bug-evidence-link:hover{text-decoration:underline}
.bug-footer{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.bug-time{font-size:10px;color:var(--vscode-descriptionForeground);flex:1}
.fix-btn{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;padding:3px 10px;border-radius:3px;cursor:pointer;font-size:11px;font-weight:600}
.fix-btn:hover{background:var(--vscode-button-hoverBackground)}
.issue-btn{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;padding:3px 10px;border-radius:3px;cursor:pointer;font-size:11px;font-weight:600}
.issue-btn:hover{background:var(--vscode-button-secondaryHoverBackground)}
.dismiss-btn{background:transparent;border:1px solid var(--vscode-panel-border);color:var(--vscode-descriptionForeground);padding:3px 8px;border-radius:3px;cursor:pointer;font-size:11px}
.dismiss-btn:hover{border-color:var(--vscode-focusBorder)}
.issue-filed-badge{display:inline-block;padding:3px 10px;border-radius:3px;font-size:11px;font-weight:600;background:rgba(63,185,80,0.15);color:#3fb950;border:1px solid #3fb950;text-decoration:none;cursor:pointer}
.issue-filed-badge:hover{background:rgba(63,185,80,0.25)}
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
    if (btn.dataset.action === 'file-issue') {
        vscode.postMessage({ command: 'file-issue', bugId: btn.dataset.id });
        btn.textContent = 'Opening GitHub\u2026';
        btn.disabled = true;
    }
    if (btn.dataset.action === 'open-issue') {
        e.preventDefault();
        vscode.postMessage({ command: 'open-issue', url: btn.dataset.url });
    }
    if (btn.dataset.action === 'open-evidence') {
        e.preventDefault();
        vscode.postMessage({ command: 'open-evidence', path: btn.dataset.path, line: parseInt(btn.dataset.line || '1', 10), column: parseInt(btn.dataset.col || '1', 10) });
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
    if (m.type === 'issue-filed' || m.type === 'issue-synced') {
        var btn = document.querySelector('.issue-btn[data-id="' + m.bugId + '"]');
        if (btn && btn.parentNode) {
            var badge = document.createElement('a');
            badge.className = 'issue-filed-badge';
            badge.href = '#';
            badge.dataset.action = 'open-issue';
            badge.dataset.url = m.url || '';
            badge.title = 'View on GitHub';
            badge.textContent = '#' + m.number + ' Filed';
            btn.parentNode.replaceChild(badge, btn);
        }
    }
    if (m.type === 'issue-filed-error') {
        var btn2 = document.querySelector('.issue-btn[data-id="' + m.bugId + '"]');
        if (btn2) { btn2.textContent = 'Create Issue'; btn2.disabled = false; }
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

    // Silently sync issue numbers from GitHub for any unlinked active bugs.
    // This runs after the panel is shown so it doesn't block opening.
    void (async () => {
        const unlinked = _state.bugs.filter(b => !b.fixed && !b.githubIssueNumber);
        if (unlinked.length === 0) { return; }
        const map = await fetchAutoFiledIssueMap();
        if (!map) { return; }
        let changed = false;
        for (const bug of unlinked) {
            const issueTitle = `[${bug.category}] ${bug.title}`;
            const match = map.get(issueTitle);
            if (match) {
                bug.githubIssueNumber = match.number;
                bug.githubIssueUrl    = match.html_url;
                changed = true;
                _panel?.webview.postMessage({
                    type:   'issue-synced',
                    bugId:  bug.id,
                    number: match.number,
                    url:    match.html_url,
                });
            }
        }
        if (changed) { saveState(); }
    })();

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
        if (msg.command === 'file-issue') {
            const bug = _state.bugs.find(b => b.id === msg.bugId && !b.fixed);
            if (bug) {
                const result = await fileHealthBugAsIssue(bug);
                if (result.ok && result.issueNumber && result.issueUrl) {
                    bug.githubIssueNumber = result.issueNumber;
                    bug.githubIssueUrl    = result.issueUrl;
                    saveState();
                    _panel?.webview.postMessage({
                        type:   'issue-filed',
                        bugId:  msg.bugId,
                        number: result.issueNumber,
                        url:    result.issueUrl,
                    });
                    void vscode.env.openExternal(vscode.Uri.parse(result.issueUrl));
                } else {
                    _panel?.webview.postMessage({ type: 'issue-filed-error', bugId: msg.bugId });
                    void vscode.window.showErrorMessage(`Couldn't file issue: ${result.error ?? 'unknown error'}`);
                }
            }
        }
        if (msg.command === 'open-issue') {
            if (msg.url) { void vscode.env.openExternal(vscode.Uri.parse(msg.url)); }
        }
        if (msg.command === 'open-evidence' && msg.path) {
            try {
                const doc = await vscode.workspace.openTextDocument(msg.path);
                const line = Math.max(0, (msg.line ?? 1) - 1);
                const column = Math.max(0, (msg.column ?? 1) - 1);
                const pos = new vscode.Position(line, column);
                const editor = await vscode.window.showTextDocument(doc, {
                    viewColumn: vscode.ViewColumn.Beside,
                    preview: true,
                    preserveFocus: false,
                });
                editor.selection = new vscode.Selection(pos, pos);
                editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
            } catch (e) {
                logError('Failed to open evidence location', e instanceof Error ? e.stack || String(e) : String(e), FEATURE);
            }
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
export const _test = {
    get state() { return _state; },
    set state(v) { _state = v; },
    addBug,
    clearBug,
    saveState,
    buildIssueUrl,
    defaultRecommendation,
};
