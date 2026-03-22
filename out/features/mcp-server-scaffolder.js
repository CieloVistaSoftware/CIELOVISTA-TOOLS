"use strict";
// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
/**
 * mcp-server-scaffolder.ts
 *
 * Scaffolds a new MCP (Model Context Protocol) server project inside the
 * current workspace.  Generates all boilerplate files so the user can
 * immediately `npm install && npm run build` and start adding tools.
 *
 * Command registered:
 *   cvs.mcp.createServer — scaffold a new MCP server project
 */
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const output_channel_1 = require("../shared/output-channel");
const FEATURE = 'mcp-server-scaffolder';
const CREATE_SERVER_COMMAND = 'cvs.mcp.createServer';
// ─── Template content ────────────────────────────────────────────────────────
function packageJson(name) {
    return JSON.stringify({
        name,
        version: "1.0.0",
        description: `MCP server — ${name}`,
        type: "module",
        main: "dist/index.js",
        bin: { [name]: "dist/index.js" },
        scripts: {
            build: "tsc",
            dev: "tsc --watch",
            start: "node dist/index.js",
            inspect: "npx @modelcontextprotocol/inspector node dist/index.js"
        },
        keywords: ["mcp"],
        author: "Cielo Vista Software",
        license: "MIT",
        dependencies: {
            "@modelcontextprotocol/sdk": "^1.12.1",
            "zod": "^3.24.2"
        },
        devDependencies: {
            "@types/node": "^22.13.10",
            "typescript": "^5.8.2"
        }
    }, null, 2) + '\n';
}
const TSCONFIG = JSON.stringify({
    compilerOptions: {
        target: "ES2022",
        module: "Node16",
        moduleResolution: "Node16",
        outDir: "./dist",
        rootDir: "./src",
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        declaration: true,
        declarationMap: true,
        sourceMap: true,
        resolveJsonModule: true
    },
    include: ["src/**/*"],
    exclude: ["node_modules", "dist"]
}, null, 2) + '\n';
const TYPES_INDEX = `\
export interface ToolResult {
  content: Array<{
    type: "text" | "image" | "resource";
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}
`;
const DEFINITIONS = `\
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
`;
const TOOLS_INDEX = `\
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  EchoToolSchema,
  ListFilesToolSchema,
  ReadFileToolSchema,
  WriteFileToolSchema,
  EditFileToolSchema,
  DeleteFileToolSchema,
  CreateDirectoryToolSchema,
} from "./definitions.js";
import * as fs from "node:fs";
import * as path from "node:path";

export function registerTools(server: McpServer): void {
  server.tool("echo", "Echoes back the provided message.", EchoToolSchema.shape,
    async ({ message }) => ({ content: [{ type: "text" as const, text: \`Echo: \${message}\` }] }));

  server.tool("list_files", "Lists files in a directory.", ListFilesToolSchema.shape,
    async ({ directory, pattern }) => {
      try {
        const dir = path.resolve(directory);
        if (!fs.existsSync(dir)) {
          return { content: [{ type: "text" as const, text: \`Error: Not found: \${dir}\` }] };
        }
        const entries = fs.readdirSync(dir, { withFileTypes: true })
          .map(e => \`\${e.isDirectory() ? "[DIR]  " : "[FILE] "}\${e.name}\`)
          .filter(n => !pattern || n.toLowerCase().includes(pattern.toLowerCase()))
          .sort();
        return { content: [{ type: "text" as const, text: [\`Directory: \${dir}\`, \`Entries: \${entries.length}\`, "---", ...entries].join("\\n") }] };
      } catch (e: unknown) {
        return { content: [{ type: "text" as const, text: \`Error: \${e instanceof Error ? e.message : String(e)}\` }] };
      }
    });

  server.tool("read_file", "Reads a file's content.", ReadFileToolSchema.shape,
    async ({ filePath }) => {
      try {
        const p = path.resolve(filePath);
        if (!fs.existsSync(p)) { return { content: [{ type: "text" as const, text: \`Error: Not found: \${p}\` }] }; }
        return { content: [{ type: "text" as const, text: fs.readFileSync(p, "utf-8") }] };
      } catch (e: unknown) {
        return { content: [{ type: "text" as const, text: \`Error: \${e instanceof Error ? e.message : String(e)}\` }] };
      }
    });

  server.tool("write_file", "Writes content to a file. Creates parent dirs.", WriteFileToolSchema.shape,
    async ({ filePath, content }) => {
      try {
        const p = path.resolve(filePath);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, content, "utf-8");
        return { content: [{ type: "text" as const, text: \`Written: \${p}\` }] };
      } catch (e: unknown) {
        return { content: [{ type: "text" as const, text: \`Error: \${e instanceof Error ? e.message : String(e)}\` }] };
      }
    });

  server.tool("edit_file", "Find-and-replace exact text in a file.", EditFileToolSchema.shape,
    async ({ filePath, oldText, newText }) => {
      try {
        const p = path.resolve(filePath);
        if (!fs.existsSync(p)) { return { content: [{ type: "text" as const, text: \`Error: Not found: \${p}\` }] }; }
        const src = fs.readFileSync(p, "utf-8");
        if (!src.includes(oldText)) { return { content: [{ type: "text" as const, text: "Error: oldText not found in file" }] }; }
        fs.writeFileSync(p, src.replace(oldText, newText), "utf-8");
        return { content: [{ type: "text" as const, text: \`Edited: \${p}\` }] };
      } catch (e: unknown) {
        return { content: [{ type: "text" as const, text: \`Error: \${e instanceof Error ? e.message : String(e)}\` }] };
      }
    });

  server.tool("delete_file", "Deletes a file or directory.", DeleteFileToolSchema.shape,
    async ({ filePath, recursive }) => {
      try {
        const p = path.resolve(filePath);
        if (!fs.existsSync(p)) { return { content: [{ type: "text" as const, text: \`Error: Not found: \${p}\` }] }; }
        if (fs.statSync(p).isDirectory()) { fs.rmSync(p, { recursive: recursive ?? false }); }
        else { fs.unlinkSync(p); }
        return { content: [{ type: "text" as const, text: \`Deleted: \${p}\` }] };
      } catch (e: unknown) {
        return { content: [{ type: "text" as const, text: \`Error: \${e instanceof Error ? e.message : String(e)}\` }] };
      }
    });

  server.tool("create_directory", "Creates a directory (recursive).", CreateDirectoryToolSchema.shape,
    async ({ dirPath }) => {
      try {
        const p = path.resolve(dirPath);
        fs.mkdirSync(p, { recursive: true });
        return { content: [{ type: "text" as const, text: \`Created: \${p}\` }] };
      } catch (e: unknown) {
        return { content: [{ type: "text" as const, text: \`Error: \${e instanceof Error ? e.message : String(e)}\` }] };
      }
    });
}
`;
const RESOURCES_INDEX = `\
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerResources(server: McpServer): void {
  server.resource("server-info", "mcp://info",
    { description: "MCP server information", mimeType: "application/json" },
    async () => ({
      contents: [{ uri: "mcp://info", text: JSON.stringify({ name: "mcp-server", version: "1.0.0" }, null, 2), mimeType: "application/json" }],
    }));
}
`;
const PROMPTS_INDEX = `\
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerPrompts(server: McpServer): void {
  server.prompt("greeting", "A friendly greeting prompt.", async () => ({
    messages: [{ role: "assistant" as const, content: { type: "text" as const, text: "Hello! How can I help?" } }],
  }));
}
`;
const SERVER_TS = `\
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./tools/index.js";
import { registerResources } from "./resources/index.js";
import { registerPrompts } from "./prompts/index.js";

export function createServer(): McpServer {
  const server = new McpServer({ name: "mcp-server", version: "1.0.0" });
  registerTools(server);
  registerResources(server);
  registerPrompts(server);
  return server;
}
`;
const INDEX_TS = `\
#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP server running on stdio");
}

main().catch((error: unknown) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
`;
const FILES = [
    { relativePath: 'tsconfig.json', content: TSCONFIG },
    { relativePath: 'src/types/index.ts', content: TYPES_INDEX },
    { relativePath: 'src/tools/definitions.ts', content: DEFINITIONS },
    { relativePath: 'src/tools/index.ts', content: TOOLS_INDEX },
    { relativePath: 'src/resources/index.ts', content: RESOURCES_INDEX },
    { relativePath: 'src/prompts/index.ts', content: PROMPTS_INDEX },
    { relativePath: 'src/server.ts', content: SERVER_TS },
    { relativePath: 'src/index.ts', content: INDEX_TS },
    { relativePath: 'package.json', content: (name) => packageJson(name) },
];
// ─── Scaffold logic ──────────────────────────────────────────────────────────
async function createMcpServer() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) {
        require('../shared/show-result-webview').showResultWebview('No Workspace Folder', 'Create MCP Server', 0, 'Open a workspace folder first.');
        return;
    }
    const folderName = await vscode.window.showInputBox({
        prompt: 'Folder name for the new MCP server (created inside workspace root)',
        value: 'mcp-server',
        validateInput: (value) => {
            if (!value.trim()) {
                return 'Folder name is required';
            }
            if (/[<>:"|?*]/.test(value)) {
                return 'Invalid characters in folder name';
            }
            return undefined;
        }
    });
    if (!folderName) {
        return;
    }
    const serverRoot = path.join(workspaceFolder, folderName.trim());
    if (fs.existsSync(serverRoot)) {
        const overwrite = await vscode.window.showWarningMessage(`Folder "${folderName}" already exists. Overwrite files?`, { modal: true }, 'Overwrite');
        if (overwrite !== 'Overwrite') {
            require('../shared/show-result-webview').showResultWebview('MCP Server Not Created', 'Create MCP Server', 0, `Folder <b>${folderName}</b> already exists. Operation cancelled.`);
            return;
        }
    }
    try {
        (0, output_channel_1.log)(FEATURE, `Scaffolding MCP server in ${serverRoot}`);
        for (const file of FILES) {
            const fullPath = path.join(serverRoot, file.relativePath);
            const dir = path.dirname(fullPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            const content = typeof file.content === 'function'
                ? file.content(folderName.trim())
                : file.content;
            fs.writeFileSync(fullPath, content, 'utf-8');
        }
        (0, output_channel_1.log)(FEATURE, `MCP server scaffolded: ${FILES.length} files created`);
        const runInstall = await vscode.window.showInformationMessage(`MCP server created in "${folderName}". Run npm install now?`, 'Yes', 'No');
        require('../shared/show-result-webview').showResultWebview('MCP Server Created', 'Create MCP Server', 0, `MCP server created in <b>${folderName}</b>.${runInstall === 'Yes' ? ' Running <b>npm install && npm run build</b>…' : ''}`);
        if (runInstall === 'Yes') {
            const terminal = vscode.window.createTerminal({ name: `MCP: ${folderName}`, cwd: serverRoot });
            terminal.show();
            terminal.sendText('npm install && npm run build');
        }
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        (0, output_channel_1.logError)(FEATURE, `Failed to scaffold MCP server: ${msg}`);
        require('../shared/show-result-webview').showResultWebview('MCP Server Creation Failed', 'Create MCP Server', 0, `Failed to create MCP Server: <b>${msg}</b>`);
    }
}
// ─── Activate / Deactivate ───────────────────────────────────────────────────
let _disposable;
function activate(context) {
    _disposable = vscode.commands.registerCommand(CREATE_SERVER_COMMAND, createMcpServer);
    context.subscriptions.push(_disposable);
    (0, output_channel_1.log)(FEATURE, 'MCP server scaffolder registered');
}
function deactivate() {
    _disposable?.dispose();
    _disposable = undefined;
}
//# sourceMappingURL=mcp-server-scaffolder.js.map