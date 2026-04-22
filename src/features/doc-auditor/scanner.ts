// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

import * as fs   from 'fs';
import * as path from 'path';
import type { DocFile } from './types';

const SKIP_DIRS = ['node_modules', '.git', 'out', 'dist', '.vscode'];

/** Returns all markdown docs under a directory tree (max 3 levels deep). */
export function collectDocs(rootPath: string, projectName: string, maxDepth = 3): DocFile[] {
    const results: DocFile[] = [];

    function walk(dir: string, depth: number): void {
        if (depth > maxDepth || !fs.existsSync(dir)) { return; }
        let entries: fs.Dirent[];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
        catch { return; }

        for (const entry of entries) {
            if (SKIP_DIRS.includes(entry.name)) { continue; }
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath, depth + 1);
            } else if (entry.isFile() && /\.md$/i.test(entry.name)) {
                try {
                    const content    = fs.readFileSync(fullPath, 'utf8');
                    const normalized = content.toLowerCase().replace(/\s+/g, ' ').replace(/[#*`_\[\]()]/g, '').trim();
                    results.push({ filePath: fullPath, fileName: entry.name, projectName,
                                   sizeBytes: Buffer.byteLength(content, 'utf8'), content, normalized });
                } catch { /* skip unreadable */ }
            }
        }
    }

    walk(rootPath, 0);
    return results;
}

/** @internal — exported for unit testing only */
export { SKIP_DIRS };
