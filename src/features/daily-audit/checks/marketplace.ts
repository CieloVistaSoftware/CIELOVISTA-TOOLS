// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/** Marketplace compliance check — LICENSE, CHANGELOG, icon.png, package.json fields. */

import * as fs from 'fs';
import * as path from 'path';
import type { AuditCheck } from '../../../shared/audit-schema';

interface ProjectEntry { name: string; path: string; type: string; }

const OPEN_SOURCE_LICENSES = ['MIT', 'ISC', 'Apache-2.0', 'GPL-2.0', 'GPL-3.0', 'BSD-2-Clause', 'BSD-3-Clause'];

interface ProjectResult {
    name:    string;
    score:   number;
    missing: string[];
}

function checkOne(project: ProjectEntry): ProjectResult {
    const missing: string[] = [];
    if (!fs.existsSync(project.path)) { return { name: project.name, score: 0, missing: ['project folder not found'] }; }

    if (!fs.existsSync(path.join(project.path, 'LICENSE')) &&
        !fs.existsSync(path.join(project.path, 'LICENSE.txt'))) { missing.push('LICENSE'); }

    if (!fs.existsSync(path.join(project.path, 'CHANGELOG.md'))) { missing.push('CHANGELOG.md'); }
    if (!fs.existsSync(path.join(project.path, 'icon.png')))     { missing.push('icon.png'); }

    const pkgPath = path.join(project.path, 'package.json');
    if (!fs.existsSync(pkgPath)) {
        missing.push('package.json');
    } else {
        try {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            if (!pkg.name        || !pkg.name.trim())        { missing.push('package.json:name'); }
            if (!pkg.description || !pkg.description.trim()) { missing.push('package.json:description'); }
            if (!pkg.version     || !pkg.version.trim())     { missing.push('package.json:version'); }
            const lic = (pkg.license ?? '').trim();
            if (!lic)                                 { missing.push('package.json:license'); }
            else if (OPEN_SOURCE_LICENSES.includes(lic)) { missing.push(`package.json:license="${lic}" must be PROPRIETARY`); }
            if (project.type === 'vscode-extension' && !pkg.publisher) { missing.push('package.json:publisher'); }
        } catch { missing.push('package.json:invalid JSON'); }
    }

    const errors   = missing.filter(m => !m.includes('icon') && !m.includes('CHANGELOG')).length;
    const warnings = missing.filter(m =>  m.includes('icon') ||  m.includes('CHANGELOG')).length;
    const score    = Math.max(0, 100 - errors * 20 - warnings * 8);
    return { name: project.name, score, missing };
}

export function runMarketplaceCheck(projects: ProjectEntry[]): AuditCheck {
    const t0 = Date.now();
    const results = projects.map(p => checkOne(p));

    const red    = results.filter(r => r.score <  60);
    const yellow = results.filter(r => r.score >= 60 && r.score < 100);
    const green  = results.filter(r => r.score === 100);

    let status: AuditCheck['status'];
    let summary: string;
    let detail: string;

    if (red.length > 0) {
        status  = 'red';
        const issues = red.flatMap(r => r.missing.slice(0, 2).map(m => `${r.name}: ${m}`));
        summary = issues.slice(0, 3).join(', ') + (issues.length > 3 ? ` +${issues.length - 3} more` : '');
        detail  = red.map(r => `${r.name} (score ${r.score}/100): ${r.missing.join(', ')}`).join('\n');
    } else if (yellow.length > 0) {
        status  = 'yellow';
        summary = `${yellow.length} project${yellow.length > 1 ? 's' : ''} not fully compliant — ${yellow.map(r => r.name).join(', ')}`;
        detail  = yellow.map(r => `${r.name} (score ${r.score}/100): ${r.missing.join(', ')}`).join('\n');
    } else {
        status  = 'green';
        summary = `All ${green.length} projects fully compliant`;
        detail  = `All projects have LICENSE, CHANGELOG, icon.png, and valid package.json.`;
    }

    return {
        checkId:          'marketplace',
        category:         'Marketplace',
        title:            'Marketplace Compliance',
        status,
        summary,
        detail,
        affectedProjects: [...red, ...yellow].map(r => r.name),
        affectedFiles:    [...red, ...yellow].flatMap(r => r.missing),
        action:           'cvs.marketplace.scan',
        actionLabel:      red.length > 0 ? 'Fix Now' : yellow.length > 0 ? 'Review' : 'Open',
        ranAt:            new Date().toISOString(),
        durationMs:       Date.now() - t0,
    };
}
