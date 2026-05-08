// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/** scanner.ts — Collects all .md files across the registry. */

import * as crypto from 'crypto';
import * as fs     from 'fs';
import * as path   from 'path';
import type { ArtifactFolder, DocFile } from './types';

const SKIP_DIRS = new Set(['node_modules', '.git', 'out', 'dist', '.vscode', '.vscode-test', '.claude', 'reports', 'CommandHelp', 'image-reader-assets', 'test-results', 'playwright-report']);

function stripFrontmatter(content: string): string {
    const m = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/);
    return m ? m[1] : content;
}

function parseFrontmatter(content: string): Record<string, string> {
    const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) { return {}; }
    const result: Record<string, string> = {};
    for (const line of m[1].split(/\r?\n/)) {
        const colon = line.indexOf(':');
        if (colon < 1) { continue; }
        const key = line.slice(0, colon).trim();
        const val = line.slice(colon + 1).trim().replace(/^["']|["']$/g, '');
        if (key && val) { result[key] = val; }
    }
    return result;
}

const ARTIFACT_DIRS = new Set(['test-results', 'playwright-report']);

export function collectDocs(rootPath: string, projectName: string, maxDepth = 3): DocFile[] {
    const results: DocFile[] = [];

    function walk(dir: string, depth: number): void {
        if (depth > maxDepth || !fs.existsSync(dir)) { return; }
        let entries: fs.Dirent[];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }

        for (const entry of entries) {
            if (SKIP_DIRS.has(entry.name)) { continue; }
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(full, depth + 1);
            } else if (entry.isFile() && /\.md$/i.test(entry.name)) {
                try {
                    const buf        = fs.readFileSync(full);
                    const content    = buf.toString('utf8');
                    const stat       = fs.statSync(full);
                    const hash       = crypto.createHash('sha256').update(buf).digest('hex');
                    const normalized = stripFrontmatter(content)
                        .toLowerCase()
                        .replace(/\s+/g, ' ')
                        .replace(/[#*`_\[\]()]/g, '')
                        .trim();
                    const fm = parseFrontmatter(content);
                    results.push({
                        filePath:       full,
                        fileName:       entry.name,
                        projectName,
                        sizeBytes:      stat.size,
                        content,
                        normalized,
                        hash,
                        mtime:          stat.mtimeMs,
                        fmStatus:       fm['status'],
                        fmDescription:  fm['description'],
                        fmDewey:        fm['dewey'] ?? fm['subject'], // support old subject: field during migration
                        fmTitle:        fm['title'],
                        fmCategory:     fm['category'],
                    });
                } catch { /* skip unreadable */ }
            }
        }
    }

    walk(rootPath, 0);
    return results;
}

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
            } else if (!SKIP_DIRS.has(entry.name)) {
                walk(full, depth + 1);
            }
        }
    }

    walk(rootPath, 0);
    return results;
}
