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

export interface ScriptEntry { name: string; cmd: string; }
export interface PkgEntry    { label: string; relPath: string; absDir: string; scripts: ScriptEntry[]; }

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
        const pkg     = JSON.parse(fs.readFileSync(pkgFile, 'utf8')) as { scripts?: Record<string, string> };
        const scripts = Object.entries(pkg.scripts ?? {}).map(([name, cmd]) => ({ name, cmd }));
        if (!scripts.length) { return null; }
        const relPath = wsRoot
            ? path.relative(wsRoot, pkgFile).replace(/\\/g, '/')
            : pkgFile;
        return { label: path.basename(absDir), relPath, absDir, scripts };
    } catch {
        return null;
    }
}
