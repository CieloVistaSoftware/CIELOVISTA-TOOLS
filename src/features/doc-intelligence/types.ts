// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * types.ts — Unified finding types for Doc Intelligence.
 *
 * A Finding is one discrete issue detected across the doc corpus.
 * Each Finding carries everything needed to:
 *   1. Display it in the dashboard (title, reason, recommendation)
 *   2. Execute the suggested action (action + paths)
 *   3. Log what happened (kind, paths, outcome)
 */

export type FindingKind =
    | 'duplicate'       // same filename in 2+ places
    | 'similar'         // different name, overlapping content
    | 'misplaced'       // project doc that belongs in global standards
    | 'orphan'          // no other doc links to this file
    | 'missing-readme'  // project has no README.md
    | 'missing-claude'  // project has no CLAUDE.md
    | 'missing-changelog'; // project has no CHANGELOG.md

export type FindingSeverity = 'red' | 'yellow' | 'info';

export type FindingAction =
    | 'merge'           // merge multiple files into one
    | 'diff'            // open side-by-side diff (read-only)
    | 'move-to-global'  // copy to CieloVistaStandards, delete original
    | 'delete'          // delete file after review
    | 'open'            // open file in editor
    | 'create'          // create a missing file from template
    | 'none';           // informational only

/** One issue found during the intelligence scan. */
export interface Finding {
    /** Stable unique ID for this finding within a scan run */
    id:           string;
    kind:         FindingKind;
    severity:     FindingSeverity;

    /** Short title shown on the card — e.g. "Duplicate: CLAUDE.md (3 copies)" */
    title:        string;

    /** One sentence — the why. e.g. "Same filename in wb-core, cielovista-tools, DiskCleanUp" */
    reason:       string;

    /** Plain-English suggestion. e.g. "Keep the most complete copy and delete the rest." */
    recommendation: string;

    /** The recommended action to execute when user clicks Accept */
    action:       FindingAction;

    /** Paths involved. First path = primary target for single-path actions. */
    paths:        string[];

    /** Which project(s) are involved */
    projects:     string[];

    /** Priority score 0-100. Higher = show first. */
    priority:     number;

    /** User's decision — set by the dashboard */
    decision?:    'accepted' | 'skipped' | 'pending';

    /** Extra context for display (e.g. similarity percentage) */
    meta?:        Record<string, string | number>;
}

export interface IntelligenceReport {
    scannedAt:    string;
    durationMs:   number;
    totalDocs:    number;
    projects:     number;
    findings:     Finding[];
    summary: {
        red:    number;
        yellow: number;
        info:   number;
        total:  number;
    };
}

export interface ProjectEntry {
    name:        string;
    path:        string;
    type:        string;
    description: string;
}

export interface ProjectRegistry {
    globalDocsPath: string;
    projects:       ProjectEntry[];
    [key: string]: unknown; // allow extra registry fields
}

export interface DocFile {
    filePath:    string;
    fileName:    string;
    projectName: string;
    sizeBytes:   number;
    content:     string;
    normalized:  string;
}
