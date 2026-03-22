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
//# sourceMappingURL=definitions.js.map