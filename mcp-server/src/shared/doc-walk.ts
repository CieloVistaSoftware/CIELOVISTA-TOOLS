// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * doc-walk.ts — the one walk over a project tree for its markdown docs, and
 * the one list of directories it never enters (#802, #812).
 *
 * WHO USES IT. Every markdown walk in the repo:
 *   - the extension, through src/shared/doc-collector.ts, which re-exports
 *     this module and adds collectDocs() on top (#802);
 *   - the MCP server: scanProjectDocs() and walkFiles() in
 *     mcp-server/src/tools/catalog-helpers.ts, behind get_catalog,
 *     search_docs and list_broken_refs (#812);
 *   - the Node scripts that walk for markdown, through the built copy of
 *     src/shared/doc-collector.ts at out/shared/doc-collector.js (#812).
 * REG-176 fails if any other function in src/, mcp-server/src/ or scripts/
 * walks a tree for markdown.
 *
 * WHY THIS FILE LIVES HERE, under mcp-server/src/ rather than src/shared/:
 * the same reason as registry-promote-core.ts (#696). mcp-server compiles
 * with its own tsconfig whose rootDir is ./src; reaching src/shared/ from
 * there would move dist/index.js, which package.json main+bin, the MCP
 * status check and the packaging tests all name by path. The extension is
 * bundled by esbuild and resolves freely, so the shared code sits inside
 * mcp-server's rootDir and the extension imports it. One source file, no
 * generated copy that could drift.
 *
 * Before #812 the MCP catalog had its own list, which did not skip .claude/:
 * every git worktree under .claude/worktrees/ added a full copy of the
 * project's docs to get_catalog and search_docs, so Claude, through MCP,
 * saw a different doc set from the Doc Catalog, Doc Auditor and Doc
 * Intelligence panels.
 *
 * THE SKIP LIST is the union of the lists the walkers had (#802), minus one
 * entry. A directory is skipped when what is inside it is not a hand-written
 * doc of the project: generated output, installed or vendored packages, tool
 * state, test artifacts, or shipped runtime payloads. The entries that hold
 * markdown in the registry projects today:
 *   .claude/       agent state, including every git worktree's full copy of
 *                  the project under .claude/worktrees/
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

import * as fs from "fs";
import * as path from "path";

/** Directories no doc walk descends into. See the header for why each is here. */
export const DOC_SKIP_DIRS: ReadonlySet<string> = new Set([
  // version control, editor and agent state
  ".git", ".vscode", ".claude",
  // installed or vendored packages
  "node_modules", "vendor", ".venv", "venv", "__pycache__",
  // build output
  "out", "dist", "build", "output", "bin", "obj", "coverage",
  ".next", ".nuxt", ".cache", "tmp", "temp",
  // test artifacts
  ".vscode-test", "test-results", "playwright-report", ".playwright-artifacts",
  // reports these doc features write, and runtime payloads shipped in the VSIX
  "reports", "CommandHelp", "image-reader-assets",
]);

/** File names that are never docs even where docs live: Playwright's per-failure dump. */
export const DOC_SKIP_FILE_SUFFIXES: readonly string[] = ["error-context.md"];

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
