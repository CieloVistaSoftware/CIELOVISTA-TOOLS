export interface ToolResult {
    content: Array<{
        type: "text" | "image" | "resource";
        text?: string;
        data?: string;
        mimeType?: string;
    }>;
    isError?: boolean;
}
export interface ResourceDefinition {
    uri: string;
    name: string;
    description: string;
    mimeType: string;
}
export interface PromptDefinition {
    name: string;
    description: string;
    arguments?: Array<{
        name: string;
        description: string;
        required?: boolean;
    }>;
}
//# sourceMappingURL=index.d.ts.map