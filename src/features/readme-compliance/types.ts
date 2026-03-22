// Copyright (c) 2025 CieloVista Software. All rights reserved.
export interface ProjectEntry { name: string; path: string; type: string; description: string; }
export interface ProjectRegistry { globalDocsPath: string; projects: ProjectEntry[]; }
export type ReadmeType = 'PROJECT' | 'FEATURE' | 'STANDARD';
export interface ComplianceIssue { severity: 'error' | 'warning' | 'info'; message: string; fixable: boolean; fixKey: string; }
export interface ReadmeReport {
    filePath: string; fileName: string; projectName: string; readmeType: ReadmeType;
    score: number; issues: ComplianceIssue[]; lineCount: number;
    missingRequiredSections: string[]; outOfOrderSections: string[];
}
