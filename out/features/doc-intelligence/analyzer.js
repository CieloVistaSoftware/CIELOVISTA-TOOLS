"use strict";
// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyze = analyze;
/**
 * analyzer.ts — Runs all five checks in a single pass over the doc corpus.
 *
 * Checks:
 *   1. Duplicates        — same filename in 2+ locations
 *   2. Similar content   — >65% Jaccard word overlap
 *   3. Misplaced docs    — project docs with global-standard patterns
 *   4. Orphans           — no other doc links to this file
 *   5. Missing standards — README, CLAUDE.md, CHANGELOG per project
 */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
let _findingSeq = 0;
function nextId() { return `fi-${++_findingSeq}`; }
// ─── Similarity ───────────────────────────────────────────────────────────────
function jaccard(a, b) {
    const wa = new Set(a.split(' ').filter(w => w.length > 3));
    const wb = new Set(b.split(' ').filter(w => w.length > 3));
    if (!wa.size || !wb.size) {
        return 0;
    }
    let inter = 0;
    for (const w of wa) {
        if (wb.has(w)) {
            inter++;
        }
    }
    return inter / (wa.size + wb.size - inter);
}
// ─── Global candidate patterns ────────────────────────────────────────────────
const GLOBAL_PATTERNS = [
    /^CODING.?STANDARDS/i, /^JAVASCRIPT.?STANDARDS/i, /^GIT.?WORKFLOW/i,
    /^WEB.?COMPONENT/i, /^ARCHITECTURE/i, /^ONBOARDING/i,
    /^COPILOT.?RULES/i, /^GLOBAL/i, /^STANDARDS/i,
    /^TIER1/i,
];
function globalCandidateReason(file) {
    if (file.projectName === 'global') {
        return undefined;
    }
    for (const re of GLOBAL_PATTERNS) {
        if (re.test(file.fileName)) {
            return `Filename "${file.fileName}" matches a global standards pattern`;
        }
    }
    if (/all projects|ALL projects|every project|global standard/i.test(file.content)) {
        return 'Content uses global-standard language';
    }
    return undefined;
}
// ─── Orphan detection ─────────────────────────────────────────────────────────
const NEVER_ORPHAN = new Set([
    'CLAUDE.md', 'README.md', 'CHANGELOG.md', 'LICENSE.md',
    'CONTRIBUTING.md', 'SECURITY.md', 'CODE_OF_CONDUCT.md',
]);
const EXEMPT_PATTERN = /CURRENT.?STATUS|PARKING.?LOT|TODAY|PROMPT.?HISTORY/i;
function isOrphan(file, allDocs) {
    if (NEVER_ORPHAN.has(file.fileName) || EXEMPT_PATTERN.test(file.fileName)) {
        return false;
    }
    const base = file.fileName.replace(/\.md$/i, '');
    for (const other of allDocs) {
        if (other.filePath === file.filePath) {
            continue;
        }
        if (other.content.includes(file.fileName) || other.content.includes(base)) {
            return false;
        }
    }
    return true;
}
// ─── Root-level standard files ────────────────────────────────────────────────
/**
 * Files that every project is expected to have exactly one copy of at its root.
 * When ALL copies of a "duplicate" group are each sitting at a DIFFERENT project
 * root, they are NOT flagged — that is the intended one-per-project pattern.
 *
 * Only flag when:
 *   a) Two or more copies share the same project root, OR
 *   b) A copy lives inside a subfolder alongside a root-level copy
 *      (e.g. a README.md inside docs/ when one already exists at the project root)
 */
const ROOT_STANDARD_FILES = new Set([
    'readme.md', 'claude.md', 'changelog.md', 'license.md',
    'contributing.md', 'security.md', 'code_of_conduct.md',
    'current-status.md',
]);
/** Returns true if the file sits directly in a known project root folder. */
function isAtProjectRoot(filePath, projectRoots) {
    return projectRoots.has(path.dirname(filePath));
}
function analyze({ allDocs, projects, globalDocsPath }) {
    _findingSeq = 0;
    const findings = [];
    // Build the full set of project root paths for root-file detection
    const projectRoots = new Set(projects.map(p => p.path));
    if (globalDocsPath) {
        projectRoots.add(globalDocsPath);
    }
    // ── 1. Duplicates ─────────────────────────────────────────────────────────
    const byName = new Map();
    for (const doc of allDocs) {
        const key = doc.fileName.toLowerCase();
        if (!byName.has(key)) {
            byName.set(key, []);
        }
        byName.get(key).push(doc);
    }
    for (const [, files] of byName) {
        if (files.length < 2) {
            continue;
        }
        const fn = files[0].fileName;
        const fnKey = fn.toLowerCase();
        // ── Root-file exemption ───────────────────────────────────────────────
        // README.md, CLAUDE.md, CHANGELOG.md etc. are expected once per project.
        // Skip the group when every copy sits at a distinct project root.
        if (ROOT_STANDARD_FILES.has(fnKey)) {
            const rootCopies = files.filter(f => isAtProjectRoot(f.filePath, projectRoots));
            const nestedCopies = files.filter(f => !isAtProjectRoot(f.filePath, projectRoots));
            const rootDirs = rootCopies.map(f => path.dirname(f.filePath));
            const allDistinct = new Set(rootDirs).size === rootDirs.length;
            // Case A: every copy is at a different project root — completely normal, skip
            if (nestedCopies.length === 0 && allDistinct) {
                continue;
            }
            // Case B: root copies are fine but there are also nested copies — report only the nested ones
            if (nestedCopies.length > 0 && rootCopies.length > 0) {
                const affectedProjects = [...new Set(files.map(f => f.projectName))];
                findings.push({
                    id: nextId(),
                    kind: 'duplicate',
                    severity: 'yellow',
                    title: `Duplicate: ${fn} — nested copy outside project root`,
                    reason: `Root-level copies are expected. Extra nested copies found in: ${nestedCopies.map(f => f.projectName).join(', ')}`,
                    recommendation: `Root-level ${fn} files are intentional. Review and remove the nested copies if they are redundant.`,
                    action: 'merge',
                    paths: [...rootCopies, ...nestedCopies].map(f => f.filePath),
                    projects: affectedProjects,
                    priority: 50,
                    meta: { copies: files.length },
                });
                continue;
            }
            // Case C: multiple copies in the same root (unusual) — fall through to normal duplicate logic below
        }
        // ── Standard duplicate logic ──────────────────────────────────────────
        const isProjectSpecific = /^CLAUDE\.md$|^CURRENT-STATUS\.md$/i.test(fn);
        const projNames = files.map(f => f.projectName);
        findings.push({
            id: nextId(),
            kind: 'duplicate',
            severity: isProjectSpecific ? 'info' : 'yellow',
            title: `Duplicate: ${fn} — ${files.length} copies`,
            reason: `Found in: ${projNames.join(', ')}`,
            recommendation: isProjectSpecific
                ? `${fn} is project-specific — keep all copies unless content is truly identical.`
                : `Review each copy. Keep the most complete version and delete the rest, or merge into one.`,
            action: 'merge',
            paths: files.map(f => f.filePath),
            projects: projNames,
            priority: isProjectSpecific ? 20 : 60,
            meta: { copies: files.length },
        });
    }
    // ── 2. Similar content ────────────────────────────────────────────────────
    const compared = new Set();
    for (let i = 0; i < allDocs.length; i++) {
        for (let j = i + 1; j < allDocs.length; j++) {
            const a = allDocs[i];
            const b = allDocs[j];
            if (a.fileName.toLowerCase() === b.fileName.toLowerCase()) {
                continue;
            }
            if (a.sizeBytes < 100 || b.sizeBytes < 100) {
                continue;
            }
            const key = [a.filePath, b.filePath].sort().join('::');
            if (compared.has(key)) {
                continue;
            }
            compared.add(key);
            const score = jaccard(a.normalized, b.normalized);
            if (score < 0.65) {
                continue;
            }
            const pct = Math.round(score * 100);
            findings.push({
                id: nextId(),
                kind: 'similar',
                severity: score >= 0.85 ? 'yellow' : 'info',
                title: `${pct}% similar: ${a.fileName} ↔ ${b.fileName}`,
                reason: `${a.projectName}/${a.fileName} overlaps ${b.projectName}/${b.fileName} by ${pct}%`,
                recommendation: score >= 0.85
                    ? `These files are nearly identical. Diff them, then merge into one canonical version.`
                    : `These files share significant content. Diff them to decide if they should be merged.`,
                action: 'diff',
                paths: [a.filePath, b.filePath],
                projects: [a.projectName, b.projectName],
                priority: Math.round(score * 50),
                meta: { similarity: pct },
            });
        }
    }
    // ── 3. Misplaced docs ─────────────────────────────────────────────────────
    for (const doc of allDocs) {
        const reason = globalCandidateReason(doc);
        if (!reason) {
            continue;
        }
        findings.push({
            id: nextId(),
            kind: 'misplaced',
            severity: 'yellow',
            title: `Misplaced: ${doc.projectName}/${doc.fileName}`,
            reason,
            recommendation: `Move to CieloVistaStandards so all projects reference one copy.`,
            action: 'move-to-global',
            paths: [doc.filePath],
            projects: [doc.projectName],
            priority: 45,
        });
    }
    // ── 4. Orphans ────────────────────────────────────────────────────────────
    for (const doc of allDocs) {
        if (!isOrphan(doc, allDocs)) {
            continue;
        }
        findings.push({
            id: nextId(),
            kind: 'orphan',
            severity: 'info',
            title: `Orphan: ${doc.projectName}/${doc.fileName}`,
            reason: `No other doc links to ${doc.fileName}`,
            recommendation: `Open and review. If no longer needed, delete it. If still needed, add a link from CLAUDE.md or README.md.`,
            action: 'open',
            paths: [doc.filePath],
            projects: [doc.projectName],
            priority: 25,
        });
    }
    // ── 5. Missing standards per project ─────────────────────────────────────
    for (const project of projects) {
        if (!fs.existsSync(project.path)) {
            continue;
        }
        const hasReadme = fs.existsSync(path.join(project.path, 'README.md'));
        const hasClaude = fs.existsSync(path.join(project.path, 'CLAUDE.md'));
        const hasChangelog = fs.existsSync(path.join(project.path, 'CHANGELOG.md'));
        if (!hasReadme) {
            findings.push({
                id: nextId(),
                kind: 'missing-readme',
                severity: 'red',
                title: `Missing README: ${project.name}`,
                reason: `${project.name} has no README.md`,
                recommendation: `Generate a README using "Generate Single README (AI)" or create one from the template.`,
                action: 'create',
                paths: [path.join(project.path, 'README.md')],
                projects: [project.name],
                priority: 85,
            });
        }
        if (!hasClaude) {
            findings.push({
                id: nextId(),
                kind: 'missing-claude',
                severity: 'red',
                title: `Missing CLAUDE.md: ${project.name}`,
                reason: `${project.name} has no CLAUDE.md — Claude starts every session cold`,
                recommendation: `Create CLAUDE.md with project name, build command, and session-start instructions.`,
                action: 'create',
                paths: [path.join(project.path, 'CLAUDE.md')],
                projects: [project.name],
                priority: 90,
            });
        }
        if (!hasChangelog) {
            findings.push({
                id: nextId(),
                kind: 'missing-changelog',
                severity: 'yellow',
                title: `Missing CHANGELOG: ${project.name}`,
                reason: `${project.name} has no CHANGELOG.md`,
                recommendation: `Run "Fix All Marketplace Issues" to auto-generate a CHANGELOG from the package.json version.`,
                action: 'create',
                paths: [path.join(project.path, 'CHANGELOG.md')],
                projects: [project.name],
                priority: 55,
            });
        }
    }
    // Sort by priority descending — most urgent first
    findings.sort((a, b) => b.priority - a.priority);
    return findings;
}
//# sourceMappingURL=analyzer.js.map