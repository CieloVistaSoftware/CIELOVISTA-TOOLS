// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

// component: aud

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
import * as https  from 'https';
import * as net    from 'net';
import * as path   from 'path';
import { spawn }   from 'child_process';
import { log, logError } from '../shared/output-channel';
import { fileHealthBugAsIssue, fetchAutoFiledIssueMap } from '../shared/github-issue-filer';
import { enqueueIssue } from '../shared/claude-notifier';
import { loadRegistry }  from '../shared/registry';
import { getLaunchedTerminal, clearLaunchedTerminal } from '../shared/terminal-utils';
import { scanFile }      from './code-highlight-audit';
import { CATALOG }       from './cvs-command-launcher/catalog';
import { esc }           from '../shared/webview-utils';
import { isFeatureEnabled } from './feature-toggle';

/**
 * Commands that are only registered when their feature toggle is enabled.
 * The catalog-registered check skips these when the feature is disabled,
 * so a disabled feature doesn't generate false-positive "not registered" bugs.
 */
const FEATURE_GATED_CMDS: Record<string, string[]> = {
    copilotRulesEnforcer:    ['cvs.copilotRules.enable', 'cvs.copilotRules.disable', 'cvs.copilotRules.reload', 'cvs.copilotRules.view'],
    copilotOpenSuggested:    ['cvs.copilot.openSuggestedFile'],
    pythonRunner:            ['cvs.python.runFile'],
    openaiChat:              ['cvs.openai.explain', 'cvs.openai.refactor', 'cvs.openai.generateDocstring', 'cvs.openai.openChat'],
    cssClassHover:           ['cvs.cssClassHover.enable'],
    htmlTemplateDownloader:  ['cvs.html.downloadTemplate'],
};

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
// One-time-one-place: data dir resolves to the workspace's data/ folder so
// bg-health.json lives beside test-watch.json (both in <repo>/data/).
// Falls back to the extension's own data/ when no workspace is open.
let DATA_DIR    = path.join(__dirname, '..', 'data');
let HEALTH_FILE = path.join(DATA_DIR, 'bg-health.json');
// Default gap between checks — overridden by cvs.bgHealthRunner.intervalSeconds setting
const CHECK_GAP_DEFAULT_S    = 30;
const TEST_RUN_INTERVAL_MS   = 60 * 60 * 1000; // 1 hour between full suite runs
const TEST_FIRST_DELAY_MS    = 2 * 60 * 1000;  // first run 2 min after activation

export interface HealthBug {
    id:          string;
    checkId:     string;
    title:       string;
    detail:      string;
    stack?:      string;
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
let _testRunTimer: NodeJS.Timeout | undefined;
let _testRunInProgress = false;
// Dedupe guard for saveState failures — a momentarily locked data dir (e.g. an
// antivirus/OneDrive lock) used to auto-file an APP_ERROR on every 30s tick (#601).
let _saveFailedLogged = false;
// Backoff state for a *persistent* saveState failure (e.g. the workspace's data/
// dir cannot be created or written at all — different workspace open, missing
// disk, permissions). Without this, a permanent failure would still attempt a
// full write-with-retries on every single check tick forever (#651).
let _consecutiveSaveFailures = 0;
let _lastSaveAttemptMs = 0;
const SAVE_BACKOFF_BASE_MS = 60_000;        // start backing off once this streak begins
const SAVE_BACKOFF_MAX_MS  = 30 * 60_000;   // never wait longer than 30 minutes between attempts
const SAVE_BACKOFF_AFTER_N_FAILURES = 3;

// Last logged pass/fail per check — used to emit delta-only output
const _checkStatus = new Map<string, 'pass' | 'fail'>();

function getCheckStatus(checkId: string): 'pass' | 'fail' {
    return _state.bugs.some(b => b.checkId === checkId && !b.fixed) ? 'fail' : 'pass';
}

function getIntervalMs(): number {
    const s = vscode.workspace.getConfiguration('cvs.bgHealthRunner').get<number>('intervalSeconds', CHECK_GAP_DEFAULT_S) ?? CHECK_GAP_DEFAULT_S;
    return Math.max(5, s) * 1000;
}

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

/** Renders an error with its Node error code (e.g. ENOENT/EPERM/UNKNOWN) when available. */
function describeError(e: unknown): string {
    if (e instanceof Error) {
        const code = (e as NodeJS.ErrnoException).code;
        return code ? `[${code}] ${e.message}` : e.message;
    }
    return String(e);
}

function saveState(): void {
    _state.lastRun = new Date().toISOString();
    const payload = JSON.stringify(_state, null, 2);

    // Once a failure streak is underway, back off exponentially instead of
    // hammering the filesystem on every check tick (e.g. every 30s) forever —
    // a persistent failure (wrong workspace, missing disk, permissions) should
    // fail quietly on a growing schedule, not retry indefinitely (#651).
    if (_consecutiveSaveFailures >= SAVE_BACKOFF_AFTER_N_FAILURES) {
        const backoffMs = Math.min(
            SAVE_BACKOFF_BASE_MS * 2 ** (_consecutiveSaveFailures - SAVE_BACKOFF_AFTER_N_FAILURES),
            SAVE_BACKOFF_MAX_MS
        );
        if (Date.now() - _lastSaveAttemptMs < backoffMs) { return; }
    }
    _lastSaveAttemptMs = Date.now();

    // Retry to ride out a transient lock on the data dir; only the final attempt
    // reports. Persistent failure is logged once per streak (reset on recovery)
    // so a locked dir does not spam APP_ERROR / auto-file every tick (#601).
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
        // Atomic write: write to a unique temp file in the same dir, then rename
        // over the target. A crash or lock mid-write can never leave bg-health.json
        // half-written, and rename sidesteps some Windows AV/OneDrive lock
        // contention that a direct writeFileSync to the final path can hit (#651).
        const tmpFile = `${HEALTH_FILE}.tmp-${process.pid}-${Date.now()}-${attempt}`;
        try {
            ensureDataDir();
            fs.writeFileSync(tmpFile, payload, 'utf8');
            fs.renameSync(tmpFile, HEALTH_FILE);
            _saveFailedLogged = false;
            _consecutiveSaveFailures = 0;
            return;
        } catch (e) {
            lastError = e;
            try { if (fs.existsSync(tmpFile)) { fs.unlinkSync(tmpFile); } } catch { /* best-effort cleanup */ }
        }
    }

    _consecutiveSaveFailures++;
    if (!_saveFailedLogged) {
        _saveFailedLogged = true;
        logError(
            'Failed to save health state',
            `path=${HEALTH_FILE}\n${describeError(lastError)}` +
                (lastError instanceof Error && lastError.stack ? `\n${lastError.stack}` : ''),
            FEATURE
        );
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
    // Mirror to error log so the Error Log panel shows it without a separate viewer
    logError(`[bg-health] ${bug.title}`, '', FEATURE);
}

function clearBug(id: string): void {
    const b = _state.bugs.find(b => b.id === id);
    if (b) { b.fixed = true; }
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

    const sourcePath = path.resolve(__dirname, '..', 'src', entry.location);
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

// ── GitHub API helpers (used by chk-issue-project-labels) ────────────────────

interface GhIssue {
    number:        number;
    title:         string;
    pull_request?: unknown;
    labels:        Array<{ name: string }>;
}

function ghGet(token: string, owner: string, repo: string, qs: string): Promise<GhIssue[] | null> {
    return new Promise((resolve) => {
        const req = https.request({
            hostname: 'api.github.com',
            path:     `/repos/${owner}/${repo}/issues?${qs}`,
            method:   'GET',
            headers: {
                'User-Agent':    'cielovista-tools-vscode',
                'Accept':        'application/vnd.github+json',
                'Authorization': `Bearer ${token}`,
            },
        }, (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (c: Buffer) => chunks.push(c));
            res.on('end', () => {
                if (!res.statusCode || res.statusCode >= 400) { resolve(null); return; }
                try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as GhIssue[]); }
                catch { resolve(null); }
            });
        });
        req.on('error', () => resolve(null));
        req.end();
    });
}

function ghAddLabel(token: string, owner: string, repo: string, number: number, label: string): Promise<boolean> {
    return new Promise((resolve) => {
        const payload = JSON.stringify({ labels: [label] });
        const req = https.request({
            hostname: 'api.github.com',
            path:     `/repos/${owner}/${repo}/issues/${number}/labels`,
            method:   'POST',
            headers: {
                'User-Agent':      'cielovista-tools-vscode',
                'Accept':          'application/vnd.github+json',
                'Authorization':   `Bearer ${token}`,
                'Content-Type':    'application/json',
                'Content-Length':  Buffer.byteLength(payload).toString(),
            },
        }, (res) => {
            res.on('data', () => { /* drain */ });
            res.on('end', () => resolve(!!res.statusCode && res.statusCode < 400));
        });
        req.on('error', () => resolve(false));
        req.write(payload);
        req.end();
    });
}

// ── Individual health checks ──────────────────────────────────────────────────

interface Check {
    id:    string;
    name:  string;
    run:   () => Promise<void>;
}

const CHECKS: Check[] = [

    {
        id: 'chk-issue-project-labels',
        name: 'All issues have project label',
        async run() {
            // Silent auth only — never prompt during a background check
            let token: string | undefined;
            try {
                const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: false });
                token = session?.accessToken;
            } catch { return; }
            if (!token) { return; }

            const REPOS = [
                { owner: 'CieloVistaSoftware', repo: 'cielovista-tools', label: 'project:cielovista-tools' },
                { owner: 'CieloVistaSoftware', repo: 'DiskCleanUp',       label: 'project:diskcleanup'      },
            ];

            const failed: string[] = [];

            for (const r of REPOS) {
                // Fetch all issues (open + closed, most recent 100 of each)
                const [open, closed] = await Promise.all([
                    ghGet(token, r.owner, r.repo, 'state=open&per_page=100'),
                    ghGet(token, r.owner, r.repo, 'state=closed&per_page=100'),
                ]);
                const all = [...(open ?? []), ...(closed ?? [])];

                for (const issue of all) {
                    if (issue.pull_request) { continue; }
                    const hasProject = issue.labels.some(l => /^project:/i.test(l.name));
                    if (hasProject) { continue; }

                    const ok = await ghAddLabel(token, r.owner, r.repo, issue.number, r.label);
                    if (ok) {
                        log(FEATURE, `✓ Applied ${r.label} to ${r.owner}/${r.repo}#${issue.number}`);
                    } else {
                        failed.push(`${r.owner}/${r.repo}#${issue.number}: ${issue.title.slice(0, 60)}`);
                    }
                }
            }

            if (failed.length > 0) {
                addBug({
                    id: 'bug-issue-project-labels',
                    checkId: 'chk-issue-project-labels',
                    title: `${failed.length} issue(s) could not get project label applied`,
                    detail: 'Attempted to auto-apply project:* labels but the GitHub API call failed for these issues:',
                    recommendation: 'Check GitHub auth token permissions (needs repo scope) and apply labels manually.',
                    evidence: failed.slice(0, 20),
                    priority: 'medium',
                    category: 'GitHub',
                    fixCommandId: 'cvs.github.openIssues',
                    fixLabel: 'Open Issues Viewer',
                });
            } else {
                clearBug('bug-issue-project-labels');
            }
        }
    },

    {
        id: 'chk-catalog-registered',
        name: 'All catalog commands registered',
        async run() {
            // Build a set of command IDs that are expected to be absent
            // because their feature toggle is currently disabled.
            const disabledCmds = new Set<string>();
            for (const [featureKey, cmds] of Object.entries(FEATURE_GATED_CMDS)) {
                if (!isFeatureEnabled(featureKey)) {
                    for (const cmd of cmds) { disabledCmds.add(cmd); }
                }
            }
            // Get all registered commands from VS Code
            const registered = await vscode.commands.getCommands(false);
            const regSet = new Set(registered);
            const missing = CATALOG
                .map(c => c.id)
                .filter(id => !regSet.has(id) && !disabledCmds.has(id));
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
                    title: `${missing.length} project(s) missing CLAUDE.md: ${missing.slice(0, 3).join(', ')}`,
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
            } catch (e) {
                addBug({
                    id: 'bug-health-dir',
                    checkId: 'chk-health-file',
                    title: 'data/ directory not writable',
                    detail: `Cannot write to ${DATA_DIR}. Health logs and fixes will not persist.`,
                    stack: e instanceof Error ? e.stack : undefined,
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
                    const SKIP_DIRS = new Set(['node_modules', '.git', '.claude', 'out', 'output', 'dist', 'build', 'coverage', '__pycache__', 'legacy', 'vendor', '.venv', 'test-results', '.playwright-artifacts']);
                    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                        if (SKIP_DIRS.has(entry.name)) { continue; }
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
            // Scope this background check to cielovista-tools' own docs. Auditing
            // every registered project (incl. external/personal repos) as a
            // recurring health finding is noise; the on-demand Code Highlight
            // Audit (cvs.audit.codeHighlight) covers any project on request. (#635)
            const selfProjects = registry.projects.filter(p => p.name === 'cielovista-tools');
            for (const p of (selfProjects.length ? selfProjects : registry.projects)) {
                if (fs.existsSync(p.path)) { scan(p.path); }
            }
            if (untagged > 0) {
                addBug({
                    id: 'bug-untagged-code',
                    checkId: 'chk-untagged-code-blocks',
                    title: `${untagged} untagged fenced code block(s); first at ${offenders[0] || 'n/a'}`,
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

];

// ── Runner loop ───────────────────────────────────────────────────────────────

async function runNextCheck(): Promise<void> {
    if (!_running) { return; }

    const check = CHECKS[_state.checkIndex % CHECKS.length];
    _state.checkIndex = (_state.checkIndex + 1) % CHECKS.length;
    _state.totalChecks++;

    try {
        await check.run();
        const newStatus  = getCheckStatus(check.id);
        const prevStatus = _checkStatus.get(check.id);
        if (prevStatus === undefined) {
            // First run — record baseline without logging (avoids wall of ✓ on startup)
            _checkStatus.set(check.id, newStatus);
        } else if (newStatus !== prevStatus) {
            if (newStatus === 'fail') {
                const bug = _state.bugs.find(b => b.checkId === check.id && !b.fixed);
                log(FEATURE, `✗ ${check.name}: ${bug?.detail ?? 'check failed'}`);
            } else {
                log(FEATURE, `✓ ${check.name} (resolved)`);
            }
            _checkStatus.set(check.id, newStatus);
        }
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

    _timer = setTimeout(runNextCheck, getIntervalMs());
}

// ── Test Results webview helpers ──────────────────────────────────────────────

interface TestWatchEntry {
    passed:      number;
    failed:      number;
    durationMs:  number;
    lastRun:     string;
    exit:        number;
    lastOutput?: string;
}
interface TestWatchData {
    startedAt:     string;
    lastFullRun:   string;
    totalRuns:     number;
    fullSuiteRuns: number;
    results:       Record<string, TestWatchEntry>;
}

function readTestWatch(): TestWatchData | null {
    const f = path.join(DATA_DIR, 'test-watch.json');
    try {
        if (!fs.existsSync(f)) { return null; }
        return JSON.parse(fs.readFileSync(f, 'utf8')) as TestWatchData;
    } catch { return null; }
}

function _relTime(iso: string): string {
    if (!iso) { return '—'; }
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1)    { return 'just now'; }
    if (m < 60)   { return `${m}m ago`; }
    const h = Math.floor(m / 60);
    if (h < 24)   { return `${h}h ago`; }
    const d = Math.floor(h / 24);
    const rem = h % 24;
    return rem > 0 ? `${d}d ${rem}h ago` : `${d}d ago`;
}

function buildTestSuiteSection(tw: TestWatchData): string {
    const entries = Object.entries(tw.results)
        .map(([file, r]) => ({ file, ...r }))
        .filter(e => !!e.lastRun);
    if (entries.length === 0) { return ''; }

    // Failing files first, then most-recently run
    entries.sort((a, b) => {
        const aFail = a.exit !== 0;
        const bFail = b.exit !== 0;
        if (aFail !== bFail) { return aFail ? -1 : 1; }
        return b.lastRun.localeCompare(a.lastRun);
    });

    const totalPassed  = entries.reduce((s, e) => s + e.passed, 0);
    const totalFailed  = entries.reduce((s, e) => s + e.failed, 0);
    const failingCount = entries.filter(e => e.exit !== 0).length;

    const summaryParts = [
        `${entries.length} files`,
        `<span style="color:#3fb950">${totalPassed} passed</span>`,
        totalFailed > 0 ? `<span style="color:#f85149">${totalFailed} failed</span>` : '',
        failingCount > 0
            ? `<span style="color:#f85149">${failingCount} file${failingCount > 1 ? 's' : ''} failing</span>`
            : '<span style="color:#3fb950">all passing</span>',
    ].filter(Boolean).join(' &nbsp;·&nbsp; ');

    const rows = entries.map(e => {
        const ok    = e.exit === 0;
        const icon  = ok ? '✓' : '✗';
        const cls   = ok ? 'tw-ok' : 'tw-fail';
        const short = e.file.replace(/^tests[/\\]/, '');
        const bad   = e.failed > 0 ? `<td class="tw-num tw-bad">${e.failed}</td>` : '<td class="tw-num"></td>';
        let errorRow = '';
        if (!ok && e.lastOutput) {
            const safeOut = esc(e.lastOutput).replace(/\n/g, '<br>');
            errorRow = `<tr class="tw-err-row"><td colspan="5">` +
                `<details class="tw-err-details"><summary class="tw-err-summary">▶ Error output &nbsp;` +
                `<button class="tw-issue-btn" data-action="file-test-issue" data-file="${esc(e.file)}" data-output="${esc(e.lastOutput ?? '').replace(/"/g, '&quot;').replace(/'/g, '&#39;')}">📋 New Issue</button>` +
                `</summary><pre class="tw-err-pre">${safeOut}</pre></details></td></tr>`;
        } else if (!ok) {
            errorRow = `<tr class="tw-err-row"><td colspan="5">` +
                `<span class="tw-no-output">No error output captured &nbsp;</span>` +
                `<button class="tw-issue-btn" data-action="file-test-issue" data-file="${esc(e.file)}" data-output="">📋 New Issue</button>` +
                `</td></tr>`;
        }
        return `<tr class="${cls}"><td class="tw-status">${icon}</td><td class="tw-file">${esc(short)}</td><td class="tw-num">${e.passed}</td>${bad}<td class="tw-time">${_relTime(e.lastRun)}</td></tr>${errorRow}`;
    }).join('');

    const meta = tw.lastFullRun
        ? `Last full run: ${_relTime(tw.lastFullRun)} &nbsp;·&nbsp; ${tw.fullSuiteRuns} full runs &nbsp;·&nbsp; ${tw.totalRuns} total`
        : '';

    return `<div class="section-heading">Test Suite &nbsp;<span class="ts-summary">${summaryParts}</span></div>
${meta ? `<div class="ts-meta">${meta}</div>` : ''}
<table class="tw-table">
  <thead><tr><th></th><th>File</th><th>✓</th><th>✗</th><th>Age</th></tr></thead>
  <tbody>${rows}</tbody>
</table>`;
}

// ── Fix Bugs / Test Results webview ───────────────────────────────────────────

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
        const stackHtml = b.stack
            ? `<details class="bug-stack"><summary>Stack trace</summary><pre class="bug-stack-pre">${esc(b.stack)}</pre></details>`
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
    ${stackHtml}
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
#toolbar .controls { display: flex; align-items: center; gap: 8px; }
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
.bug-stack{font-size:11px}.bug-stack summary{cursor:pointer;color:var(--vscode-textLink-foreground);user-select:none}.bug-stack-pre{margin-top:5px;padding:6px 8px;background:var(--vscode-editor-background);border:1px solid var(--vscode-panel-border);border-radius:3px;font-family:var(--vscode-editor-font-family,monospace);font-size:10px;white-space:pre-wrap;word-break:break-all;max-height:180px;overflow:auto}
.bug-footer{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.bug-time{font-size:10px;color:var(--vscode-descriptionForeground);flex:1}
.fix-btn{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;padding:3px 10px;border-radius:3px;cursor:pointer;font-size:11px;font-weight:600}
.fix-btn:hover{background:var(--vscode-button-hoverBackground)}
.stop-btn{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;padding:3px 10px;border-radius:3px;cursor:pointer;font-size:11px;font-weight:600}
.stop-btn:hover{background:var(--vscode-button-secondaryHoverBackground)}
.issue-btn{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;padding:3px 10px;border-radius:3px;cursor:pointer;font-size:11px;font-weight:600}
.issue-btn:hover{background:var(--vscode-button-secondaryHoverBackground)}
.dismiss-btn{background:transparent;border:1px solid var(--vscode-panel-border);color:var(--vscode-descriptionForeground);padding:3px 8px;border-radius:3px;cursor:pointer;font-size:11px}
.dismiss-btn:hover{border-color:var(--vscode-focusBorder)}
.issue-filed-badge{display:inline-block;padding:3px 10px;border-radius:3px;font-size:11px;font-weight:600;background:rgba(63,185,80,0.15);color:#3fb950;border:1px solid #3fb950;text-decoration:none;cursor:pointer}
.issue-filed-badge:hover{background:rgba(63,185,80,0.25)}
.empty{padding:40px;text-align:center;color:var(--vscode-descriptionForeground)}
.spin{display:inline-block;animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.ts-summary{font-weight:400;font-size:10px;text-transform:none;letter-spacing:0;color:var(--vscode-descriptionForeground)}
.ts-meta{font-size:10px;color:var(--vscode-descriptionForeground);margin-bottom:8px;font-style:italic;padding:0 1px}
.tw-table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:16px}
.tw-table th{text-align:left;color:var(--vscode-descriptionForeground);font-weight:600;font-size:10px;padding:3px 6px;border-bottom:1px solid var(--vscode-panel-border)}
.tw-table td{padding:2px 6px;border-bottom:1px solid var(--vscode-panel-border);white-space:nowrap}
.tw-table tr:last-child td{border-bottom:none}
.tw-ok .tw-status{color:#3fb950}.tw-fail .tw-status{color:#f85149;font-weight:700}
.tw-fail .tw-file{color:#f85149}
.tw-file{width:100%;overflow:hidden;text-overflow:ellipsis;font-family:var(--vscode-editor-font-family,monospace)}
.tw-num{text-align:right;width:36px}.tw-bad{color:#f85149}
.tw-time{color:var(--vscode-descriptionForeground);font-size:10px;text-align:right;padding-left:12px}
.tw-err-row td{padding:0 6px 6px 22px;border-bottom:1px solid var(--vscode-panel-border)}
.tw-err-details{font-size:10px;color:var(--vscode-descriptionForeground)}
.tw-err-summary{cursor:pointer;user-select:none;display:flex;align-items:center;gap:8px}
.tw-err-pre{margin:4px 0 0;padding:6px 8px;background:var(--vscode-textCodeBlock-background,#1e1e1e);border-radius:4px;white-space:pre-wrap;word-break:break-all;max-height:200px;overflow:auto;font-family:var(--vscode-editor-font-family,monospace);font-size:10px;color:var(--vscode-editor-foreground)}
.tw-no-output{font-size:10px;color:var(--vscode-descriptionForeground);font-style:italic}
.tw-issue-btn{font-size:10px;padding:1px 6px;border:1px solid var(--vscode-button-border,#444);border-radius:3px;background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);cursor:pointer;white-space:nowrap}
.tw-issue-btn:hover{background:var(--vscode-button-secondaryHoverBackground)}
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
  if (btn.dataset.action === 'regression-log') {
    vscode.postMessage({ command: 'regression-log' });
  }
  if (btn.dataset.action === 'stop-runner') {
        vscode.postMessage({ command: 'stop-runner' });
        btn.textContent = 'Stopping...';
        btn.disabled = true;
    }
  if (btn.dataset.action === 'dismiss') {
    vscode.postMessage({ command: 'dismiss', bugId: btn.dataset.id });
    var card = btn.closest('.bug-card');
    if (card) { card.style.opacity = '0.3'; card.style.pointerEvents = 'none'; }
  }
  if (btn.dataset.action === 'file-test-issue') {
    vscode.postMessage({ command: 'file-test-issue', testFile: btn.dataset.file, output: btn.dataset.output || '' });
    btn.textContent = 'Filing…';
    btn.disabled = true;
  }
});

window.addEventListener('message', function(e) {
  var m = e.data;
  if (m.type === 'update') {
    // Reload the page with fresh state
    vscode.postMessage({ command: 'reload' });
  }
  if (m.type === 'runner-stopped') {
    var stopBtn = document.querySelector('.stop-btn');
    if (stopBtn) {
        stopBtn.textContent = 'Stopped';
        stopBtn.disabled = true;
    }
    var nextCheckEl = document.getElementById('next-check');
    if (nextCheckEl) {
        nextCheckEl.textContent = 'Runner stopped.';
    }
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

        const tw            = readTestWatch();
        const testSuiteHtml = tw ? buildTestSuiteSection(tw) : '';

        return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${CSS}</style></head><body>
<div id="toolbar">
    <h1>&#129514; Test Results</h1>
    <div class="controls">
        <span class="stat"><strong>${activeBugs.length}</strong> bugs &nbsp;|&nbsp; <strong>${state.totalChecks}</strong> checks run</span>
        <span class="stat" id="mcp-status">${mcpStatusHtml}</span>
        <button class="issue-btn" data-action="regression-log">Regression Log</button>
        <button class="stop-btn" data-action="stop-runner">Stop Runner</button>
    </div>
</div>
<div id="progress-bar-wrap"><div id="progress-bar" style="width:${pct}%"></div></div>
<div id="next-check">&#9203; Next: ${nextCheck}</div>
<div id="content">
    ${testSuiteHtml}
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

// ── Hourly regression test runner ────────────────────────────────────────────

function _stripAnsi(s: string): string {
    return s.replace(/\x1b\[[0-9;]*m/g, '');
}

function _regEvidence(extRoot: string, failLines: string[]): string[] {
    const regDir = path.join(extRoot, 'tests', 'regression');
    return failLines.map(line => {
        const m = line.match(/REG-(\d+[a-z]?)/i);
        if (!m) { return line; }
        try {
            const files = fs.readdirSync(regDir).filter((f: string) =>
                f.startsWith(`REG-${m[1].toUpperCase()}-`) && f.endsWith('.test.js'));
            if (files.length > 0) { return path.join(regDir, files[0]) + ':1'; }
        } catch { /* best-effort */ }
        return line;
    });
}

function runRegressionTests(): void {
    if (_testRunInProgress) { return; }
    _testRunInProgress = true;

    const extensionRoot = path.join(__dirname, '..');
    const scriptPath    = path.join(extensionRoot, 'scripts', 'run-regression-tests.js');

    if (!fs.existsSync(scriptPath)) {
        log(FEATURE, '⚠ run-regression-tests.js not found — skipping hourly test run');
        _testRunInProgress = false;
        return;
    }

    log(FEATURE, '▶ Hourly regression run starting...');
    const lines: string[] = [];

    const proc = spawn('node', [scriptPath], { cwd: extensionRoot, stdio: 'pipe' });

    const collect = (chunk: Buffer) => {
        for (const line of chunk.toString().split('\n')) {
            const clean = _stripAnsi(line).trim();
            if (clean) { lines.push(clean); }
        }
    };
    proc.stdout.on('data', collect);
    proc.stderr.on('data', collect);

    proc.on('error', (err: Error) => {
        _testRunInProgress = false;
        logError('Regression runner failed to start', err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
    });

    proc.on('close', (code: number | null) => {
        _testRunInProgress = false;
        const failed = code !== 0;

        if (failed) {
            const failLines = lines
                .filter(l => /✗|FAIL(?:ED)?/.test(l))
                .slice(0, 8);
            const detail = failLines.length > 0
                ? failLines.join('\n')
                : 'Check the CieloVista Tools output channel for full output.';

            const evidence = _regEvidence(extensionRoot, failLines);

            addBug({
                id:             'bug-regression-tests',
                checkId:        'chk-regression-tests',
                title:          'Regression tests failing',
                detail:         detail.slice(0, 600),
                evidence,
                priority:       'high',
                category:       'Quality',
                recommendation: 'Run node scripts/run-regression-tests.js and fix the failing tests.',
            });
            log(FEATURE, `✗ Regression suite (exit ${code ?? '?'}) — ${failLines.length} failure line(s):`);
            for (const ev of evidence) { log(FEATURE, `  ${ev}`); }
        } else {
            clearBug('bug-regression-tests');
            const summary = lines.find(l => /All \d+ regression/.test(l)) ?? 'all tests passed';
            log(FEATURE, `✓ Regression suite: ${summary}`);
        }

        saveState();
        if (_panel) { _panel.webview.postMessage({ type: 'update', state: _state }); }

        // Schedule the NEXT run only after the current one fully completes — #505
        // Previously scheduleTestRun was called immediately after runRegressionTests(),
        // meaning the 1-hour countdown started while the tests were still running.
        if (_running) { scheduleTestRun(TEST_RUN_INTERVAL_MS); }
    });
}

function scheduleTestRun(delayMs: number): void {
    _testRunTimer = setTimeout(() => {
        if (!_running) { return; }
        runRegressionTests();
        // NOTE: do NOT call scheduleTestRun here — it is now called inside
        // runRegressionTests' close handler so the next cycle starts only
        // after the current run finishes (fixes #505).
    }, delayMs);
}

function stopRunner(): void {
    if (_running) {
        _running = false;
        if (_timer) {
            clearTimeout(_timer);
            _timer = undefined;
        }
        if (_testRunTimer) {
            clearTimeout(_testRunTimer);
            _testRunTimer = undefined;
        }
        log(FEATURE, 'Background health runner stopped by user.');
        if (_panel) {
            _panel.webview.postMessage({ type: 'runner-stopped' });
        }
    }
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

        _panel.webview.onDidReceiveMessage(async msg => {
            try {
                if (msg.command === 'fix' && msg.cmdId) {
                    await vscode.commands.executeCommand(msg.cmdId);
                    clearBug(msg.bugId);
                    saveState();
                }
                if (msg.command === 'stop-runner') {
                    stopRunner();
                }
                if (msg.command === 'regression-log') {
                    void vscode.commands.executeCommand('cvs.tools.regressionLog');
                }
                if (msg.command === 'dismiss') {
                    clearBug(msg.bugId);
                    saveState();
                }
                if (msg.command === 'file-issue') {
                    const bug = _state.bugs.find(b => b.id === msg.bugId && !b.fixed);
                    if (!bug) { return; }
                    const result = await fileHealthBugAsIssue(bug);
                    if (result.ok && result.issueNumber && result.issueUrl) {
                        bug.githubIssueNumber = result.issueNumber;
                        bug.githubIssueUrl    = result.issueUrl;
                        saveState();
                        const nq = enqueueIssue(bug, result.issueNumber, result.issueUrl);
                        if (nq.ok) {
                            log(FEATURE, `queued issue #${result.issueNumber} for Claude review`);
                        } else {
                            logError(`[${FEATURE}] failed to queue issue for Claude: ${nq.error ?? 'unknown'}`, '', FEATURE);
                        }
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
                if (msg.command === 'open-issue') {
                    if (msg.url) { void vscode.env.openExternal(vscode.Uri.parse(msg.url)); }
                }
                if (msg.command === 'open-evidence' && msg.path) {
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
                }
                if (msg.command === 'reload') {
                    if (_panel) { _panel.webview.html = buildFixBugsHtml(_state); }
                }
                if (msg.command === 'file-test-issue' && msg.testFile) {
                    const shortFile = (msg.testFile as string).replace(/^tests[/\\]/, '');
                    const outputBlock = msg.output
                        ? `\n\n## Error Output\n\`\`\`\n${(msg.output as string).slice(0, 2000)}\n\`\`\``
                        : '';
                    const title = `test failure: ${shortFile}`;
                    const body = `## Failing Test\n\n\`${shortFile}\`${outputBlock}\n\n---\n*Reported from Test Results panel*`;
                    const url = `https://github.com/CieloVistaSoftware/cielovista-tools/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}&labels=type:bug,project:cielovista-tools`;
                    void vscode.env.openExternal(vscode.Uri.parse(url));
                }
                if (msg.command === 'checkMcpPort') {
                    const open = await isPortOpen(3000);
                    _panel?.webview.postMessage({ type: 'mcpPortStatus', open });
                }
            } catch (e) {
                logError('Fix Bugs panel message error', e instanceof Error ? e.stack || String(e) : String(e), FEATURE);
            }
        });
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

}

// ── Activate / Deactivate ─────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.health.fixBugs', showFixBugsPanel)
    );

    if (isAlreadyRunning()) {
        log(FEATURE, 'Runner already active — skipping duplicate activation');
        return;
    }

    // Resolve data dir to the open workspace so bg-health.json and test-watch.json
    // share one location (one-time-one-place rule). Fallback: extension's own data/.
    const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (wsRoot) {
        DATA_DIR    = path.join(wsRoot, 'data');
        HEALTH_FILE = path.join(DATA_DIR, 'bg-health.json');
    }

    log(FEATURE, 'Background health runner starting');
    loadState();
    _running = true;
    claimSingleton();

    // Start the first check after a short delay so activation isn't blocked
    _timer = setTimeout(runNextCheck, 5000);
    // Schedule the first regression run 2 min after startup, then every hour
    scheduleTestRun(TEST_FIRST_DELAY_MS);
    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.health.stopRunner', stopRunner)
    );

    // Monitor extension-launched terminals for non-zero exit codes
    context.subscriptions.push(
        vscode.window.onDidCloseTerminal(terminal => {
            const info = getLaunchedTerminal(terminal.name);
            if (!info) { return; }
            clearLaunchedTerminal(terminal.name);

            const code = terminal.exitStatus?.code;
            const bugId = `bug-terminal-${terminal.name.replace(/[^a-zA-Z0-9]/g, '-')}`;

            if (code === undefined || code === 0) {
                // Success or manual close — clear any prior failure bug
                clearBug(bugId);
                saveState();
                return;
            }

            addBug({
                id:             bugId,
                checkId:        'chk-terminal-exit',
                title:          `Terminal command failed: ${info.script}`,
                detail:         `"${terminal.name}" exited with code ${code}. Command: ${info.command}`,
                recommendation: `Re-run the command and check the terminal output for errors.`,
                priority:       'high',
                category:       'Terminal',
            });
            saveState();
            if (_panel) { _panel.webview.postMessage({ type: 'update', state: _state }); }
            log(FEATURE, `✗ Terminal failed: "${terminal.name}" exit code ${code}`);
        })
    );

    log(FEATURE, `Background runner active — ${CHECKS.length} checks, ${getIntervalMs() / 1000}s interval`);
}

export function deactivate(): void {
    stopRunner();
    releaseSingleton();
    _panel?.dispose();
    _panel = undefined;
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
    getCheckStatus,
    get checkStatus() { return _checkStatus; },
};
