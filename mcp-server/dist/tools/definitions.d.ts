import { z } from "zod";
export declare const EchoToolSchema: z.ZodObject<{
    message: z.ZodString;
}, "strip", z.ZodTypeAny, {
    message: string;
}, {
    message: string;
}>;
export declare const ListFilesToolSchema: z.ZodObject<{
    directory: z.ZodString;
    pattern: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    directory: string;
    pattern?: string | undefined;
}, {
    directory: string;
    pattern?: string | undefined;
}>;
export declare const ReadFileToolSchema: z.ZodObject<{
    filePath: z.ZodString;
}, "strip", z.ZodTypeAny, {
    filePath: string;
}, {
    filePath: string;
}>;
export declare const ProjectStatusToolSchema: z.ZodObject<{
    projectPath: z.ZodString;
}, "strip", z.ZodTypeAny, {
    projectPath: string;
}, {
    projectPath: string;
}>;
export declare const WriteFileToolSchema: z.ZodObject<{
    filePath: z.ZodString;
    content: z.ZodString;
}, "strip", z.ZodTypeAny, {
    filePath: string;
    content: string;
}, {
    filePath: string;
    content: string;
}>;
export declare const EditFileToolSchema: z.ZodObject<{
    filePath: z.ZodString;
    oldText: z.ZodString;
    newText: z.ZodString;
}, "strip", z.ZodTypeAny, {
    filePath: string;
    oldText: string;
    newText: string;
}, {
    filePath: string;
    oldText: string;
    newText: string;
}>;
export declare const DeleteFileToolSchema: z.ZodObject<{
    filePath: z.ZodString;
    recursive: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    filePath: string;
    recursive?: boolean | undefined;
}, {
    filePath: string;
    recursive?: boolean | undefined;
}>;
export declare const CreateDirectoryToolSchema: z.ZodObject<{
    dirPath: z.ZodString;
}, "strip", z.ZodTypeAny, {
    dirPath: string;
}, {
    dirPath: string;
}>;
export type EchoToolInput = z.infer<typeof EchoToolSchema>;
export type ListFilesToolInput = z.infer<typeof ListFilesToolSchema>;
export type ReadFileToolInput = z.infer<typeof ReadFileToolSchema>;
export type ProjectStatusToolInput = z.infer<typeof ProjectStatusToolSchema>;
export type WriteFileToolInput = z.infer<typeof WriteFileToolSchema>;
export type EditFileToolInput = z.infer<typeof EditFileToolSchema>;
export type DeleteFileToolInput = z.infer<typeof DeleteFileToolSchema>;
export type CreateDirectoryToolInput = z.infer<typeof CreateDirectoryToolSchema>;
//# sourceMappingURL=definitions.d.ts.map