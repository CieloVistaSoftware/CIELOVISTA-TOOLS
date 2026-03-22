"use strict";
// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeSimilarity = computeSimilarity;
exports.isGlobalCandidate = isGlobalCandidate;
exports.isOrphan = isOrphan;
/** Jaccard word-overlap similarity, 0.0–1.0. */
function computeSimilarity(a, b) {
    if (!a || !b) {
        return 0;
    }
    const wordsA = new Set(a.split(' ').filter(w => w.length > 3));
    const wordsB = new Set(b.split(' ').filter(w => w.length > 3));
    if (!wordsA.size || !wordsB.size) {
        return 0;
    }
    let inter = 0;
    for (const w of wordsA) {
        if (wordsB.has(w)) {
            inter++;
        }
    }
    return inter / (wordsA.size + wordsB.size - inter);
}
const GLOBAL_CANDIDATE_PATTERNS = [
    /^CODING.?STANDARDS/i, /^TIER1.?LAWS/i, /^JAVASCRIPT.?STANDARDS/i,
    /^GIT.?WORKFLOW/i, /^WEB.?COMPONENT/i, /^ARCHITECTURE.?PRINCIPLES/i,
    /^ONBOARDING/i, /^COPILOT.?RULES/i, /^GLOBAL/i, /^STANDARDS/i,
];
function isGlobalCandidate(file) {
    if (file.projectName === 'global') {
        return undefined;
    }
    for (const p of GLOBAL_CANDIDATE_PATTERNS) {
        if (p.test(file.fileName)) {
            return `Filename "${file.fileName}" matches a global standards pattern`;
        }
    }
    if (file.content.includes('all projects') || file.content.includes('every project') ||
        file.content.includes('global standard')) {
        return 'Content uses global-standard language ("all projects", "global standard")';
    }
    return undefined;
}
const ALWAYS_REFERENCED = new Set([
    'CLAUDE.md', 'README.md', 'CHANGELOG.md', 'LICENSE.md',
    'CONTRIBUTING.md', 'SECURITY.md', 'CODE_OF_CONDUCT.md',
]);
function isOrphan(file, allDocs) {
    if (ALWAYS_REFERENCED.has(file.fileName.toUpperCase()) || ALWAYS_REFERENCED.has(file.fileName)) {
        return undefined;
    }
    const baseName = file.fileName.replace(/\.md$/i, '');
    for (const other of allDocs) {
        if (other.filePath === file.filePath) {
            continue;
        }
        if (other.content.includes(file.fileName) || other.content.includes(baseName)) {
            return undefined;
        }
    }
    if (/CURRENT.?STATUS|PARKING.?LOT|TODAY|PROMPT.?HISTORY/i.test(file.fileName)) {
        return undefined;
    }
    return 'No other doc links to this file';
}
//# sourceMappingURL=analyzer.js.map