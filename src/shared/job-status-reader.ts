// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

// component: jstat

/**
 * job-status-reader.ts
 *
 * Reads and summarizes the "current Claude job" status file (issue #3) so the
 * Issue Viewer can show a live progress panel for a running batch job.
 *
 * The status file (data/claude-job-status.json) is written by Claude as it
 * works. This reader is source-agnostic and pure Node (no VS Code dependency)
 * so it is fully unit-testable and could later be fed from a trace instead.
 *
 * Schema (data/claude-job-status.json):
 *   {
 *     "jobId":     "string",
 *     "title":     "string",
 *     "startedAt": "ISO-8601",
 *     "updatedAt": "ISO-8601",
 *     "etaIso":    "ISO-8601 | null",   // optional absolute ETA
 *     "steps":     [ { "name": "string", "status": "done|active|pending" } ],
 *     "detail":    "string"             // optional current-activity line
 *   }
 */

import * as fs   from 'fs';
import * as path from 'path';

export type StepStatus = 'done' | 'active' | 'pending';

export interface JobStep {
    name:   string;
    status: StepStatus;
}

export interface JobStatus {
    jobId:     string;
    title:     string;
    startedAt: string;
    updatedAt: string;
    etaIso?:   string | null;
    steps:     JobStep[];
    detail?:   string;
}

/** A job whose status file has not been touched in this long is treated as gone. */
export const STALE_MS = 5 * 60 * 1000;

/** 'none' and 'stale' hide the banner; 'running' and 'done' show it. */
export type JobState = 'none' | 'stale' | 'running' | 'done';

export interface JobSummary {
    state:          JobState;
    title:          string;
    stepsDone:      number;
    stepsTotal:     number;
    percent:        number;   // 0–100
    activeStepName: string;   // active step (or first pending), else ''
    elapsedText:    string;   // "1m 30s"
    etaText:        string;   // "~4m" or '—'
    updatedAgoText: string;   // "3s ago"
    detail:         string;
    steps:          JobStep[];
}

/** Default location of the status file, relative to the compiled out/ dir. */
export function defaultStatusPath(): string {
    return path.join(__dirname, '..', 'data', 'claude-job-status.json');
}

/** Read + parse the status file. Returns null when missing or invalid. */
export function readJobStatus(filePath: string): JobStatus | null {
    try {
        if (!fs.existsSync(filePath)) { return null; }
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as JobStatus;
        if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.steps)) { return null; }
        return parsed;
    } catch {
        return null;
    }
}

/** Write a status file (used by tooling/tests; pretty-printed for hand edits). */
export function writeJobStatus(filePath: string, status: JobStatus): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
    fs.writeFileSync(filePath, JSON.stringify(status, null, 2), 'utf8');
}

// ─── Time formatting (pure) ───────────────────────────────────────────────────

function formatDuration(ms: number): string {
    if (ms < 0) { ms = 0; }
    const totalSec = Math.round(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) { return `${h}h ${m}m`; }
    if (m > 0) { return `${m}m ${s}s`; }
    return `${s}s`;
}

function agoText(fromMs: number, nowMs: number): string {
    const diff = nowMs - fromMs;
    if (diff < 1000) { return 'just now'; }
    return `${formatDuration(diff)} ago`;
}

const EMPTY: JobSummary = {
    state: 'none', title: '', stepsDone: 0, stepsTotal: 0, percent: 0,
    activeStepName: '', elapsedText: '', etaText: '—', updatedAgoText: '',
    detail: '', steps: [],
};

/**
 * Derive a display summary from a status + the current time (injected for tests).
 * Returns state 'none' for an absent/empty job, 'stale' when the file is old,
 * 'done' when every step is done, otherwise 'running'.
 */
export function summarizeJob(status: JobStatus | null, nowMs: number): JobSummary {
    if (!status || !Array.isArray(status.steps) || status.steps.length === 0) {
        return { ...EMPTY };
    }

    const updatedMs = Date.parse(status.updatedAt);
    if (!Number.isFinite(updatedMs) || nowMs - updatedMs > STALE_MS) {
        return { ...EMPTY, state: 'stale' };
    }

    const stepsTotal = status.steps.length;
    const stepsDone  = status.steps.filter((s) => s.status === 'done').length;
    const percent    = Math.round((stepsDone / stepsTotal) * 100);
    const allDone    = stepsDone === stepsTotal;

    const active = status.steps.find((s) => s.status === 'active')
                ?? status.steps.find((s) => s.status === 'pending');

    const startedMs = Date.parse(status.startedAt);
    const elapsedText = Number.isFinite(startedMs) ? formatDuration(nowMs - startedMs) : '';

    const etaMs = status.etaIso ? Date.parse(status.etaIso) : NaN;
    const etaText = Number.isFinite(etaMs) && etaMs > nowMs
        ? `~${formatDuration(etaMs - nowMs)}`
        : '—';

    return {
        state:          allDone ? 'done' : 'running',
        title:          status.title || '(untitled job)',
        stepsDone,
        stepsTotal,
        percent,
        activeStepName: allDone ? '' : (active?.name ?? ''),
        elapsedText,
        etaText,
        updatedAgoText: agoText(updatedMs, nowMs),
        detail:         status.detail ?? '',
        steps:          status.steps,
    };
}
