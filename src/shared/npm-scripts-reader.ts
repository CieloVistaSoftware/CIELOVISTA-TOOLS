// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * npm-scripts-reader.ts
 *
 * Pure filesystem reader for npm scripts — NO vscode dependency.
 * Extracted so it can be compiled to a standalone module and tested directly
 * (out/shared/npm-scripts-reader.js is required by REG-114 behavioral test).
 *
 * This is the exact function that runs in production when a project is selected
 * in the NPM Scripts panel. The test calls THIS compiled output, not a copy.
 */

import * as fs   from 'fs';
import * as path from 'path';

/** `desc` comes from the optional top-level "scripts-info" key: { "<script>": "<what it does, when to use it>" }. */
export interface ScriptEntry { name: string; cmd: string; desc?: string; }
/** One section of the panel, from the optional top-level "scripts-groups" key, in reading order. */
export interface ScriptGroup { heading: string; collapsed: boolean; scripts: string[]; }
export interface PkgEntry    { label: string; relPath: string; absDir: string; scripts: ScriptEntry[]; groups?: ScriptGroup[]; }

/** Heading of the section that collects scripts named in no group. */
export const OTHER_GROUP = 'Other';

/**
 * Resolve "scripts-groups" against the real script names: keeps the given order,
 * drops names that are not scripts, lists each script once (first group wins),
 * and puts every script in no group into a final "Other" section.
 * A heading starting with "Internal" is collapsed by default.
 * @returns the groups, or undefined when the key is absent or not an object
 */
export function resolveGroups(raw: unknown, scripts: ScriptEntry[]): ScriptGroup[] | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const known  = new Set(scripts.map(s => s.name));
    const placed = new Set<string>();
    const groups: ScriptGroup[] = [];
    for (const [heading, list] of Object.entries(raw as Record<string, unknown>)) {
        if (!Array.isArray(list)) { continue; }
        const names = list.filter((n): n is string => typeof n === 'string' && known.has(n) && !placed.has(n));
        names.forEach(n => placed.add(n));
        if (names.length) { groups.push({ heading, collapsed: /^internal/i.test(heading.trim()), scripts: names }); }
    }
    const rest = scripts.map(s => s.name).filter(n => !placed.has(n));
    if (rest.length) { groups.push({ heading: OTHER_GROUP, collapsed: false, scripts: rest }); }
    return groups;
}

/**
 * Read package.json scripts from a single directory.
 * @param absDir absolute path to the directory containing package.json
 * @param wsRoot workspace root used to compute relPath; pass '' to get the full path
 * @returns PkgEntry with the directory's scripts, or null if no package.json / no scripts / parse error
 */
export function readPkgScripts(absDir: string, wsRoot: string): PkgEntry | null {
    const pkgFile = path.join(absDir, 'package.json');
    if (!fs.existsSync(pkgFile)) { return null; }
    try {
        const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8')) as {
            scripts?: Record<string, string>; 'scripts-info'?: unknown; 'scripts-groups'?: unknown;
        };
        const rawInfo = pkg['scripts-info'];
        const info = rawInfo && typeof rawInfo === 'object' ? rawInfo as Record<string, unknown> : {};
        const scripts: ScriptEntry[] = Object.entries(pkg.scripts ?? {}).map(([name, cmd]) => {
            const desc = info[name];
            return typeof desc === 'string' && desc.trim() ? { name, cmd, desc: desc.trim() } : { name, cmd };
        });
        if (!scripts.length) { return null; }
        const groups = resolveGroups(pkg['scripts-groups'], scripts);
        const relPath = wsRoot
            ? path.relative(wsRoot, pkgFile).replace(/\\/g, '/')
            : pkgFile;
        const entry: PkgEntry = { label: path.basename(absDir), relPath, absDir, scripts };
        if (groups) { entry.groups = groups; }
        return entry;
    } catch {
        return null;
    }
}
