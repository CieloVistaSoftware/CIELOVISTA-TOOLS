// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/** Changelog freshness check — active projects should have recent changelogs. */

import * as fs from 'fs';
import * as path from 'path';
import type { AuditCheck } from '../../../shared/audit-schema';

interface ProjectEntry { name: string; path: string; }

const STALE_DAYS = 30;

export function runChangelogCheck(projects: ProjectEntry[]): AuditCheck {
    const t0  = Date.now();
    const now = Date.now();

    const missing: string[] = [];
    const stale:   string[] = [];
    const fresh:   string[] = [];

    for (const p of projects) {
        if (!fs.existsSync(p.path)) { continue; }
        const clPath = path.join(p.path, 'CHANGELOG.md');
        if (!fs.existsSync(clPath)) {
            missing.push(p.name);
            continue;
        }
        const mtime   = fs.statSync(clPath).mtimeMs;
        const ageDays = (now - mtime) / (1000 * 60 * 60 * 24);
        if (ageDays > STALE_DAYS) { stale.push(p.name); }
        else                       { fresh.push(p.name); }
    }

    let status: AuditCheck['status'];
    let summary: string;
    let detail: string;

    if (missing.length > 0) {
        status  = 'red';
        summary = `No CHANGELOG in: ${missing.join(', ')}`;
        detail  = `${missing.length} project(s) have no CHANGELOG.md: ${missing.join(', ')}\n` +
                  (stale.length > 0 ? `${stale.length} project(s) have changelogs not updated in ${STALE_DAYS}+ days: ${stale.join(', ')}` : '');
    } else if (stale.length > 0) {
        status  = 'yellow';
        summary = `${stale.length} changelog${stale.length > 1 ? 's' : ''} not updated in ${STALE_DAYS}+ days — ${stale.join(', ')}`;
        detail  = `These projects have changelogs that haven't been touched in over ${STALE_DAYS} days:\n${stale.join(', ')}`;
    } else {
        status  = 'green';
        summary = `All ${fresh.length} changelogs up to date`;
        detail  = `All project CHANGELOG.md files have been updated within the last ${STALE_DAYS} days.`;
    }

    return {
        checkId:          'changelog',
        category:         'Documentation',
        title:            'Changelog Status',
        status,
        summary,
        detail,
        affectedProjects: [...missing, ...stale],
        affectedFiles:    [...missing, ...stale].map(n => path.join(n, 'CHANGELOG.md')),
        action:           'cvs.marketplace.scan',
        actionLabel:      missing.length > 0 ? 'Auto-Fix' : 'Review',
        ranAt:            new Date().toISOString(),
        durationMs:       Date.now() - t0,
    };
}
