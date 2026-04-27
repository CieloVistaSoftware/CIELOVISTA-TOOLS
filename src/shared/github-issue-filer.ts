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
