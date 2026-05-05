// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * archive.ts — Doc Catalog archive store.
 *
 * Archived docs are hidden from the catalog view but preserved on disk.
 * Archive list persisted to data/archived-docs.json.
 * Restore via cvs.catalog.viewArchived.
 */

import * as fs   from 'fs';
import * as path from 'path';

export interface ArchivedEntry {
    filePath:    string;
    title:       string;
    projectName: string;
    archivedAt:  string;
}

const ARCHIVE_FILE = path.join(__dirname, '..', '..', '..', 'data', 'archived-docs.json');

function readFile(): ArchivedEntry[] {
    try {
        if (fs.existsSync(ARCHIVE_FILE)) {
            return JSON.parse(fs.readFileSync(ARCHIVE_FILE, 'utf8')) as ArchivedEntry[];
        }
    } catch { /* corrupt or missing — start fresh */ }
    return [];
}

function writeFile(entries: ArchivedEntry[]): void {
    fs.writeFileSync(ARCHIVE_FILE, JSON.stringify(entries, null, 2), 'utf8');
}

export function loadArchivedPaths(): Set<string> {
    return new Set(readFile().map(e => e.filePath));
}

export function loadArchiveEntries(): ArchivedEntry[] {
    return readFile();
}

export function archiveDoc(filePath: string, title: string, projectName: string): void {
    const entries = readFile();
    if (entries.some(e => e.filePath === filePath)) { return; }
    entries.push({ filePath, title, projectName, archivedAt: new Date().toISOString().slice(0, 10) });
    writeFile(entries);
}

export function restoreDoc(filePath: string): void {
    const entries = readFile().filter(e => e.filePath !== filePath);
    writeFile(entries);
}

export function isArchived(filePath: string): boolean {
    return readFile().some(e => e.filePath === filePath);
}
