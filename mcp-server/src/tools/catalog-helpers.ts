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
          docs.push({
            projectName,
            fileName: entry.name,
            filePath: full,
            title: extractTitle(content, entry.name),
            description: extractDescription(content),
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
      trimmed.startsWith("```")
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
    docs.push(...scanProjectDocs(registry.globalDocsPath, "global"));
  }

  for (const p of registry.projects) {
    if (projectNameFilter && p.name !== projectNameFilter) {
      continue;
    }
    docs.push(...scanProjectDocs(p.path, p.name));
  }

  return docs;
}

export function searchDocs(docs: DocEntry[], query: string): DocEntry[] {
  const q = query.toLowerCase();
  return docs.filter(
    (d) =>
      d.title.toLowerCase().includes(q) ||
      d.description.toLowerCase().includes(q) ||
      d.fileName.toLowerCase().includes(q)
  );
}
