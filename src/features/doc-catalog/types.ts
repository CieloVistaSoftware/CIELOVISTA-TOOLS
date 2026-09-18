// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

// component: cat

/** Shared types for the doc-catalog feature. */

export interface ProjectEntry {
    name: string;
    path: string;
    type: string;
    description: string;
}

export interface ProjectRegistry {
    globalDocsPath: string;
    projects: ProjectEntry[];
}

export interface ProjectInfo {
    name: string;
    rootPath: string;
    type: string;
    description: string;
    scripts: Record<string, string>;
    hasNpm: boolean;
    hasDotnet: boolean;
}

export interface CatalogCard {
    id: string;
    fileName: string;
    title: string;
    description: string;
    filePath: string;
    projectName: string;
    projectPath: string;
    category: string;
    /** The doc's folder relative to its project root, forward slashes; '' at the root (#707). */
    folder: string;
    sizeBytes: number;
    lastModified: string;
    tags: string[];
    /**
     * The doc's frontmatter docid, if it declares one. The catalog itself no
     * longer groups, sorts or badges by it (#707 stage 2). Only the MCP
     * Endpoint Viewer's Dewey tools still read it, and #707 stage 3 deletes
     * those tools and this field together.
     */
    dewey?: string;
    helpDoc?: string;
    helpMarkdown?: string;
    /** Type extracted from frontmatter `type:` or stripped from title prefix (e.g. "Feature") */
    docType?: string;
    /** VS Code command ID from frontmatter `command:` field or matched via CATALOG helpDoc */
    command?: string;
}
