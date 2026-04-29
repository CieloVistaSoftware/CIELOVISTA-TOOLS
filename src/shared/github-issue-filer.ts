// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * github-issue-filer.ts
 *
 * Phase 1 of issue #23: one-click "File as GitHub Issue" from the Error
 * Log Viewer. Given an ErrorEntry, this module:
 *
 *   1. Acquires a GitHub auth token via vscode.authentication
 *      (one-time consent prompt; cached after that)
 *   2. Builds a pre-filled title and body
 *   3. POSTs to api.github.com/repos/{owner}/{repo}/issues
 *   4. Returns the new issue's html_url, or a structured error
 *
 * Phase 1 always files to CieloVistaSoftware/cielovista-tools. Phase 2
 * (separate issue) will route based on the error's file path via the
 * symbol index, falling back to cielovista-tools.
 *
 * Phase 1 does NOT deduplicate. If the same error is filed twice, two
 * issues result. Phase 2 will hash the stack trace and increment a
 * comment-counter on an existing issue when matched.
 */

import * as vscode from 'vscode';
import * as https from 'https';
import type { ErrorEntry } from './error-log-adapter';

const REPO_OWNER = 'CieloVistaSoftware';
const REPO_NAME  = 'cielovista-tools';

export interface FileIssueResult {
    ok:        boolean;
    issueUrl?: string;
    issueNumber?: number;
    error?:    string;   // human-readable failure detail
}

// ─── Title + body builders ────────────────────────────────────────────────────

/**
 * Build a one-line issue title from an error entry.
 * Format: "[type] message (truncated to 80 chars)"
 */
export function buildTitle(e: ErrorEntry): string {
    const msg = (e.message || '').replace(/\s+/g, ' ').trim();
    const max = 80;
    const truncated = msg.length > max ? msg.slice(0, max - 1) + '\u2026' : msg;
    return `[${e.type}] ${truncated}`;
}

/**
 * Build a markdown issue body. Includes the structured fields the
 * Error Log Viewer already shows, formatted for GitHub.
 */
export function buildBody(e: ErrorEntry): string {
    const lines: string[] = [];
    lines.push('## Auto-filed from CVT Error Log Viewer');
    lines.push('');
    lines.push(`**Type:** \`${e.type}\``);
    lines.push(`**Source:** ${e.prefix}`);
    if (e.context) { lines.push(`**Context:** \`${e.context}\``); }
    if (e.command) { lines.push(`**Command:** \`${e.command}\``); }
    lines.push(`**Timestamp:** ${e.timestamp}`);
    if (e.filename) {
        lines.push(`**Location:** \`${e.filename}:${e.lineno}:${e.colno}\``);
    }
    lines.push('');
    lines.push('### Message');
    lines.push('```');
    lines.push(e.message);
    lines.push('```');
    if (e.stack) {
        lines.push('');
        lines.push('### Stack trace');
        lines.push('```');
        // Trim to the first 8 frames so the issue body doesn't get
        // dominated by deep VS Code internals.
        const frames = e.stack.split('\n').slice(0, 9);
        lines.push(frames.join('\n'));
        lines.push('```');
    }
    lines.push('');
    lines.push('---');
    lines.push('*Filed from `cvs.tools.errorLog` viewer on ' + new Date().toISOString() + '*');
    return lines.join('\n');
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

/**
 * Get a GitHub auth token using VS Code's built-in provider.
 * `createIfNone: true` triggers the one-time consent prompt the first
 * time the user files an issue from this session.
 */
async function getGithubToken(): Promise<string | undefined> {
    try {
        const session = await vscode.authentication.getSession(
            'github',
            ['repo'],
            { createIfNone: true }
        );
        return session?.accessToken;
    } catch (err) {
        // User can cancel the consent prompt — that throws.
        return undefined;
    }
}

// ─── HTTP POST ────────────────────────────────────────────────────────────────

interface CreateIssueResponse {
    html_url:  string;
    number:    number;
    message?:  string;   // present on errors
}

/**
 * Look up an existing open issue with the same title and the auto-filed
 * label. Returns null on any failure (including 4xx / network) so the
 * caller falls through to the create path — dedup is best-effort.
 *
 * Issue #60 (duplicate of #64 with identical title) is exactly the
 * pattern this prevents: same error filed twice within minutes
 * because there was no pre-flight title check.
 */
function findOpenAutoFiledIssue(token: string, title: string): Promise<{ number: number; html_url: string } | null> {
    return new Promise((resolve) => {
        const opts: https.RequestOptions = {
            hostname: 'api.github.com',
            path:     `/repos/${REPO_OWNER}/${REPO_NAME}/issues?labels=auto-filed&state=open&per_page=100`,
            method:   'GET',
            headers: {
                'User-Agent':    'cielovista-tools-vscode',
                'Accept':        'application/vnd.github+json',
                'Authorization': `Bearer ${token}`,
            },
        };
        const req = https.request(opts, (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (c: Buffer) => chunks.push(c));
            res.on('end',  () => {
                if (!res.statusCode || res.statusCode >= 400) { return resolve(null); }
                try {
                    const issues = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Array<{ number: number; html_url: string; title: string }>;
                    const match = issues.find(i => i.title === title);
                    resolve(match ? { number: match.number, html_url: match.html_url } : null);
                } catch {
                    resolve(null);
                }
            });
        });
        req.on('error', () => resolve(null));
        req.end();
    });
}

/**
 * Post a comment on an existing issue. Used by the dedup path to bump
 * the count instead of opening a new issue with an identical title.
 */
function postIssueComment(token: string, issueNumber: number, body: string): Promise<boolean> {
    return new Promise((resolve) => {
        const payload = JSON.stringify({ body });
        const opts: https.RequestOptions = {
            hostname: 'api.github.com',
            path:     `/repos/${REPO_OWNER}/${REPO_NAME}/issues/${issueNumber}/comments`,
            method:   'POST',
            headers: {
                'User-Agent':    'cielovista-tools-vscode',
                'Accept':        'application/vnd.github+json',
                'Authorization': `Bearer ${token}`,
                'Content-Type':  'application/json',
                'Content-Length': Buffer.byteLength(payload).toString(),
            },
        };
        const req = https.request(opts, (res) => {
            res.on('data', () => { /* drain */ });
            res.on('end',  () => {
                resolve(!!res.statusCode && res.statusCode < 400);
            });
        });
        req.on('error', () => resolve(false));
        req.write(payload);
        req.end();
    });
}

function postIssue(token: string, title: string, body: string, labels: string[]): Promise<CreateIssueResponse> {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({ title, body, labels });
        const opts: https.RequestOptions = {
            hostname: 'api.github.com',
            path:     `/repos/${REPO_OWNER}/${REPO_NAME}/issues`,
            method:   'POST',
            headers: {
                'User-Agent':    'cielovista-tools-vscode',
                'Accept':        'application/vnd.github+json',
                'Authorization': `Bearer ${token}`,
                'Content-Type':  'application/json',
                'Content-Length': Buffer.byteLength(payload).toString(),
            },
        };
        const req = https.request(opts, (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (c: Buffer) => chunks.push(c));
            res.on('end',  () => {
                const body = Buffer.concat(chunks).toString('utf8');
                if (res.statusCode && res.statusCode >= 400) {
                    let detail = `HTTP ${res.statusCode}`;
                    try {
                        const j = JSON.parse(body) as { message?: string };
                        if (j.message) { detail += `: ${j.message}`; }
                    } catch { /* swallow */ }
                    return reject(new Error(detail));
                }
                try {
                    const parsed = JSON.parse(body) as CreateIssueResponse;
                    resolve(parsed);
                } catch {
                    reject(new Error('Failed to parse GitHub response'));
                }
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface RegressionEntry {
    regId:            string;
    title:            string;
    date:             string;
    severity:         string;
    status:           string;
    description:      string;
    rule?:            string;
    githubIssueNumber: number | null;
    githubIssueUrl:    string | null;
    fixedDate:         string | null;
    releaseVersion:    string | null;
}

/**
 * File a GitHub issue for the given error entry.
 * Always files to CieloVistaSoftware/cielovista-tools (Phase 1 routing).
 */
export async function fileErrorAsIssue(e: ErrorEntry): Promise<FileIssueResult> {
    const token = await getGithubToken();
    if (!token) {
        return { ok: false, error: 'GitHub authentication was canceled or failed. Click File as Issue again to retry.' };
    }

    const title  = buildTitle(e);
    const body   = buildBody(e);
    const labels = ['type:bug', 'auto-filed'];

    // Dedup: if an open auto-filed issue with the same title already
    // exists, drop a +1 comment instead of opening a duplicate. This
    // is what should have prevented #60 from being filed when #64
    // already had the identical title.
    const existing = await findOpenAutoFiledIssue(token, title);
    if (existing) {
        const commentLines = [
            `Recurrence reported at ${new Date().toISOString()}.`,
            '',
            `**Source:** ${e.prefix}`,
        ];
        if (e.context) { commentLines.push(`**Context:** \`${e.context}\``); }
        if (e.command) { commentLines.push(`**Command:** \`${e.command}\``); }
        commentLines.push('', '_Posted via dedup — title matched this open auto-filed issue, so a comment was added instead of a duplicate issue._');
        const ok = await postIssueComment(token, existing.number, commentLines.join('\n'));
        return ok
            ? { ok: true, issueUrl: existing.html_url, issueNumber: existing.number }
            : { ok: false, error: `Title matched open issue #${existing.number} but the dedup comment failed to post.` };
    }

    try {
        const res = await postIssue(token, title, body, labels);
        return { ok: true, issueUrl: res.html_url, issueNumber: res.number };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, error: msg };
    }
}

/**
 * File a GitHub issue for the given regression entry.
 */
export async function fileRegressionAsIssue(r: RegressionEntry): Promise<FileIssueResult> {
    const token = await getGithubToken();
    if (!token) {
        return { ok: false, error: 'GitHub authentication was canceled or failed.' };
    }

    const title = `[${r.regId}] ${r.title}`;
    const lines: string[] = [];
    lines.push('## Regression Report — ' + r.regId);
    lines.push('');
    lines.push(`**Severity:** ${r.severity}`);
    lines.push(`**Date discovered:** ${r.date}`);
    lines.push('');
    lines.push('### Description');
    lines.push(r.description);
    if (r.rule) {
        lines.push('');
        lines.push('### Rule established');
        lines.push(r.rule);
    }
    lines.push('');
    lines.push('---');
    lines.push('*Filed from `cvs.tools.regressionLog` viewer on ' + new Date().toISOString() + '*');
    const body   = lines.join('\n');
    const labels = ['type:regression', 'auto-filed'];

    try {
        const res = await postIssue(token, title, body, labels);
        return { ok: true, issueUrl: res.html_url, issueNumber: res.number };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, error: msg };
    }
}

/**
 * File a GitHub issue for the given HealthBug from the Fix Bugs panel.
 */
export async function fileHealthBugAsIssue(bug: { id: string; title: string; detail: string; category: string; priority: string; checkId: string; detectedAt: string; recommendation?: string; evidence?: string[] }): Promise<FileIssueResult> {
    const token = await getGithubToken();
    if (!token) {
        return { ok: false, error: 'GitHub authentication was canceled or failed.' };
    }

    const title = `[${bug.category}] ${bug.title}`;
    const lines: string[] = [
        '## Background Health Runner report',
        '',
        `**Check ID:** \`${bug.checkId}\``,
        `**Priority:** \`${bug.priority}\``,
        `**Category:** ${bug.category}`,
        `**Detected:** ${bug.detectedAt}`,
        '',
        '### What\'s wrong',
        bug.detail,
    ];
    if (bug.recommendation) {
        lines.push('', '### Recommended fix', bug.recommendation);
    }
    if (bug.evidence && bug.evidence.length > 0) {
        lines.push('', '### Evidence', '```text', ...bug.evidence.slice(0, 20), '```');
    }
    lines.push('', '---', '*Filed from CVT Background Health Runner on ' + new Date().toISOString() + '*');

    const body   = lines.join('\n');
    const labels = ['type:bug', 'auto-filed', `area:${bug.category.toLowerCase().replace(/\s+/g, '-')}`];

    const existing = await findOpenAutoFiledIssue(token, title);
    if (existing) {
        const comment = `Recurrence detected at ${new Date().toISOString()}.\n\n_Posted via dedup — title matched this open auto-filed issue._`;
        const ok = await postIssueComment(token, existing.number, comment);
        return ok
            ? { ok: true, issueUrl: existing.html_url, issueNumber: existing.number }
            : { ok: false, error: `Matched issue #${existing.number} but comment failed to post.` };
    }

    try {
        const res = await postIssue(token, title, body, labels);
        return { ok: true, issueUrl: res.html_url, issueNumber: res.number };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, error: msg };
    }
}

/**
 * Fetch all open auto-filed issues from GitHub in a single API call.
 * Returns a map of issue title → { number, html_url } for fast lookup.
 * Returns null if auth fails or the request errors.
 */
export async function fetchAutoFiledIssueMap(): Promise<Map<string, { number: number; html_url: string }> | null> {
    const token = await getGithubToken();
    if (!token) { return null; }
    return new Promise((resolve) => {
        const opts: https.RequestOptions = {
            hostname: 'api.github.com',
            path:     `/repos/${REPO_OWNER}/${REPO_NAME}/issues?labels=auto-filed&state=open&per_page=100`,
            method:   'GET',
            headers: {
                'User-Agent':    'cielovista-tools-vscode',
                'Accept':        'application/vnd.github+json',
                'Authorization': `Bearer ${token}`,
            },
        };
        const req = https.request(opts, (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (c: Buffer) => chunks.push(c));
            res.on('end', () => {
                if (!res.statusCode || res.statusCode >= 400) { return resolve(null); }
                try {
                    const issues = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Array<{ number: number; html_url: string; title: string }>;
                    const map = new Map<string, { number: number; html_url: string }>();
                    for (const i of issues) { map.set(i.title, { number: i.number, html_url: i.html_url }); }
                    resolve(map);
                } catch {
                    resolve(null);
                }
            });
        });
        req.on('error', () => resolve(null));
        req.end();
    });
}
