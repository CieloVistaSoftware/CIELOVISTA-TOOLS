// Copyright (c) 2025 CieloVista Software. All rights reserved.
export interface ProjectEntry { name: string; path: string; type: string; description: string; }
export interface ProjectRegistry { globalDocsPath: string; projects: ProjectEntry[]; }
export type Severity = 'error' | 'warning' | 'info';
export interface ComplianceIssue { severity: Severity; file: string; message: string; fixable: boolean; fixKey: string; }
export interface ProjectCompliance { project: ProjectEntry; issues: ComplianceIssue[]; score: number; packageJson: Record<string, unknown> | null; }
