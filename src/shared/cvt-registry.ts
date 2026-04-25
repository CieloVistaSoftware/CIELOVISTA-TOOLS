// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * cvt-registry.ts
 *
 * Read/write helpers for the CVT project registry at
 *   C:\Users\jwpmi\Downloads\CieloVistaStandards\project-registry.json
 *
 * This is the same file read by the MCP server's catalog-helpers. The MCP
 * server runs in a separate Node process and re-reads the file on every
 * tool invocation, so mutations here propagate to list_projects /
 * find_project / get_catalog on the next call — no restart needed.
 *
 * Path comparisons are case-insensitive because Windows paths are, and the
 * existing registry has mixed casing (C:\dev vs c:\Users\...). All comparisons
 * normalize via toLowerCase().
 */

import * as fs   from 'fs';
import * as path from 'path';

export interface ProjectEntry {
    name:         string;
    path:         string;
    type:         string;
    description:  string;
    status?:      'product' | 'workbench' | 'generated' | 'archived';
}

export interface ProjectRegistry {
    globalDocsPath: string;
    projects:       ProjectEntry[];
}

export const REGISTRY_PATH =
    'C:\\Users\\jwpmi\\Downloads\\CieloVistaStandards\\project-registry.json';

/** Read the registry JSON. Throws if the file is missing or unparseable. */
export function loadRegistry(): ProjectRegistry {
    if (!fs.existsSync(REGISTRY_PATH)) {
        throw new Error(`Project registry not found at: ${REGISTRY_PATH}`);
    }
    const raw = fs.readFileSync(REGISTRY_PATH, 'utf8');
    const parsed = JSON.parse(raw) as ProjectRegistry;
    if (!Array.isArray(parsed.projects)) {
        throw new Error('Project registry is missing `projects` array.');
    }
    for (const p of parsed.projects) {
        if (!p.status) { p.status = 'product'; }
    }
    return parsed;
}

/** Write the registry back, preserving 2-space indent for readability. */
export function saveRegistry(reg: ProjectRegistry): void {
    const json = JSON.stringify(reg, null, 2);
    fs.writeFileSync(REGISTRY_PATH, json + '\n', 'utf8');
}

/** Build a Set of normalized registry paths for O(1) membership checks. */
export function registryPathSet(reg: ProjectRegistry): Set<string> {
    return new Set(reg.projects.map(p => p.path.toLowerCase()));
}

/** True if `fsPath` appears in `reg` (case-insensitive match). */
export function isInRegistry(reg: ProjectRegistry, fsPath: string): boolean {
    const needle = fsPath.toLowerCase();
    return reg.projects.some(p => p.path.toLowerCase() === needle);
}

/**
 * Add a project to the registry. No-op if already present. Uses the folder's
 * basename as `name` and sensible defaults for the other fields. The user
 * can refine them later by editing project-registry.json directly.
 */
export function addToRegistry(fsPath: string, name?: string): void {
    const reg = loadRegistry();
    if (isInRegistry(reg, fsPath)) { return; }
    const entry: ProjectEntry = {
        name:        name ?? (path.basename(fsPath) || fsPath),
        path:        fsPath,
        type:        'app',
        description: '',
        status:      'product',
    };
    reg.projects.push(entry);
    saveRegistry(reg);
}

/**
 * Remove every entry whose path matches `fsPath` (case-insensitive). Returns
 * the count removed. If nothing matches, the registry is left untouched on
 * disk — no pointless rewrite.
 */
export function removeFromRegistry(fsPath: string): number {
    const reg = loadRegistry();
    const needle = fsPath.toLowerCase();
    const before = reg.projects.length;
    reg.projects = reg.projects.filter(p => p.path.toLowerCase() !== needle);
    const removed = before - reg.projects.length;
    if (removed > 0) { saveRegistry(reg); }
    return removed;
}
