// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

// component: cat

import * as fs   from 'fs';
import * as path from 'path';
import { extractTitle, extractDescription, extractTags, extractDocType, stripTypePrefix } from './content';
import { extractHelpMarkdown } from '../../shared/help-utils';
import { walkDocTree } from '../../shared/doc-collector';
import type { CatalogCard } from './types';

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

    for (const fullPath of walkDocTree(rootPath, { maxDepth })) {
        if (archivedPaths.has(fullPath)) { continue; }
        const fileName = path.basename(fullPath);
        try {
            const content = fs.readFileSync(fullPath, 'utf8');
            const stat    = fs.statSync(fullPath);
            // #707: the catalog groups by project and folder; the folder IS the category.
            const helpMarkdown = extractHelpMarkdown(content);
            const folder = path.relative(projectRootPath, path.dirname(fullPath)).split(path.sep).join('/');
            const rawTitle = extractTitle(content, fileName);
            const docType  = extractDocType(content, rawTitle);
            const title    = stripTypePrefix(rawTitle);
            const fmCommand = extractFrontmatterCommand(content);
            cards.push({
                id:           `card-${++_cardIdCounter}`,
                fileName,
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
                tags:         extractTags(content, fileName),
                helpMarkdown,
                command:      fmCommand,
            });
        } catch { /* skip unreadable */ }
    }
    return cards;
}
