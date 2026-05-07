// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * types.ts — Unified finding types for Doc Intelligence.
 */

export type FindingKind =
    | 'exact-duplicate'  // byte-for-byte identical content (hash match)
    | 'folder-duplicate' // entire folder is an exact copy of another folder
    | 'duplicate'        // same filename, ≥50% similar content
    | 'similar'          // different name, ≥65% Jaccard overlap
    | 'misplaced'        // project doc that belongs in global standards
    | 'orphan'           // no other doc links to this file
    | 'missing-readme'
    | 'missing-claude'
    | 'missing-changelog';

export type FindingSeverity = 'red' | 'yellow' | 'info';

export type FindingAction =
    | 'keep-newest-delete-rest' // keep recommended copy, trash the rest
    | 'delete-file'             // trash a single file
    | 'delete-folder'           // trash an entire folder
    | 'merge'                   // merge multiple files into one
    | 'diff'                    // open side-by-side diff (read-only)
    | 'move-to-global'          // copy to CieloVistaStandards, delete original
    | 'delete'                  // legacy delete
    | 'open'
    | 'create'
    | 'none';

/** One issue found during the intelligence scan. */
export interface Finding {
    id:             string;
    kind:           FindingKind;
    severity:       FindingSeverity;
    title:          string;
    reason:         string;
    recommendation: string;
    action:         FindingAction;

    /** All paths involved. For exact-duplicate, paths[0] = recommended keeper. */
    paths:          string[];
    projects:       string[];
    priority:       number;
    decision?:      'accepted' | 'skipped' | 'pending';

    /** Extra display context */
    meta?:          Record<string, string | number>;

    /** For exact-duplicate: the path recommended to keep, with the reason why */
    keepPath?:      string;
    keepReason?:    string;

    /** Bytes that would be freed if duplicates were deleted */
    wastedBytes?:   number;
}

export interface IntelligenceReport {
    scannedAt:    string;
    durationMs:   number;
    totalDocs:    number;
    projects:     number;
    findings:     Finding[];
    wastedBytes:  number;
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
    [key: string]: unknown;
}

export interface DocFile {
    filePath:    string;
    fileName:    string;
    projectName: string;
    sizeBytes:   number;
    content:     string;
    normalized:  string;
    hash:        string;
    mtime:       number;
}
