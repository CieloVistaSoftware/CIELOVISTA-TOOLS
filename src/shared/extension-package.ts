// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

// component: shared

import * as fs   from 'fs';
import * as path from 'path';

/**
 * Locates the extension's own package.json without assuming how deep the
 * calling module sits inside out/.
 *
 * esbuild emits the same source at two different depths: everything reachable
 * from src/extension.ts is bundled into out/extension.js (__dirname = <ext>/out),
 * while a handful of modules are ALSO emitted standalone under out/features/…
 * (__dirname = <ext>/out/features). A hardcoded '..' or '../..' can therefore
 * only ever be right in one of the two builds — that mismatch is what made the
 * link-integrity checker read <ext>/../package.json and fail with ENOENT (#677).
 *
 * Walking up and matching on the package name is correct from any depth, and in
 * a source checkout as well as an installed extension. Deliberately free of any
 * `vscode` import so the standalone bundles keep running under plain node.
 */

const PACKAGE_NAME = 'cielovista-tools';
const MAX_WALK_UP  = 6;

export function resolveExtensionRoot(startDir: string = __dirname): string | undefined {
    let dir = startDir;

    for (let i = 0; i < MAX_WALK_UP; i++) {
        const candidate = path.join(dir, 'package.json');
        if (fs.existsSync(candidate)) {
            try {
                const pkg = JSON.parse(fs.readFileSync(candidate, 'utf8'));
                if (pkg?.name === PACKAGE_NAME) { return dir; }
            } catch {
                // Unparseable package.json on the way up is not ours — keep walking.
            }
        }
        const parent = path.dirname(dir);
        if (parent === dir) { break; }
        dir = parent;
    }

    return undefined;
}

export function readExtensionPackageJson(startDir: string = __dirname): Record<string, any> | undefined {
    const root = resolveExtensionRoot(startDir);
    if (!root) { return undefined; }

    try {
        return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    } catch {
        return undefined;
    }
}

export function getContributedCommands(startDir: string = __dirname): Array<Record<string, any>> {
    const pkg = readExtensionPackageJson(startDir);
    return pkg?.contributes?.commands ?? [];
}

export function getContributedCommandIds(startDir: string = __dirname): Set<string> {
    const ids = new Set<string>();
    for (const cmd of getContributedCommands(startDir)) {
        if (typeof cmd?.command === 'string') { ids.add(cmd.command); }
    }
    return ids;
}
