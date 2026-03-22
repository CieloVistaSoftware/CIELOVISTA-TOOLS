// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

export interface DocFile {
    filePath:    string;
    fileName:    string;
    projectName: string;
    sizeBytes:   number;
    content:     string;
    normalized:  string;
}

export interface DuplicateGroup {
    fileName: string;
    files:    DocFile[];
}

export interface SimilarGroup {
    similarity: number;
    fileA:      DocFile;
    fileB:      DocFile;
    reason:     string;
}

export interface MoveCandidate {
    file:   DocFile;
    reason: string;
}

export interface OrphanFile {
    file:   DocFile;
    reason: string;
}

export interface AuditResults {
    duplicates:       DuplicateGroup[];
    similar:          SimilarGroup[];
    moveCandidates:   MoveCandidate[];
    orphans:          OrphanFile[];
    totalDocsScanned: number;
    projectsScanned:  number;
    warningCandidates?: MoveCandidate[];
}

export type FindingKind = 'duplicate' | 'similar' | 'move' | 'orphan';

export interface Finding {
    kind:          FindingKind;
    title:         string;
    description:   string;
    primaryPaths:  string[];
    secondaryPath?: string;
}

export interface ParsedAction {
    label:   string;
    kind:    'merge' | 'diff' | 'move-to-global' | 'delete' | 'open';
    paths:   string[];
    context: string;
}
