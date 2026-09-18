// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * doc-collector.ts — the one walk over a project tree for its markdown docs (#802).
 *
 * Before this module 13 functions in 12 files walked a tree for markdown, each
 * with its own skip list: Doc Auditor skipped 6 directories, Doc Intelligence
 * 12, Doc Catalog 11, Doc Header 23, Doc Consolidator 6 (not .claude/, so every
 * worktree's copy of a doc was a "duplicate"). Over the 22 registry projects
 * on 2026-09-18 the Doc Auditor saw 1,466 docs and Doc Intelligence 1,445: 21
 * report files, Playwright dumps and CommandHelp payloads that only the
 * auditor counted. Every walker now goes through walkDocTree(), so a
 * directory is a doc location for every feature or for none; both now see
 * the same 1,441.
 *
 * THE SKIP LIST and the walk itself live in mcp-server/src/shared/doc-walk.ts
 * (#812), so the MCP server and the Node scripts walk with the same list;
 * this module re-exports them and adds the reading. See doc-walk.ts for why
 * each directory is skipped and why the file sits under mcp-server/src/.
 *
 * Pure functions: no vscode, no state. They read the file system and return.
 */

import * as crypto from 'crypto';
import * as fs     from 'fs';
import * as path   from 'path';
import { readFrontmatter } from './doc-frontmatter';
// #812 -- the one walk and the one skip list, shared with the MCP server and
// scripts/. It lives under mcp-server/src/ for the reason registry-promote-core
// does (#696): mcp-server's tsconfig rootDir is ./src.
import { walkDocTree, DEFAULT_DOC_DEPTH } from '../../mcp-server/src/shared/doc-walk';

export {
    DOC_SKIP_DIRS,
    DOC_SKIP_FILE_SUFFIXES,
    DEFAULT_DOC_DEPTH,
    isMarkdownDoc,
    walkDocTree,
    type DocTreeOptions,
} from '../../mcp-server/src/shared/doc-walk';

/** One markdown doc, read. Each feature maps this onto its own record. */
export interface CollectedDoc {
    filePath:    string;
    fileName:    string;
    projectName: string;
    /** Bytes on disk. */
    sizeBytes:   number;
    /** Last modified, epoch ms. */
    mtimeMs:     number;
    content:     string;
    /** Body without frontmatter, lower-cased, whitespace collapsed, markdown punctuation removed: what similarity compares. */
    normalized:  string;
    /** sha256 of the raw bytes. */
    hash:        string;
    /** Frontmatter fields, names lower-cased; {} when there is none. */
    frontmatter: Record<string, string>;
}

/** The body text similarity and duplicate checks compare. Frontmatter is metadata, not content. */
export function normalizeDocText(content: string): string {
    return readFrontmatter(content).body
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[#*`_\[\]()]/g, '')
        .trim();
}

/** Every markdown doc under rootPath, read. Unreadable files are skipped. */
export function collectDocs(rootPath: string, projectName: string, maxDepth: number = DEFAULT_DOC_DEPTH): CollectedDoc[] {
    const docs: CollectedDoc[] = [];
    for (const filePath of walkDocTree(rootPath, { maxDepth })) {
        try {
            const buf     = fs.readFileSync(filePath);
            const content = buf.toString('utf8');
            const stat    = fs.statSync(filePath);
            docs.push({
                filePath,
                fileName:    path.basename(filePath),
                projectName,
                sizeBytes:   stat.size,
                mtimeMs:     stat.mtimeMs,
                content,
                normalized:  normalizeDocText(content),
                hash:        crypto.createHash('sha256').update(buf).digest('hex'),
                frontmatter: readFrontmatter(content).fields,
            });
        } catch { /* unreadable: skip */ }
    }
    return docs;
}
