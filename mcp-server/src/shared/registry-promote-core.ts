// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * registry-promote-core.ts
 *
 * Registering a project in the CieloVista registry, with no VS Code in sight.
 *
 * Until #696 this logic lived only in src/features/registry-promote.ts, which
 * imports vscode at the top level. That made promotion reachable exactly one
 * way: a human clicking through interactive prompts in the extension host. An
 * agent could read the registry through five MCP tools and never add to it —
 * backwards, for the one job most likely to be delegated. Registering a project
 * meant hand-editing project-registry.json and then re-deriving CLAUDE.md and
 * README.md by hand from code that already knew how to write them.
 *
 * WHY THIS FILE LIVES HERE, under mcp-server/src/ rather than src/shared/:
 *
 * mcp-server compiles with its own tsconfig whose rootDir is ./src, and its
 * entry path dist/index.js is named in package.json main+bin, in
 * mcp-server-status.ts, and in the packaging tests. Widening rootDir to reach
 * src/shared/ would relocate that entry to dist/mcp-server/src/index.js and
 * break all of them at once. So the shared core has to sit inside mcp-server's
 * rootDir and be imported by the extension — which is esbuild-bundled and
 * resolves freely — and not the other way round.
 *
 * Rules:
 *   - No vscode import, ever. That is the whole point of the file.
 *   - No prompting, no UI. Callers supply every value; this returns a report.
 *   - Throws rather than showing a message; the extension catches and renders.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  REGISTRY_PATH,
  loadRegistry,
  type ProjectEntry,
  type ProjectRegistry,
} from "../tools/catalog-helpers.js";

export { REGISTRY_PATH, loadRegistry };
export type { ProjectEntry, ProjectRegistry };

const GLOBAL_DOCS_DIR = path.join(os.homedir(), "Downloads", "CieloVistaStandards");

/** Project types the registry accepts. Kept in step with registry-promote.ts. */
export const PROJECT_TYPES = [
  "vscode-extension",
  "web-app",
  "library",
  "cli",
  "mcp-server",
  "website",
  "other",
] as const;

export type ProjectType = (typeof PROJECT_TYPES)[number];

/**
 * Writes the registry back to disk, pretty-printed at 2-space indent to match
 * the hand-maintained style. Throws on write failure.
 */
export function saveRegistry(registry: ProjectRegistry): void {
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2), "utf8");
}

/** Builds a minimal CLAUDE.md tailored to the new project. */
export function buildClaudeMd(projectName: string, projectPath: string): string {
  return [
    `# CLAUDE.md — ${projectName}`,
    "",
    "## Session Start",
    "",
    "1. Read this file",
    "2. Read docs/status/current-status.md if it exists",
    "3. Start working — no questions",
    "",
    "## Project",
    "",
    `**Name:** ${projectName}`,
    `**Location:** ${projectPath}`,
    `**Status:** product`,
    "",
    "## Build",
    "",
    "```powershell",
    "# TODO: add build command",
    "```",
    "",
    "## Global Standards",
    "",
    "These apply to ALL CieloVista projects:",
    "",
    "| Document | Location |",
    "|---|---|",
    `| Copilot Rules | \`${path.join(GLOBAL_DOCS_DIR, "copilot-rules.md")}\` |`,
    `| JavaScript Standards | \`${path.join(GLOBAL_DOCS_DIR, "javascript_standards.md")}\` |`,
    `| Git Workflow | \`${path.join(GLOBAL_DOCS_DIR, "git_workflow.md")}\` |`,
    `| Project Registry | \`${REGISTRY_PATH}\` |`,
    "",
  ].join("\n");
}

/** Builds a minimal README.md tailored to the new project. */
export function buildReadmeMd(projectName: string, type: string, description: string): string {
  const desc = description.trim() || "_Short description pending._";
  return [
    `# ${projectName}`,
    "",
    desc,
    "",
    "## Type",
    "",
    `\`${type}\``,
    "",
    "## Status",
    "",
    "Product — registered in the CieloVista project registry.",
    "",
    "## Getting Started",
    "",
    "_TODO: describe install / build / run._",
    "",
    "## License",
    "",
    "Copyright (c) 2026 CieloVista Software. All rights reserved.",
    "",
  ].join("\n");
}

export interface PromoteResult {
  ok: boolean;
  registryEntry: ProjectEntry;
  claudeWritten: boolean;
  readmeWritten: boolean;
  alreadyInRegistry: boolean;
  message: string;
}

/**
 * Registers a folder as a product project, scaffolding CLAUDE.md and README.md
 * if they are absent.
 *
 * Existing files are never overwritten. A project already in the registry is
 * updated to status=product rather than duplicated — matching on name OR path,
 * case-insensitively, because the same project arriving under a different
 * spelling of its path is the common way a duplicate entry gets created.
 *
 * @param folderPath  Absolute path to the project root.
 * @param name        Registry name.
 * @param type        One of PROJECT_TYPES.
 * @param description Short description for README.md and the registry entry.
 * @param dryRun      When true, reports what would happen and writes nothing.
 */
export function promoteFolder(
  folderPath: string,
  name: string,
  type: string,
  description: string,
  dryRun = false
): PromoteResult {
  const fallbackEntry: ProjectEntry = {
    name,
    path: folderPath,
    type,
    description,
    status: "product",
  };

  if (!fs.existsSync(folderPath)) {
    return {
      ok: false,
      registryEntry: fallbackEntry,
      claudeWritten: false,
      readmeWritten: false,
      alreadyInRegistry: false,
      message: `Folder does not exist: ${folderPath}`,
    };
  }

  let registry: ProjectRegistry;
  try {
    registry = loadRegistry();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      registryEntry: fallbackEntry,
      claudeWritten: false,
      readmeWritten: false,
      alreadyInRegistry: false,
      message: `Could not load registry: ${msg}`,
    };
  }

  const existing = registry.projects.find(
    (p) =>
      p.name.toLowerCase() === name.toLowerCase() ||
      p.path.toLowerCase() === folderPath.toLowerCase()
  );
  const alreadyInRegistry = !!existing;

  const entry: ProjectEntry = existing ?? fallbackEntry;

  const claudePath = path.join(folderPath, "CLAUDE.md");
  const readmePath = path.join(folderPath, "README.md");
  const wouldWriteClaude = !fs.existsSync(claudePath);
  const wouldWriteReadme = !fs.existsSync(readmePath);

  if (dryRun) {
    const planned: string[] = [];
    planned.push(
      alreadyInRegistry
        ? `would update "${name}" to status=product`
        : `would register "${name}" as product`
    );
    if (wouldWriteClaude) { planned.push("would create CLAUDE.md"); }
    if (wouldWriteReadme) { planned.push("would create README.md"); }
    if (!wouldWriteClaude && !wouldWriteReadme) {
      planned.push("CLAUDE.md and README.md already present");
    }
    return {
      ok: true,
      registryEntry: entry,
      claudeWritten: false,
      readmeWritten: false,
      alreadyInRegistry,
      message: "Dry run — nothing written; " + planned.join("; ") + ".",
    };
  }

  if (!existing) {
    registry.projects.push(entry);
    saveRegistry(registry);
  } else if (existing.status !== "product") {
    /* Promote an existing entry that was workbench/generated/archived. */
    existing.status = "product";
    saveRegistry(registry);
  }

  let claudeWritten = false;
  if (wouldWriteClaude) {
    fs.writeFileSync(claudePath, buildClaudeMd(name, folderPath), "utf8");
    claudeWritten = true;
  }

  let readmeWritten = false;
  if (wouldWriteReadme) {
    fs.writeFileSync(readmePath, buildReadmeMd(name, type, description), "utf8");
    readmeWritten = true;
  }

  const bits: string[] = [];
  bits.push(
    alreadyInRegistry ? `Updated "${name}" to status=product` : `Registered "${name}" as product`
  );
  if (claudeWritten) { bits.push("created CLAUDE.md"); }
  if (readmeWritten) { bits.push("created README.md"); }
  if (!claudeWritten && !readmeWritten) {
    bits.push("CLAUDE.md and README.md already present");
  }

  return {
    ok: true,
    registryEntry: entry,
    claudeWritten,
    readmeWritten,
    alreadyInRegistry,
    message: bits.join("; ") + ".",
  };
}

/** Sets a project's lifecycle status. Used by demote and archive. */
function setStatus(
  name: string,
  status: NonNullable<ProjectEntry["status"]>,
  verb: string
): { ok: boolean; message: string } {
  let registry: ProjectRegistry;
  try {
    registry = loadRegistry();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Could not load registry: ${msg}` };
  }

  const entry = registry.projects.find((p) => p.name.toLowerCase() === name.toLowerCase());
  if (!entry) {
    return { ok: false, message: `Project "${name}" not found in registry.` };
  }

  if (entry.status === status) {
    return { ok: true, message: `"${name}" is already status=${status}.` };
  }

  entry.status = status;
  saveRegistry(registry);
  return { ok: true, message: `${verb} "${name}" — set status=${status}.` };
}

/** Change a project's status to 'workbench' (demote from product). */
export function demoteFolder(name: string): { ok: boolean; message: string } {
  return setStatus(name, "workbench", "Demoted");
}

/** Change a project's status to 'archived'. */
export function archiveFolder(name: string): { ok: boolean; message: string } {
  return setStatus(name, "archived", "Archived");
}
