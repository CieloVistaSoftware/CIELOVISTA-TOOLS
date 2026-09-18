// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Catalog helpers for the MCP server. Keeps AI-facing catalog tools
// self-contained from the extension's webview-focused catalog code.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ProjectEntry {
  name: string;
  path: string;
  type: string;
  description: string;
  /** Lifecycle status. Missing entries default to "product" for backward compatibility. */
  status?: "product" | "workbench" | "generated" | "archived";
  /** GitHub repository URL, used to build GitHub links in the viewer. */
  githubUrl?: string;
}

export interface ProjectRegistry {
  globalDocsPath: string;
  projects: ProjectEntry[];
}

export interface DocEntry {
  projectName: string;
  fileName: string;
  filePath: string;
  title: string;
  description: string;
  id?: string; // Frontmatter id (the three-field doc contract, #708)
  projectPath: string;
  projectStatus: "product" | "workbench" | "generated" | "archived";
  tags: string[];
  sizeBytes: number;
  lastModified: string;
  helpMarkdown?: string;
}

// ─── Registry ───────────────────────────────────────────────────────────────

export const REGISTRY_PATH = path.join(
  os.homedir(),
  "Downloads",
  "CieloVistaStandards",
  "project-registry.json"
);

export function loadRegistry(): ProjectRegistry {
  if (!fs.existsSync(REGISTRY_PATH)) {
    throw new Error(`Project registry not found at: ${REGISTRY_PATH}`);
  }
  const raw = fs.readFileSync(REGISTRY_PATH, "utf8");
  try {
    const parsed = JSON.parse(raw) as ProjectRegistry;
    for (const p of parsed.projects) {
      if (!p.status) { p.status = "product"; }
    }
    return parsed;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse project registry: ${msg}`);
  }
}

// ─── Markdown scan ──────────────────────────────────────────────────────────

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "out",
  "dist",
  ".vscode",
  ".vscode-test",
  "reports",
  "playwright-report",
  "test-results",
]);

export function scanProjectDocs(
  rootPath: string,
  projectName: string,
  projectPath: string,
  projectStatus: "product" | "workbench" | "generated" | "archived",
  maxDepth = 3
): DocEntry[] {
  const docs: DocEntry[] = [];
  if (!fs.existsSync(rootPath)) {
    return docs;
  }

  function walk(dir: string, depth: number): void {
    if (depth > maxDepth) {
      return;
    }
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) {
        continue;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else if (entry.isFile() && /\.md$/i.test(entry.name)) {
        try {
          const content = fs.readFileSync(full, "utf8");
          const stat = fs.statSync(full);
          docs.push({
            projectName,
            fileName: entry.name,
            filePath: full,
            title: extractTitle(content, entry.name),
            description: extractDescription(content),
            id: extractFrontmatterId(content),
            projectPath,
            projectStatus,
            tags: extractTags(content, entry.name),
            sizeBytes: Buffer.byteLength(content, "utf8"),
            lastModified: stat.mtime.toISOString().slice(0, 10),
            helpMarkdown: extractHelpMarkdown(content),
          });
        } catch {
          /* skip unreadable files */
        }
      }
    }
  }

  walk(rootPath, 0);
  return docs;
}

export function extractTitle(content: string, fileName: string): string {
  const h1 = content.match(/^#\s+(.+)$/m);
  if (h1) {
    return h1[1].trim();
  }
  return fileName.replace(/\.md$/i, "").replace(/[-_]/g, " ");
}

export function extractDescription(content: string): string {
  const lines = content.split("\n");
  const textLines: string[] = [];
  let pastFirstHeading = false;
  const metadataLine = /^\s*\*\*[^*]+\*\*\s*:/;
  let frontmatterDelimsSeen = 0;
  const inFrontmatterMode = lines[0]?.trim() === "---";

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    if (inFrontmatterMode && frontmatterDelimsSeen < 2) {
      if (line.trim() === "---") {
        frontmatterDelimsSeen += 1;
      }
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed.startsWith("#")) {
      if (pastFirstHeading && textLines.length) {
        break;
      }
      pastFirstHeading = true;
      continue;
    }
    if (
      trimmed.startsWith(">") ||
      trimmed.startsWith("<!--") ||
      trimmed.startsWith("---") ||
      trimmed.startsWith("|") ||
      trimmed.startsWith("```") ||
      metadataLine.test(trimmed)
    ) {
      continue;
    }
    textLines.push(trimmed.replace(/\*\*|__|\*|_|`/g, ""));
    if (textLines.join(" ").length > 160) {
      break;
    }
  }

  const desc = textLines.join(" ").trim();
  if (!desc) {
    return "No description.";
  }
  return desc.length > 160 ? desc.slice(0, 157) + "…" : desc;
}

export function extractTags(content: string, fileName: string): string[] {
  const tags = new Set<string>();
  fileName
    .replace(/\.md$/i, "")
    .split(/[-_. ]+/)
    .forEach((word) => {
      if (word.length > 2) {
        tags.add(word.toLowerCase());
      }
    });

  const headings = content.match(/^#{1,3}\s+(.+)$/gm) ?? [];
  for (const heading of headings.slice(0, 5)) {
    heading
      .replace(/^#+\s+/, "")
      .split(/\s+/)
      .forEach((word) => {
        const clean = word.replace(/[^a-z0-9]/gi, "").toLowerCase();
        if (clean.length > 3) {
          tags.add(clean);
        }
      });
  }

  return [...tags].slice(0, 12);
}

export function extractHelpMarkdown(content: string): string | undefined {
  const lines = content.split("\n");
  const helpLines: string[] = [];
  let started = false;

  for (const line of lines) {
    if (/^# /.test(line)) {
      started = true;
      continue;
    }
    if (/^## /.test(line) && started) {
      break;
    }
    if (started && helpLines.length < 10) {
      helpLines.push(line);
    }
  }

  return helpLines.join("\n").trim() || undefined;
}

/** The frontmatter id from a top YAML block (the three-field contract, #708). */
export function extractFrontmatterId(content: string): string | undefined {
  const lines = content.split("\n");
  if (lines[0]?.trim() !== "---") {
    return undefined;
  }
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "---") {
      break;
    }
    const idMatch = line.match(/^id:\s*(.+?)(?:\s*#.*)?$/);
    if (idMatch) {
      return idMatch[1].trim();
    }
  }
  return undefined;
}

// ─── Query helpers ──────────────────────────────────────────────────────────

export function findProjects(
  registry: ProjectRegistry,
  query: string
): ProjectEntry[] {
  const q = query.toLowerCase();
  return registry.projects.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      (p.description ?? "").toLowerCase().includes(q)
  );
}

export function scanAllDocs(
  registry: ProjectRegistry,
  projectNameFilter?: string
): DocEntry[] {
  const docs: DocEntry[] = [];
  if (!projectNameFilter || projectNameFilter === "global") {
    docs.push(
      ...scanProjectDocs(
        registry.globalDocsPath,
        "global",
        registry.globalDocsPath,
        "product"
      )
    );
  }

  for (const p of registry.projects) {
    if (projectNameFilter && p.name !== projectNameFilter) {
      continue;
    }
    docs.push(
      ...scanProjectDocs(
        p.path,
        p.name,
        p.path,
        p.status ?? "product"
      )
    );
  }

  return docs;
}

export function searchDocs(docs: DocEntry[], query: string): DocEntry[] {
  const q = query.toLowerCase();
  return docs.filter(
    (d) =>
      d.title.toLowerCase().includes(q) ||
      d.description.toLowerCase().includes(q) ||
      d.fileName.toLowerCase().includes(q) ||
      d.tags.some((tag) => tag.includes(q))
  );
}

export interface BrokenRefCandidate {
  projectName: string;
  filePath: string;
  distance: number;
}

export interface BrokenRefFinding {
  projectName: string;
  filePath: string;
  line: number;
  refType: "image" | "doc" | "doc-id";
  target: string;
  resolvedPath?: string;
  reason: string;
  candidates: BrokenRefCandidate[];
  placeholderCreated?: boolean;
}

export interface BrokenRefsResult {
  totalDocsScanned: number;
  totalBroken: number;
  findings: BrokenRefFinding[];
  byProject: Array<{ projectName: string; count: number }>;
  placeholdersCreated: number;
}

interface ParsedRef {
  rawText: string;
  target: string;
  altOrText: string;
  refType: "image" | "doc";
  line: number;
}

function normalizeTarget(raw: string): string {
  const trimmed = raw.trim().replace(/^<|>$/g, "");
  const withNoTitle = trimmed.replace(/^([^\s]+)\s+(?:"[^"]*"|'[^']*')$/, "$1");
  const q = withNoTitle.indexOf("?");
  const h = withNoTitle.indexOf("#");
  let end = withNoTitle.length;
  if (q >= 0) { end = Math.min(end, q); }
  if (h >= 0) { end = Math.min(end, h); }
  const noFrag = withNoTitle.slice(0, end);
  try { return decodeURI(noFrag); } catch { return noFrag; }
}

function isExternalTarget(target: string): boolean {
  const t = target.toLowerCase();
  return (
    t.startsWith("http://") ||
    t.startsWith("https://") ||
    t.startsWith("mailto:") ||
    t.startsWith("tel:") ||
    t.startsWith("#") ||
    t.startsWith("command:") ||
    t.startsWith("vscode:") ||
    t.startsWith("vscode-insiders:") ||
    t.startsWith("ms-vscode:") ||
    t.startsWith("file:") ||
    t.startsWith("data:")
  );
}

function lineFromOffset(content: string, offset: number): number {
  return content.slice(0, offset).split("\n").length;
}

function parseMarkdownRefs(content: string): ParsedRef[] {
  const refs: ParsedRef[] = [];
  const refRegex = /(!?)\[([^\]]*)\]\(([^)\n]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = refRegex.exec(content)) !== null) {
    const rawTarget = match[3];
    const target = normalizeTarget(rawTarget);
    if (!target || isExternalTarget(target)) {
      continue;
    }
    refs.push({
      rawText: match[0],
      target,
      altOrText: match[2] || "missing",
      refType: match[1] === "!" ? "image" : "doc",
      line: lineFromOffset(content, match.index),
    });
  }
  return refs;
}

function walkFiles(rootPath: string, maxDepth = 8): string[] {
  const files: string[] = [];
  if (!fs.existsSync(rootPath)) {
    return files;
  }
  function walk(dir: string, depth: number): void {
    if (depth > maxDepth) {
      return;
    }
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) {
        continue;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else if (entry.isFile()) {
        files.push(full);
      }
    }
  }
  walk(rootPath, 0);
  return files;
}

function buildFileNameIndex(files: string[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const f of files) {
    const key = path.basename(f).toLowerCase();
    const arr = index.get(key);
    if (arr) {
      arr.push(f);
    } else {
      index.set(key, [f]);
    }
  }
  return index;
}

function pathDistance(a: string, b: string): number {
  const as = a.toLowerCase().split(/[\\/]+/).filter(Boolean);
  const bs = b.toLowerCase().split(/[\\/]+/).filter(Boolean);
  let sameTail = 0;
  const lim = Math.min(as.length, bs.length);
  for (let i = 1; i <= lim; i += 1) {
    if (as[as.length - i] === bs[bs.length - i]) {
      sameTail += 1;
    } else {
      break;
    }
  }
  return (as.length - sameTail) + (bs.length - sameTail);
}

function candidateFromPaths(
  paths: string[],
  projectByRoot: Array<{ projectName: string; rootPath: string }>,
  expectedPath: string
): BrokenRefCandidate[] {
  return paths
    .map((filePath) => {
      const owner = projectByRoot.find((p) => filePath.startsWith(p.rootPath));
      return {
        projectName: owner?.projectName ?? "unknown",
        filePath,
        distance: pathDistance(filePath, expectedPath),
      };
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5);
}

function createSvgPlaceholder(filePath: string, altText: string): boolean {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const safe = altText.replace(/[<>&"]/g, "");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="220" viewBox="0 0 800 220"><rect x="1" y="1" width="798" height="218" fill="#fff4f4" stroke="#c92a2a" stroke-width="2"/><text x="24" y="72" font-family="Segoe UI, Arial, sans-serif" font-size="24" fill="#7a1a1a">Missing Image Placeholder</text><text x="24" y="116" font-family="Consolas, monospace" font-size="18" fill="#5c5c5c">${safe || "missing"}</text><text x="24" y="156" font-family="Consolas, monospace" font-size="14" fill="#7a7a7a">Generated by list_broken_refs(createPlaceholder=true)</text></svg>`;
    fs.writeFileSync(filePath, svg, "utf8");
    return true;
  } catch {
    return false;
  }
}

export function listBrokenRefs(
  registry: ProjectRegistry,
  projectName?: string,
  createPlaceholder = false
): BrokenRefsResult {
  const docs = scanAllDocs(registry, projectName);
  const roots: Array<{ projectName: string; rootPath: string }> = [];

  if (!projectName || projectName === "global") {
    roots.push({ projectName: "global", rootPath: path.resolve(registry.globalDocsPath) });
  }
  for (const p of registry.projects) {
    if (projectName && p.name !== projectName) {
      continue;
    }
    roots.push({ projectName: p.name, rootPath: path.resolve(p.path) });
  }

  const projectIndices = new Map<string, Map<string, string[]>>();
  const allFiles: string[] = [];
  for (const root of roots) {
    const files = walkFiles(root.rootPath);
    projectIndices.set(root.projectName, buildFileNameIndex(files));
    allFiles.push(...files);
  }
  const allIndex = buildFileNameIndex(allFiles);
  const findings: BrokenRefFinding[] = [];
  let placeholdersCreated = 0;

  for (const doc of docs) {
    let content: string;
    try {
      content = fs.readFileSync(doc.filePath, "utf8");
    } catch {
      continue;
    }
    const refs = parseMarkdownRefs(content);
    const projectRoot = roots.find((r) => r.projectName === doc.projectName)?.rootPath;

    for (const ref of refs) {
      if (ref.target.startsWith("/doc/")) {
        const refId = ref.target.slice("/doc/".length).toLowerCase();
        const known = docs.some((d) => (d.id ?? "").toLowerCase() === refId);
        if (!known) {
          findings.push({
            projectName: doc.projectName,
            filePath: doc.filePath,
            line: ref.line,
            refType: "doc-id",
            target: ref.target,
            reason: "Doc id does not match any doc's frontmatter id",
            candidates: docs
              .filter((d) => d.projectName === doc.projectName && d.id)
              .slice(0, 5)
              .map((d) => ({ projectName: d.projectName, filePath: d.filePath, distance: 0 })),
          });
        }
        continue;
      }

      if (!projectRoot) {
        continue;
      }
      const resolved = path.resolve(path.dirname(doc.filePath), ref.target);
      if (fs.existsSync(resolved)) {
        continue;
      }

      const fileName = path.basename(resolved).toLowerCase();
      const localCandidates = projectIndices.get(doc.projectName)?.get(fileName) ?? [];
      const globalCandidates = allIndex.get(fileName) ?? [];
      const candidatePaths = localCandidates.length ? localCandidates : globalCandidates;
      const candidates = candidateFromPaths(candidatePaths, roots.map((r) => ({ projectName: r.projectName, rootPath: r.rootPath })), resolved);

      let placeholderCreated = false;
      if (
        createPlaceholder &&
        ref.refType === "image" &&
        /\.svg$/i.test(resolved) &&
        candidates.length === 0
      ) {
        placeholderCreated = createSvgPlaceholder(resolved, ref.altOrText);
        if (placeholderCreated) {
          placeholdersCreated += 1;
        }
      }

      findings.push({
        projectName: doc.projectName,
        filePath: doc.filePath,
        line: ref.line,
        refType: ref.refType,
        target: ref.target,
        resolvedPath: resolved,
        reason: "Referenced file does not exist",
        candidates,
        placeholderCreated,
      });
    }
  }

  const byProjectMap = new Map<string, { projectName: string; count: number }>();
  for (const f of findings) {
    const row = byProjectMap.get(f.projectName);
    if (row) {
      row.count += 1;
    } else {
      byProjectMap.set(f.projectName, { projectName: f.projectName, count: 1 });
    }
  }

  return {
    totalDocsScanned: docs.length,
    totalBroken: findings.length,
    findings,
    byProject: [...byProjectMap.values()].sort((a, b) => b.count - a.count),
    placeholdersCreated,
  };
}

export function repairBrokenRefs(input: {
  edits?: Array<{ filePath: string; oldText: string; newText: string }>;
  placeholders?: Array<{ filePath: string; altText?: string }>;
}): {
  editsApplied: number;
  placeholdersCreated: number;
  failures: string[];
} {
  const failures: string[] = [];
  let editsApplied = 0;
  let placeholdersCreated = 0;

  for (const edit of input.edits ?? []) {
    try {
      if (!fs.existsSync(edit.filePath)) {
        failures.push(`edit:file-missing:${edit.filePath}`);
        continue;
      }
      const current = fs.readFileSync(edit.filePath, "utf8");
      if (!current.includes(edit.oldText)) {
        failures.push(`edit:oldText-not-found:${edit.filePath}`);
        continue;
      }
      fs.writeFileSync(edit.filePath, current.replace(edit.oldText, edit.newText), "utf8");
      editsApplied += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push(`edit:error:${edit.filePath}:${msg}`);
    }
  }

  for (const p of input.placeholders ?? []) {
    if (!/\.svg$/i.test(p.filePath)) {
      failures.push(`placeholder:not-svg:${p.filePath}`);
      continue;
    }
    if (createSvgPlaceholder(p.filePath, p.altText ?? "missing")) {
      placeholdersCreated += 1;
    } else {
      failures.push(`placeholder:error:${p.filePath}`);
    }
  }

  return { editsApplied, placeholdersCreated, failures };
}
