// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * changelog-freshness.ts
 *
 * Single source of truth for what counts as a "stale" CHANGELOG.md.
 * Used by both:
 *   - daily-audit/checks/changelog.ts (dashboard status/summary)
 *   - marketplace-compliance/checker.ts (interactive scan/review — surfaces
 *     the same staleness signal so "Auto-Fix"/"Review" isn't silent about it)
 *
 * A changelog can only be auto-fixed when it's missing (its content can be
 * generated). Staleness cannot be auto-fixed — only a human knows what
 * actually changed — so it is always reported as informational, never
 * marked fixable.
 */

/** A changelog older than this many days is considered stale. */
export const CHANGELOG_STALE_DAYS = 30;

/** Age in days of a file, given its mtime in epoch milliseconds. */
export function ageDays(mtimeMs: number, now: number = Date.now()): number {
    return (now - mtimeMs) / (1000 * 60 * 60 * 24);
}

/** True when a changelog's mtime is older than the staleness threshold. */
export function isChangelogStale(mtimeMs: number, now: number = Date.now()): boolean {
    return ageDays(mtimeMs, now) > CHANGELOG_STALE_DAYS;
}
