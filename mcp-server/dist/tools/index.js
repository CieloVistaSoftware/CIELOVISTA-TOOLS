import { EchoToolSchema, ListFilesToolSchema, ReadFileToolSchema, ProjectStatusToolSchema, WriteFileToolSchema, EditFileToolSchema, DeleteFileToolSchema, CreateDirectoryToolSchema, } from "./definitions.js";
import * as fs from "node:fs";
import * as path from "node:path";
export function registerTools(server) {
    server.tool("echo", "Echoes back the provided message. Useful for testing connectivity.", EchoToolSchema.shape, async ({ message }) => {
        return {
            content: [{ type: "text", text: `Echo: ${message}` }],
        };
    });
    server.tool("list_files", "Lists files in a directory with an optional pattern filter.", ListFilesToolSchema.shape, async ({ directory, pattern }) => {
        try {
            const resolvedDir = path.resolve(directory);
            if (!fs.existsSync(resolvedDir)) {
                return {
                    content: [{ type: "text", text: `Error: Directory not found: ${resolvedDir}` }],
                };
            }
            const entries = fs.readdirSync(resolvedDir, { withFileTypes: true });
            const files = entries
                .map((entry) => {
                const prefix = entry.isDirectory() ? "[DIR]  " : "[FILE] ";
                return `${prefix}${entry.name}`;
            })
                .filter((name) => {
                if (!pattern)
                    return true;
                return name.toLowerCase().includes(pattern.toLowerCase());
            })
                .sort();
            const result = [
                `Directory: ${resolvedDir}`,
                `Entries: ${files.length}`,
                "---",
                ...files,
            ].join("\n");
            return { content: [{ type: "text", text: result }] };
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return {
                content: [{ type: "text", text: `Error listing files: ${msg}` }],
            };
        }
    });
    server.tool("read_file", "Reads and returns the content of a file.", ReadFileToolSchema.shape, async ({ filePath }) => {
        try {
            const resolvedPath = path.resolve(filePath);
            if (!fs.existsSync(resolvedPath)) {
                return {
                    content: [{ type: "text", text: `Error: File not found: ${resolvedPath}` }],
                };
            }
            const content = fs.readFileSync(resolvedPath, "utf-8");
            return {
                content: [{ type: "text", text: content }],
            };
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return {
                content: [{ type: "text", text: `Error reading file: ${msg}` }],
            };
        }
    });
    server.tool("project_status", "Reads the project status from docs/_today/CURRENT-STATUS.md if it exists.", ProjectStatusToolSchema.shape, async ({ projectPath }) => {
        try {
            const statusFile = path.resolve(projectPath, "docs", "_today", "CURRENT-STATUS.md");
            if (!fs.existsSync(statusFile)) {
                return {
                    content: [{ type: "text", text: `No status file found at: ${statusFile}` }],
                };
            }
            const content = fs.readFileSync(statusFile, "utf-8");
            return {
                content: [{ type: "text", text: `# Project Status\n\n${content}` }],
            };
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return {
                content: [{ type: "text", text: `Error reading project status: ${msg}` }],
            };
        }
    });
    server.tool("write_file", "Writes content to a file. Creates the file if it doesn't exist, overwrites if it does. Creates parent directories automatically.", WriteFileToolSchema.shape, async ({ filePath, content }) => {
        try {
            const resolvedPath = path.resolve(filePath);
            const dir = path.dirname(resolvedPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(resolvedPath, content, "utf-8");
            return {
                content: [{ type: "text", text: `File written: ${resolvedPath}` }],
            };
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return {
                content: [{ type: "text", text: `Error writing file: ${msg}` }],
            };
        }
    });
    server.tool("edit_file", "Finds and replaces exact text in a file. The oldText must match exactly (including whitespace).", EditFileToolSchema.shape, async ({ filePath, oldText, newText }) => {
        try {
            const resolvedPath = path.resolve(filePath);
            if (!fs.existsSync(resolvedPath)) {
                return {
                    content: [{ type: "text", text: `Error: File not found: ${resolvedPath}` }],
                };
            }
            const content = fs.readFileSync(resolvedPath, "utf-8");
            if (!content.includes(oldText)) {
                return {
                    content: [{ type: "text", text: `Error: oldText not found in ${resolvedPath}` }],
                };
            }
            const updated = content.replace(oldText, newText);
            fs.writeFileSync(resolvedPath, updated, "utf-8");
            return {
                content: [{ type: "text", text: `File edited: ${resolvedPath}` }],
            };
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return {
                content: [{ type: "text", text: `Error editing file: ${msg}` }],
            };
        }
    });
    server.tool("delete_file", "Deletes a file or directory. Use recursive=true for non-empty directories.", DeleteFileToolSchema.shape, async ({ filePath, recursive }) => {
        try {
            const resolvedPath = path.resolve(filePath);
            if (!fs.existsSync(resolvedPath)) {
                return {
                    content: [{ type: "text", text: `Error: Path not found: ${resolvedPath}` }],
                };
            }
            const stat = fs.statSync(resolvedPath);
            if (stat.isDirectory()) {
                fs.rmSync(resolvedPath, { recursive: recursive ?? false });
            }
            else {
                fs.unlinkSync(resolvedPath);
            }
            return {
                content: [{ type: "text", text: `Deleted: ${resolvedPath}` }],
            };
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return {
                content: [{ type: "text", text: `Error deleting: ${msg}` }],
            };
        }
    });
    server.tool("create_directory", "Creates a directory (and any missing parent directories).", CreateDirectoryToolSchema.shape, async ({ dirPath }) => {
        try {
            const resolvedPath = path.resolve(dirPath);
            fs.mkdirSync(resolvedPath, { recursive: true });
            return {
                content: [{ type: "text", text: `Directory created: ${resolvedPath}` }],
            };
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return {
                content: [{ type: "text", text: `Error creating directory: ${msg}` }],
            };
        }
    });
}
//# sourceMappingURL=index.js.map