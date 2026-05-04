// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * github-issues-view.ts
 *
 * Webview that lists open GitHub Issues for the cielovista-tools repo.
 * Wired to the "TODO List" button on the CVT Home dashboard.
 *
 * - Anonymous fetch via Node's https module (public repo, ~60 req/hr is plenty).
 * - PRs are filtered out (GitHub's /issues endpoint returns both).
 * - Click an issue card to open it in the user's default browser.
 * - Reload button re-fetches.
 *
 * No webview client-side fetch — the extension host fetches and bakes the
 * data into the HTML each render. Avoids CSP gymnastics for connect-src.
 */

import * as vscode from 'vscode';
import * as https  from 'https';
import { execFile } from 'child_process';
import * as fs from 'fs';

const REPO_OWNER = 'CieloVistaSoftware';
const REPO_NAME  = 'cielovista-tools';

interface GHLabel    { name: string; color: string; }
interface GHUser     { login: string; }
interface GHAssignee { login: string; }
interface GHIssue {
    number:       number;
    title:        string;
    html_url:     string;
    state:        string;
    created_at:   string;
    updated_at:   string;
    user:         GHUser;
    labels:       GHLabel[];
    assignees:    GHAssignee[];
    body:         string | null;
    pull_request?: unknown;   // present only when the entry is actually a PR
    comments:     number;
}

let activePanel: vscode.WebviewPanel | undefined;
let activeRefresh: (() => Promise<void>) | undefined;

function formatIssuesForClipboard(issues: GHIssue[]): string {
    return issues.map((issue) => {
        const labels = issue.labels.map((label) => label.name).filter(Boolean).join(', ');
        const assignees = issue.assignees.map((assignee) => '@' + assignee.login).filter(Boolean).join(', ');
        const parts = [
            `#${issue.number} ${issue.title}`,
            `URL: ${issue.html_url}`,
            `State: ${issue.state}`,
            `Author: @${issue.user.login}`,
            `Updated: ${issue.updated_at}`,
        ];
        if (labels) {
            parts.push(`Labels: ${labels}`);
        }
        if (assignees) {
            parts.push(`Assignees: ${assignees}`);
        }
        if (issue.comments > 0) {
            parts.push(`Comments: ${issue.comments}`);
        }
        if (issue.body && issue.body.trim()) {
            parts.push(`Body: ${issue.body.trim()}`);
        }
        return parts.join('\n');
    }).join('\n\n---\n\n');
}

/**
 * Show the issues panel. Reuses the existing panel if already open.
 *
 * Function name is `showGithubIssues` (lowercase h) to match the existing
 * import in home-page.ts.
 */
export function showGithubIssues(): void {
    if (activePanel) {
        activePanel.reveal();
        if (activeRefresh) {
            void activeRefresh();
        }
        return;
    }

    const panel = vscode.window.createWebviewPanel(
        'cvtIssues',
        'cielovista-tools \u2014 Open Issues',
        vscode.ViewColumn.One,
        { enableScripts: true }
    );
    activePanel = panel;
    panel.onDidDispose(() => {
        activePanel = undefined;
        activeRefresh = undefined;
    });

    let latestIssues: GHIssue[] = [];

    const setHtml = (loading: boolean, issues: GHIssue[] | null, error: string | null): void => {
        latestIssues = Array.isArray(issues) ? issues : [];
        panel.webview.html = buildHtml(loading, issues, error);
    };

    const refresh = async (): Promise<void> => {
        setHtml(true, null, null);
        try {
            const issues = await fetchIssues();
            setHtml(false, issues, null);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setHtml(false, null, msg);
        }
    };
    activeRefresh = refresh;

    panel.webview.onDidReceiveMessage((msg: { type?: string; url?: string }) => {
        if (!msg?.type) { return; }
        if (msg.type === 'refresh') {
            void refresh();
        } else if (msg.type === 'open' && msg.url) {
            void vscode.env.openExternal(vscode.Uri.parse(String(msg.url)));
        } else if (msg.type === 'copyAll' && latestIssues.length > 0) {
            void vscode.env.clipboard.writeText(formatIssuesForClipboard(latestIssues));
        }
    });

    void refresh();
}

// ─── Fetch ──────────────────────────────────────────────────────────────────

async function fetchIssues(): Promise<GHIssue[]> {
    const errors: string[] = [];

    try {
        const viaGh = await fetchIssuesViaGh();
        if (viaGh.length > 0) {
            return viaGh;
        }
    } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
    }

    try {
        const rest = await fetchIssuesViaRest();
        if (rest.length > 0) {
            return rest;
        }
        return [];
    } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
    }

    throw new Error(errors.join(' | '));
}

function fetchIssuesViaRest(): Promise<GHIssue[]> {
    // GitHub /issues returns both issues and pull requests. In active repos,
    // page 1 can be dominated by PRs and would look like "no issues" after
    // filtering. Scan a few pages to find real issues before giving up.
    return (async () => {
        const perPage = 50;
        const maxPages = 5;
        const byNumber = new Map<number, GHIssue>();

        for (let page = 1; page <= maxPages; page++) {
            const raw = await fetchIssuesPage(page, perPage);
            const issuesOnly = raw.filter((i) => !i.pull_request);
            for (const issue of issuesOnly) {
                byNumber.set(issue.number, issue);
            }

            if (byNumber.size >= perPage) { break; }
        }

        return [...byNumber.values()]
            .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
            .slice(0, perPage);
    })();
}

interface GhIssueRaw {
    number: number;
    title: string;
    url: string;
    state: string;
    createdAt: string;
    updatedAt: string;
    author?: { login?: string };
    labels?: Array<{ name?: string; color?: string }>;
    assignees?: Array<{ login?: string }>;
    body?: string | null;
    comments?: number;
}

function fetchIssuesViaGh(): Promise<GHIssue[]> {
    return new Promise((resolve, reject) => {
        const ghCandidates = [
            'gh',
            'C:\\Program Files\\GitHub CLI\\gh.exe',
            'C:\\Program Files (x86)\\GitHub CLI\\gh.exe',
        ];
        const ghPath = ghCandidates.find((candidate) => candidate === 'gh' || fs.existsSync(candidate));
        if (!ghPath) {
            reject(new Error('GitHub CLI not found'));
            return;
        }

        const args = [
            'issue', 'list',
            '-R', `${REPO_OWNER}/${REPO_NAME}`,
            '--state', 'open',
            '--limit', '50',
            '--json', 'number,title,url,state,createdAt,updatedAt,author,labels,assignees,body,comments',
        ];

        execFile(ghPath, args, { windowsHide: true, timeout: 10000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
            if (err) {
                reject(new Error((stderr || err.message || 'gh issue list failed').trim()));
                return;
            }

            try {
                const parsed = JSON.parse(stdout) as GhIssueRaw[];
                if (!Array.isArray(parsed)) {
                    resolve([]);
                    return;
                }

                const mapped: GHIssue[] = parsed.map((i) => ({
                    number: i.number,
                    title: i.title,
                    html_url: i.url,
                    state: i.state,
                    created_at: i.createdAt,
                    updated_at: i.updatedAt,
                    user: { login: i.author?.login || 'unknown' },
                    labels: (i.labels || []).map((l) => ({ name: l.name || '', color: l.color || '888888' })),
                    assignees: (i.assignees || []).map((a) => ({ login: a.login || '' })).filter((a) => a.login),
                    body: i.body || null,
                    comments: typeof i.comments === 'number' ? i.comments : 0,
                }));

                resolve(mapped);
            } catch {
                reject(new Error('Failed to parse gh issue list output'));
            }
        });
    });
}

function fetchIssuesPage(page: number, perPage: number): Promise<GHIssue[]> {
    return new Promise((resolve, reject) => {
        const path = `/repos/${REPO_OWNER}/${REPO_NAME}/issues?state=open&per_page=${perPage}&sort=updated&page=${page}`;
        const opts: https.RequestOptions = {
            hostname: 'api.github.com',
            path,
            method:   'GET',
            headers: {
                'User-Agent': 'cielovista-tools-vscode',
                'Accept':     'application/vnd.github+json',
            },
        };
        const req = https.request(opts, (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (c: Buffer) => chunks.push(c));
            res.on('end', () => {
                const body = Buffer.concat(chunks).toString('utf8');
                if (res.statusCode && res.statusCode >= 400) {
                    let detail = `${res.statusCode}`;
                    try {
                        const j = JSON.parse(body) as { message?: string };
                        if (j.message) { detail += ` \u2014 ${j.message}`; }
                    } catch { /* swallow */ }
                    return reject(new Error(`GitHub API returned ${detail}`));
                }
                try {
                    const parsed = JSON.parse(body) as GHIssue[];
                    resolve(Array.isArray(parsed) ? parsed : []);
                } catch {
                    reject(new Error('Failed to parse GitHub response'));
                }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function esc(s: string): string {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function ago(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const m    = Math.floor(diff / 60000);
    if (m < 1)   { return 'just now'; }
    if (m < 60)  { return `${m}m ago`; }
    const h = Math.floor(m / 60);
    if (h < 24)  { return `${h}h ago`; }
    const d = Math.floor(h / 24);
    if (d < 30)  { return `${d}d ago`; }
    return `${Math.floor(d / 30)}mo ago`;
}

/** Pick black or white text for a given hex background based on luminance. */
function contrastText(hex: string): string {
    const clean = hex.replace(/^#/, '');
    if (clean.length !== 6) { return '#fff'; }
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.6 ? '#000' : '#fff';
}

// ─── HTML ───────────────────────────────────────────────────────────────────

function buildHtml(loading: boolean, issues: GHIssue[] | null, error: string | null): string {
    const css = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:100% !important;max-width:none !important}
body{font-family:var(--vscode-font-family);font-size:13px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);min-height:100vh;width:100% !important;max-width:none !important;display:block}
#hd{display:flex;align-items:center;justify-content:space-between;padding:14px 20px;background:var(--vscode-sideBar-background);border-bottom:1px solid var(--vscode-panel-border);position:sticky;top:0;z-index:10;gap:14px;flex-wrap:wrap}
#hd-text h1{font-size:1.05em;font-weight:700}
#hd-text .subtitle{font-size:11px;color:var(--vscode-descriptionForeground);margin-top:2px;font-family:var(--vscode-editor-font-family,monospace)}
.repo-link{display:inline-block;padding:2px 0;color:var(--vscode-textLink-foreground);cursor:pointer;font:inherit;text-align:left;text-decoration:underline}
.repo-link:hover{opacity:.9}
.repo-link:focus{outline:1px solid var(--vscode-focusBorder);outline-offset:2px;border-radius:2px}
#hd-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.action-btn{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;padding:6px 14px;border-radius:4px;cursor:pointer;font-size:12px;font-family:inherit}
.action-btn:hover{background:var(--vscode-button-secondaryHoverBackground)}
.action-btn:disabled{opacity:.5;cursor:default}
#body{padding:14px 20px;width:100% !important;max-width:none !important;display:flex;flex-direction:column;align-items:stretch}
.loading{padding:24px;text-align:center;color:var(--vscode-descriptionForeground)}
.error{padding:14px 16px;border:1px solid #f85149;border-radius:6px;background:rgba(248,81,73,.08);color:#f85149;margin-bottom:14px;line-height:1.5}
.empty{padding:32px;text-align:center;color:var(--vscode-descriptionForeground);font-size:14px}
.summary{display:flex;gap:14px;margin-bottom:10px;padding:8px 12px;background:var(--vscode-textCodeBlock-background);border-radius:4px;font-size:11px;color:var(--vscode-descriptionForeground);align-items:center;flex-wrap:wrap;width:100%;max-width:none}
.controls{display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap;width:100%;max-width:none}
#search{flex:1;min-width:240px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border, var(--vscode-panel-border));border-radius:4px;padding:7px 10px;font-size:12px;font-family:inherit}
#search:focus{outline:1px solid var(--vscode-focusBorder)}
#clear{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;padding:7px 10px;border-radius:4px;cursor:pointer;font-size:12px;font-family:inherit}
#clear:hover{background:var(--vscode-button-secondaryHoverBackground)}
.table-wrap{border:1px solid var(--vscode-panel-border);border-radius:6px;overflow:auto;background:var(--vscode-textCodeBlock-background);max-height:calc(100vh - 210px);width:100%;max-width:none}
table{width:100%;border-collapse:collapse;min-width:1240px}
thead th{position:sticky;top:0;background:var(--vscode-sideBar-background);z-index:2;border-bottom:1px solid var(--vscode-panel-border);text-align:left;padding:7px 8px;white-space:nowrap}
th button{background:transparent;border:none;color:inherit;font:inherit;font-weight:700;cursor:pointer;padding:0;display:inline-flex;align-items:center;gap:5px}
th button:hover{text-decoration:underline}
th .sort-ind{font-size:10px;color:var(--vscode-descriptionForeground)}
tbody td{border-bottom:1px solid var(--vscode-panel-border);padding:7px 8px;vertical-align:top;font-size:12px}
tbody tr:hover{background:var(--vscode-list-hoverBackground)}
.num{font-family:var(--vscode-editor-font-family,monospace)}
.title-btn{background:none;border:none;padding:0;color:var(--vscode-textLink-foreground);cursor:pointer;font:inherit;text-align:left;line-height:1.3;font-weight:600}
.title-btn:hover{text-decoration:underline}
.muted{color:var(--vscode-descriptionForeground)}
.tags{display:flex;gap:4px;flex-wrap:wrap}
.label{padding:1px 7px;border-radius:10px;font-size:10px;font-weight:600;line-height:1.45;border:1px solid rgba(0,0,0,.1)}
.priority{background:var(--vscode-dropdown-background, var(--vscode-input-background));color:var(--vscode-dropdown-foreground, var(--vscode-input-foreground));border:1px solid var(--vscode-dropdown-border, var(--vscode-panel-border));border-radius:4px;padding:2px 4px;font-size:11px}
.state-pill{display:inline-block;padding:1px 7px;border-radius:10px;font-size:10px;font-weight:700;background:rgba(63,185,80,.14);color:#3fb950;border:1px solid rgba(63,185,80,.45)}
.proj-pill{display:inline-block;padding:1px 7px;border-radius:10px;font-size:10px;font-weight:600;background:rgba(0,82,204,.15);color:#4a90e2;border:1px solid rgba(0,82,204,.35);white-space:nowrap}
#proj-filter{background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border, var(--vscode-panel-border));border-radius:4px;padding:7px 8px;font-size:12px;font-family:inherit;cursor:pointer}
`;

    const copyDisabled = loading || !!error || !issues || issues.length === 0 ? ' disabled' : '';

    let bodyHtml: string;
    if (loading) {
        bodyHtml = `<div class="loading">Loading issues from github.com/${REPO_OWNER}/${REPO_NAME}\u2026</div>`;
    } else if (error) {
        bodyHtml = `<div class="error"><strong>Couldn't fetch issues.</strong><br>${esc(error)}<br><br>Click <em>\u21bb Reload</em> to try again.</div>`;
    } else if (!issues || issues.length === 0) {
        bodyHtml = `<div class="empty">\u2728 No open issues.</div>`;
    } else {
                // Collect unique project names for the filter dropdown
                const allProjects = [...new Set(
                    issues.flatMap((i) => i.labels
                        .filter((l) => l.name.startsWith('project:'))
                        .map((l) => l.name.slice('project:'.length))
                    )
                )].sort();

                const summary = `<div class="summary"><span><strong id="countShown">${issues.length}</strong> / <strong id="countTotal">${issues.length}</strong> open ${issues.length === 1 ? 'issue' : 'issues'}</span><span>\u2022</span><span>sticky field headers + sortable columns</span><span>\u2022</span><span>priority 1 = highest</span></div>`;
                const projectOptions = allProjects.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
                const controls = `<div class="controls"><input id="search" type="text" placeholder="Filter by number, title, body, labels, assignees, author" aria-label="Search issues"><select id="proj-filter" aria-label="Filter by project"><option value="">all projects</option>${projectOptions}</select><button id="clear" type="button">Clear</button></div>`;
                const rows = issues.map((iss) => {
            const labels = iss.labels.map((l) => {
                const bg = (l.color || '888888').replace(/^#/, '');
                const fg = contrastText(bg);
                return `<span class="label" style="background:#${esc(bg)};color:${fg}">${esc(l.name)}</span>`;
            }).join('');
                        const projectLabel = iss.labels.find((l) => l.name.startsWith('project:'));
                        const projectName  = projectLabel ? projectLabel.name.slice('project:'.length) : '';
                        const assigneesText = iss.assignees.map((a) => '@' + a.login).join(', ');
                        const labelsText = iss.labels.map((l) => l.name).join(' ');
                        const filterText = `${iss.number} ${iss.title} ${iss.body ?? ''} ${iss.user.login} ${labelsText} ${assigneesText}`.toLowerCase().replace(/\s+/g, ' ').trim();
                        return `<tr class="issue-row"
    data-number="${iss.number}"
    data-title="${esc(iss.title.toLowerCase())}"
    data-created="${new Date(iss.created_at).getTime()}"
    data-updated="${new Date(iss.updated_at).getTime()}"
    data-comments="${iss.comments}"
    data-state="${esc(iss.state.toLowerCase())}"
    data-author="${esc(iss.user.login.toLowerCase())}"
    data-project="${esc(projectName.toLowerCase())}"
    data-priority="3"
    data-filter="${esc(filterText)}">
    <td class="num">#${iss.number}</td>
    <td>${projectName ? `<span class="proj-pill">${esc(projectName)}</span>` : `<span class="muted">-</span>`}</td>
    <td>
        <button class="title-btn" type="button" data-url="${esc(iss.html_url)}" title="Open #${iss.number} on GitHub">${esc(iss.title)}</button>
    </td>
    <td><select class="priority" data-number="${iss.number}" aria-label="Priority for issue #${iss.number}"><option value="1">1</option><option value="2">2</option><option value="3" selected>3</option><option value="4">4</option><option value="5">5</option></select></td>
    <td><span class="state-pill">${esc(iss.state)}</span></td>
    <td><span class="muted">@${esc(iss.user.login)}</span></td>
    <td>${labels ? `<span class="tags">${labels}</span>` : `<span class="muted">-</span>`}</td>
    <td>${assigneesText ? `<span class="muted">${esc(assigneesText)}</span>` : `<span class="muted">-</span>`}</td>
    <td>${iss.comments}</td>
    <td title="${esc(iss.created_at)}">${esc(ago(iss.created_at))}</td>
    <td title="${esc(iss.updated_at)}">${esc(ago(iss.updated_at))}</td>
</tr>`;
        }).join('');
                const table = `<div class="table-wrap"><table id="issuesTable"><thead><tr>
<th><button type="button" data-sort="number">number <span class="sort-ind"></span></button></th>
<th><button type="button" data-sort="project">project <span class="sort-ind"></span></button></th>
<th><button type="button" data-sort="title">title <span class="sort-ind"></span></button></th>
<th><button type="button" data-sort="priority">priority <span class="sort-ind"></span></button></th>
<th><button type="button" data-sort="state">state <span class="sort-ind"></span></button></th>
<th><button type="button" data-sort="author">user.login <span class="sort-ind"></span></button></th>
<th><button type="button" data-sort="labels">labels[].name <span class="sort-ind"></span></button></th>
<th><button type="button" data-sort="assignees">assignees[].login <span class="sort-ind"></span></button></th>
<th><button type="button" data-sort="comments">comments <span class="sort-ind"></span></button></th>
<th><button type="button" data-sort="created">created_at <span class="sort-ind"></span></button></th>
<th><button type="button" data-sort="updated">updated_at <span class="sort-ind"></span></button></th>
</tr></thead><tbody id="issueRows">${rows}</tbody></table></div>`;
                bodyHtml = summary + controls + table;
    }

    const js = `
(function(){
    var vsc = acquireVsCodeApi();
    var STORAGE_KEY = 'cvt.issuePriorities.v1';
    var sortState = { key: 'priority', dir: 'asc' };

    function loadPriorities(){
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) { return {}; }
            var parsed = JSON.parse(raw);
            return (parsed && typeof parsed === 'object') ? parsed : {};
        } catch { return {}; }
    }

    function savePriorities(map){
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)); }
        catch { /* ignore storage failures */ }
    }

    var priorities = loadPriorities();

    function compareText(a, b){
        return String(a || '').localeCompare(String(b || ''));
    }

    function compareNum(a, b){
        return Number(a || 0) - Number(b || 0);
    }

    function rowSortValue(row, key){
        if (key === 'number')    { return Number(row.dataset.number || 0); }
        if (key === 'project')   { return String(row.dataset.project || ''); }
        if (key === 'title')     { return String(row.dataset.title || ''); }
        if (key === 'priority')  { return Number(row.dataset.priority || 3); }
        if (key === 'state')     { return String(row.dataset.state || ''); }
        if (key === 'author')    { return String(row.dataset.author || ''); }
        if (key === 'labels')    { var c = row.children[6]; return c ? c.textContent || '' : ''; }
        if (key === 'assignees') { var a = row.children[7]; return a ? a.textContent || '' : ''; }
        if (key === 'comments')  { return Number(row.dataset.comments || 0); }
        if (key === 'created')   { return Number(row.dataset.created || 0); }
        if (key === 'updated')   { return Number(row.dataset.updated || 0); }
        return '';
    }

    function applySort(){
        var tbody = document.getElementById('issueRows');
        if (!tbody) { return; }
        var rows = Array.from(tbody.querySelectorAll('.issue-row'));
        rows.sort(function(a, b){
            var av = rowSortValue(a, sortState.key);
            var bv = rowSortValue(b, sortState.key);
            var cmp = (typeof av === 'number' && typeof bv === 'number') ? compareNum(av, bv) : compareText(av, bv);
            if (cmp === 0) {
                // Stable fallback: updated_at desc, then number asc
                cmp = compareNum(Number(b.dataset.updated || 0), Number(a.dataset.updated || 0));
                if (cmp === 0) { cmp = compareNum(Number(a.dataset.number || 0), Number(b.dataset.number || 0)); }
            }
            return sortState.dir === 'asc' ? cmp : -cmp;
        });
        rows.forEach(function(r){ tbody.appendChild(r); });
        updateSortIndicators();
    }

    function updateSortIndicators(){
        document.querySelectorAll('th button[data-sort]').forEach(function(btn){
            var ind = btn.querySelector('.sort-ind');
            if (!ind) { return; }
            if (btn.getAttribute('data-sort') === sortState.key) {
                ind.textContent = sortState.dir === 'asc' ? '▲' : '▼';
            } else {
                ind.textContent = '';
            }
        });
    }

    function applyFilter(){
        var input = document.getElementById('search');
        var q = input ? String(input.value || '').trim().toLowerCase() : '';
        var projSel = document.getElementById('proj-filter');
        var projQ = projSel ? String(projSel.value || '').toLowerCase() : '';
        var total = 0;
        var shown = 0;
        document.querySelectorAll('.issue-row').forEach(function(row){
            total++;
            var txt = String(row.getAttribute('data-filter') || '');
            var proj = String(row.dataset.project || '');
            var okText = !q || txt.indexOf(q) !== -1;
            var okProj = !projQ || proj === projQ;
            var ok = okText && okProj;
            row.style.display = ok ? '' : 'none';
            if (ok) { shown++; }
        });
        var countShown = document.getElementById('countShown');
        var countTotal = document.getElementById('countTotal');
        if (countShown) { countShown.textContent = String(shown); }
        if (countTotal) { countTotal.textContent = String(total); }
    }

    var refresh = document.getElementById('refresh');
  if (refresh) {
    refresh.addEventListener('click', function(){ vsc.postMessage({ type: 'refresh' }); });
  }
        var copyAll = document.getElementById('copy-all');
        if (copyAll) {
                copyAll.addEventListener('click', function(){
                        if (!copyAll.disabled) {
                                vsc.postMessage({ type: 'copyAll' });
                        }
                });
        }
    var search = document.getElementById('search');
    if (search) {
        search.addEventListener('input', applyFilter);
    }
    var clear = document.getElementById('clear');
    if (clear && search) {
        clear.addEventListener('click', function(){
            search.value = '';
            var projSel = document.getElementById('proj-filter');
            if (projSel) { projSel.value = ''; }
            applyFilter();
            search.focus();
        });
    }
    var projFilter = document.getElementById('proj-filter');
    if (projFilter) {
        projFilter.addEventListener('change', applyFilter);
    }
    document.querySelectorAll('th button[data-sort]').forEach(function(btn){
        btn.addEventListener('click', function(){
            var key = btn.getAttribute('data-sort') || '';
            if (!key) { return; }
            if (sortState.key === key) {
                sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
            } else {
                sortState.key = key;
                sortState.dir = key === 'updated' ? 'desc' : 'asc';
            }
            applySort();
        });
    });
    document.querySelectorAll('.priority').forEach(function(sel){
        var n = String(sel.getAttribute('data-number') || '');
        if (n && priorities[n] >= 1 && priorities[n] <= 5) {
            sel.value = String(priorities[n]);
        }
        var row = sel.closest('.issue-row');
        if (row) { row.dataset.priority = sel.value || '3'; }
        sel.addEventListener('change', function(){
            var num = String(sel.getAttribute('data-number') || '');
            var val = Number(sel.value || '3');
            if (num) {
                priorities[num] = (val >= 1 && val <= 5) ? val : 3;
                savePriorities(priorities);
            }
            var r = sel.closest('.issue-row');
            if (r) { r.dataset.priority = String((val >= 1 && val <= 5) ? val : 3); }
            if (sortState.key === 'priority') {
                applySort();
                applyFilter();
            }
        });
    });
    document.querySelectorAll('.title-btn').forEach(function(b){
    b.addEventListener('click', function(){
      var url = b.dataset.url;
      if (url) { vsc.postMessage({ type: 'open', url: url }); }
    });
  });
        var repo = document.getElementById('repo-link');
        if (repo) {
                repo.addEventListener('click', function(e){
                        e.preventDefault();
                        var href = repo.getAttribute('href') || '';
                        if (href) { vsc.postMessage({ type: 'open', url: href }); }
                });
        }
    applySort();
    applyFilter();
})();
`;

    return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src 'unsafe-inline';script-src 'unsafe-inline';">
<style>${css}</style>
</head><body>
<div id="hd">
  <div id="hd-text">
        <h1>\u{1F4CB} Issue Viewer</h1>
        <div class="subtitle" title="Open repository on GitHub"><a id="repo-link" href="https://github.com/${REPO_OWNER}/${REPO_NAME}" class="repo-link" title="Open repository on GitHub">github.com/${REPO_OWNER}/${REPO_NAME}</a></div>
  </div>
    <div id="hd-actions">
        <button id="copy-all" class="action-btn" type="button" title="Copy all visible issue details to the clipboard"${copyDisabled}>Copy All</button>
        <button id="refresh" class="action-btn" type="button" title="Re-fetch from GitHub">\u21bb Reload</button>
    </div>
</div>
<div id="body">${bodyHtml}</div>
<script>${js}</script>
</body></html>`;
}

/** @internal — exported for unit/integration test assertions only */
export const _test = {
    buildHtml,
        formatIssuesForClipboard,
};
