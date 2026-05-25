// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

// component: ntf

/**
 * claude-notifier.ts
 *
 * When bg-health-runner files a new GitHub issue it calls enqueueIssue()
 * here, which appends a WorkQueueEntry to data/claude-work-queue.json.
 *
 * A durable CronCreate job checks the queue every two hours while Claude
 * Code is running, and the session-start workflow reads CURRENT-STATUS.md
 * which always mentions the queue when it has unprocessed items.
 *
 * No VS Code dependency — pure Node.js so it is fully unit-testable.
 */

import * as fs   from 'fs';
import * as path from 'path';

export interface WorkQueueEntry {
    bugId:           string;
    checkId:         string;
    title:           string;
    category:        string;
    priority:        string;
    issueNumber:     number;
    issueUrl:        string;
    detail:          string;
    recommendation?: string;
    enqueuedAt:      string;
    processed:       boolean;
}

export interface NotifyResult {
    ok:     boolean;
    error?: string;
}

const DATA_DIR    = path.join(__dirname, '..', 'data');
export const DEFAULT_QUEUE_PATH = path.join(DATA_DIR, 'claude-work-queue.json');

// ─── Internal helpers ─────────────────────────────────────────────────────────

function readRaw(queuePath: string): WorkQueueEntry[] {
    if (!fs.existsSync(queuePath)) { return []; }
    try {
        const parsed = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
        return Array.isArray(parsed) ? parsed as WorkQueueEntry[] : [];
    } catch {
        return [];
    }
}

function writeRaw(queuePath: string, entries: WorkQueueEntry[]): void {
    const dir = path.dirname(queuePath);
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
    fs.writeFileSync(queuePath, JSON.stringify(entries, null, 2), 'utf8');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Read all entries from the queue file.
 * Returns [] when the file does not exist or cannot be parsed.
 */
export function readQueue(queuePath = DEFAULT_QUEUE_PATH): WorkQueueEntry[] {
    return readRaw(queuePath);
}

/**
 * Append or update a work-queue entry for a newly filed health issue.
 * If an entry with the same bugId already exists it is replaced so the
 * queue does not accumulate stale duplicates.
 */
export function enqueueIssue(
    bug: {
        id:              string;
        checkId:         string;
        title:           string;
        category:        string;
        priority:        string;
        detail:          string;
        recommendation?: string;
    },
    issueNumber: number,
    issueUrl:    string,
    queuePath = DEFAULT_QUEUE_PATH
): NotifyResult {
    try {
        const entries = readRaw(queuePath);
        const idx = entries.findIndex(e => e.bugId === bug.id);
        const entry: WorkQueueEntry = {
            bugId:          bug.id,
            checkId:        bug.checkId,
            title:          bug.title,
            category:       bug.category,
            priority:       bug.priority,
            issueNumber,
            issueUrl,
            detail:         bug.detail,
            recommendation: bug.recommendation,
            enqueuedAt:     new Date().toISOString(),
            processed:      false,
        };
        if (idx >= 0) { entries[idx] = entry; } else { entries.push(entry); }
        writeRaw(queuePath, entries);
        return { ok: true };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}

/**
 * Mark an entry as processed so the cron job skips it on the next run.
 * Safe to call on a bugId that does not exist in the queue.
 */
export function markProcessed(bugId: string, queuePath = DEFAULT_QUEUE_PATH): NotifyResult {
    try {
        const entries = readRaw(queuePath);
        const entry = entries.find(e => e.bugId === bugId);
        if (entry) {
            entry.processed = true;
            writeRaw(queuePath, entries);
        }
        return { ok: true };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}
