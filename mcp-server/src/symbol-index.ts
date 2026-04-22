// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * symbol-index.ts
 *
 * Builds a flat, cross-project index of every reusable symbol found in:
 *   - `.d.ts` declaration files under each project's `out/` (TypeScript corpus)
 *   - `.js` files under each project's `scripts/`, `tests/`, and any loose
 *     `.js` in the project root (JavaScript corpus)
 *   - `.ts` source files that are not compiled (rare, but covered)
 *
 * Output: a unified `SymbolEntry[]` regardless of source language. Callers
 * don't need to know whether a symbol came from TypeScript or JavaScript.
 *
 * No AST library. Pure regex over predictable generated-and-hand-written
 * shapes. Fast, zero-dep, and good enough for a name+signature+doc index.
 *
 * Cache: the index is built lazily on first access and invalidated whenever
 * any scanned directory's mtime changes beyond the cached snapshot.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { loadRegistry, type ProjectRegistry, type ProjectEntry } from "./tools/catalog-helpers.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export type SymbolKind =
  | "function"
  | "class"
  | "interface"
  | "type"
  | "const"
  | "let"
  | "var"
  | "enum"
  | "namespace"
  | "export";

export type SymbolRole = "src" | "script" | "test" | "declaration";

export interface SymbolEntry {
  /** Exported or top-level symbol name. */
  name: string;
  /** Category of the declaration. */
  kind: SymbolKind;
  /** The declaration line (stripped of `export declare` and JSDoc). */
  signature: string;
  /** JSDoc block immediately preceding the declaration, if any. */
  docComment: string;
  /** Absolute path of the file the symbol was read from. */
  sourceFile: string;
  /** Project name from the registry, or 'global' for global docs path. */
  projectName: string;
  /** Role of the file in the project — src, script, test, or declaration. */
  role: SymbolRole;
  /** True if the symbol is exported (always true for declarations). */
  exported: boolean;
  /** 1-based line number of the declaration. */
  line: number;
  /**
   * Module path usable in an import from within the same project. Derived
   * by stripping the project root and the file extension. e.g.
   * "src/features/terminal-copy-output" or "scripts/run-regression-tests".
   */
  modulePath: string;
}

// ─── Folders and skip rules ─────────────────────────────────────────────────

const SCAN_FOLDERS: Array<{ name: string; role: SymbolRole; exts: readonly string[] }> = [
  { name: "src",     role: "src",    exts: [".ts", ".js"] },
  { name: "scripts", role: "script", exts: [".js", ".ts"] },
  { name: "tests",   role: "test",   exts: [".js", ".ts"] },
  { name: "out",     role: "declaration", exts: [".d.ts"] },
];

const SKIP_DIR_NAMES = new Set<string>([
  "node_modules",
  ".git",
  ".vscode",
  ".vscode-test",
  "dist",
  "reports",
  "playwright-report",
  "test-results",
  "coverage",
  ".next",
  ".cache",
]);

const MAX_DEPTH = 6;

// ─── Parsers ────────────────────────────────────────────────────────────────

/**
 * Returns the JSDoc block that ends on the line immediately before `lineIdx`,
 * or an empty string if none. `lines` is the full file split on \n.
 */
function extractLeadingJsDoc(lines: string[], lineIdx: number): string {
  let i = lineIdx - 1;
  // Skip blank lines
  while (i >= 0 && lines[i].trim() === "") { i--; }
  if (i < 0) { return ""; }
  if (!lines[i].trim().endsWith("*/")) { return ""; }
  // Walk up to the matching /**
  const end = i;
  while (i >= 0 && !lines[i].includes("/**")) { i--; }
  if (i < 0) { return ""; }
  return lines.slice(i, end + 1).join("\n");
}

/**
 * Parses a `.d.ts` declaration file. tsc emits one or a few lines per export
 * with predictable prefixes: `export declare function`, `export declare class`,
 * `export interface`, `export declare const`, `export type`, `export enum`.
 */
function parseDts(filePath: string, content: string): Array<Omit<SymbolEntry, "projectName" | "role" | "modulePath">> {
  const lines = content.split(/\r?\n/);
  const out: Array<Omit<SymbolEntry, "projectName" | "role" | "modulePath">> = [];

  // Regex handles:
  //   export declare function foo(...)
  //   export declare class Foo
  //   export declare const foo: ...
  //   export declare let foo: ...
  //   export declare var foo: ...
  //   export declare enum Foo
  //   export declare namespace Foo
  //   export interface Foo
  //   export type Foo = ...
  //   export enum Foo
  //   export class Foo        (non-declare form, seen in hand-written .d.ts)
  const re = /^export\s+(?:declare\s+)?(function|class|interface|type|const|let|var|enum|namespace)\s+([A-Za-z_$][\w$]*)/;

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re);
    if (!m) { continue; }
    const kind = m[1] as SymbolKind;
    const name = m[2];
    out.push({
      name,
      kind,
      signature: lines[i].trim(),
      docComment: extractLeadingJsDoc(lines, i),
      sourceFile: filePath,
      exported: true,
      line: i + 1,
    });
  }
  return out;
}

/**
 * Parses a hand-written `.js` or non-declaration `.ts` file for:
 *   - function declarations (exported or not)
 *   - class declarations (exported or not)
 *   - top-level const/let/var bindings
 *   - module.exports.foo = / module.exports = { foo, ... }
 *   - export const/function/class (ES modules)
 *   - export default ...
 *
 * Only top-level (column 0 indentation) declarations are captured. Nested
 * helpers inside other functions are intentionally skipped — they aren't
 * reusable without extraction, and including them would flood the index.
 */
function parseHandWritten(filePath: string, content: string): Array<Omit<SymbolEntry, "projectName" | "role" | "modulePath">> {
  const lines = content.split(/\r?\n/);
  const out: Array<Omit<SymbolEntry, "projectName" | "role" | "modulePath">> = [];
  const seen = new Set<string>(); // name+line dedupe

  function push(entry: Omit<SymbolEntry, "projectName" | "role" | "modulePath">): void {
    const key = `${entry.name}:${entry.line}`;
    if (seen.has(key)) { return; }
    seen.add(key);
    out.push(entry);
  }

  // Regexes anchored to column 0.
  const reFunc        = /^(export\s+(?:default\s+)?)?(async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/;
  const reClass       = /^(export\s+(?:default\s+)?)?class\s+([A-Za-z_$][\w$]*)/;
  const reConst       = /^(export\s+)?(const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?\s*=/;
  const reInterface   = /^(export\s+)?interface\s+([A-Za-z_$][\w$]*)/;
  const reType        = /^(export\s+)?type\s+([A-Za-z_$][\w$]*)\s*=/;
  const reEnum        = /^(export\s+)?enum\s+([A-Za-z_$][\w$]*)/;
  const reCjsNamed    = /^module\.exports\.([A-Za-z_$][\w$]*)\s*=/;
  const reCjsObject   = /^module\.exports\s*=\s*\{/;
  const reCjsObjKey   = /^\s*([A-Za-z_$][\w$]*)\s*[:,]/;

  let inCjsExportObject = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const raw = line;

    // Track `module.exports = { ... }` objects so we capture the keys.
    if (inCjsExportObject) {
      if (raw.includes("}")) { inCjsExportObject = false; }
      const km = raw.match(reCjsObjKey);
      if (km) {
        push({
          name: km[1],
          kind: "export",
          signature: raw.trim(),
          docComment: extractLeadingJsDoc(lines, i),
          sourceFile: filePath,
          exported: true,
          line: i + 1,
        });
      }
      continue;
    }

    if (reCjsObject.test(raw)) {
      inCjsExportObject = true;
      if (raw.includes("}")) { inCjsExportObject = false; } // single-line
      continue;
    }

    let m: RegExpMatchArray | null;

    if ((m = raw.match(reFunc))) {
      push({
        name: m[3],
        kind: "function",
        signature: raw.trim(),
        docComment: extractLeadingJsDoc(lines, i),
        sourceFile: filePath,
        exported: Boolean(m[1]),
        line: i + 1,
      });
      continue;
    }
    if ((m = raw.match(reClass))) {
      push({
        name: m[2],
        kind: "class",
        signature: raw.trim(),
        docComment: extractLeadingJsDoc(lines, i),
        sourceFile: filePath,
        exported: Boolean(m[1]),
        line: i + 1,
      });
      continue;
    }
    if ((m = raw.match(reInterface))) {
      push({
        name: m[2],
        kind: "interface",
        signature: raw.trim(),
        docComment: extractLeadingJsDoc(lines, i),
        sourceFile: filePath,
        exported: Boolean(m[1]),
        line: i + 1,
      });
      continue;
    }
    if ((m = raw.match(reType))) {
      push({
        name: m[2],
        kind: "type",
        signature: raw.trim(),
        docComment: extractLeadingJsDoc(lines, i),
        sourceFile: filePath,
        exported: Boolean(m[1]),
        line: i + 1,
      });
      continue;
    }
    if ((m = raw.match(reEnum))) {
      push({
        name: m[2],
        kind: "enum",
        signature: raw.trim(),
        docComment: extractLeadingJsDoc(lines, i),
        sourceFile: filePath,
        exported: Boolean(m[1]),
        line: i + 1,
      });
      continue;
    }
    if ((m = raw.match(reConst))) {
      push({
        name: m[3],
        kind: m[2] as SymbolKind,
        signature: raw.trim(),
        docComment: extractLeadingJsDoc(lines, i),
        sourceFile: filePath,
        exported: Boolean(m[1]),
        line: i + 1,
      });
      continue;
    }
    if ((m = raw.match(reCjsNamed))) {
      push({
        name: m[1],
        kind: "export",
        signature: raw.trim(),
        docComment: extractLeadingJsDoc(lines, i),
        sourceFile: filePath,
        exported: true,
        line: i + 1,
      });
      continue;
    }
  }

  return out;
}

// ─── Walker ─────────────────────────────────────────────────────────────────

function walkFolder(
  root: string,
  exts: readonly string[],
  depth: number,
  acc: string[],
): void {
  if (depth > MAX_DEPTH) { return; }
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIR_NAMES.has(entry.name)) { continue; }
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      walkFolder(full, exts, depth + 1, acc);
    } else if (entry.isFile()) {
      // .d.ts must match before .ts so that .d.ts files in an out/ folder
      // are routed to the declaration parser.
      if (exts.includes(".d.ts") && entry.name.endsWith(".d.ts")) {
        acc.push(full);
      } else if (exts.includes(".ts") && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
        acc.push(full);
      } else if (exts.includes(".js") && entry.name.endsWith(".js") && !entry.name.endsWith(".js.map")) {
        acc.push(full);
      }
    }
  }
}

// ─── Project scan ───────────────────────────────────────────────────────────

function toModulePath(projectRoot: string, filePath: string): string {
  const rel = path.relative(projectRoot, filePath);
  const withoutExt = rel.replace(/\.d\.ts$/, "").replace(/\.ts$/, "").replace(/\.js$/, "");
  return withoutExt.split(path.sep).join("/");
}

function scanProject(project: ProjectEntry): SymbolEntry[] {
  const symbols: SymbolEntry[] = [];
  if (!fs.existsSync(project.path)) { return symbols; }

  for (const folder of SCAN_FOLDERS) {
    const folderRoot = path.join(project.path, folder.name);
    if (!fs.existsSync(folderRoot)) { continue; }

    const files: string[] = [];
    walkFolder(folderRoot, folder.exts, 0, files);

    for (const file of files) {
      let content: string;
      try {
        content = fs.readFileSync(file, "utf8");
      } catch {
        continue;
      }
      const parsed = file.endsWith(".d.ts")
        ? parseDts(file, content)
        : parseHandWritten(file, content);

      for (const raw of parsed) {
        symbols.push({
          ...raw,
          projectName: project.name,
          role: folder.role,
          modulePath: toModulePath(project.path, file),
        });
      }
    }
  }

  return symbols;
}

// ─── Cache and public API ───────────────────────────────────────────────────

interface IndexCache {
  builtAt: number;
  symbols: SymbolEntry[];
  /** mtimes of each scanned folder root keyed by path — rough staleness check. */
  folderMtimes: Record<string, number>;
}

let _cache: IndexCache | undefined;

function currentFolderMtimes(registry: ProjectRegistry): Record<string, number> {
  const map: Record<string, number> = {};
  for (const p of registry.projects) {
    for (const folder of SCAN_FOLDERS) {
      const full = path.join(p.path, folder.name);
      try {
        const st = fs.statSync(full);
        map[full] = st.mtimeMs;
      } catch {
        /* not present, skip */
      }
    }
  }
  return map;
}

function cacheIsFresh(registry: ProjectRegistry): boolean {
  if (!_cache) { return false; }
  const now = currentFolderMtimes(registry);
  const cachedKeys = Object.keys(_cache.folderMtimes);
  const nowKeys = Object.keys(now);
  if (cachedKeys.length !== nowKeys.length) { return false; }
  for (const k of cachedKeys) {
    if (now[k] !== _cache.folderMtimes[k]) { return false; }
  }
  return true;
}

/**
 * Build or return the cached symbol index for every registered project.
 * Call `invalidateSymbolIndex()` after a build if immediate freshness matters.
 */
export function getSymbolIndex(): SymbolEntry[] {
  const registry = loadRegistry();
  if (cacheIsFresh(registry)) {
    return _cache!.symbols;
  }
  const symbols: SymbolEntry[] = [];
  for (const p of registry.projects) {
    symbols.push(...scanProject(p));
  }
  _cache = {
    builtAt: Date.now(),
    symbols,
    folderMtimes: currentFolderMtimes(registry),
  };
  return symbols;
}

export function invalidateSymbolIndex(): void {
  _cache = undefined;
}

// ─── Query helpers used by tools and REST API ──────────────────────────────

export interface SymbolFilter {
  query?: string;
  kind?: SymbolKind;
  projectName?: string;
  role?: SymbolRole;
  exportedOnly?: boolean;
  limit?: number;
}

export function filterSymbols(all: SymbolEntry[], f: SymbolFilter): SymbolEntry[] {
  const q = (f.query ?? "").toLowerCase();
  const out: SymbolEntry[] = [];
  for (const s of all) {
    if (f.kind && s.kind !== f.kind) { continue; }
    if (f.projectName && s.projectName !== f.projectName) { continue; }
    if (f.role && s.role !== f.role) { continue; }
    if (f.exportedOnly && !s.exported) { continue; }
    if (q) {
      const hay = `${s.name} ${s.signature} ${s.docComment}`.toLowerCase();
      if (!hay.includes(q)) { continue; }
    }
    out.push(s);
    if (f.limit && out.length >= f.limit) { break; }
  }
  return out;
}

/**
 * Exact name match with fall-back to prefix match. Returns at most `limit`
 * entries — default 10 — ordered exact first, then prefix.
 */
export function findSymbolByName(all: SymbolEntry[], name: string, limit = 10): SymbolEntry[] {
  const target = name.toLowerCase();
  const exact: SymbolEntry[] = [];
  const prefix: SymbolEntry[] = [];
  for (const s of all) {
    const n = s.name.toLowerCase();
    if (n === target) { exact.push(s); }
    else if (n.startsWith(target)) { prefix.push(s); }
  }
  return [...exact, ...prefix].slice(0, limit);
}

// ─── CVT command catalog exposure ──────────────────────────────────────────

/**
 * Reads the cielovista-tools command catalog (a TypeScript array literal in
 * `src/features/cvs-command-launcher/catalog.ts`) and returns each entry as
 * plain JSON. Because catalog.ts is source-of-truth for every CVT command
 * and Dewey number, exposing it lets callers answer "is there already a
 * command for this" without reading the file manually.
 */
export interface CvtCommandEntry {
  id: string;
  title: string;
  description: string;
  tags: string[];
  group: string;
  dewey: string;
  scope: string;
  action?: string;
  location?: string;
}

export function loadCvtCommands(): CvtCommandEntry[] {
  const registry = loadRegistry();
  const cvt = registry.projects.find((p) => p.name === "cielovista-tools");
  if (!cvt) { return []; }
  const catalogPath = path.join(cvt.path, "src", "features", "cvs-command-launcher", "catalog.ts");
  if (!fs.existsSync(catalogPath)) { return []; }
  const content = fs.readFileSync(catalogPath, "utf8");

  // Parse each object literal between the opening [ and closing ];
  // catalog.ts rule: one entry per line, starts with `{ id: '...',`.
  const out: CvtCommandEntry[] = [];
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (!t.startsWith("{ id:") && !t.startsWith("{id:")) { continue; }
    const entry = parseCatalogLine(t);
    if (entry) { out.push(entry); }
  }
  return out;
}

function parseCatalogLine(line: string): CvtCommandEntry | undefined {
  // Strip leading `{` and trailing `},` or `}`
  const body = line.replace(/^\{/, "").replace(/\},?\s*$/, "");
  // Pull fields with simple patterns. Single-quoted strings are the
  // convention in catalog.ts.
  const pick = (key: string): string | undefined => {
    const m = body.match(new RegExp(`${key}\\s*:\\s*'([^']*)'`));
    return m ? m[1] : undefined;
  };
  const pickArray = (key: string): string[] => {
    const m = body.match(new RegExp(`${key}\\s*:\\s*\\[([^\\]]*)\\]`));
    if (!m) { return []; }
    const parts = m[1].match(/'([^']*)'/g) ?? [];
    return parts.map((p) => p.slice(1, -1));
  };
  const id = pick("id");
  if (!id) { return undefined; }
  return {
    id,
    title: pick("title") ?? "",
    description: pick("description") ?? "",
    tags: pickArray("tags"),
    group: pick("group") ?? "",
    dewey: pick("dewey") ?? "",
    scope: pick("scope") ?? "",
    action: pick("action"),
    location: pick("location"),
  };
}
