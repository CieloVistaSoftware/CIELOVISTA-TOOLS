// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/** Registry health check — are all registered project paths still valid? */

import * as fs from 'fs';
import type { AuditCheck } from '../../../shared/audit-schema';

interface ProjectEntry { name: string; path: string; }

export function runRegistryHealthCheck(projects: ProjectEntry[]): AuditCheck {
    const t0 = Date.now();

    const stale  = projects.filter(p => !fs.existsSync(p.path));
    const active = projects.filter(p =>  fs.existsSync(p.path));

    let status: AuditCheck['status'];
    let summary: string;
    let detail: string;

    if (stale.length > 0) {
        status  = 'red';
        summary = `${stale.length} registered path${stale.length > 1 ? 's' : ''} not found: ${stale.map(p => p.name).join(', ')}`;
        detail  = `The following projects are in the registry but their folders no longer exist:\n` +
                  stale.map(p => `  ${p.name}: ${p.path}`).join('\n') +
                  `\n\nUpdate project-registry.json to remove or fix these entries.`;
    } else {
        status  = 'green';
        summary = `All ${active.length} registered projects found on disk`;
        detail  = `Registry is clean — all ${active.length} project paths are valid.`;
    }

    return {
        checkId:          'registryHealth',
        category:         'Registry',
        title:            'Project Registry',
        status,
        summary,
        detail,
        affectedProjects: stale.map(p => p.name),
        affectedFiles:    stale.map(p => p.path),
        action:           'cvs.docs.openRegistry',
        actionLabel:      stale.length > 0 ? 'Open Registry' : 'Open',
        ranAt:            new Date().toISOString(),
        durationMs:       Date.now() - t0,
    };
}
