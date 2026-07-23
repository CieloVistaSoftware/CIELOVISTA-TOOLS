// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

// component: sessact

/**
 * session-activity.ts
 *
 * Session Activity Dashboard — a single live rollup view of "what's going on
 * right now" for the current workspace's repo:
 *
 *   1. Current Focus  — reads data/claude-job-status.json (if a Claude
 *      session has written one) to show the single issue actively being
 *      worked right now.
 *   2. Current Batch  — open issues carrying status:in-progress or
 *      priority:1 (the same "actively worked" convention already used by
 *      the Issue Viewer's in-progress chip), i.e. the batch being burned
 *      down, not the full backlog.
 *   3. Pushes to deploy branch — recent commits on whichever remote branch
 *      looks like the deploy/publish branch for this repo (gh-pages, deploy,
 *      live, prod, production, io, release — first match wins), read via
 *      `git log`. If no such branch exists, the section says so.
 *   4. CI — the last 10 GitHub Actions runs for the repo, via `gh run list`.
 *   5. Open Issues — every open issue, uncapped (unlike the Issue Viewer's
 *      default page size), via the shared gh-CLI issue fetcher.
 *
 * Design decision (GitHub issue #650): this is a NEW dedicated feature file,
 * not an extension of the existing Issue Viewer (src/shared/github-issues-
 * view.ts, wired from home-page.ts). Reasoning:
 *   - Issue Viewer's job is browsing / triaging / claiming individual issues
 *     in a big sortable table. Session Activity's job is a small at-a-glance
 *     rollup across FOUR different data sources (job-status file, git log,
 *     gh run list, gh issue list) that Issue Viewer has no reason to know
 *     about. Folding those in would turn one focused file into two jobs,
 *     violating the "one job per file" rule.
 *   - No logic is duplicated to get there: repo detection and the gh-CLI
 *     issue fetch are REUSED from src/shared/github-issues-view.ts (see
 *     `detectRepoFromWorkspace` / `fetchIssuesForRepo`, both exported from
 *     that module specifically so this feature didn't have to re-implement
 *     them). Everything else this feature needs (job-status file, git log
 *     on a deploy branch, gh run list) has no existing shared helper in this
 *     codebase to reuse, so it's implemented here, ad hoc, the same way
 *     github-issues-view.ts and mcp-viewer/index.ts already shell out to
 *     `git`/`gh` directly — there is no dedicated git/gh wrapper module in
 *     src/shared/ to route through.
 *
 * Data-source notes:
 *   - "What's actively being worked on" (item 3 in the issue): this
 *     extension cannot know that on its own. It reads
 *     `<workspace root>/data/claude-job-status.json` if present — the same
 *     path already referenced in project conventions for a "Current Job"
 *     signal. AS OF THIS CHANGE, no other feature in cielovista-tools writes
 *     that file yet (searched the full source tree — no producer exists).
 *     This feature only *consumes* it; see the README for the schema it
 *     expects and who would need to start writing it for the Current Focus
 *     section to ever show real data.
 *   - The deploy-branch port-4300-style hardcoding from the throwaway
 *     reference tool is gone: the branch is auto-detected from `git branch
 *     -r` against a candidate list, and everything is scoped to whichever
 *     workspace folder is currently open (no fixed repo path, no fixed
 *     port — this renders as a VS Code webview panel, not an HTTP server).
 *
 * Command: cvs.tools.sessionActivity
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { esc } from '../shared/webview-utils';
import { log } from '../shared/output-channel';
import {
    detectRepoFromWorkspace,
    fetchIssuesForRepo,
    type GHIssue,
} from '../shared/github-issues-view';

const FEATURE = 'session-activity';
const CACHE_TTL_MS = 12000; // matches the ~12s live-read cache of the reference tool this replaces
const DEPLOY_BRANCH_CANDIDATES = ['gh-pages', 'deploy', 'live', 'prod', 'production', 'io', 'release'];

interface RepoRef { owner: string; name: string; }

interface CurrentFocus {
    issueNumber?: number;
    title?: string;
    branch?: string;
    startedAt?: string;
    note?: string;
    updatedAt?: string;
}

interface PushEntry {
    hash: string;
    author: string;
    date: string;
    subject: string;
}

interface CiRun {
    name: string;
    status: string;
    conclusion: string;
    branch: string;
    createdAt: string;
    url: string;
    title: string;
}

interface SessionActivityData {
    fetchedAt: number;
    repo: RepoRef;
    currentFocus: CurrentFocus | null;
    currentBatch: GHIssue[];
    deployBranch: string | null;
    pushes: PushEntry[];
    pushesError: string | null;
    ciRuns: CiRun[];
    ciError: string | null;
    openIssues: GHIssue[];
    openIssuesError: string | null;
}

let activePanel: vscode.WebviewPanel | undefined;
let activeRefresh: (() => Promise<void>) | undefined;
let cache: { key: string; data: SessionActivityData } | undefined;

export function activate(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.tools.sessionActivity', () => showSessionActivity()),
    );
}

export function deactivate(): void {
    activePanel = undefined;
    activeRefresh = undefined;
    cache = undefined;
}

// ─── Child-process helpers ────────────────────────────────────────────────────

function runCommand(cmd: string, args: string[], cwd: string, timeout = 10000): Promise<string> {
    return new Promise((resolve, reject) => {
        execFile(cmd, args, { cwd, timeout, windowsHide: true, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
            if (err) {
                reject(new Error((stderr || err.message || `${cmd} failed`).trim()));
                return;
            }
            resolve(stdout);
        });
    });
}

// ─── Current Focus (data/claude-job-status.json) ─────────────────────────────

function readCurrentFocus(wsRoot: string): CurrentFocus | null {
    if (!wsRoot) { return null; }
    try {
        const jobStatusPath = path.join(wsRoot, 'data', 'claude-job-status.json');
        if (!fs.existsSync(jobStatusPath)) { return null; }
        const raw = fs.readFileSync(jobStatusPath, 'utf8');
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') { return null; }
        const p = parsed as Record<string, unknown>;
        return {
            issueNumber: typeof p.issueNumber === 'number' ? p.issueNumber : undefined,
            title:       typeof p.title === 'string' ? p.title : undefined,
            branch:      typeof p.branch === 'string' ? p.branch : undefined,
            startedAt:   typeof p.startedAt === 'string' ? p.startedAt : undefined,
            note:        typeof p.note === 'string' ? p.note : undefined,
            updatedAt:   typeof p.updatedAt === 'string' ? p.updatedAt : undefined,
        };
    } catch {
        return null;
    }
}

// ─── Deploy branch + push log ─────────────────────────────────────────────────

async function detectDeployBranch(wsRoot: string): Promise<string | null> {
    try {
        const out = await runCommand('git', ['branch', '-r'], wsRoot, 8000);
        const remoteBranches = out
            .split('\n')
            .map((l) => l.trim().replace(/^origin\//, '').replace(/^\*\s*/, ''))
            .filter(Boolean);
        for (const candidate of DEPLOY_BRANCH_CANDIDATES) {
            if (remoteBranches.includes(candidate)) { return candidate; }
        }
        return null;
    } catch {
        return null;
    }
}

async function readPushLog(wsRoot: string, branch: string, limit = 20): Promise<PushEntry[]> {
    // Best-effort refresh of remote-tracking refs; safe to ignore failures
    // (offline, no network, branch protection, etc.) — we still read whatever
    // is already known locally.
    try { await runCommand('git', ['fetch', 'origin', branch, '--quiet'], wsRoot, 10000); } catch { /* offline is fine */ }

    const sep = '\x1f'; // unit separator — won't collide with commit text
    const format = `%H${sep}%an${sep}%ad${sep}%s`;
    const out = await runCommand('git', [
        'log', `origin/${branch}`,
        `--max-count=${limit}`,
        '--date=iso-strict',
        `--format=${format}`,
    ], wsRoot, 10000);

    return out.split('\n').filter(Boolean).map((line) => {
        const [hash, author, date, subject] = line.split(sep);
        return {
            hash: (hash || '').slice(0, 7),
            author: author || 'unknown',
            date: date || '',
            subject: subject || '',
        };
    });
}

// ─── CI status ────────────────────────────────────────────────────────────────

interface GhRunRaw {
    name?: string;
    displayTitle?: string;
    status?: string;
    conclusion?: string;
    headBranch?: string;
    createdAt?: string;
    url?: string;
}

async function readCiRuns(repo: RepoRef, wsRoot: string, limit = 10): Promise<CiRun[]> {
    const out = await runCommand('gh', [
        'run', 'list',
        '-R', `${repo.owner}/${repo.name}`,
        '--limit', String(limit),
        '--json', 'name,displayTitle,status,conclusion,headBranch,createdAt,url',
    ], wsRoot, 10000);

    const parsed = JSON.parse(out) as GhRunRaw[];
    if (!Array.isArray(parsed)) { return []; }
    return parsed.map((r) => ({
        name: r.name || 'workflow',
        title: r.displayTitle || '',
        status: r.status || 'unknown',
        conclusion: r.conclusion || '',
        branch: r.headBranch || '',
        createdAt: r.createdAt || '',
        url: r.url || '',
    }));
}

// ─── Aggregate fetch (cached) ─────────────────────────────────────────────────

async function fetchSessionActivity(wsRoot: string, repo: RepoRef, force: boolean): Promise<SessionActivityData> {
    const cacheKey = `${wsRoot}::${repo.owner}/${repo.name}`;
    if (!force && cache && cache.key === cacheKey && (Date.now() - cache.data.fetchedAt) < CACHE_TTL_MS) {
        return cache.data;
    }

    const currentFocus = readCurrentFocus(wsRoot);

    let openIssues: GHIssue[] = [];
    let openIssuesError: string | null = null;
    try {
        openIssues = await fetchIssuesForRepo(repo, 'open', 500);
    } catch (err) {
        openIssuesError = err instanceof Error ? err.message : String(err);
    }

    const currentBatch = openIssues.filter((issue) =>
        issue.labels.some((l) => l.name === 'status:in-progress' || l.name === 'priority:1'));

    const deployBranch = await detectDeployBranch(wsRoot);
    let pushes: PushEntry[] = [];
    let pushesError: string | null = null;
    if (deployBranch) {
        try {
            pushes = await readPushLog(wsRoot, deployBranch);
        } catch (err) {
            pushesError = err instanceof Error ? err.message : String(err);
        }
    }

    let ciRuns: CiRun[] = [];
    let ciError: string | null = null;
    try {
        ciRuns = await readCiRuns(repo, wsRoot);
    } catch (err) {
        ciError = err instanceof Error ? err.message : String(err);
    }

    const data: SessionActivityData = {
        fetchedAt: Date.now(),
        repo,
        currentFocus,
        currentBatch,
        deployBranch,
        pushes,
        pushesError,
        ciRuns,
        ciError,
        openIssues,
        openIssuesError,
    };
    cache = { key: cacheKey, data };
    return data;
}

// ─── Panel ─────────────────────────────────────────────────────────────────────

function showSessionActivity(): void {
    const wsFolder = vscode.workspace.workspaceFolders?.[0];
    const wsRoot = wsFolder?.uri.fsPath ?? process.cwd();
    const repo = detectRepoFromWorkspace(wsRoot);

    if (activePanel) {
        activePanel.reveal(vscode.ViewColumn.Two);
        if (activeRefresh) { void activeRefresh(); }
        return;
    }

    const panel = vscode.window.createWebviewPanel(
        'cvtSessionActivity',
        'Session Activity',
        vscode.ViewColumn.Two,
        { enableScripts: true }
    );
    activePanel = panel;
    panel.onDidDispose(() => {
        activePanel = undefined;
        activeRefresh = undefined;
    });

    const render = async (force: boolean): Promise<void> => {
        panel.webview.html = buildLoadingHtml(repo);
        try {
            const data = await fetchSessionActivity(wsRoot, repo, force);
            panel.webview.html = buildHtml(data);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            panel.webview.html = buildErrorHtml(repo, msg);
        }
    };
    activeRefresh = () => render(true);

    panel.webview.onDidReceiveMessage((msg: { type?: string; url?: string }) => {
        if (!msg?.type) { return; }
        if (msg.type === 'refresh') {
            log(FEATURE, 'Manual refresh requested');
            void render(true);
        } else if (msg.type === 'open' && msg.url) {
            void vscode.env.openExternal(vscode.Uri.parse(String(msg.url)));
        }
    });

    void render(false);
}

// ─── HTML ───────────────────────────────────────────────────────────────────

const BASE_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);font-size:13px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background)}
#hd{display:flex;align-items:center;justify-content:space-between;padding:14px 20px;background:var(--vscode-sideBar-background);border-bottom:1px solid var(--vscode-panel-border);position:sticky;top:0;z-index:10;gap:14px;flex-wrap:wrap}
#hd-text h1{font-size:1.05em;font-weight:700}
#hd-text .subtitle{font-size:11px;color:var(--vscode-descriptionForeground);margin-top:2px;font-family:var(--vscode-editor-font-family,monospace)}
#hd-actions{display:flex;align-items:center;gap:8px}
.action-btn{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;padding:6px 14px;border-radius:4px;cursor:pointer;font-size:12px;font-family:inherit}
.action-btn:hover{background:var(--vscode-button-secondaryHoverBackground)}
#auto-timer{font-size:11px;color:var(--vscode-descriptionForeground);opacity:.65;white-space:nowrap}
#body{padding:14px 20px;display:flex;flex-direction:column;gap:16px}
.section{border:1px solid var(--vscode-panel-border);border-radius:6px;background:var(--vscode-textCodeBlock-background);padding:12px 16px}
.section-hd{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--vscode-descriptionForeground);margin-bottom:10px;border-bottom:1px solid var(--vscode-panel-border);padding-bottom:6px}
.section-count{background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);border-radius:10px;padding:1px 8px;font-size:10px}
.empty{padding:10px 4px;color:var(--vscode-descriptionForeground);font-size:12px}
.err{padding:10px 4px;color:#f85149;font-size:12px}
table{width:100%;border-collapse:collapse;font-size:12px}
th{text-align:left;padding:5px 8px;color:var(--vscode-descriptionForeground);font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid var(--vscode-panel-border)}
td{padding:6px 8px;border-bottom:1px solid var(--vscode-panel-border);vertical-align:top}
tr:last-child td{border-bottom:none}
tr:hover td{background:var(--vscode-list-hoverBackground)}
.link-btn{background:none;border:none;padding:0;color:var(--vscode-textLink-foreground);cursor:pointer;font:inherit;text-align:left}
.link-btn:hover{text-decoration:underline}
.mono{font-family:var(--vscode-editor-font-family,monospace)}
.muted{color:var(--vscode-descriptionForeground)}
.pill{display:inline-block;padding:1px 8px;border-radius:10px;font-size:10px;font-weight:700;border:1px solid;white-space:nowrap}
.pill-ok{background:rgba(63,185,80,.14);color:#3fb950;border-color:rgba(63,185,80,.45)}
.pill-warn{background:rgba(240,180,41,.18);color:#f0b429;border-color:rgba(240,180,41,.5)}
.pill-err{background:rgba(248,81,73,.14);color:#f85149;border-color:rgba(248,81,73,.45)}
.pill-info{background:rgba(88,166,255,.14);color:#58a6ff;border-color:rgba(88,166,255,.45)}
.focus-card{display:flex;flex-direction:column;gap:4px}
.focus-title{font-size:14px;font-weight:700}
.focus-meta{font-size:11px;color:var(--vscode-descriptionForeground)}
.label{padding:1px 7px;border-radius:10px;font-size:10px;font-weight:600;border:1px solid rgba(0,0,0,.1);margin-right:3px}
`;


function timeAgo(iso: string): string {
    if (!iso) { return ''; }
    const diff = Date.now() - new Date(iso).getTime();
    if (!Number.isFinite(diff)) { return iso; }
    const m = Math.floor(diff / 60000);
    if (m < 1)  { return 'just now'; }
    if (m < 60) { return `${m}m ago`; }
    const h = Math.floor(m / 60);
    if (h < 24) { return `${h}h ago`; }
    const d = Math.floor(h / 24);
    if (d < 30) { return `${d}d ago`; }
    return `${Math.floor(d / 30)}mo ago`;
}

function ciStatusPill(run: CiRun): string {
    if (run.status !== 'completed') {
        return `<span class="pill pill-info">${esc(run.status.toUpperCase())}</span>`;
    }
    if (run.conclusion === 'success') { return `<span class="pill pill-ok">PASS</span>`; }
    if (run.conclusion === 'failure' || run.conclusion === 'timed_out') { return `<span class="pill pill-err">FAIL</span>`; }
    return `<span class="pill pill-warn">${esc((run.conclusion || 'unknown').toUpperCase())}</span>`;
}

function contrastText(hex: string): string {
    const clean = hex.replace(/^#/, '');
    if (clean.length !== 6) { return '#fff'; }
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.6 ? '#000' : '#fff';
}

function headerHtml(repo: RepoRef, statusLine: string): string {
    return `<div id="hd">
  <div id="hd-text">
    <h1>&#128225; Session Activity</h1>
    <div class="subtitle">github.com/${esc(repo.owner)}/${esc(repo.name)} &mdash; ${statusLine}</div>
  </div>
  <div id="hd-actions">
    <button id="refresh" class="action-btn" type="button" title="Re-fetch git/gh live">&#8635; Reload</button>
    <span id="auto-timer" title="Auto-refreshes every 60 seconds">&#8634; <span id="auto-timer-sec">60</span>s</span>
  </div>
</div>`;
}

const CLIENT_JS = `
(function(){
    var vsc = acquireVsCodeApi();
    var refreshBtn = document.getElementById('refresh');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', function(){ vsc.postMessage({ type: 'refresh' }); });
    }
    document.querySelectorAll('[data-url]').forEach(function(el){
        el.addEventListener('click', function(){
            var url = el.getAttribute('data-url');
            if (url) { vsc.postMessage({ type: 'open', url: url }); }
        });
    });
    var timerEl = document.getElementById('auto-timer-sec');
    var secs = 60;
    setInterval(function(){
        secs--;
        if (timerEl) { timerEl.textContent = String(secs); }
        if (secs <= 0) {
            secs = 60;
            if (timerEl) { timerEl.textContent = '60'; }
            vsc.postMessage({ type: 'refresh' });
        }
    }, 1000);
})();
`;

function wrapPage(title: string, bodyHtml: string): string {
    return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none';img-src data: https: http: vscode-webview: vscode-resource:;style-src 'unsafe-inline';script-src 'unsafe-inline';">
<title>${esc(title)}</title>
<style>${BASE_CSS}</style>
</head><body>${bodyHtml}<script>${CLIENT_JS}</script></body></html>`;
}

function buildLoadingHtml(repo: RepoRef): string {
    return wrapPage('Session Activity', `${headerHtml(repo, 'loading…')}<div id="body"><div class="empty">Loading live git/gh data…</div></div>`);
}

function buildErrorHtml(repo: RepoRef, message: string): string {
    return wrapPage('Session Activity', `${headerHtml(repo, 'error')}<div id="body"><div class="err"><strong>Couldn't load session activity.</strong><br>${esc(message)}</div></div>`);
}

function buildHtml(data: SessionActivityData): string {
    const statusLine = `updated ${timeAgo(new Date(data.fetchedAt).toISOString())}`;

    // ── Current Focus ──
    let focusHtml: string;
    if (!data.currentFocus) {
        focusHtml = `<div class="empty">No active job data. This section reads <span class="mono">data/claude-job-status.json</span> in the workspace root when a Claude session writes one — see this feature's README for the schema.</div>`;
    } else {
        const f = data.currentFocus;
        const titleLine = f.issueNumber ? `#${f.issueNumber} ${esc(f.title || '')}` : esc(f.title || 'Untitled');
        const metaParts: string[] = [];
        if (f.branch)    { metaParts.push(`branch <span class="mono">${esc(f.branch)}</span>`); }
        if (f.startedAt) { metaParts.push(`started ${esc(timeAgo(f.startedAt))}`); }
        if (f.updatedAt) { metaParts.push(`updated ${esc(timeAgo(f.updatedAt))}`); }
        focusHtml = `<div class="focus-card">
  <div class="focus-title">${titleLine}</div>
  ${metaParts.length ? `<div class="focus-meta">${metaParts.join(' &middot; ')}</div>` : ''}
  ${f.note ? `<div class="focus-meta">${esc(f.note)}</div>` : ''}
</div>`;
    }

    // ── Current Batch ──
    let batchHtml: string;
    if (data.openIssuesError) {
        batchHtml = `<div class="err">${esc(data.openIssuesError)}</div>`;
    } else if (data.currentBatch.length === 0) {
        batchHtml = `<div class="empty">No issues currently marked status:in-progress or priority:1.</div>`;
    } else {
        const rows = data.currentBatch.map((iss) => issueRow(iss)).join('');
        batchHtml = `<table><thead><tr><th>#</th><th>title</th><th>labels</th><th>updated</th></tr></thead><tbody>${rows}</tbody></table>`;
    }

    // ── Pushes to deploy branch ──
    let pushesHtml: string;
    let pushesHeading = 'Pushes to Deploy Branch';
    if (!data.deployBranch) {
        pushesHtml = `<div class="empty">No deploy branch detected among remotes (looked for: ${DEPLOY_BRANCH_CANDIDATES.map((c) => `<span class="mono">${esc(c)}</span>`).join(', ')}).</div>`;
    } else {
        pushesHeading = `Pushes to <span class="mono">${esc(data.deployBranch)}</span>`;
        if (data.pushesError) {
            pushesHtml = `<div class="err">${esc(data.pushesError)}</div>`;
        } else if (data.pushes.length === 0) {
            pushesHtml = `<div class="empty">No commits found on origin/${esc(data.deployBranch)}.</div>`;
        } else {
            const rows = data.pushes.map((p) => `<tr>
  <td class="mono">${esc(p.hash)}</td>
  <td>${esc(p.subject)}</td>
  <td>${esc(p.author)}</td>
  <td class="muted">${esc(timeAgo(p.date))}</td>
</tr>`).join('');
            pushesHtml = `<table><thead><tr><th>commit</th><th>message</th><th>author</th><th>when</th></tr></thead><tbody>${rows}</tbody></table>`;
        }
    }

    // ── CI ──
    let ciHtml: string;
    if (data.ciError) {
        ciHtml = `<div class="err">${esc(data.ciError)}</div>`;
    } else if (data.ciRuns.length === 0) {
        ciHtml = `<div class="empty">No recent workflow runs.</div>`;
    } else {
        const rows = data.ciRuns.map((r) => `<tr>
  <td>${ciStatusPill(r)}</td>
  <td>${esc(r.name)}${r.title ? ` &mdash; ${esc(r.title)}` : ''}</td>
  <td class="mono">${esc(r.branch)}</td>
  <td class="muted">${esc(timeAgo(r.createdAt))}</td>
  <td>${r.url ? `<button class="link-btn" type="button" data-url="${esc(r.url)}">view</button>` : ''}</td>
</tr>`).join('');
        ciHtml = `<table><thead><tr><th>status</th><th>workflow</th><th>branch</th><th>when</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
    }

    // ── Open Issues (uncapped) ──
    let openHtml: string;
    if (data.openIssuesError) {
        openHtml = `<div class="err">${esc(data.openIssuesError)}</div>`;
    } else if (data.openIssues.length === 0) {
        openHtml = `<div class="empty">No open issues. Nice.</div>`;
    } else {
        const sorted = [...data.openIssues].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
        const rows = sorted.map((iss) => issueRow(iss)).join('');
        openHtml = `<table><thead><tr><th>#</th><th>title</th><th>labels</th><th>updated</th></tr></thead><tbody>${rows}</tbody></table>`;
    }

    const body = `<div id="body">
  <div class="section">
    <div class="section-hd">Current Focus</div>
    ${focusHtml}
  </div>
  <div class="section">
    <div class="section-hd">Current Batch <span class="section-count">${data.currentBatch.length}</span></div>
    ${batchHtml}
  </div>
  <div class="section">
    <div class="section-hd">${pushesHeading}</div>
    ${pushesHtml}
  </div>
  <div class="section">
    <div class="section-hd">CI</div>
    ${ciHtml}
  </div>
  <div class="section">
    <div class="section-hd">Open Issues <span class="section-count">${data.openIssues.length}</span></div>
    ${openHtml}
  </div>
</div>`;

    return wrapPage('Session Activity', `${headerHtml(data.repo, statusLine)}${body}`);
}

function issueRow(iss: GHIssue): string {
    const labels = iss.labels.map((l) => {
        const bg = (l.color || '888888').replace(/^#/, '');
        const fg = contrastText(bg);
        return `<span class="label" style="background:#${esc(bg)};color:${fg}">${esc(l.name)}</span>`;
    }).join('');
    return `<tr>
  <td class="mono">#${iss.number}</td>
  <td><button class="link-btn" type="button" data-url="${esc(iss.html_url)}">${esc(iss.title)}</button></td>
  <td>${labels || '<span class="muted">-</span>'}</td>
  <td class="muted">${esc(timeAgo(iss.updated_at))}</td>
</tr>`;
}
