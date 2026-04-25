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

/**
 * Show the issues panel. Reuses the existing panel if already open.
 *
 * Function name is `showGithubIssues` (lowercase h) to match the existing
 * import in home-page.ts.
 */
export function showGithubIssues(): void {
    if (activePanel) {
        activePanel.reveal();
        return;
    }

    const panel = vscode.window.createWebviewPanel(
        'cvtIssues',
        'cielovista-tools \u2014 Open Issues',
        vscode.ViewColumn.One,
        { enableScripts: true }
    );
    activePanel = panel;
    panel.onDidDispose(() => { activePanel = undefined; });

    const setHtml = (loading: boolean, issues: GHIssue[] | null, error: string | null): void => {
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

    panel.webview.onDidReceiveMessage((msg: { type?: string; url?: string }) => {
        if (!msg?.type) { return; }
        if (msg.type === 'refresh') {
            void refresh();
        } else if (msg.type === 'open' && msg.url) {
            void vscode.env.openExternal(vscode.Uri.parse(String(msg.url)));
        }
    });

    void refresh();
}

// ─── Fetch ──────────────────────────────────────────────────────────────────

function fetchIssues(): Promise<GHIssue[]> {
    return new Promise((resolve, reject) => {
        const path = `/repos/${REPO_OWNER}/${REPO_NAME}/issues?state=open&per_page=50&sort=updated`;
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
                    // The /issues endpoint includes pull requests; strip them.
                    resolve(parsed.filter((i) => !i.pull_request));
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
body{font-family:var(--vscode-font-family);font-size:13px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);min-height:100vh}
#hd{display:flex;align-items:center;justify-content:space-between;padding:14px 20px;background:var(--vscode-sideBar-background);border-bottom:1px solid var(--vscode-panel-border);position:sticky;top:0;z-index:10;gap:14px;flex-wrap:wrap}
#hd-text h1{font-size:1.05em;font-weight:700}
#hd-text .subtitle{font-size:11px;color:var(--vscode-descriptionForeground);margin-top:2px;font-family:var(--vscode-editor-font-family,monospace)}
#refresh{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;padding:6px 14px;border-radius:4px;cursor:pointer;font-size:12px;font-family:inherit}
#refresh:hover{background:var(--vscode-button-secondaryHoverBackground)}
#body{padding:14px 20px;max-width:900px}
.loading{padding:24px;text-align:center;color:var(--vscode-descriptionForeground)}
.error{padding:14px 16px;border:1px solid #f85149;border-radius:6px;background:rgba(248,81,73,.08);color:#f85149;margin-bottom:14px;line-height:1.5}
.empty{padding:32px;text-align:center;color:var(--vscode-descriptionForeground);font-size:14px}
.summary{display:flex;gap:14px;margin-bottom:12px;padding:8px 12px;background:var(--vscode-textCodeBlock-background);border-radius:4px;font-size:11px;color:var(--vscode-descriptionForeground);align-items:center}
.issue{display:block;width:100%;text-align:left;border:1px solid var(--vscode-panel-border);border-radius:6px;padding:12px 14px;margin-bottom:8px;cursor:pointer;background:var(--vscode-textCodeBlock-background);transition:border-color .12s,background .12s;color:inherit;font-family:inherit;font-size:inherit}
.issue:hover{border-color:var(--vscode-focusBorder);background:var(--vscode-list-hoverBackground)}
.issue-top{display:flex;align-items:baseline;gap:10px;margin-bottom:6px}
.issue-num{font-family:var(--vscode-editor-font-family,monospace);font-size:12px;color:var(--vscode-descriptionForeground);flex-shrink:0}
.issue-title{font-weight:700;font-size:14px;flex:1;min-width:0;line-height:1.35}
.issue-meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:11px;color:var(--vscode-descriptionForeground)}
.labels{display:inline-flex;gap:4px;flex-wrap:wrap}
.label{padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;line-height:1.45;border:1px solid rgba(0,0,0,.1)}
.assignees{font-style:italic}
.comments{display:inline-flex;align-items:center;gap:3px}
`;

    let bodyHtml: string;
    if (loading) {
        bodyHtml = `<div class="loading">Loading issues from github.com/${REPO_OWNER}/${REPO_NAME}\u2026</div>`;
    } else if (error) {
        bodyHtml = `<div class="error"><strong>Couldn't fetch issues.</strong><br>${esc(error)}<br><br>Click <em>\u21bb Reload</em> to try again.</div>`;
    } else if (!issues || issues.length === 0) {
        bodyHtml = `<div class="empty">\u2728 No open issues.</div>`;
    } else {
        const summary = `<div class="summary"><span><strong>${issues.length}</strong> open ${issues.length === 1 ? 'issue' : 'issues'}</span><span>\u2022</span><span>sorted by recently updated</span></div>`;
        const cards = issues.map((iss) => {
            const labels = iss.labels.map((l) => {
                const bg = (l.color || '888888').replace(/^#/, '');
                const fg = contrastText(bg);
                return `<span class="label" style="background:#${esc(bg)};color:${fg}">${esc(l.name)}</span>`;
            }).join('');
            const assignees = iss.assignees.length > 0
                ? `<span class="assignees">assigned ${esc(iss.assignees.map((a) => '@' + a.login).join(', '))}</span>`
                : '';
            const comments = iss.comments > 0
                ? `<span class="comments">\u{1F4AC} ${iss.comments}</span>`
                : '';
            return `<button class="issue" data-url="${esc(iss.html_url)}" type="button" title="Open #${iss.number} on GitHub">
  <div class="issue-top">
    <span class="issue-num">#${iss.number}</span>
    <span class="issue-title">${esc(iss.title)}</span>
  </div>
  <div class="issue-meta">
    <span>opened ${esc(ago(iss.created_at))} by @${esc(iss.user.login)}</span>
    <span>updated ${esc(ago(iss.updated_at))}</span>
    ${comments}
    ${assignees}
    ${labels ? `<span class="labels">${labels}</span>` : ''}
  </div>
</button>`;
        }).join('');
        bodyHtml = summary + cards;
    }

    const js = `
(function(){
  var vsc = acquireVsCodeApi();
  var refresh = document.getElementById('refresh');
  if (refresh) {
    refresh.addEventListener('click', function(){ vsc.postMessage({ type: 'refresh' }); });
  }
  document.querySelectorAll('.issue').forEach(function(b){
    b.addEventListener('click', function(){
      var url = b.dataset.url;
      if (url) { vsc.postMessage({ type: 'open', url: url }); }
    });
  });
})();
`;

    return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src 'unsafe-inline';script-src 'unsafe-inline';">
<style>${css}</style>
</head><body>
<div id="hd">
  <div id="hd-text">
    <h1>\u{1F4CB} Open Issues</h1>
    <div class="subtitle">github.com/${REPO_OWNER}/${REPO_NAME}</div>
  </div>
  <button id="refresh" type="button" title="Re-fetch from GitHub">\u21bb Reload</button>
</div>
<div id="body">${bodyHtml}</div>
<script>${js}</script>
</body></html>`;
}
