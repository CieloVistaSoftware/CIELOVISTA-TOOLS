// Copyright (c) Cielo Vista Software. All rights reserved.
// collector.ts — doc collection utilities for doc-auditor

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { DocFile } from './types';

/**
 * Returns the docs folder for the current VS Code workspace.
 * Falls back to CieloVistaStandards/reports if no workspace is open.
 * Creates the folder if it does not exist.
 */
export function getReportDir(): string {
    const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const dir = ws
        ? path.join(ws, 'docs')
        : 'C:\\Users\\jwpmi\\Downloads\\CieloVistaStandards\\reports';
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
    return dir;
}

/** Returns a datestamped report filename for a given audit type. */
export function reportFileName(type: 'full' | 'duplicates' | 'similar' | 'orphans' | 'move-candidates'): string {
    const date = new Date().toISOString().slice(0, 10);
    return `audit-${type}-${date}.md`;
}

/** Returns all markdown docs under a directory tree (max 3 levels deep). */
export function collectDocs(rootPath: string, projectName: string, maxDepth = 3): DocFile[] {
    const results: DocFile[] = [];

    function walk(dir: string, depth: number): void {
        if (depth > maxDepth) { return; }
        if (!fs.existsSync(dir)) { return; }

        let entries: fs.Dirent[];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
        catch { return; }

        for (const entry of entries) {
            // Skip node_modules, .git, out, dist
            if (['node_modules', '.git', 'out', 'dist', '.vscode'].includes(entry.name)) { continue; }

            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                walk(fullPath, depth + 1);
            } else if (entry.isFile() && /\.md$/i.test(entry.name)) {
                try {
                    const content = fs.readFileSync(fullPath, 'utf8');
                    const normalized = content
                        .toLowerCase()
                        .replace(/\s+/g, ' ')
                        .replace(/[#*`_\[\]()]/g, '')
                        .trim();

                    results.push({
                        filePath: fullPath,
                        fileName: entry.name,
                        projectName,
                        sizeBytes: Buffer.byteLength(content, 'utf8'),
                        content,
                        normalized,
                    });
                } catch { /* skip unreadable */ }
            }
        }
    }

    walk(rootPath, 0);
    return results;
}
