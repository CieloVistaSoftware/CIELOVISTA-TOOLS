// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

// component: aud

/** CLAUDE.md coverage check — every project should have session instructions. */

import * as fs from 'fs';
import * as path from 'path';
import type { AuditCheck } from '../../../shared/audit-schema';
import { findClaudeMd } from '../../../shared/claude-md';

interface ProjectEntry { name: string; path: string; }

export function runClaudeCoverageCheck(projects: ProjectEntry[]): AuditCheck {
    const t0 = Date.now();

    // CLAUDE.md may live at the root or in .claude/ (#862).
    const missing = projects.filter(p => fs.existsSync(p.path) && !findClaudeMd(p.path));
    const present = projects.filter(p => fs.existsSync(p.path) &&  !!findClaudeMd(p.path));

    let status: AuditCheck['status'];
    let summary: string;
    let detail: string;

    if (missing.length > 0) {
        status  = 'red';
        summary = `No CLAUDE.md in: ${missing.map(p => p.name).join(', ')}`;
        detail  = `${missing.length} project(s) are missing CLAUDE.md session instructions.\n` +
                  `Without it Claude starts every session cold with no project context.\n` +
                  `Missing: ${missing.map(p => p.name).join(', ')}`;
    } else {
        status  = 'green';
        summary = `All ${present.length} projects have CLAUDE.md`;
        detail  = `Every registered project has CLAUDE.md session instructions.`;
    }

    return {
        checkId:          'claudeCoverage',
        category:         'Session Management',
        title:            'CLAUDE.md Coverage',
        status,
        summary,
        detail,
        affectedProjects: missing.map(p => p.name),
        affectedFiles:    missing.map(p => path.join(p.path, 'CLAUDE.md')),
        action:           'cvs.catalog.open',
        actionLabel:      missing.length > 0 ? 'Create Missing' : 'Open Catalog',
        ranAt:            new Date().toISOString(),
        durationMs:       Date.now() - t0,
    };
}
