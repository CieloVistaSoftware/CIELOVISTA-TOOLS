// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Catalog helpers for the MCP server. Keeps AI-facing catalog tools
// self-contained from the extension's webview-focused catalog code.

import * as fs from "node:fs";
import * as path from "node:path";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ProjectEntry {
  name: string;
  path: string;
  type: string;
  description: string;
  /** Lifecycle status. Missing entries default to "product" for backward compatibility. */
  status?: "product" | "workbench" | "generated" | "archived";
  /** Fixed Dewey hundred for this project. Stored in project-registry.json. */
  dewey?: number;
  /** GitHub repository URL, used to build GitHub links in the viewer. */
  githubUrl?: string;
}

export interface ProjectRegistry {
  globalDocsPath: string;
  /** Dewey number for the global docs folder. Defaults to 0. */
  globalDewey?: number;
  projects: ProjectEntry[];
}

export interface DocEntry {
  projectName: string;
  fileName: string;
  filePath: string;
  title: string;
  description: string;
  dewey: string;
  subject?: string; // Frontmatter subject (the stable Dewey classification)
  id?: string; // Frontmatter id (the stable identity slug)
  projectDewey: number;
  projectPath: string;
  projectStatus: "product" | "workbench" | "generated" | "archived";
  tags: string[];
  sizeBytes: number;
  lastModified: string;
  helpMarkdown?: string;
}

interface ProjectDewey {
  num: number;
  label: string;
}

// ─── Registry ───────────────────────────────────────────────────────────────

export const REGISTRY_PATH =
  "C:\\Users\\jwpmi\\Downloads\\CieloVistaStandards\\project-registry.json";

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
  projectDewey: number,
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
          const help = extractDeweyAndHelp(full, content);
          const frontmatter = extractFrontmatterSubjectAndId(content);
          
          // Primary source: frontmatter subject. Fallback: extracted from filename pattern.
          const dewey = frontmatter.subject ?? help.dewey;
          
          docs.push({
            projectName,
            fileName: entry.name,
            filePath: full,
            title: extractTitle(content, entry.name),
            description: extractDescription(content),
            dewey: dewey ?? "unknown",
            subject: frontmatter.subject,
            id: frontmatter.id,
            projectDewey,
            projectPath,
            projectStatus,
            tags: extractTags(content, entry.name),
            sizeBytes: Buffer.byteLength(content, "utf8"),
            lastModified: stat.mtime.toISOString().slice(0, 10),
            helpMarkdown: help.helpMarkdown,
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

  for (const line of lines) {
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

export function extractDeweyAndHelp(
  mdFilePath: string,
  content: string
): { dewey?: string; helpMarkdown?: string } {
  const match = mdFilePath.match(/([0-9]{3,}\.[0-9]{3})\.md$/);
  const dewey = match ? match[1] : undefined;

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

  const helpMarkdown = helpLines.join("\n").trim() || undefined;
  return { dewey, helpMarkdown };
}

/** Extract subject and id from YAML frontmatter (between --- delimiters).
 * Returns extracted values or undefined if not found.
 */
export function extractFrontmatterSubjectAndId(content: string): { subject?: string; id?: string } {
  const lines = content.split("\n");
  if (lines[0]?.trim() !== "---") {
    return {};
  }

  const result: { subject?: string; id?: string } = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "---") {
      break; // End of frontmatter
    }

    const subjectMatch = line.match(/^subject:\s*(.+?)(?:\s*#.*)?$/);
    if (subjectMatch) {
      result.subject = subjectMatch[1].trim();
    }

    const idMatch = line.match(/^id:\s*(.+?)(?:\s*#.*)?$/);
    if (idMatch) {
      result.id = idMatch[1].trim();
    }
  }

  return result;
}

export function buildProjectDeweyMap(
  projects: ProjectEntry[] | string[],
  registry?: ProjectRegistry
): Map<string, ProjectDewey> {
  const map = new Map<string, ProjectDewey>();
  const globalDewey = registry?.globalDewey ?? 0;
  map.set("global", { num: globalDewey, label: "Global Standards" });

  if (projects.length === 0) { return map; }

  if (typeof projects[0] === "string") {
    // Legacy: string[] path — look up dewey from registry if available
    const entries = projects as string[];
    entries.forEach((name, index) => {
      const entry = registry?.projects.find((p) => p.name === name);
      const num = entry?.dewey ?? (index + 1) * 100;
      map.set(name, { num, label: name });
    });
  } else {
    // Preferred: ProjectEntry[] path — use dewey field directly
    const entries = projects as ProjectEntry[];
    entries.forEach((entry, index) => {
      const num = entry.dewey ?? (index + 1) * 100;
      map.set(entry.name, { num, label: entry.name });
    });
  }

  return map;
}

export function lookupDewey(
  map: Map<string, ProjectDewey>,
  projectName: string
): ProjectDewey {
  return map.get(projectName) ?? { num: 999, label: projectName };
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
  const deweyMap = buildProjectDeweyMap(registry.projects, registry);

  if (!projectNameFilter || projectNameFilter === "global") {
    docs.push(
      ...scanProjectDocs(
        registry.globalDocsPath,
        "global",
        registry.globalDocsPath,
        "product",
        lookupDewey(deweyMap, "global").num
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
        p.status ?? "product",
        lookupDewey(deweyMap, p.name).num
      )
    );
  }

  return docs;
}

export type DocViolationCode =
  | "missing-frontmatter"
  | "missing-subject"
  | "missing-id"
  | "missing-title"
  | "missing-project"
  | "missing-description"
  | "missing-status"
  | "invalid-subject-format"
  | "subject-project-mismatch"
  | "invalid-id-format"
  | "invalid-status"
  | "identity-collision";

export interface DocViolation {
  projectName: string;
  projectDewey: number;
  filePath: string;
  identity?: string;
  code: DocViolationCode;
  message: string;
}

export interface DocViolationsResult {
  totalDocsScanned: number;
  totalViolations: number;
  violations: DocViolation[];
  byProject: Array<{ projectName: string; projectDewey: number; count: number }>;
  byCode: Array<{ code: DocViolationCode; count: number }>;
}

export interface ValidateDocResult {
  ok: boolean;
  filePath: string;
  projectName: string;
  projectDewey: number;
  expectedSubjectPrefix: string;
  identity?: string;
  violations: DocViolation[];
}

function parseFrontmatter(content: string): Record<string, string> | null {
  const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*/);
  if (!match) {
    return null;
  }
  const result: Record<string, string> = {};
  const lines = match[1].split(/\r?\n/);
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx <= 0) {
      continue;
    }
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key) {
      result[key] = value;
    }
  }
  return result;
}

export function validateDoc(
  registry: ProjectRegistry,
  filePath: string
): ValidateDocResult {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`File not found: ${resolved}`);
  }
  if (!/\.md$/i.test(resolved)) {
    throw new Error(`validate_doc only supports .md files: ${resolved}`);
  }

  const deweyMap = buildProjectDeweyMap(registry.projects, registry);
  const roots: Array<{ projectName: string; rootPath: string; projectDewey: number }> = [
    { projectName: "global", rootPath: path.resolve(registry.globalDocsPath), projectDewey: 0 },
    ...registry.projects.map((p) => ({
      projectName: p.name,
      rootPath: path.resolve(p.path),
      projectDewey: lookupDewey(deweyMap, p.name).num,
    })),
  ];

  const lower = resolved.toLowerCase();
  const owner = roots.find((r) => lower.startsWith(r.rootPath.toLowerCase()));
  const projectName = owner?.projectName ?? "unknown";
  const projectDewey = owner?.projectDewey ?? 999;
  const expectedPrefix = String(projectDewey).padStart(3, "0");

  const content = fs.readFileSync(resolved, "utf8");
  const fm = parseFrontmatter(content);
  const violations: DocViolation[] = [];
  const allowedStatus = new Set(["active", "draft", "archived"]);
  let identity: string | undefined;

  if (!fm) {
    violations.push({
      projectName,
      projectDewey,
      filePath: resolved,
      code: "missing-frontmatter",
      message: "Missing YAML front-matter block",
    });
    return {
      ok: false,
      filePath: resolved,
      projectName,
      projectDewey,
      expectedSubjectPrefix: expectedPrefix,
      violations,
    };
  }

  const subject = (fm.subject ?? "").trim();
  const id = (fm.id ?? "").trim();
  const title = (fm.title ?? "").trim();
  const project = (fm.project ?? "").trim();
  const description = (fm.description ?? "").trim();
  const status = (fm.status ?? "").trim().toLowerCase();

  if (!subject) {
    violations.push({
      projectName,
      projectDewey,
      filePath: resolved,
      code: "missing-subject",
      message: "Missing required front-matter field: subject",
    });
  } else if (!/^\d{3}\.\d+$/.test(subject)) {
    violations.push({
      projectName,
      projectDewey,
      filePath: resolved,
      code: "invalid-subject-format",
      message: "subject must match pattern ###.# (for example 200.1)",
    });
  } else if (projectName !== "unknown" && !subject.startsWith(`${expectedPrefix}.`)) {
    violations.push({
      projectName,
      projectDewey,
      filePath: resolved,
      code: "subject-project-mismatch",
      message: `subject prefix must match project Dewey ${expectedPrefix}`,
    });
  }

  if (!id) {
    violations.push({
      projectName,
      projectDewey,
      filePath: resolved,
      code: "missing-id",
      message: "Missing required front-matter field: id",
    });
  } else if (!/^[a-z0-9]+(?:-[a-z0-9]+){0,24}$/.test(id) || id.length < 3 || id.length > 50) {
    violations.push({
      projectName,
      projectDewey,
      filePath: resolved,
      code: "invalid-id-format",
      message: "id must be lowercase-kebab-case, 3-50 chars",
    });
  }

  if (!title) {
    violations.push({
      projectName,
      projectDewey,
      filePath: resolved,
      code: "missing-title",
      message: "Missing required front-matter field: title",
    });
  }
  if (!project) {
    violations.push({
      projectName,
      projectDewey,
      filePath: resolved,
      code: "missing-project",
      message: "Missing required front-matter field: project",
    });
  }
  if (!description) {
    violations.push({
      projectName,
      projectDewey,
      filePath: resolved,
      code: "missing-description",
      message: "Missing required front-matter field: description",
    });
  }
  if (!status) {
    violations.push({
      projectName,
      projectDewey,
      filePath: resolved,
      code: "missing-status",
      message: "Missing required front-matter field: status",
    });
  } else if (!allowedStatus.has(status)) {
    violations.push({
      projectName,
      projectDewey,
      filePath: resolved,
      code: "invalid-status",
      message: "status must be one of: active, draft, archived",
    });
  }

  if (subject && id) {
    identity = `${subject}.${id}`.toLowerCase();
    const allDocs = scanAllDocs(registry);
    let seen = 0;
    for (const doc of allDocs) {
      try {
        const docFm = parseFrontmatter(fs.readFileSync(doc.filePath, "utf8"));
        if (!docFm) {
          continue;
        }
        const docSubject = (docFm.subject ?? "").trim().toLowerCase();
        const docId = (docFm.id ?? "").trim().toLowerCase();
        if (docSubject && docId && `${docSubject}.${docId}` === identity) {
          seen += 1;
        }
      } catch {
        // ignore unreadable docs
      }
    }
    if (seen > 1) {
      violations.push({
        projectName,
        projectDewey,
        filePath: resolved,
        identity,
        code: "identity-collision",
        message: `Identity collision: ${identity} appears in ${seen} docs`,
      });
    }
  }

  return {
    ok: violations.length === 0,
    filePath: resolved,
    projectName,
    projectDewey,
    expectedSubjectPrefix: expectedPrefix,
    identity,
    violations,
  };
}

export function listDocViolations(
  registry: ProjectRegistry,
  projectName?: string
): DocViolationsResult {
  const docs = scanAllDocs(registry, projectName);
  const deweyMap = buildProjectDeweyMap(registry.projects, registry);
  const violations: DocViolation[] = [];
  const identityBuckets = new Map<string, DocEntry[]>();
  const allowedStatus = new Set(["active", "draft", "archived"]);

  for (const doc of docs) {
    let content = "";
    try {
      content = fs.readFileSync(doc.filePath, "utf8");
    } catch {
      continue;
    }

    const projectDewey = doc.projectName === "global"
      ? 0
      : lookupDewey(deweyMap, doc.projectName).num;
    const expectedPrefix = String(projectDewey).padStart(3, "0");
    const fm = parseFrontmatter(content);

    if (!fm) {
      violations.push({
        projectName: doc.projectName,
        projectDewey,
        filePath: doc.filePath,
        code: "missing-frontmatter",
        message: "Missing YAML front-matter block",
      });
      continue;
    }

    const subject = (fm.subject ?? "").trim();
    const id = (fm.id ?? "").trim();
    const title = (fm.title ?? "").trim();
    const project = (fm.project ?? "").trim();
    const description = (fm.description ?? "").trim();
    const status = (fm.status ?? "").trim().toLowerCase();

    if (!subject) {
      violations.push({
        projectName: doc.projectName,
        projectDewey,
        filePath: doc.filePath,
        code: "missing-subject",
        message: "Missing required front-matter field: subject",
      });
    } else if (!/^\d{3}\.\d+$/.test(subject)) {
      violations.push({
        projectName: doc.projectName,
        projectDewey,
        filePath: doc.filePath,
        code: "invalid-subject-format",
        message: "subject must match pattern ###.# (for example 200.1)",
      });
    } else if (!subject.startsWith(`${expectedPrefix}.`)) {
      violations.push({
        projectName: doc.projectName,
        projectDewey,
        filePath: doc.filePath,
        code: "subject-project-mismatch",
        message: `subject prefix must match project Dewey ${expectedPrefix}`,
      });
    }

    if (!id) {
      violations.push({
        projectName: doc.projectName,
        projectDewey,
        filePath: doc.filePath,
        code: "missing-id",
        message: "Missing required front-matter field: id",
      });
    } else if (!/^[a-z0-9]+(?:-[a-z0-9]+){0,24}$/.test(id) || id.length < 3 || id.length > 50) {
      violations.push({
        projectName: doc.projectName,
        projectDewey,
        filePath: doc.filePath,
        code: "invalid-id-format",
        message: "id must be lowercase-kebab-case, 3-50 chars",
      });
    }

    if (!title) {
      violations.push({
        projectName: doc.projectName,
        projectDewey,
        filePath: doc.filePath,
        code: "missing-title",
        message: "Missing required front-matter field: title",
      });
    }
    if (!project) {
      violations.push({
        projectName: doc.projectName,
        projectDewey,
        filePath: doc.filePath,
        code: "missing-project",
        message: "Missing required front-matter field: project",
      });
    }
    if (!description) {
      violations.push({
        projectName: doc.projectName,
        projectDewey,
        filePath: doc.filePath,
        code: "missing-description",
        message: "Missing required front-matter field: description",
      });
    }
    if (!status) {
      violations.push({
        projectName: doc.projectName,
        projectDewey,
        filePath: doc.filePath,
        code: "missing-status",
        message: "Missing required front-matter field: status",
      });
    } else if (!allowedStatus.has(status)) {
      violations.push({
        projectName: doc.projectName,
        projectDewey,
        filePath: doc.filePath,
        code: "invalid-status",
        message: "status must be one of: active, draft, archived",
      });
    }

    if (subject && id) {
      const identity = `${subject}.${id}`.toLowerCase();
      const bucket = identityBuckets.get(identity);
      if (bucket) {
        bucket.push(doc);
      } else {
        identityBuckets.set(identity, [doc]);
      }
    }
  }

  for (const [identity, bucket] of identityBuckets) {
    if (bucket.length < 2) {
      continue;
    }
    for (const doc of bucket) {
      violations.push({
        projectName: doc.projectName,
        projectDewey: doc.projectDewey,
        filePath: doc.filePath,
        identity,
        code: "identity-collision",
        message: `Identity collision: ${identity} appears in ${bucket.length} docs`,
      });
    }
  }

  const byProjectMap = new Map<string, { projectName: string; projectDewey: number; count: number }>();
  for (const v of violations) {
    const key = `${v.projectName}:${v.projectDewey}`;
    const row = byProjectMap.get(key);
    if (row) {
      row.count += 1;
    } else {
      byProjectMap.set(key, { projectName: v.projectName, projectDewey: v.projectDewey, count: 1 });
    }
  }

  const byCodeMap = new Map<DocViolationCode, number>();
  for (const v of violations) {
    byCodeMap.set(v.code, (byCodeMap.get(v.code) ?? 0) + 1);
  }

  return {
    totalDocsScanned: docs.length,
    totalViolations: violations.length,
    violations,
    byProject: [...byProjectMap.values()].sort((a, b) => b.count - a.count),
    byCode: [...byCodeMap.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count),
  };
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

function normalizeDeweyQuery(input: string): { raw: string; digits: string } {
  const raw = input.trim().toLowerCase();
  const digits = raw.replace(/\D+/g, "");
  return { raw, digits };
}

function scoreDeweyMatch(candidate: string, query: string): number {
  const c = normalizeDeweyQuery(candidate);
  const q = normalizeDeweyQuery(query);
  if (!q.raw) {
    return 0;
  }
  if (c.raw === q.raw || (q.digits && c.digits === q.digits)) {
    return 300;
  }
  if (c.raw.startsWith(q.raw) || (q.digits && c.digits.startsWith(q.digits))) {
    return 200;
  }
  if (c.raw.includes(q.raw) || (q.digits && c.digits.includes(q.digits))) {
    return 100;
  }
  return 0;
}

export function lookupDocsByDewey(docs: DocEntry[], query: string, limit = 25): DocEntry[] {
  const ranked = docs
    .map((doc) => ({ doc, score: scoreDeweyMatch(doc.dewey, query) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.doc.dewey.localeCompare(b.doc.dewey);
    })
    .slice(0, limit);
  return ranked.map((row) => row.doc);
}

export interface BrokenRefCandidate {
  projectName: string;
  filePath: string;
  distance: number;
}

export interface BrokenRefFinding {
  projectName: string;
  projectDewey: number;
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
  byProject: Array<{ projectName: string; projectDewey: number; count: number }>;
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
  const q = trimmed.indexOf("?");
  const h = trimmed.indexOf("#");
  let end = trimmed.length;
  if (q >= 0) { end = Math.min(end, q); }
  if (h >= 0) { end = Math.min(end, h); }
  const noFrag = trimmed.slice(0, end);
  try { return decodeURI(noFrag); } catch { return noFrag; }
}

function isExternalTarget(target: string): boolean {
  const t = target.toLowerCase();
  return (
    t.startsWith("http://") ||
    t.startsWith("https://") ||
    t.startsWith("mailto:") ||
    t.startsWith("tel:") ||
    t.startsWith("#")
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
  const roots: Array<{ projectName: string; projectDewey: number; rootPath: string }> = [];

  if (!projectName || projectName === "global") {
    roots.push({ projectName: "global", projectDewey: 0, rootPath: path.resolve(registry.globalDocsPath) });
  }
  for (const p of registry.projects) {
    if (projectName && p.name !== projectName) {
      continue;
    }
    const deweyMap = buildProjectDeweyMap(registry.projects, registry);
    roots.push({ projectName: p.name, projectDewey: lookupDewey(deweyMap, p.name).num, rootPath: path.resolve(p.path) });
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
    const projectDewey = roots.find((r) => r.projectName === doc.projectName)?.projectDewey ?? doc.projectDewey;

    for (const ref of refs) {
      if (ref.target.startsWith("/doc/")) {
        const docId = ref.target.slice("/doc/".length).toLowerCase();
        const known = docs.some((d) => d.dewey.toLowerCase() === docId);
        if (!known) {
          findings.push({
            projectName: doc.projectName,
            projectDewey,
            filePath: doc.filePath,
            line: ref.line,
            refType: "doc-id",
            target: ref.target,
            reason: "Doc-contract ID does not match any known Dewey entry",
            candidates: docs
              .filter((d) => d.dewey.slice(0, 3) === String(projectDewey).padStart(3, "0"))
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
        projectDewey,
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

  const byProjectMap = new Map<string, { projectName: string; projectDewey: number; count: number }>();
  for (const f of findings) {
    const key = `${f.projectName}:${f.projectDewey}`;
    const row = byProjectMap.get(key);
    if (row) {
      row.count += 1;
    } else {
      byProjectMap.set(key, { projectName: f.projectName, projectDewey: f.projectDewey, count: 1 });
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

// ─── Phase 3: Normalizer ─────────────────────────────────────────────────────

export interface NormalizeDocResult {
  filePath: string;
  projectName: string;
  projectDewey: number;
  hasFrontmatter: boolean;
  missingFields: string[];
  proposed: {
    subject?: string;
    id?: string;
    title?: string;
    project?: string;
    description?: string;
    status?: string;
  };
  suggestedFrontmatter: string;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50)
    .replace(/^-|-$/g, "");
}

export function normalizeDoc(
  registry: ProjectRegistry,
  filePath: string
): NormalizeDocResult {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`File not found: ${resolved}`);
  }

  const deweyMap = buildProjectDeweyMap(registry.projects, registry);
  const roots: Array<{ projectName: string; rootPath: string; projectDewey: number }> = [
    { projectName: "global", rootPath: path.resolve(registry.globalDocsPath), projectDewey: registry.globalDewey ?? 0 },
    ...registry.projects.map((p) => ({
      projectName: p.name,
      rootPath: path.resolve(p.path),
      projectDewey: deweyMap.get(p.name)?.num ?? 999,
    })),
  ];

  const lower = resolved.toLowerCase();
  const owner = roots.find((r) => lower.startsWith(r.rootPath.toLowerCase()));
  const projectName = owner?.projectName ?? "unknown";
  const projectDewey = owner?.projectDewey ?? 999;
  const prefix = String(projectDewey).padStart(3, "0");

  const content = fs.readFileSync(resolved, "utf8");
  const fm = parseFrontmatter(content);
  const hasFrontmatter = fm !== null;

  const subject = fm?.subject?.trim() ?? "";
  const id = fm?.id?.trim() ?? "";
  const title = fm?.title?.trim() ?? extractTitle(content, path.basename(resolved));
  const project = fm?.project?.trim() ?? "";
  const description = fm?.description?.trim() ?? extractDescription(content);
  const status = fm?.status?.trim() ?? "";

  const missing: string[] = [];
  const proposed: NormalizeDocResult["proposed"] = {};

  if (!subject) {
    missing.push("subject");
    proposed.subject = `${prefix}.9`;
  }
  if (!id) {
    missing.push("id");
    const raw = slugify(title || path.basename(resolved, ".md"));
    proposed.id = raw.length >= 3 ? raw : `${raw}-doc`;
  }
  if (!title) {
    missing.push("title");
    proposed.title = path.basename(resolved, ".md").replace(/[-_]/g, " ");
  }
  if (!project) {
    missing.push("project");
    if (projectName !== "unknown") { proposed.project = projectName; }
  }
  if (!description) {
    missing.push("description");
    const auto = extractDescription(content);
    if (auto !== "No description.") { proposed.description = auto.slice(0, 200); }
  }
  if (!status) {
    missing.push("status");
    proposed.status = "draft";
  }

  const merged = {
    subject: subject || proposed.subject || `${prefix}.9`,
    id: id || proposed.id || "unnamed-doc",
    title: title || proposed.title || path.basename(resolved, ".md"),
    project: project || proposed.project || projectName,
    description: description || proposed.description || "No description.",
    status: status || proposed.status || "draft",
  };

  const suggestedFrontmatter = [
    "---",
    `subject: ${merged.subject}`,
    `id: ${merged.id}`,
    `title: ${merged.title}`,
    `project: ${merged.project}`,
    `description: ${merged.description.slice(0, 200)}`,
    `status: ${merged.status}`,
    "---",
  ].join("\n");

  return { filePath: resolved, projectName, projectDewey, hasFrontmatter, missingFields: missing, proposed, suggestedFrontmatter };
}

// ─── Phase 4: Doc ledger / identity resolution ───────────────────────────────

export interface DocIdentityEntry {
  identity: string;
  subject: string;
  id: string;
  filePath: string;
  projectName: string;
  projectDewey: number;
  title: string;
  description: string;
  status: string;
  githubUrl?: string;
}

export interface DocLedgerResult {
  docsScanned: number;
  identitiesIndexed: number;
  duplicates: number;
  index: DocIdentityEntry[];
}

const ALIAS_PATH =
  "C:\\Users\\jwpmi\\Downloads\\CieloVistaStandards\\dewey-aliases.json";

function loadAliases(): Record<string, string> {
  try {
    if (!fs.existsSync(ALIAS_PATH)) { return {}; }
    const raw = JSON.parse(fs.readFileSync(ALIAS_PATH, "utf8")) as { aliases?: Record<string, string> };
    return raw.aliases ?? {};
  } catch {
    return {};
  }
}

export function buildDocLedger(
  registry: ProjectRegistry,
  projectName?: string
): DocLedgerResult {
  const docs = scanAllDocs(registry, projectName);
  const deweyMap = buildProjectDeweyMap(registry.projects, registry);
  const index: DocIdentityEntry[] = [];
  const seen = new Map<string, number>();
  let duplicates = 0;

  const githubByProject = new Map<string, string>();
  for (const p of registry.projects) {
    if (p.githubUrl) { githubByProject.set(p.name, p.githubUrl); }
  }

  for (const doc of docs) {
    let content = "";
    try { content = fs.readFileSync(doc.filePath, "utf8"); } catch { continue; }
    const fm = parseFrontmatter(content);
    if (!fm) { continue; }
    const subject = (fm.subject ?? "").trim();
    const id = (fm.id ?? "").trim();
    if (!subject || !id) { continue; }
    const identity = `${subject}.${id}`.toLowerCase();
    const projectDewey = doc.projectName === "global"
      ? (registry.globalDewey ?? 0)
      : (deweyMap.get(doc.projectName)?.num ?? 999);
    seen.set(identity, (seen.get(identity) ?? 0) + 1);
    if ((seen.get(identity) ?? 0) > 1) { duplicates += 1; }
    index.push({
      identity,
      subject,
      id,
      filePath: doc.filePath,
      projectName: doc.projectName,
      projectDewey,
      title: (fm.title ?? doc.title).trim(),
      description: (fm.description ?? doc.description).trim(),
      status: (fm.status ?? "active").trim(),
      githubUrl: githubByProject.get(doc.projectName),
    });
  }

  return { docsScanned: docs.length, identitiesIndexed: index.length, duplicates, index };
}

export function getDocByIdentity(
  registry: ProjectRegistry,
  identity: string
): DocIdentityEntry | null {
  const normalized = identity.trim().toLowerCase();
  const aliases = loadAliases();
  const resolved = aliases[normalized] ?? normalized;

  const ledger = buildDocLedger(registry);
  return ledger.index.find((e) => e.identity === resolved) ?? null;
}

// ─── Phase 4: Old Dewey scanner ──────────────────────────────────────────────

export interface OldDeweyEntry {
  filePath: string;
  projectName: string;
  projectDewey: number;
  title: string;
  oldDewey: string;
  source: "filename" | "frontmatter-category" | "frontmatter-dewey";
}

export interface OldDeweyResult {
  totalFound: number;
  docs: OldDeweyEntry[];
}

export function listOldDewey(
  registry: ProjectRegistry,
  projectName?: string
): OldDeweyResult {
  const docs = scanAllDocs(registry, projectName);
  const deweyMap = buildProjectDeweyMap(registry.projects, registry);
  const results: OldDeweyEntry[] = [];

  for (const doc of docs) {
    const projectDewey = doc.projectName === "global"
      ? (registry.globalDewey ?? 0)
      : (deweyMap.get(doc.projectName)?.num ?? 999);

    // Check filename pattern: NNN.NNN.md or NNNN.NNN.md
    const fnMatch = path.basename(doc.filePath).match(/^(\d{3,}\.\d{3})\.md$/i);
    if (fnMatch) {
      results.push({ filePath: doc.filePath, projectName: doc.projectName, projectDewey, title: doc.title, oldDewey: fnMatch[1], source: "filename" });
      continue;
    }

    // Check front-matter for old-style numeric `category` or `dewey` fields
    let content = "";
    try { content = fs.readFileSync(doc.filePath, "utf8"); } catch { continue; }
    const fm = parseFrontmatter(content);
    if (!fm) { continue; }

    const category = (fm.category ?? "").trim();
    if (category && /^\d{3,}\.\d{3}$/.test(category)) {
      results.push({ filePath: doc.filePath, projectName: doc.projectName, projectDewey, title: doc.title, oldDewey: category, source: "frontmatter-category" });
      continue;
    }
    const dewey = (fm.dewey ?? "").trim();
    if (dewey && /^\d{3,}\.\d{3}$/.test(dewey)) {
      results.push({ filePath: doc.filePath, projectName: doc.projectName, projectDewey, title: doc.title, oldDewey: dewey, source: "frontmatter-dewey" });
    }
  }

  return { totalFound: results.length, docs: results };
}

// ─── Phase 4: Dewey migration proposal ──────────────────────────────────────

export interface MigrateDeweyResult {
  filePath: string;
  projectName: string;
  oldDewey: string | null;
  proposedSubject: string;
  proposedId: string;
  proposedIdentity: string;
  suggestedFrontmatterAdditions: string;
  aliasEntry: { old: string; new: string } | null;
}

export function migrateDewey(
  registry: ProjectRegistry,
  filePath: string,
  overrideSubject?: string,
  overrideId?: string
): MigrateDeweyResult {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`File not found: ${resolved}`);
  }

  const norm = normalizeDoc(registry, resolved);
  const content = fs.readFileSync(resolved, "utf8");
  const fm = parseFrontmatter(content);

  // Find old Dewey: filename pattern, or category/dewey front-matter field
  let oldDewey: string | null = null;
  const fnMatch = path.basename(resolved).match(/^(\d{3,}\.\d{3})\.md$/i);
  if (fnMatch) { oldDewey = fnMatch[1]; }
  else if (fm) {
    const cat = (fm.category ?? "").trim();
    const dw = (fm.dewey ?? "").trim();
    if (/^\d{3,}\.\d{3}$/.test(cat)) { oldDewey = cat; }
    else if (/^\d{3,}\.\d{3}$/.test(dw)) { oldDewey = dw; }
  }

  const proposedSubject = overrideSubject ?? norm.proposed.subject ?? fm?.subject ?? `${String(norm.projectDewey).padStart(3, "0")}.9`;
  const rawId = overrideId ?? norm.proposed.id ?? fm?.id ?? slugify(norm.proposed.title ?? path.basename(resolved, ".md"));
  const proposedId = rawId.length >= 3 ? rawId : `${rawId}-doc`;
  const proposedIdentity = `${proposedSubject}.${proposedId}`.toLowerCase();

  const suggestedFrontmatterAdditions = [
    `subject: ${proposedSubject}`,
    `id: ${proposedId}`,
    `project: ${norm.projectName}`,
    `status: draft`,
  ].join("\n");

  const aliasEntry = oldDewey
    ? { old: oldDewey, new: proposedIdentity }
    : null;

  return { filePath: resolved, projectName: norm.projectName, oldDewey, proposedSubject, proposedId, proposedIdentity, suggestedFrontmatterAdditions, aliasEntry };
}
