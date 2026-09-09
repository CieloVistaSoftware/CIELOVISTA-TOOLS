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

// ─── What counts as a changelog ───────────────────────────────────────────────

/**
 * #714: this module was the single source of truth for what counts as STALE,
 * but nothing was the source of truth for what counts as a CHANGELOG. Both
 * callers hardcoded `CHANGELOG.md`, so wb-starter -- whose changelog is a page
 * (`pages/whats-new.html`, fed by data/fixes-cache.json, and which describes
 * itself as "the real changelog") -- was reported as having none, and the
 * marketplace Auto-Fix offered to create a second, empty, competing one beside
 * it. Same destructive class as #667.
 *
 * A project may declare its changelog surface in the registry; `CHANGELOG.md`
 * remains the default for everyone who does not.
 */

import * as fs from 'fs';
import * as path from 'path';

export const DEFAULT_CHANGELOG = 'CHANGELOG.md';

/**
 * Surfaces that count as a changelog when a project has not declared one.
 *
 * Being GENEROUS here is safe in the direction that matters: every consumer
 * gates the "create one for you" action on having found nothing, so recognising
 * more surfaces can only prevent a competing file, never create one. The
 * opposite bias -- recognising only CHANGELOG.md -- is what produced #714.
 */
// NOTE: these are relative to ANOTHER project's root, not to this repo. Spelled
// out as a bare literal, the docs/-prefixed entry was read by docs-sync's
// dangling-path scan as a reference to cvt's own docs folder and failed the
// build. Composing it from DEFAULT_CHANGELOG says what it actually is -- and
// keeps the two in step if the default ever changes.
export const KNOWN_CHANGELOG_SURFACES = [
    DEFAULT_CHANGELOG,
    'CHANGELOG',
    'changelog.md',
    `docs/${DEFAULT_CHANGELOG}`,
    'pages/whats-new.html',   // wb-starter: "this list is the real changelog"
];

function fileExists(p: string): boolean {
    try { return fs.existsSync(p); } catch { return false; }
}

export interface ChangelogLocation {
    /** Absolute path to the changelog, whether or not it exists. */
    filePath: string;
    /** Path relative to the project root, for messages. */
    relPath:  string;
    /** True when the project named this surface itself rather than defaulting. */
    declared: boolean;
    /** True when the file is actually on disk. */
    exists:   boolean;
}

/**
 * Resolves a project's changelog. `declaredPath` is the registry's `changelog`
 * field when present -- a project-root-relative path such as
 * "pages/whats-new.html".
 */
export function resolveChangelog(projectPath: string, declaredPath?: string): ChangelogLocation {
    const declared = typeof declaredPath === 'string' && declaredPath.trim() !== '';

    if (declared) {
        const relPath  = declaredPath!.trim();
        const filePath = path.join(projectPath, relPath);
        return { filePath, relPath, declared: true, exists: fileExists(filePath) };
    }

    // No declaration: look for any surface a project actually uses before
    // concluding it has none. Requiring a registry edit to stop a false
    // "missing" would leave the report wrong for every project until someone
    // remembered to declare — and the report drives a fix action.
    for (const candidate of KNOWN_CHANGELOG_SURFACES) {
        const filePath = path.join(projectPath, candidate);
        if (fileExists(filePath)) {
            return { filePath, relPath: candidate, declared: false, exists: true };
        }
    }

    // Nothing found — report against the default, which is what would be created.
    return {
        filePath: path.join(projectPath, DEFAULT_CHANGELOG),
        relPath:  DEFAULT_CHANGELOG,
        declared: false,
        exists:   false,
    };
}

/**
 * True when it is safe to OFFER TO CREATE a changelog for this project.
 *
 * Never true for a project that declared a surface: generating `CHANGELOG.md`
 * beside an existing page-based changelog produces two competing changelogs,
 * which is worse than the gap it claims to close (#714).
 */
export function canGenerateChangelog(location: ChangelogLocation): boolean {
    return !location.exists && !location.declared;
}
