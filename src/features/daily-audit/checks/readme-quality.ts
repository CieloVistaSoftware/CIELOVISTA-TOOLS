// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/** README quality check — does each project have a README? Is it big enough to matter? */

import * as fs from 'fs';
import * as path from 'path';
import type { AuditCheck } from '../../../shared/audit-schema';

interface ProjectEntry { name: string; path: string; }

interface ProjectResult { name: string; status: 'missing' | 'stub' | 'ok'; lines: number; }

function checkOne(project: ProjectEntry): ProjectResult {
    const readmePath = path.join(project.path, 'README.md');
    if (!fs.existsSync(readmePath)) { return { name: project.name, status: 'missing', lines: 0 }; }
    const content = fs.readFileSync(readmePath, 'utf8');
    const lines   = content.split('\n').length;
    return { name: project.name, status: lines < 20 ? 'stub' : 'ok', lines };
}

export function runReadmeQualityCheck(projects: ProjectEntry[]): AuditCheck {
    const t0 = Date.now();
    const results = projects.map(p => checkOne(p));

    const missing = results.filter(r => r.status === 'missing');
    const stubs   = results.filter(r => r.status === 'stub');
    const ok      = results.filter(r => r.status === 'ok');

    let status: AuditCheck['status'];
    let summary: string;
    let detail: string;

    if (missing.length > 0) {
        status  = 'red';
        summary = `Missing README in: ${missing.map(r => r.name).join(', ')}`;
        detail  = `${missing.length} project(s) have no README.md at all: ${missing.map(r => r.name).join(', ')}` +
                  (stubs.length > 0 ? `\n${stubs.length} project(s) have stub READMEs under 20 lines: ${stubs.map(r => r.name).join(', ')}` : '');
    } else if (stubs.length > 0) {
        status  = 'yellow';
        summary = `${stubs.length} project${stubs.length > 1 ? 's have' : ' has'} stub README${stubs.length > 1 ? 's' : ''} — ${stubs.map(r => r.name).join(', ')}`;
        detail  = stubs.map(r => `${r.name}: README.md is only ${r.lines} lines`).join('\n');
    } else {
        status  = 'green';
        summary = `All ${ok.length} projects have a README`;
        detail  = `All project READMEs are present and have sufficient content.`;
    }

    return {
        checkId:          'readmeQuality',
        category:         'Documentation',
        title:            'README Quality',
        status,
        summary,
        detail,
        affectedProjects: [...missing, ...stubs].map(r => r.name),
        affectedFiles:    [...missing].map(r => path.join(r.name, 'README.md')),
        action:           'cvs.readme.scan',
        actionLabel:      missing.length > 0 ? 'Generate Now' : stubs.length > 0 ? 'Fix Now' : 'Scan',
        ranAt:            new Date().toISOString(),
        durationMs:       Date.now() - t0,
    };
}
