// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * analyzer.ts — Runs all checks in a single pass over the doc corpus.
 *
 * Checks (in priority order):
 *   1. Exact duplicates   — byte-for-byte identical (hash match)
 *   2. Folder duplicates  — entire folder contents match another folder
 *   3. Similar duplicates — same filename, ≥50% Jaccard overlap
 *   4. Similar content    — different names, ≥65% Jaccard overlap
 *   5. Misplaced docs     — project docs with global-standard patterns
 *   6. Orphans            — no other doc links to this file
 *   7. Missing standards  — README, CLAUDE.md, CHANGELOG per project
 */

import * as crypto from 'crypto';
import * as fs     from 'fs';
import * as path   from 'path';
import type { ArtifactFolder, DocFile, Finding, ProjectEntry } from './types';

let _findingSeq = 0;
function nextId(): string { return `fi-${++_findingSeq}`; }

// ─── Similarity ───────────────────────────────────────────────────────────────

function jaccard(a: string, b: string): number {
    const wa = new Set(a.split(' ').filter(w => w.length > 3));
    const wb = new Set(b.split(' ').filter(w => w.length > 3));
    if (!wa.size || !wb.size) { return 0; }
    let inter = 0;
    for (const w of wa) { if (wb.has(w)) { inter++; } }
    return inter / (wa.size + wb.size - inter);
}

// ─── Smart "which copy to keep" scoring ──────────────────────────────────────
//
// Higher score = better candidate to keep.
//   +30  Most recently modified
//   +20  Sitting directly at a project root
//   +15  Longest content (most complete)
//   +10  In a named project (not the catch-all 'global' folder)

function scoreKeep(file: DocFile, cluster: DocFile[], projectRoots: Set<string>): number {
    let score = 0;
    const maxMtime = Math.max(...cluster.map(f => f.mtime));
    const maxSize  = Math.max(...cluster.map(f => f.sizeBytes));
    if (file.mtime     === maxMtime) { score += 30; }
    if (isAtRoot(file.filePath, projectRoots)) { score += 20; }
    if (file.sizeBytes === maxSize)  { score += 15; }
    if (file.projectName !== 'global') { score += 10; }
    return score;
}

function isAtRoot(filePath: string, projectRoots: Set<string>): boolean {
    return projectRoots.has(path.dirname(filePath));
}

function keepReason(file: DocFile, cluster: DocFile[], projectRoots: Set<string>): string {
    const reasons: string[] = [];
    const maxMtime = Math.max(...cluster.map(f => f.mtime));
    const maxSize  = Math.max(...cluster.map(f => f.sizeBytes));
    if (file.mtime === maxMtime) { reasons.push('most recently modified'); }
    if (isAtRoot(file.filePath, projectRoots)) { reasons.push('at project root'); }
    if (file.sizeBytes === maxSize && cluster.some(f => f.sizeBytes !== maxSize)) {
        reasons.push('largest copy');
    }
    return reasons.length > 0 ? reasons.join(', ') : 'highest overall score';
}

function fmtBytes(n: number): string {
    if (n >= 1024 * 1024) { return (n / (1024 * 1024)).toFixed(1) + ' MB'; }
    if (n >= 1024)        { return (n / 1024).toFixed(1) + ' KB'; }
    return n + ' B';
}

// ─── Folder fingerprinting ────────────────────────────────────────────────────
//
// A folder fingerprint = SHA-256 of sorted "relpath::hash" pairs for all .md
// files inside it. Two folders with the same fingerprint are exact copies.

function folderFingerprint(folderPath: string, files: DocFile[]): string {
    const sep = path.sep;
    const inside = files
        .filter(f => f.filePath.startsWith(folderPath + sep) || f.filePath.startsWith(folderPath + '/'))
        .map(f => {
            const rel = path.relative(folderPath, f.filePath).replace(/\\/g, '/');
            return `${rel}::${f.hash}`;
        })
        .sort();
    if (inside.length === 0) { return ''; }
    return crypto.createHash('sha256').update(inside.join('\n')).digest('hex');
}

// ─── Global candidate patterns ────────────────────────────────────────────────

const GLOBAL_PATTERNS = [
    /^CODING.?STANDARDS/i, /^JAVASCRIPT.?STANDARDS/i, /^GIT.?WORKFLOW/i,
    /^WEB.?COMPONENT/i,    /^ARCHITECTURE/i,           /^ONBOARDING/i,
    /^COPILOT.?RULES/i,    /^GLOBAL/i,                 /^STANDARDS/i,
    /^TIER1/i,
];

function globalCandidateReason(file: DocFile): string | undefined {
    if (file.projectName === 'global') { return undefined; }
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

// Files intentionally placed in every project folder for AI context.
// Identical copies across projects are by design — never flag as duplicates.
const AI_CONTEXT_FILES = new Set([
    'copilot-rules.md', 'claude.md', 'copilot-instructions.md',
    '.cursorrules', 'aider.conf.md',
]);

function isOrphan(file: DocFile, allDocs: DocFile[]): boolean {
    if (NEVER_ORPHAN.has(file.fileName) || EXEMPT_PATTERN.test(file.fileName)) { return false; }
    const base = file.fileName.replace(/\.md$/i, '');
    for (const other of allDocs) {
        if (other.filePath === file.filePath) { continue; }
        if (other.content.includes(file.fileName) || other.content.includes(base)) { return false; }
    }
    return true;
}

// ─── Root-level standard files ────────────────────────────────────────────────

const ROOT_STANDARD_FILES = new Set([
    'readme.md', 'claude.md', 'changelog.md', 'license.md',
    'contributing.md', 'security.md', 'code_of_conduct.md', 'current-status.md',
]);

// ─── Main analysis ────────────────────────────────────────────────────────────

export interface AnalysisInput {
    allDocs:          DocFile[];
    projects:         ProjectEntry[];
    globalDocsPath?:  string;
    artifactFolders?: ArtifactFolder[];
}

export function analyze({ allDocs, projects, globalDocsPath, artifactFolders }: AnalysisInput): Finding[] {
    _findingSeq = 0;
    const findings: Finding[] = [];
    const projectRoots = new Set<string>(projects.map(p => p.path));
    if (globalDocsPath) { projectRoots.add(globalDocsPath); }

    // ── 1. Exact duplicates (hash-based) ──────────────────────────────────────

    const byHash = new Map<string, DocFile[]>();
    for (const doc of allDocs) {
        if (!byHash.has(doc.hash)) { byHash.set(doc.hash, []); }
        byHash.get(doc.hash)!.push(doc);
    }

    const exactHashes = new Set<string>(); // hashes already handled as exact-duplicate

    for (const [hash, cluster] of byHash) {
        if (cluster.length < 2) { continue; }
        // Skip AI context files — identical copies in every project are intentional
        if (AI_CONTEXT_FILES.has(cluster[0].fileName.toLowerCase())) { exactHashes.add(hash); continue; }
        exactHashes.add(hash);

        const scored = cluster.map(f => ({ file: f, score: scoreKeep(f, cluster, projectRoots) }));
        scored.sort((a, b) => b.score - a.score || b.file.mtime - a.file.mtime);
        const keeper  = scored[0].file;
        const deletes = scored.slice(1).map(s => s.file);
        const wasted  = deletes.reduce((sum, f) => sum + f.sizeBytes, 0);

        findings.push({
            id:             nextId(),
            kind:           'exact-duplicate',
            severity:       'yellow',
            title:          `Exact duplicate: ${keeper.fileName} — ${cluster.length} identical copies`,
            reason:         `${cluster.length} files have byte-for-byte identical content across: ${[...new Set(cluster.map(f => f.projectName))].join(', ')}`,
            recommendation: `Keep the copy in ${keeper.projectName} (${keepReason(keeper, cluster, projectRoots)}) and delete the other ${deletes.length}.`,
            action:         'keep-newest-delete-rest',
            paths:          [keeper.filePath, ...deletes.map(f => f.filePath)],
            projects:       [...new Set(cluster.map(f => f.projectName))],
            priority:       95,
            keepPath:       keeper.filePath,
            keepReason:     keepReason(keeper, cluster, projectRoots),
            wastedBytes:    wasted,
            meta:           { copies: cluster.length, wastedBytes: wasted, wastedFmt: fmtBytes(wasted), keepProject: keeper.projectName },
        });
    }

    // ── 2. Folder duplicates ──────────────────────────────────────────────────

    const allFolders = new Set<string>();
    for (const doc of allDocs) { allFolders.add(path.dirname(doc.filePath)); }

    const byFingerprint = new Map<string, string[]>();
    for (const folder of allFolders) {
        const fp = folderFingerprint(folder, allDocs);
        if (!fp) { continue; }
        if (!byFingerprint.has(fp)) { byFingerprint.set(fp, []); }
        byFingerprint.get(fp)!.push(folder);
    }

    for (const [, folders] of byFingerprint) {
        if (folders.length < 2) { continue; }
        const sorted  = [...folders].sort((a, b) => a.length - b.length);
        const keeper  = sorted[0];
        const others  = sorted.slice(1);
        const inside  = allDocs.filter(f => f.filePath.startsWith(keeper + path.sep) || f.filePath.startsWith(keeper + '/'));
        const wasted  = inside.reduce((s, f) => s + f.sizeBytes, 0) * others.length;

        findings.push({
            id:             nextId(),
            kind:           'folder-duplicate',
            severity:       'yellow',
            title:          `Folder duplicate: ${path.basename(keeper)} — ${folders.length} identical copies`,
            reason:         `All ${inside.length} files inside are byte-for-byte identical. Folders: ${folders.map(f => path.basename(f)).join(', ')}`,
            recommendation: `Keep ${keeper} and delete the other ${others.length} folder(s). Would free ${fmtBytes(wasted)}.`,
            action:         'delete-folder',
            paths:          [keeper, ...others],
            projects:       [...new Set(allDocs
                .filter(f => folders.some(fd => f.filePath.startsWith(fd + path.sep) || f.filePath.startsWith(fd + '/')))
                .map(f => f.projectName))],
            priority:       88,
            keepPath:       keeper,
            wastedBytes:    wasted,
            meta:           { folders: folders.length, files: inside.length, wastedBytes: wasted, wastedFmt: fmtBytes(wasted) },
        });
    }

    // ── 3. Filename duplicates (non-exact, ≥50% similar) ─────────────────────

    const byName = new Map<string, DocFile[]>();
    for (const doc of allDocs) {
        if (exactHashes.has(doc.hash)) { continue; }
        const key = doc.fileName.toLowerCase();
        if (!byName.has(key)) { byName.set(key, []); }
        byName.get(key)!.push(doc);
    }

    for (const [, files] of byName) {
        if (files.length < 2) { continue; }
        const fn    = files[0].fileName;
        const fnKey = fn.toLowerCase();

        // Standard root files (README.md, CLAUDE.md, etc.) are intentionally present in
        // every project. A duplicate is same content — already caught by check #1 (hash).
        // Sharing a filename with different content is not a duplicate.
        if (ROOT_STANDARD_FILES.has(fnKey)) { continue; }
        // AI context files are deliberately identical across all project folders — skip.
        if (AI_CONTEXT_FILES.has(fnKey)) { continue; }

        const groups: DocFile[][] = [];
        const used = new Set<number>();
        for (let i = 0; i < files.length; i++) {
            if (used.has(i)) { continue; }
            const group = [files[i]];
            used.add(i);
            for (let j = 0; j < files.length; j++) {
                if (i === j || used.has(j)) { continue; }
                try { if (jaccard(files[i].content, files[j].content) >= 0.5) { group.push(files[j]); used.add(j); } } catch { /* skip */ }
            }
            if (group.length > 1) { groups.push(group); }
        }

        for (const group of groups) {
            const isProjectSpecific = /^CLAUDE\.md$|^CURRENT-STATUS\.md$/i.test(fn);
            findings.push({
                id: nextId(), kind: 'duplicate', severity: isProjectSpecific ? 'info' : 'yellow',
                title: `Similar duplicate: ${fn} — ${group.length} copies (≥50% similar)`,
                reason: `Found in: ${group.map(f => f.projectName).join(', ')}`,
                recommendation: isProjectSpecific
                    ? `${fn} is project-specific — keep all copies unless content is truly identical.`
                    : `Review each copy. Keep the most complete version and delete the rest, or merge.`,
                action: 'merge', paths: group.map(f => f.filePath),
                projects: group.map(f => f.projectName), priority: isProjectSpecific ? 20 : 60,
                meta: { copies: group.length },
            });
        }
    }

    // ── 4. Similar content (different filenames) ──────────────────────────────

    const compared = new Set<string>();
    for (let i = 0; i < allDocs.length; i++) {
        for (let j = i + 1; j < allDocs.length; j++) {
            const a = allDocs[i];
            const b = allDocs[j];
            if (a.fileName.toLowerCase() === b.fileName.toLowerCase()) { continue; }
            if (a.sizeBytes < 100 || b.sizeBytes < 100) { continue; }
            if (exactHashes.has(a.hash) && exactHashes.has(b.hash)) { continue; }
            const key = [a.filePath, b.filePath].sort().join('::');
            if (compared.has(key)) { continue; }
            compared.add(key);
            const score = jaccard(a.normalized, b.normalized);
            if (score < 0.65) { continue; }
            const pct = Math.round(score * 100);
            findings.push({
                id: nextId(), kind: 'similar', severity: score >= 0.85 ? 'yellow' : 'info',
                title: `${pct}% similar: ${a.fileName} ↔ ${b.fileName}`,
                reason: `${a.projectName}/${a.fileName} overlaps ${b.projectName}/${b.fileName} by ${pct}%`,
                recommendation: score >= 0.85
                    ? `These files are nearly identical despite different names. Diff, then merge into one canonical version.`
                    : `These files share significant content. Diff them to decide if they should be merged.`,
                action: 'diff', paths: [a.filePath, b.filePath],
                projects: [a.projectName, b.projectName], priority: Math.round(score * 50), meta: { similarity: pct },
            });
        }
    }

    // ── 5. Misplaced docs ─────────────────────────────────────────────────────
    for (const doc of allDocs) {
        const reason = globalCandidateReason(doc);
        if (!reason) { continue; }
        findings.push({
            id: nextId(), kind: 'misplaced', severity: 'yellow',
            title: `Misplaced: ${doc.projectName}/${doc.fileName}`, reason,
            recommendation: `Move to CieloVistaStandards so all projects reference one copy.`,
            action: 'move-to-global', paths: [doc.filePath], projects: [doc.projectName], priority: 45,
        });
    }

    // ── 6. Orphans ────────────────────────────────────────────────────────────
    for (const doc of allDocs) {
        if (!isOrphan(doc, allDocs)) { continue; }
        findings.push({
            id: nextId(), kind: 'orphan', severity: 'info',
            title: `Orphan: ${doc.projectName}/${doc.fileName}`,
            reason: `No other doc links to ${doc.fileName}`,
            recommendation: `Open and review. Delete if no longer needed, or link from CLAUDE.md or README.md.`,
            action: 'open', paths: [doc.filePath], projects: [doc.projectName], priority: 25,
        });
    }

    // ── 7. Missing standards ──────────────────────────────────────────────────
    for (const project of projects) {
        if (!fs.existsSync(project.path)) { continue; }
        const has = (f: string) => fs.existsSync(path.join(project.path, f));
        if (!has('README.md')) {
            findings.push({ id: nextId(), kind: 'missing-readme', severity: 'red',
                title: `Missing README: ${project.name}`, reason: `${project.name} has no README.md`,
                recommendation: `Generate a README or create one from the template.`,
                action: 'create', paths: [path.join(project.path, 'README.md')], projects: [project.name], priority: 85 });
        }
        if (!has('CLAUDE.md')) {
            findings.push({ id: nextId(), kind: 'missing-claude', severity: 'red',
                title: `Missing CLAUDE.md: ${project.name}`, reason: `${project.name} has no CLAUDE.md`,
                recommendation: `Create CLAUDE.md with project name, build command, and session-start instructions.`,
                action: 'create', paths: [path.join(project.path, 'CLAUDE.md')], projects: [project.name], priority: 90 });
        }
        if (!has('CHANGELOG.md')) {
            findings.push({ id: nextId(), kind: 'missing-changelog', severity: 'yellow',
                title: `Missing CHANGELOG: ${project.name}`, reason: `${project.name} has no CHANGELOG.md`,
                recommendation: `Run "Fix All Marketplace Issues" to auto-generate a CHANGELOG.`,
                action: 'create', paths: [path.join(project.path, 'CHANGELOG.md')], projects: [project.name], priority: 55 });
        }
    }

    // ── 8. Test artifact folders ──────────────────────────────────────────────
    for (const af of artifactFolders ?? []) {
        const fmtSize = fmtBytes(af.sizeBytes);
        findings.push({
            id: nextId(), kind: 'test-artifact', severity: 'info',
            title: `Test artifacts: ${af.projectName}/${af.folderName} — ${af.fileCount} file${af.fileCount !== 1 ? 's' : ''}`,
            reason: `${af.folderPath} is a generated Playwright output folder (${fmtSize}). Not real documentation.`,
            recommendation: `Safe to delete after reviewing any test failures. Run "Playwright: Clean Test Results" to remove all at once.`,
            action: 'delete-folder',
            paths: [af.folderPath],
            projects: [af.projectName],
            priority: 30,
            wastedBytes: af.sizeBytes,
            meta: { files: af.fileCount, wastedBytes: af.sizeBytes, wastedFmt: fmtSize },
        });
    }

    // ── 9. Subject/category misalignment ─────────────────────────────────────
    // category: "700 — Project Docs" → leading number 700
    // subject:  "300.9"              → integer part 300
    // Rule: the integer part of the Dewey must equal the category's leading number.
    // e.g. subject 150.6 + category "150 — Meta" → 150 === 150 → OK (no mismatch)
    //      subject 300.9 + category "700 — Project Docs" → 300 !== 700 → mismatch

    const mismatches: Array<{ filePath: string; fileName: string; projectName: string; dewey: string; category: string; proposed: string }> = [];

    for (const doc of allDocs) {
        if (!doc.fmDewey || !doc.fmCategory) { continue; }
        const subjectNum = parseFloat(doc.fmDewey);
        if (isNaN(subjectNum)) { continue; }
        const subjectBase = Math.floor(subjectNum);   // integer part: 150.6 → 150
        const catMatch = doc.fmCategory.match(/^(\d+)/);
        if (!catMatch) { continue; }
        const categoryNum = parseInt(catMatch[1], 10);
        if (subjectBase === categoryNum) { continue; }
        const label    = doc.fmCategory.replace(/^\d+\s*[—\-]\s*/, '');
        const proposed = `${subjectBase} — ${label}`;
        mismatches.push({ filePath: doc.filePath, fileName: doc.fileName, projectName: doc.projectName, dewey: doc.fmDewey, category: doc.fmCategory, proposed });
    }

    if (mismatches.length > 0) {
        findings.push({
            id:             nextId(),
            kind:           'subject-mismatch',
            severity:       'red',
            title:          `Subject/category mismatch — ${mismatches.length} doc${mismatches.length !== 1 ? 's' : ''}`,
            reason:         `${mismatches.length} doc${mismatches.length !== 1 ? 's have' : ' has'} a category number that doesn't match the subject prefix`,
            recommendation: `Update each doc's Dewey subject so its integer part matches the category's leading number.`,
            action:         'none',
            paths:          mismatches.map(m => m.filePath),
            projects:       [...new Set(mismatches.map(m => m.projectName))],
            priority:       80,
            meta:           { count: mismatches.length, mismatches: JSON.stringify(mismatches) },
        });
    }

    // ── 10. Stale docs (status:active, untouched 90+ days) ───────────────────
    const STALE_MS  = 90 * 24 * 60 * 60 * 1000;
    const DRAFT_MS  = 30 * 24 * 60 * 60 * 1000;
    const now       = Date.now();

    for (const doc of allDocs) {
        const age = now - doc.mtime;
        if (doc.fmStatus === 'active' && age > STALE_MS) {
            const days = Math.floor(age / (24 * 60 * 60 * 1000));
            findings.push({
                id: nextId(), kind: 'stale-doc', severity: 'yellow',
                title: `Stale doc: ${doc.projectName}/${doc.fileName} — ${days} days`,
                reason: `Marked status:active but not modified in ${days} days`,
                recommendation: `Review and update, or change status to draft or archived if no longer relevant.`,
                action: 'open', paths: [doc.filePath], projects: [doc.projectName], priority: 22,
            });
        }
    }

    // ── 11. Draft rot (status:draft, untouched 30+ days) ─────────────────────
    for (const doc of allDocs) {
        const age = now - doc.mtime;
        if (doc.fmStatus === 'draft' && age > DRAFT_MS) {
            const days = Math.floor(age / (24 * 60 * 60 * 1000));
            findings.push({
                id: nextId(), kind: 'draft-rot', severity: 'yellow',
                title: `Draft rot: ${doc.projectName}/${doc.fileName} — ${days} days`,
                reason: `Stuck in draft for ${days} days — never promoted to active`,
                recommendation: `Either finish and promote to status:active, or archive it if no longer needed.`,
                action: 'open', paths: [doc.filePath], projects: [doc.projectName], priority: 18,
            });
        }
    }

    // ── 12. Thin/missing description ──────────────────────────────────────────
    for (const doc of allDocs) {
        const desc  = (doc.fmDescription ?? '').trim();
        const title = (doc.fmTitle ?? '').trim().toLowerCase();
        const isThin = !desc || desc.length < 20 || desc.toLowerCase() === title;
        if (!isThin) { continue; }
        const reason = !desc ? 'description field is missing'
                     : desc.length < 20 ? `description is too short (${desc.length} chars)`
                     : 'description is identical to the title';
        findings.push({
            id: nextId(), kind: 'thin-description', severity: 'yellow',
            title: `Thin description: ${doc.projectName}/${doc.fileName}`,
            reason,
            recommendation: `Add a meaningful one-line description (20–200 chars) explaining what this doc covers.`,
            action: 'open', paths: [doc.filePath], projects: [doc.projectName], priority: 15,
        });
    }

    findings.sort((a, b) => b.priority - a.priority);
    return findings;
}
