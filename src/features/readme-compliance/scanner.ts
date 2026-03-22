// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

import * as fs   from 'fs';
import * as path from 'path';
import type { ReadmeType } from './types';

export function isReadme(fileName: string): boolean {
    return /^readme\.md$/i.test(fileName) || /\.readme\.md$/i.test(fileName);
}

export function detectType(filePath: string, projectRootPath: string, projectName: string): ReadmeType {
    const fileName = path.basename(filePath).toLowerCase();
    const dir      = path.dirname(filePath);
    if (/\.readme\.md$/i.test(fileName))  { return 'FEATURE'; }
    if (projectName === 'global')          { return 'STANDARD'; }
    if (/[\\/]docs[\\/]/i.test(dir))       { return 'STANDARD'; }
    const rel = path.relative(projectRootPath, dir);
    if (rel === '' || rel === '.')         { return 'PROJECT'; }
    return 'FEATURE';
}

const SKIP = new Set(['node_modules', '.git', 'out', 'dist', 'reports']);

export function collectReadmes(
    rootPath: string,
    projectName: string,
    projectRoot: string,
    maxDepth = 4
): Array<{ filePath: string; projectName: string; projectRoot: string }> {
    const results: Array<{ filePath: string; projectName: string; projectRoot: string }> = [];

    function walk(dir: string, depth: number): void {
        if (depth > maxDepth || !fs.existsSync(dir)) { return; }
        let entries: fs.Dirent[];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const entry of entries) {
            if (SKIP.has(entry.name)) { continue; }
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) { walk(full, depth + 1); }
            else if (entry.isFile() && isReadme(entry.name)) {
                results.push({ filePath: full, projectName, projectRoot });
            }
        }
    }

    walk(rootPath, 0);
    return results;
}
