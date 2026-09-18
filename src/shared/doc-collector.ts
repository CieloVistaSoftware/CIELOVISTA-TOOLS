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
 * THE SKIP LIST is the union of the lists the walkers had, minus one entry.
 * A directory is skipped when what is inside it is not a hand-written doc of
 * the project: generated output, installed or vendored packages, tool state,
 * test artifacts, or shipped runtime payloads. The entries that hold markdown
 * in the registry projects today:
 *   .vscode-test/  the VS Code build extension tests download (61 files)
 *   bin/           .NET build output: DiskCleanUp's bin/ holds five copies
 *                  of wwwroot/settings-help.md, one per build configuration
 *   .venv/, venv/  installed Python packages' own READMEs
 *   reports/       the audit and coverage reports these features write
 *   test-results/  Playwright failure dumps (error-context.md)
 *   output/        generated build and RAG prompts (pico-dataset)
 *   CommandHelp/   help payloads copied into the VSIX and read at runtime
 *                  (#712), not project documentation
 * DROPPED: legacy/. Only the background health check skipped it, and the only
 * legacy/ holding markdown (vscode-claude/patches/legacy/README.md) is a
 * hand-written doc, which is exactly what a doc audit should see.
 *
 * Pure functions: no vscode, no state. They read the file system and return.
 */

import * as crypto from 'crypto';
import * as fs     from 'fs';
import * as path   from 'path';
import { readFrontmatter } from './doc-frontmatter';

/** Directories no doc walk descends into. See the header for why each is here. */
export const DOC_SKIP_DIRS: ReadonlySet<string> = new Set([
    // version control, editor and agent state
    '.git', '.vscode', '.claude',
    // installed or vendored packages
    'node_modules', 'vendor', '.venv', 'venv', '__pycache__',
    // build output
    'out', 'dist', 'build', 'output', 'bin', 'obj', 'coverage',
    '.next', '.nuxt', '.cache', 'tmp', 'temp',
    // test artifacts
    '.vscode-test', 'test-results', 'playwright-report', '.playwright-artifacts',
    // reports these doc features write, and runtime payloads shipped in the VSIX
    'reports', 'CommandHelp', 'image-reader-assets',
]);

/** File names that are never docs even where docs live: Playwright's per-failure dump. */
export const DOC_SKIP_FILE_SUFFIXES: readonly string[] = ['error-context.md'];

/** How deep the doc features look below a project root (root = depth 0). */
export const DEFAULT_DOC_DEPTH = 3;

const MARKDOWN = /\.md$/i;

export function isMarkdownDoc(fileName: string): boolean {
    if (!MARKDOWN.test(fileName)) { return false; }
    const lower = fileName.toLowerCase();
    return !DOC_SKIP_FILE_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

export interface DocTreeOptions {
    /** Deepest directory level entered; the root is 0. Default DEFAULT_DOC_DEPTH. Infinity for no limit. */
    maxDepth?: number;
    /** Which files to return, by name. Default isMarkdownDoc. */
    match?: (fileName: string) => boolean;
}

/**
 * Every file under rootPath whose name passes `match`, never entering a
 * DOC_SKIP_DIRS directory. Unreadable directories are skipped; a missing
 * root returns [].
 */
export function walkDocTree(rootPath: string, options: DocTreeOptions = {}): string[] {
    const maxDepth = options.maxDepth ?? DEFAULT_DOC_DEPTH;
    const match    = options.match ?? isMarkdownDoc;
    const files: string[] = [];

    function walk(dir: string, depth: number): void {
        if (depth > maxDepth) { return; }
        let entries: fs.Dirent[];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const entry of entries) {
            if (DOC_SKIP_DIRS.has(entry.name)) { continue; }
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) { walk(full, depth + 1); }
            else if (entry.isFile() && match(entry.name)) { files.push(full); }
        }
    }

    walk(rootPath, 0);
    return files;
}

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
