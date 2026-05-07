// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/** scanner.ts — Collects all .md files across the registry. */

import * as crypto from 'crypto';
import * as fs     from 'fs';
import * as path   from 'path';
import type { DocFile } from './types';

const SKIP_DIRS = new Set(['node_modules', '.git', 'out', 'dist', '.vscode', 'reports']);

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
                    const normalized = content
                        .toLowerCase()
                        .replace(/\s+/g, ' ')
                        .replace(/[#*`_\[\]()]/g, '')
                        .trim();
                    results.push({
                        filePath:    full,
                        fileName:    entry.name,
                        projectName,
                        sizeBytes:   stat.size,
                        content,
                        normalized,
                        hash,
                        mtime:       stat.mtimeMs,
                    });
                } catch { /* skip unreadable */ }
            }
        }
    }

    walk(rootPath, 0);
    return results;
}
