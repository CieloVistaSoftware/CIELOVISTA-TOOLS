// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

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
    categoryNum: number;
    sizeBytes: number;
    lastModified: string;
    tags: string[];
}
