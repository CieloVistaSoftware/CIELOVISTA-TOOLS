import { z } from "zod";

export const EchoToolSchema = z.object({
  message: z.string().describe("The message to echo back"),
});

export const ListFilesToolSchema = z.object({
  directory: z.string().describe("The directory path to list files from"),
  pattern: z.string().optional().describe("Optional filter text to match against file names"),
});

export const ReadFileToolSchema = z.object({
  filePath: z.string().describe("The full path of the file to read"),
});

export const ProjectStatusToolSchema = z.object({
  projectPath: z.string().describe("The root path of the project to check status for"),
});

export const WriteFileToolSchema = z.object({
  filePath: z.string().describe("The full path of the file to write"),
  content: z.string().describe("The content to write to the file"),
});

export const EditFileToolSchema = z.object({
  filePath: z.string().describe("The full path of the file to edit"),
  oldText: z.string().describe("The exact text to find and replace"),
  newText: z.string().describe("The replacement text"),
});

export const DeleteFileToolSchema = z.object({
  filePath: z.string().describe("The full path of the file or directory to delete"),
  recursive: z.boolean().optional().describe("If true, delete directories recursively"),
});

export const CreateDirectoryToolSchema = z.object({
  dirPath: z.string().describe("The full path of the directory to create"),
});

// ─── Catalog tools ──────────────────────────────────────────────────────
// Thin catalog interface over CieloVistaStandards\project-registry.json plus
// on-demand .md scanning. Serves AI callers who need to locate existing work
// before proposing anything new.

const ProjectStatusEnum = z.enum(["product", "workbench", "generated", "archived"]);

export const ListProjectsToolSchema = z.object({
  status: ProjectStatusEnum.optional().describe("Filter by lifecycle status: product (shipped), workbench (active dev), generated (tool output), archived (retired). Omit to return all."),
});

export const FindProjectToolSchema = z.object({
  query: z.string().describe("Project name or substring to match (case-insensitive). e.g. 'wb-core', 'wb-', 'catalog'"),
  status: ProjectStatusEnum.optional().describe("Optional: restrict matches to one lifecycle status."),
});

export const GetCatalogToolSchema = z.object({
  projectName: z.string().optional().describe("Optional: limit scan to one project by exact name"),
});

export const SearchDocsToolSchema = z.object({
  query: z.string().describe("Case-insensitive substring to match against doc title, description, or filename"),
  projectName: z.string().optional().describe("Optional: limit search to one project by exact name"),
});

export const LookupDeweyToolSchema = z.object({
  query: z.string().describe("Full or partial Dewey ID to resolve, e.g. '1400.005', '1400', or '005'"),
  projectName: z.string().optional().describe("Optional: limit document lookup to one project by exact name"),
  includeCommands: z.boolean().optional().describe("If true, also return CVT command catalog matches by Dewey."),
  limit: z.number().int().positive().optional().describe("Max matches per section (default 25)."),
});

export const ListBrokenRefsToolSchema = z.object({
  projectName: z.string().optional().describe("Optional: limit scan to one project by exact name"),
  createPlaceholder: z.boolean().optional().describe("If true, creates missing .svg placeholders only when no candidates are found."),
});

export const RepairBrokenRefsToolSchema = z.object({
  edits: z.array(z.object({
    filePath: z.string().describe("Markdown file to update."),
    oldText: z.string().describe("Exact markdown reference text to replace."),
    newText: z.string().describe("Replacement markdown reference text."),
  })).optional().describe("Approved markdown updates to apply."),
  placeholders: z.array(z.object({
    filePath: z.string().describe("Absolute path for placeholder SVG to create."),
    altText: z.string().optional().describe("Text rendered in placeholder SVG."),
  })).optional().describe("Optional placeholder SVGs to create for unresolved image refs."),
});

// ─── Symbol index tools ────────────────────────────────────────────────
// Cross-project reusable-code search. Indexes both TypeScript (via tsc's
// generated .d.ts files) and plain JavaScript (direct regex over src/,
// scripts/, tests/). Answers "does something like this already exist"
// without walking the filesystem manually.

const SymbolKindEnum = z.enum([
  "function", "class", "interface", "type", "const", "let", "var", "enum", "namespace", "export",
]);
const SymbolRoleEnum = z.enum(["src", "script", "test", "declaration"]);

export const ListSymbolsToolSchema = z.object({
  query: z.string().optional().describe("Case-insensitive substring match on symbol name, signature, or JSDoc. Omit to list everything."),
  kind: SymbolKindEnum.optional().describe("Restrict to one kind, e.g. 'function' or 'class'."),
  projectName: z.string().optional().describe("Limit to one registered project by exact name."),
  role: SymbolRoleEnum.optional().describe("Limit by file role: src, script, test, or declaration (.d.ts)."),
  exportedOnly: z.boolean().optional().describe("If true, skip internal/non-exported symbols."),
  limit: z.number().int().positive().optional().describe("Cap result count (default 200)."),
});

export const FindSymbolToolSchema = z.object({
  name: z.string().describe("Exact symbol name to resolve. Falls back to prefix match if no exact hit."),
  limit: z.number().int().positive().optional().describe("Max matches to return (default 10)."),
});

export const ListCvtCommandsToolSchema = z.object({
  group: z.string().optional().describe("Restrict to one CVT catalog group, e.g. 'Other Tools' or 'Doc Auditor'."),
});

export type EchoToolInput = z.infer<typeof EchoToolSchema>;
export type ListFilesToolInput = z.infer<typeof ListFilesToolSchema>;
export type ReadFileToolInput = z.infer<typeof ReadFileToolSchema>;
export type ProjectStatusToolInput = z.infer<typeof ProjectStatusToolSchema>;
export type WriteFileToolInput = z.infer<typeof WriteFileToolSchema>;
export type EditFileToolInput = z.infer<typeof EditFileToolSchema>;
export type DeleteFileToolInput = z.infer<typeof DeleteFileToolSchema>;
export type CreateDirectoryToolInput = z.infer<typeof CreateDirectoryToolSchema>;
export type ListProjectsToolInput = z.infer<typeof ListProjectsToolSchema>;
export type FindProjectToolInput = z.infer<typeof FindProjectToolSchema>;
export type GetCatalogToolInput = z.infer<typeof GetCatalogToolSchema>;
export type SearchDocsToolInput = z.infer<typeof SearchDocsToolSchema>;
export type LookupDeweyToolInput = z.infer<typeof LookupDeweyToolSchema>;
export type ListBrokenRefsToolInput = z.infer<typeof ListBrokenRefsToolSchema>;
export type RepairBrokenRefsToolInput = z.infer<typeof RepairBrokenRefsToolSchema>;
export type ListSymbolsToolInput = z.infer<typeof ListSymbolsToolSchema>;
export type FindSymbolToolInput = z.infer<typeof FindSymbolToolSchema>;
export type ListCvtCommandsToolInput = z.infer<typeof ListCvtCommandsToolSchema>;
// FILE REMOVED BY REQUEST
