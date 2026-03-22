// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * docs-audit-utils.ts
 *
 * Shared pure functions for scanning, analyzing, and recommending actions
 * for documentation health across all CieloVista projects and the global standards folder.
 *
 * Used by the unified docs-manager audit/recommend/fix workflow.
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProjectEntry {
    name: string;
    path: string;
    type: string;
    description: string;
}

export interface ProjectRegistry {
    globalDocsPath: string;
    projects: ProjectEntry[];
}

export interface DocFile {
    filePath: string;
    fileName: string;
    projectName: string;
    sizeBytes: number;
    content: string;
    normalized: string;
}

export type AuditIssueType =
    | 'duplicate'
    | 'near-match'
    | 'move-candidate'
    | 'orphan'
    | 'missing-standard'
    | 'broken-reference';

export interface AuditIssue {
    type: AuditIssueType;
    files: DocFile[];
    recommendation: string;
    rationale: string;
    canAutoFix: boolean;
}

export interface AuditReport {
    issues: AuditIssue[];
    allDocs: DocFile[];
    summary: Record<string, number>;
}

// ─── Doc Collection ───────────────────────────────────────────────────────────

/** Recursively collects all markdown docs under a directory (max 3 levels deep). */
export function collectDocs(rootPath: string, projectName: string, maxDepth = 3): DocFile[] {
    const results: DocFile[] = [];
    function walk(dir: string, depth: number): void {
        if (depth > maxDepth) return;
        if (!fs.existsSync(dir)) return;
        let entries: fs.Dirent[];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const entry of entries) {
            if (["node_modules", ".git", "out", "dist", ".vscode", "reports"].includes(entry.name)) continue;
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath, depth + 1);
            } else if (entry.isFile() && /\.md$/i.test(entry.name)) {
                try {
                    const content = fs.readFileSync(fullPath, 'utf8');
                    const normalized = content.toLowerCase().replace(/\s+/g, ' ').replace(/[#*`_\[\]()]/g, '').trim();
                    results.push({
                        filePath: fullPath,
                        fileName: entry.name,
                        projectName,
                        sizeBytes: Buffer.byteLength(content, 'utf8'),
                        content,
                        normalized,
                    });
                } catch { /* skip unreadable */ }
            }
        }
    }
    walk(rootPath, 0);
    return results;
}

// More analysis and recommendation functions will be added here.
