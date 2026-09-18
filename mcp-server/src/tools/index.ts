import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  EchoToolSchema,
  NotifyToolSchema,
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
  ListBrokenRefsToolSchema,
  RepairBrokenRefsToolSchema,
  ListSymbolsToolSchema,
  FindSymbolToolSchema,
  ListCvtCommandsToolSchema,
  AuditDuplicationToolSchema,
  RegistryPromoteToolSchema,
  RegistrySetStatusToolSchema,
} from "./definitions.js";
import {
  loadRegistry,
  findProjects,
  scanAllDocs,
  searchDocs,
  listBrokenRefs,
  repairBrokenRefs,
} from "./catalog-helpers.js";
import {
  getSymbolIndex,
  filterSymbols,
  findSymbolByName,
  loadCvtCommands,
} from "../symbol-index.js";
import {
  promoteFolder,
  demoteFolder,
  archiveFolder,
} from "../shared/registry-promote-core.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

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
    "notify",
    "Send a message to the CieloVista Tools output channel in VS Code. Use this to report status updates, findings, or notes directly into John's VS Code window without interrupting the chat.",
    NotifyToolSchema.shape,
    async ({ message, level }) => {
      try {
        const res = await fetch("http://127.0.0.1:52199/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, level: level ?? "info" }),
        });
        if (res.ok) {
          return { content: [{ type: "text" as const, text: "✓ Message sent to VS Code output channel." }] };
        } else {
          return { content: [{ type: "text" as const, text: `Failed: HTTP ${res.status} — is the extension running?` }] };
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Failed to reach notify server: ${msg}` }] };
      }
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
    "Reads the project status from docs/status/current-status.md if it exists.",
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
    "Scans every project in the registry for .md docs and returns a flat catalog. Each entry includes title, description, frontmatter id, project metadata, tags, size, and last-modified date. Optionally filter by projectName to scan just one project. This does a live disk scan — call once per session and reuse the result.",
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
    "Case-insensitive search across all .md docs in the registry. Matches against title, description, filename, and extracted tags. Optionally restrict to a single project with projectName. Returns matching DocEntry records with project metadata.",
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
    "Lists every CieloVista Tools command from the cielovista-tools catalog. Each entry has id, title, description, tags, group, scope, action and source location. Optionally filter by group. Use this before proposing any new command — the catalog is the authoritative index of what CVT already does.",
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

  server.tool(
    "cvs_audit_duplication",
    "Runs the CieloVista code duplication auditor across registered projects. Detects exact, near, and repeated-pattern duplicate code blocks and returns suggested shared abstraction paths.",
    AuditDuplicationToolSchema.shape,
    async ({ json, minLines, minStatements, nearThreshold, registryPath }) => {
      try {
        const mcpRoot = path.resolve(__dirname, "..", "..");
        const repoRoot = path.resolve(mcpRoot, "..");
        const scriptPath = path.resolve(repoRoot, "scripts", "code-auditor.js");

        if (!fs.existsSync(scriptPath)) {
          return {
            content: [{ type: "text" as const, text: `Error: code auditor script not found: ${scriptPath}` }],
          };
        }

        const args: string[] = [];
        if (json !== false) {
          args.push("--json");
        }
        if (typeof minLines === "number") {
          args.push(`--min-lines=${minLines}`);
        }
        if (typeof minStatements === "number") {
          args.push(`--min-statements=${minStatements}`);
        }
        if (typeof nearThreshold === "number") {
          args.push(`--near-threshold=${nearThreshold}`);
        }
        if (registryPath && registryPath.trim()) {
          args.push(`--registry=${registryPath.trim()}`);
        }

        const output = execFileSync(process.execPath, [scriptPath, ...args], {
          cwd: repoRoot,
          encoding: "utf8",
          maxBuffer: 16 * 1024 * 1024,
        });

        return {
          content: [{ type: "text" as const, text: output }],
        };
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error running duplication audit: ${msg}` }],
        };
      }
    }
  );

  // -- Registry write tools (#696) -------------------------------------

  server.tool(
    "registry_promote",
    "Registers a folder in the CieloVista project registry as status=product, creating CLAUDE.md and README.md if they are absent. Existing files are never overwritten, and a project already present is updated rather than duplicated (matched on name OR path, case-insensitively). Pass dryRun:true first to see what would change. This is the write counterpart to list_projects / find_project / project_status, which are read-only.",
    RegistryPromoteToolSchema.shape,
    async ({ folderPath, name, type, description, dryRun }) => {
      try {
        const result = promoteFolder(folderPath, name, type, description, dryRun === true);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: `Error: ${msg}` }] };
      }
    }
  );

  server.tool(
    "registry_set_status",
    "Moves an existing registry project to status=workbench (demote) or status=archived. Nothing is deleted and no files are touched \u2014 only the registry entry's status changes. Use registry_promote to move a project back to status=product.",
    RegistrySetStatusToolSchema.shape,
    async ({ name, status }) => {
      try {
        const result = status === "archived" ? archiveFolder(name) : demoteFolder(name);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: `Error: ${msg}` }] };
      }
    }
  );
}
