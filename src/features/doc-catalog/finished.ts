// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

// component: cat

/**
 * finished.ts — Doc Catalog "Finished Work" queue.
 *
 * Finished docs are moved out of the active catalog into a "Finished Work"
 * section — work that has been completed but is still worth keeping visible.
 * List persisted to data/finished-work.json. Restore with the Restore button.
 */

import * as fs   from 'fs';
import * as path from 'path';

export interface FinishedEntry {
    filePath:    string;
    title:       string;
    projectName: string;
    finishedAt:  string;
}

const FINISHED_FILE = path.join(__dirname, '..', 'data', 'finished-work.json');

function readFile(): FinishedEntry[] {
    try {
        if (fs.existsSync(FINISHED_FILE)) {
            return JSON.parse(fs.readFileSync(FINISHED_FILE, 'utf8')) as FinishedEntry[];
        }
    } catch { /* corrupt or missing — start fresh */ }
    return [];
}

function writeFile(entries: FinishedEntry[]): void {
    const dir = path.dirname(FINISHED_FILE);
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
    fs.writeFileSync(FINISHED_FILE, JSON.stringify(entries, null, 2), 'utf8');
}

export function loadFinishedPaths(): Set<string> {
    return new Set(readFile().map(e => e.filePath));
}

export function loadFinishedEntries(): FinishedEntry[] {
    return readFile();
}

export function markAsFinished(filePath: string, title: string, projectName: string): void {
    const entries = readFile();
    if (entries.some(e => e.filePath === filePath)) { return; }
    entries.push({ filePath, title, projectName, finishedAt: new Date().toISOString().slice(0, 10) });
    writeFile(entries);
}

export function restoreFromFinished(filePath: string): void {
    writeFile(readFile().filter(e => e.filePath !== filePath));
}

export function isFinished(filePath: string): boolean {
    return readFile().some(e => e.filePath === filePath);
}
