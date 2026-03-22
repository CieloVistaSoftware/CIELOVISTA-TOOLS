// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * categories.ts
 *
 * Project-based Dewey numbering for the Doc Catalog.
 *
 * Each PROJECT gets a stable 3-digit base number derived from its position
 * in the registry. Documents within that project are sub-items:
 *
 *   000  — Global Standards (CieloVistaStandards)
 *   100  — vscode-claude
 *   200  — wb-core
 *   300  — DiskCleanUp
 *   400  — cielovista-tools
 *   ...
 *
 * Individual cards display as: 300.001, 300.002, 300.003 ...
 * meaning "the 1st, 2nd, 3rd document in the DiskCleanUp project".
 *
 * This is the canonical way to identify any document across all projects.
 */

export interface ProjectDewey {
    num:   number;   // e.g. 300
    label: string;   // e.g. "DiskCleanUp"
}

/**
 * Build a stable map of projectName → Dewey base number.
 * Global docs always get 000.
 * Projects get 100, 200, 300 ... in registry order.
 */
export function buildProjectDeweyMap(
    projectNames: string[]
): Map<string, ProjectDewey> {
    const map = new Map<string, ProjectDewey>();
    map.set('global', { num: 0, label: 'Global Standards' });
    projectNames.forEach((name, i) => {
        map.set(name, { num: (i + 1) * 100, label: name });
    });
    return map;
}

/**
 * Look up a project's Dewey entry, falling back to 999 if unknown.
 */
export function lookupDewey(
    map: Map<string, ProjectDewey>,
    projectName: string
): ProjectDewey {
    return map.get(projectName) ?? { num: 999, label: projectName };
}
