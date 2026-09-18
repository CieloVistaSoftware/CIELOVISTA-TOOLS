// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

// component: cat

import * as fs   from 'fs';
import * as path from 'path';
import { extractTitle, extractDescription, extractTags, extractDocType, stripTypePrefix } from './content';
import { extractHelpMarkdown } from '../../shared/help-utils';
import type { CatalogCard } from './types';

const SKIP_DIRS  = new Set(['node_modules', '.git', 'bin', 'out', 'dist', '.vscode', '.vscode-test', '.claude', 'reports', 'CommandHelp', 'image-reader-assets']);
const SKIP_FILES = new Set(['.gitignore', '.gitattributes']);

let _cardIdCounter = 0;

export function resetCardCounter(): void { _cardIdCounter = 0; }

function extractFrontmatterCommand(content: string): string | undefined {
    const lines = content.split('\n');
    if (lines[0]?.trim() !== '---') { return undefined; }
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === '---') { break; }
        const m = line.match(/^command\s*:\s*(.+?)\s*$/i);
        if (m) { return m[1].trim(); }
    }
    return undefined;
}

export function scanForCards(
    rootPath:        string,
    projectName:     string,
    projectRootPath: string,
    maxDepth = 3,
    archivedPaths: Set<string> = new Set()
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
                if (archivedPaths.has(fullPath)) { continue; }
                try {
                    const content = fs.readFileSync(fullPath, 'utf8');
                    const stat    = fs.statSync(fullPath);
                    // #707: the catalog groups by project and folder; the folder IS the category.
                    const helpMarkdown = extractHelpMarkdown(content);
                    const folder = path.relative(projectRootPath, path.dirname(fullPath)).split(path.sep).join('/');
                    const rawTitle = extractTitle(content, entry.name);
                    const docType  = extractDocType(content, rawTitle);
                    const title    = stripTypePrefix(rawTitle);
                    const fmCommand = extractFrontmatterCommand(content);
                    cards.push({
                        id:           `card-${++_cardIdCounter}`,
                        fileName:     entry.name,
                        title,
                        description:  extractDescription(content),
                        docType,
                        filePath:     fullPath,
                        projectName,
                        projectPath:  projectRootPath,
                        category:     projectName,   // section heading = project name
                        folder:       folder === '.' ? '' : folder,
                        sizeBytes:    Buffer.byteLength(content, 'utf8'),
                        lastModified: stat.mtime.toISOString().slice(0, 10),
                        tags:         extractTags(content, entry.name),
                        helpMarkdown,
                        command:      fmCommand,
                    });
                } catch { /* skip unreadable */ }
            }
        }
    }

    walk(rootPath, 0);
    return cards;
}
