import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  EchoToolSchema,
  ListFilesToolSchema,
  ReadFileToolSchema,
  ProjectStatusToolSchema,
  WriteFileToolSchema,
  EditFileToolSchema,
  DeleteFileToolSchema,
  CreateDirectoryToolSchema,
  ListProjectsToolSchema,
  FindProjectToolSchema,
  GetCatalogToolSchema,
  SearchDocsToolSchema,
  LookupDeweyToolSchema,
  ListBrokenRefsToolSchema,
  RepairBrokenRefsToolSchema,
  ListSymbolsToolSchema,
  FindSymbolToolSchema,
  ListCvtCommandsToolSchema,
} from "./definitions.js";
import {
  loadRegistry,
  findProjects,
  scanAllDocs,
  searchDocs,
  lookupDocsByDewey,
  listBrokenRefs,
  repairBrokenRefs,
} from "./catalog-helpers.js";
import {
  getSymbolIndex,
  filterSymbols,
  findSymbolByName,
  loadCvtCommands,
} from "../symbol-index.js";
import * as fs from "node:fs";
import * as path from "node:path";

export function registerTools(server: McpServer): void {
  server.tool(
    "echo",
    "Echoes back the provided message. Useful for testing connectivity.",
    EchoToolSchema.shape,
    async ({ message }) => {
      return {
        content: [{ type: "text" as const, text: `Echo: ${message}` }],
      };
    }
  );

  server.tool(
    "list_files",
    "Lists files in a directory with an optional pattern filter.",
    ListFilesToolSchema.shape,
    async ({ directory, pattern }) => {
      try {
        const resolvedDir: string = path.resolve(directory);

        if (!fs.existsSync(resolvedDir)) {
          return {
            content: [{ type: "text" as const, text: `Error: Directory not found: ${resolvedDir}` }],
          };
        }

        const entries: fs.Dirent[] = fs.readdirSync(resolvedDir, { withFileTypes: true });
        const files: string[] = entries
          .map((entry: fs.Dirent): string => {
            const prefix: string = entry.isDirectory() ? "[DIR]  " : "[FILE] ";
            return `${prefix}${entry.name}`;
          })
          .filter((name: string): boolean => {
            if (!pattern) return true;
            return name.toLowerCase().includes(pattern.toLowerCase());
          })
          .sort();

        const result: string = [
          `Directory: ${resolvedDir}`,
          `Entries: ${files.length}`,
          "---",
          ...files,
        ].join("\n");

        return { content: [{ type: "text" as const, text: result }] };
      } catch (error: unknown) {
        const msg: string = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error listing files: ${msg}` }],
        };
      }
    }
  );

  server.tool(
    "read_file",
    "Reads and returns the content of a file.",
    ReadFileToolSchema.shape,
    async ({ filePath }) => {
      try {
        const resolvedPath: string = path.resolve(filePath);

        if (!fs.existsSync(resolvedPath)) {
          return {
            content: [{ type: "text" as const, text: `Error: File not found: ${resolvedPath}` }],
          };
        }

        const content: string = fs.readFileSync(resolvedPath, "utf-8");
        return {
          content: [{ type: "text" as const, text: content }],
        };
      } catch (error: unknown) {
        const msg: string = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error reading file: ${msg}` }],
        };
      }
    }
  );

  server.tool(
    "project_status",
    "Reads the project status from docs/_today/CURRENT-STATUS.md if it exists.",
    ProjectStatusToolSchema.shape,
    async ({ projectPath }) => {
      try {
        const statusFile: string = path.resolve(
          projectPath,
          "docs",
          "_today",
          "CURRENT-STATUS.md"
        );

        if (!fs.existsSync(statusFile)) {
          return {
            content: [{ type: "text" as const, text: `No status file found at: ${statusFile}` }],
          };
        }

        const content: string = fs.readFileSync(statusFile, "utf-8");
        return {
          content: [{ type: "text" as const, text: `# Project Status\n\n${content}` }],
        };
      } catch (error: unknown) {
        const msg: string = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error reading project status: ${msg}` }],
        };
      }
    }
  );

  server.tool(
    "write_file",
    "Writes content to a file. Creates the file if it doesn't exist, overwrites if it does. Creates parent directories automatically.",
    WriteFileToolSchema.shape,
    async ({ filePath, content }) => {
      try {
        const resolvedPath: string = path.resolve(filePath);
        const dir: string = path.dirname(resolvedPath);

        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(resolvedPath, content, "utf-8");
        return {
          content: [{ type: "text" as const, text: `File written: ${resolvedPath}` }],
        };
      } catch (error: unknown) {
        const msg: string = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error writing file: ${msg}` }],
        };
      }
    }
  );

  server.tool(
    "edit_file",
    "Finds and replaces exact text in a file. The oldText must match exactly (including whitespace).",
    EditFileToolSchema.shape,
    async ({ filePath, oldText, newText }) => {
      try {
        const resolvedPath: string = path.resolve(filePath);

        if (!fs.existsSync(resolvedPath)) {
          return {
            content: [{ type: "text" as const, text: `Error: File not found: ${resolvedPath}` }],
          };
        }

        const content: string = fs.readFileSync(resolvedPath, "utf-8");

        if (!content.includes(oldText)) {
          return {
            content: [{ type: "text" as const, text: `Error: oldText not found in ${resolvedPath}` }],
          };
        }

        const updated: string = content.replace(oldText, newText);
        fs.writeFileSync(resolvedPath, updated, "utf-8");

        return {
          content: [{ type: "text" as const, text: `File edited: ${resolvedPath}` }],
        };
      } catch (error: unknown) {
        const msg: string = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error editing file: ${msg}` }],
        };
      }
    }
  );

  server.tool(
    "delete_file",
    "Deletes a file or directory. Use recursive=true for non-empty directories.",
    DeleteFileToolSchema.shape,
    async ({ filePath, recursive }) => {
      try {
        const resolvedPath: string = path.resolve(filePath);

        if (!fs.existsSync(resolvedPath)) {
          return {
            content: [{ type: "text" as const, text: `Error: Path not found: ${resolvedPath}` }],
          };
        }

        const stat: fs.Stats = fs.statSync(resolvedPath);

        if (stat.isDirectory()) {
          fs.rmSync(resolvedPath, { recursive: recursive ?? false });
        } else {
          fs.unlinkSync(resolvedPath);
        }

        return {
          content: [{ type: "text" as const, text: `Deleted: ${resolvedPath}` }],
        };
      } catch (error: unknown) {
        const msg: string = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error deleting: ${msg}` }],
        };
      }
    }
  );

  server.tool(
    "create_directory",
    "Creates a directory (and any missing parent directories).",
    CreateDirectoryToolSchema.shape,
    async ({ dirPath }) => {
      try {
        const resolvedPath: string = path.resolve(dirPath);
        fs.mkdirSync(resolvedPath, { recursive: true });
        return {
          content: [{ type: "text" as const, text: `Directory created: ${resolvedPath}` }],
        };
      } catch (error: unknown) {
        const msg: string = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error creating directory: ${msg}` }],
        };
      }
    }
  );

  // ─── Catalog tools ────────────────────────────────────────────────────────

  server.tool(
    "list_projects",
    "Lists all projects from the CieloVista project registry. Returns name, path, type, description, and status for each. No scanning — just the registry file. Optional status filter: product (shipped), workbench (active dev), generated (tool output), archived (retired). Use this first when looking for existing work before proposing anything new.",
    ListProjectsToolSchema.shape,
    async ({ status }) => {
      try {
        const registry = loadRegistry();
        const projects = status
          ? registry.projects.filter((p) => p.status === status)
          : registry.projects;
        const payload = {
          globalDocsPath: registry.globalDocsPath,
          status: status ?? "(all)",
          projectCount: projects.length,
          projects,
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
        };
      } catch (error: unknown) {
        const msg: string = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error loading registry: ${msg}` }],
        };
      }
    }
  );

  server.tool(
    "find_project",
    "Finds projects in the registry whose name or description contains the query (case-insensitive). Use for quick lookups like 'wb-core', 'wb-', or 'catalog'. Optional status filter narrows to one lifecycle stage. Returns all matching entries.",
    FindProjectToolSchema.shape,
    async ({ query, status }) => {
      try {
        const registry = loadRegistry();
        let matches = findProjects(registry, query);
        if (status) { matches = matches.filter((p) => p.status === status); }
        const payload = {
          query,
          status: status ?? "(all)",
          matchCount: matches.length,
          matches,
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
        };
      } catch (error: unknown) {
        const msg: string = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error finding project: ${msg}` }],
        };
      }
    }
  );

  server.tool(
    "get_catalog",
    "Scans every project in the registry for .md docs and returns a flat catalog. Each entry includes title/description plus Dewey identity, project metadata, tags, size, and last-modified date. Optionally filter by projectName to scan just one project. This does a live disk scan — call once per session and reuse the result.",
    GetCatalogToolSchema.shape,
    async ({ projectName }) => {
      try {
        const registry = loadRegistry();
        const docs = scanAllDocs(registry, projectName);
        const payload = {
          projectName: projectName ?? "(all)",
          docCount: docs.length,
          docs,
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
        };
      } catch (error: unknown) {
        const msg: string = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error building catalog: ${msg}` }],
        };
      }
    }
  );

  server.tool(
    "search_docs",
    "Case-insensitive search across all .md docs in the registry. Matches against title, description, filename, and extracted tags. Optionally restrict to a single project with projectName. Returns matching DocEntry records with Dewey and project metadata.",
    SearchDocsToolSchema.shape,
    async ({ query, projectName }) => {
      try {
        const registry = loadRegistry();
        const all = scanAllDocs(registry, projectName);
        const matches = searchDocs(all, query);
        const payload = {
          query,
          projectName: projectName ?? "(all)",
          matchCount: matches.length,
          matches,
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
        };
      } catch (error: unknown) {
        const msg: string = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error searching docs: ${msg}` }],
        };
      }
    }
  );

  server.tool(
    "lookup_dewey",
    "Finds locations by full or partial Dewey ID. Matches catalog docs and, optionally, CVT command catalog entries. Use when you only have a Dewey number and need file/command location quickly.",
    LookupDeweyToolSchema.shape,
    async ({ query, projectName, includeCommands, limit }) => {
      try {
        const max = limit ?? 25;
        const registry = loadRegistry();
        const docs = scanAllDocs(registry, projectName);
        const docMatches = lookupDocsByDewey(docs, query, max);

        const allCommands = includeCommands === false ? [] : loadCvtCommands();
        const normalizedRaw = query.trim().toLowerCase();
        const normalizedDigits = normalizedRaw.replace(/\D+/g, "");
        const rankedCommands = allCommands
          .map((cmd) => {
            const raw = (cmd.dewey ?? "").trim().toLowerCase();
            const digits = raw.replace(/\D+/g, "");
            if (!normalizedRaw) {
              return { cmd, score: 0 };
            }
            const score =
              raw === normalizedRaw || (normalizedDigits && digits === normalizedDigits)
                ? 300
                : raw.startsWith(normalizedRaw) || (normalizedDigits && digits.startsWith(normalizedDigits))
                  ? 200
                  : raw.includes(normalizedRaw) || (normalizedDigits && digits.includes(normalizedDigits))
                    ? 100
                    : 0;
            return { cmd, score };
          })
          .filter((row) => row.score > 0)
          .sort((a, b) => {
            if (b.score !== a.score) {
              return b.score - a.score;
            }
            return a.cmd.dewey.localeCompare(b.cmd.dewey);
          })
          .slice(0, max)
          .map((row) => row.cmd);

        const payload = {
          query,
          normalized: {
            raw: normalizedRaw,
            digits: normalizedDigits,
          },
          projectName: projectName ?? "(all)",
          includeCommands: includeCommands !== false,
          docMatchCount: docMatches.length,
          commandMatchCount: rankedCommands.length,
          docs: docMatches,
          commands: rankedCommands,
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
        };
      } catch (error: unknown) {
        const msg: string = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error looking up Dewey: ${msg}` }],
        };
      }
    }
  );

  server.tool(
    "list_broken_refs",
    "Scans markdown docs for missing image/doc references across registered projects. Detects broken relative links and image refs, suggests filename candidates (project-first then global), and can optionally create placeholder SVGs when createPlaceholder=true.",
    ListBrokenRefsToolSchema.shape,
    async ({ projectName, createPlaceholder }) => {
      try {
        const registry = loadRegistry();
        const report = listBrokenRefs(registry, projectName, createPlaceholder ?? false);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(report, null, 2) }],
        };
      } catch (error: unknown) {
        const msg: string = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error scanning broken refs: ${msg}` }],
        };
      }
    }
  );

  server.tool(
    "repair_broken_refs",
    "Applies approved broken-reference changes. Supports exact markdown text replacements and optional SVG placeholder creation for unresolved image references.",
    RepairBrokenRefsToolSchema.shape,
    async ({ edits, placeholders }) => {
      try {
        const result = repairBrokenRefs({ edits, placeholders });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: unknown) {
        const msg: string = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error repairing broken refs: ${msg}` }],
        };
      }
    }
  );

  // ─── Symbol index tools ─────────────────────────────────────────────────

  server.tool(
    "list_symbols",
    "Lists reusable code symbols across every registered project. Indexes both TypeScript (via tsc's generated .d.ts files) and JavaScript (direct parse of src/, scripts/, tests/). Filter by query, kind (function|class|interface|type|const|enum), projectName, role (src|script|test|declaration), or exportedOnly. Use this before writing any new helper — 10-100x faster than re-discovering existing code.",
    ListSymbolsToolSchema.shape,
    async (args) => {
      try {
        const all = getSymbolIndex(args.status ?? 'product');
        const filtered = filterSymbols(all, { ...args, limit: args.limit ?? 200 });
        const payload = {
          query: args.query ?? "",
          kind: args.kind ?? "(any)",
          projectName: args.projectName ?? "(all)",
          role: args.role ?? "(any)",
          status: args.status ?? "product",
          totalIndexed: all.length,
          matchCount: filtered.length,
          truncated: filtered.length >= (args.limit ?? 200),
          matches: filtered,
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
        };
      } catch (error: unknown) {
        const msg: string = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error listing symbols: ${msg}` }],
        };
      }
    }
  );

  server.tool(
    "find_symbol",
    "Resolves a symbol by exact name, with prefix fallback. Returns the best matches across every registered project with file path, line number, signature, and JSDoc. Equivalent to 'Go to Definition' in an IDE — use when you have a function or class name and need to know where it lives.",
    FindSymbolToolSchema.shape,
    async ({ name, status, limit }) => {
      try {
        const all = getSymbolIndex(status ?? 'product');
        const matches = findSymbolByName(all, name, limit ?? 10);
        const payload = {
          name,
          status: status ?? "product",
          totalIndexed: all.length,
          matchCount: matches.length,
          matches,
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
        };
      } catch (error: unknown) {
        const msg: string = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error finding symbol: ${msg}` }],
        };
      }
    }
  );

  server.tool(
    "list_cvt_commands",
    "Lists every CieloVista Tools command from the cielovista-tools catalog. Each entry has id, title, description, tags, group, Dewey number, scope, and source location. Optionally filter by group. Use this before proposing any new command — the 83-entry catalog is the authoritative index of what CVT already does.",
    ListCvtCommandsToolSchema.shape,
    async ({ group }) => {
      try {
        const all = loadCvtCommands();
        const filtered = group ? all.filter((c) => c.group === group) : all;
        const payload = {
          group: group ?? "(all)",
          totalCommands: all.length,
          matchCount: filtered.length,
          commands: filtered,
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
        };
      } catch (error: unknown) {
        const msg: string = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error listing CVT commands: ${msg}` }],
        };
      }
    }
  );
}
// FILE REMOVED BY REQUEST
