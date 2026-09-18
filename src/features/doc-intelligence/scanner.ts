// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/** scanner.ts — Doc Intelligence's view of the registry's .md files and test-artifact folders. */

import * as fs   from 'fs';
import * as path from 'path';
import { collectDocs, DOC_SKIP_DIRS } from '../../shared/doc-collector';
import type { ArtifactFolder, DocFile } from './types';

/**
 * The docs Doc Intelligence analyzes under one root: shared/doc-collector's
 * set (the same set the Doc Auditor sees, #802) plus the fields the analyzer
 * scores on.
 */
export function intelligenceDocs(rootPath: string, projectName: string): DocFile[] {
    return collectDocs(rootPath, projectName).map((doc) => ({
        filePath:      doc.filePath,
        fileName:      doc.fileName,
        projectName:   doc.projectName,
        sizeBytes:     doc.sizeBytes,
        content:       doc.content,
        normalized:    doc.normalized,
        hash:          doc.hash,
        mtime:         doc.mtimeMs,
        fmStatus:      doc.frontmatter['status'],
        fmDescription: doc.frontmatter['description'],
        fmTitle:       doc.frontmatter['title'],
    }));
}

/** Test-artifact folders: reported as clutter to clean up, never read as docs. */
const ARTIFACT_DIRS = new Set(['test-results', 'playwright-report']);

export function collectArtifactFolders(rootPath: string, projectName: string, maxDepth = 4): ArtifactFolder[] {
    const results: ArtifactFolder[] = [];

    function walk(dir: string, depth: number): void {
        if (depth > maxDepth || !fs.existsSync(dir)) { return; }
        let entries: fs.Dirent[];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const entry of entries) {
            if (!entry.isDirectory()) { continue; }
            const full = path.join(dir, entry.name);
            if (ARTIFACT_DIRS.has(entry.name)) {
                let fileCount = 0;
                let sizeBytes = 0;
                try {
                    const inner = fs.readdirSync(full, { withFileTypes: true });
                    for (const f of inner) {
                        if (f.isFile()) {
                            fileCount++;
                            try { sizeBytes += fs.statSync(path.join(full, f.name)).size; } catch { /* skip */ }
                        }
                    }
                } catch { /* skip */ }
                results.push({ folderPath: full, folderName: entry.name, projectName, fileCount, sizeBytes });
            } else if (!DOC_SKIP_DIRS.has(entry.name)) {
                walk(full, depth + 1);
            }
        }
    }

    walk(rootPath, 0);
    return results;
}
