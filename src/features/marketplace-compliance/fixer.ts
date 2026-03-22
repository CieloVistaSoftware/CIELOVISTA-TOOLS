// Copyright (c) 2025 CieloVista Software. All rights reserved.
import * as fs from 'fs';
import * as path from 'path';
import { logError } from '../../shared/output-channel';
import { licenseContent, changelogContent } from './file-generators';
import { createBlueStarPng } from './png-generator';
import type { ProjectCompliance } from './types';

export function fixProject(compliance: ProjectCompliance): string[] {
    const fixed: string[] = [];
    const { project, issues, packageJson } = compliance;
    let pkg = packageJson ? { ...packageJson } : null;

    for (const issue of issues) {
        if (!issue.fixable) { continue; }
        try {
            if (issue.fixKey === 'create:license') {
                fs.writeFileSync(path.join(project.path, 'LICENSE'), licenseContent(project.name), 'utf8');
                fixed.push('LICENSE');
            }
            if (issue.fixKey === 'create:changelog') {
                const version = (pkg?.['version'] as string) ?? '1.0.0';
                fs.writeFileSync(path.join(project.path, 'CHANGELOG.md'), changelogContent(project.name, version), 'utf8');
                fixed.push('CHANGELOG.md');
            }
            if (issue.fixKey === 'create:icon') {
                fs.writeFileSync(path.join(project.path, 'icon.png'), createBlueStarPng());
                fixed.push('icon.png');
                if (pkg) { pkg['icon'] = 'icon.png'; }
            }
            if (issue.fixKey === 'pkg:license' && pkg) { pkg['license'] = 'PROPRIETARY'; }
            if (issue.fixKey === 'pkg:icon'    && pkg) { pkg['icon'] = 'icon.png'; }
            if (issue.fixKey === 'pkg:publisher' && pkg) { pkg['publisher'] = 'CieloVistaSoftware'; }
        } catch (err) { logError('marketplace-compliance', `Fix failed: ${issue.fixKey} in ${project.name}`, err); }
    }

    if (pkg && packageJson) {
        const pkgPath = path.join(project.path, 'package.json');
        try {
            fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
            if (JSON.stringify(pkg) !== JSON.stringify(packageJson)) { fixed.push('package.json'); }
        } catch (err) { logError('marketplace-compliance', `Failed to write package.json for ${project.name}`, err); }
    }

    return fixed;
}
