// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

import * as fs   from 'fs';
import * as path from 'path';
import { extractTitle, extractDescription, extractTags } from './content';
import { extractDeweyAndHelp } from '../../shared/help-utils';
import type { CatalogCard } from './types';

const SKIP_DIRS  = new Set(['node_modules', '.git', 'out', 'dist', '.vscode', 'reports', 'CommandHelp', 'image-reader-assets']);
const SKIP_FILES = new Set(['.gitignore', '.gitattributes']);

let _cardIdCounter = 0;

export function resetCardCounter(): void { _cardIdCounter = 0; }

export function scanForCards(
    rootPath:        string,
    projectName:     string,
    projectRootPath: string,
    projectDeweyNum: number,   // e.g. 300 for DiskCleanUp
    maxDepth = 3
): CatalogCard[] {
    const cards: CatalogCard[] = [];

    function walk(dir: string, depth: number): void {
        if (depth > maxDepth || !fs.existsSync(dir)) { return; }
        let entries: fs.Dirent[];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
        catch { return; }

        for (const entry of entries) {
            if (SKIP_DIRS.has(entry.name) || SKIP_FILES.has(entry.name)) { continue; }
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath, depth + 1);
            } else if (entry.isFile() && /\.md$/i.test(entry.name)) {
                try {
                    const content = fs.readFileSync(fullPath, 'utf8');
                    const stat    = fs.statSync(fullPath);
                    const { dewey, helpMarkdown } = extractDeweyAndHelp(fullPath);
                    cards.push({
                        id:           `card-${++_cardIdCounter}`,
                        fileName:     entry.name,
                        title:        extractTitle(content, entry.name),
                        description:  extractDescription(content),
                        filePath:     fullPath,
                        projectName,
                        projectPath:  projectRootPath,
                        category:     projectName,   // section heading = project name
                        categoryNum:  projectDeweyNum,
                        sizeBytes:    Buffer.byteLength(content, 'utf8'),
                        lastModified: stat.mtime.toISOString().slice(0, 10),
                        tags:         extractTags(content, entry.name),
                        dewey,
                        helpMarkdown,
                    });
                } catch { /* skip unreadable */ }
            }
        }
    }

    walk(rootPath, 0);
    return cards;
}
