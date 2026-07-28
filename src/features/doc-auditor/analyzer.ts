// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

// component: aud

import type { DocFile } from './types';

/** Jaccard word-overlap similarity, 0.0–1.0. */
export function computeSimilarity(a: string, b: string): number {
    if (!a || !b) { return 0; }
    const wordsA = new Set(a.split(' ').filter(w => w.length > 3));
    const wordsB = new Set(b.split(' ').filter(w => w.length > 3));
    if (!wordsA.size || !wordsB.size) { return 0; }
    let inter = 0;
    for (const w of wordsA) { if (wordsB.has(w)) { inter++; } }
    return inter / (wordsA.size + wordsB.size - inter);
}

const GLOBAL_CANDIDATE_PATTERNS = [
    /^CODING.?STANDARDS/i, /^TIER1.?LAWS/i, /^JAVASCRIPT.?STANDARDS/i,
    /^GIT.?WORKFLOW/i,     /^WEB.?COMPONENT/i, /^ARCHITECTURE.?PRINCIPLES/i,
    /^ONBOARDING/i,        /^COPILOT.?RULES/i, /^GLOBAL/i, /^STANDARDS/i,
];

// Requires the global-standard language to appear in a normative sentence ABOUT the file
// itself (e.g. "this document applies to all projects"), not just anywhere in the body —
// otherwise a doc merely *mentioning* "all projects" in an unrelated sentence (e.g.
// describing a feature that operates across projects) false-positives. See #667.
const SELF_REFERENTIAL_GLOBAL_RE =
    /\b(this (document|standard|guide|file|policy)|these (rules|standards|laws|guidelines))\b[\s\S]{0,80}?\b(applies?|apply) to (all projects|every project)\b|\bglobal standard\b[\s\S]{0,40}\bfor all projects\b/i;

export function isGlobalCandidate(file: DocFile): string | undefined {
    if (file.projectName === 'global') { return undefined; }
    const filenameMatches = GLOBAL_CANDIDATE_PATTERNS.some(p => p.test(file.fileName));
    const contentConfirms = SELF_REFERENTIAL_GLOBAL_RE.test(file.content);
    // Filename pattern alone is too weak a signal (e.g. TIER1-LAWS.md that's genuinely
    // project-specific) — require corroborating self-referential content evidence.
    if (filenameMatches && contentConfirms) {
        return `Filename "${file.fileName}" matches a global standards pattern, and content confirms project-wide applicability`;
    }
    if (contentConfirms) {
        return 'Content declares itself as a global standard applying to all projects';
    }
    return undefined;
}

// Files expected once per project — cross-project copies are NOT duplicates.
export const PER_PROJECT_EXEMPT = new Set([
    'claude.md', 'readme.md', 'changelog.md', 'license.md', 'license',
    'contributing.md', 'security.md', 'code_of_conduct.md',
]);

// "container" projects (lightweight organizational folders like `samples`, `tooling`,
// `settings`) deliberately ship near-identical boilerplate CLAUDE.md/README.md placeholders
// — these are expected, not real duplicates. See #667.
const CONTAINER_BOILERPLATE_FILES = new Set(['claude.md', 'readme.md']);

/** True if `doc` is an expected-identical boilerplate file from a "container" project. */
export function isContainerBoilerplate(doc: DocFile): boolean {
    return doc.projectStatus === 'container' && CONTAINER_BOILERPLATE_FILES.has(doc.fileName.toLowerCase());
}

/** Filter a byName map into duplicate groups, respecting per-project exemptions. */
export function filterDuplicates(byName: Map<string, DocFile[]>): Array<{ fileName: string; files: DocFile[] }> {
    const results: Array<{ fileName: string; files: DocFile[] }> = [];
    for (const [key, files] of byName) {
        if (files.length < 2) { continue; }
        if (PER_PROJECT_EXEMPT.has(key)) {
            const projectCounts = new Map<string, number>();
            for (const f of files) { projectCounts.set(f.projectName, (projectCounts.get(f.projectName) ?? 0) + 1); }
            if (![...projectCounts.values()].some(n => n > 1)) { continue; }
        }
        // Sub-group by byte count — only same-size files are true duplicates
        const bySizeMap = new Map<number, DocFile[]>();
        for (const f of files) {
            if (!bySizeMap.has(f.sizeBytes)) { bySizeMap.set(f.sizeBytes, []); }
            bySizeMap.get(f.sizeBytes)!.push(f);
        }
        for (const sameSize of bySizeMap.values()) {
            if (sameSize.length >= 2) {
                results.push({ fileName: sameSize[0].fileName, files: sameSize });
            }
        }
    }
    return results;
}

const ALWAYS_REFERENCED = new Set([
    'CLAUDE.md', 'README.md', 'CHANGELOG.md', 'LICENSE.md',
    'CONTRIBUTING.md', 'SECURITY.md', 'CODE_OF_CONDUCT.md',
]);

export function isOrphan(file: DocFile, allDocs: DocFile[]): string | undefined {
    if (ALWAYS_REFERENCED.has(file.fileName.toUpperCase()) || ALWAYS_REFERENCED.has(file.fileName)) { return undefined; }
    const baseName = file.fileName.replace(/\.md$/i, '');
    for (const other of allDocs) {
        if (other.filePath === file.filePath) { continue; }
        if (other.content.includes(file.fileName) || other.content.includes(baseName)) { return undefined; }
    }
    if (/CURRENT.?STATUS|PARKING.?LOT|TODAY|PROMPT.?HISTORY/i.test(file.fileName)) { return undefined; }
    return 'No other doc links to this file';
}
