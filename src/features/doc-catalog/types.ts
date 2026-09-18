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
    helpDoc?: string;
    helpMarkdown?: string;
    /** Type extracted from frontmatter `type:` or stripped from title prefix (e.g. "Feature") */
    docType?: string;
    /** VS Code command ID from frontmatter `command:` field or matched via CATALOG helpDoc */
    command?: string;
}
