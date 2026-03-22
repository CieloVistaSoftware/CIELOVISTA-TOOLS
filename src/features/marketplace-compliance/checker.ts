// Copyright (c) 2025 CieloVista Software. All rights reserved.
import * as fs from 'fs';
import * as path from 'path';
import type { ProjectEntry, ProjectCompliance, ComplianceIssue } from './types';

const OPEN_SOURCE_LICENSES = ['MIT', 'ISC', 'Apache-2.0', 'GPL-2.0', 'GPL-3.0', 'BSD-2-Clause', 'BSD-3-Clause'];

export function checkProject(project: ProjectEntry): ProjectCompliance {
    const issues: ComplianceIssue[] = [];
    let pkg: Record<string, unknown> | null = null;

    if (!fs.existsSync(project.path)) {
        return { project, issues: [{ severity: 'error', file: 'folder', message: 'Project folder not found', fixable: false, fixKey: '' }], score: 0, packageJson: null };
    }

    const pkgPath = path.join(project.path, 'package.json');
    if (!fs.existsSync(pkgPath)) {
        issues.push({ severity: 'warning', file: 'package.json', message: 'No package.json found', fixable: false, fixKey: '' });
    } else {
        try {
            pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as Record<string, unknown>;
            for (const r of [{ key: 'name' }, { key: 'description' }, { key: 'version' }, { key: 'license' }]) {
                if (!pkg[r.key] || (pkg[r.key] as string).trim() === '') {
                    issues.push({ severity: 'error', file: 'package.json', message: `Missing or empty field: "${r.key}"`, fixable: r.key === 'license', fixKey: `pkg:${r.key}` });
                }
            }
            const lic = (pkg['license'] as string ?? '').trim();
            if (OPEN_SOURCE_LICENSES.includes(lic)) {
                issues.push({ severity: 'error', file: 'package.json', message: `License is "${lic}" — CieloVista projects must use PROPRIETARY`, fixable: true, fixKey: 'pkg:license' });
            }
            if (!pkg['icon']) {
                issues.push({ severity: 'warning', file: 'package.json', message: 'Missing "icon" field (should be "icon.png")', fixable: true, fixKey: 'pkg:icon' });
            }
            if (project.type === 'vscode-extension') {
                if (!pkg['publisher']) { issues.push({ severity: 'error', file: 'package.json', message: 'Missing "publisher"', fixable: true, fixKey: 'pkg:publisher' }); }
                if (!Array.isArray(pkg['categories']) || (pkg['categories'] as unknown[]).length === 0) {
                    issues.push({ severity: 'warning', file: 'package.json', message: 'Missing or empty "categories"', fixable: false, fixKey: '' });
                }
            }
            if (!pkg['repository']) { issues.push({ severity: 'info', file: 'package.json', message: 'No "repository" field', fixable: false, fixKey: '' }); }
        } catch (err) {
            issues.push({ severity: 'error', file: 'package.json', message: `Invalid JSON: ${err}`, fixable: false, fixKey: '' });
        }
    }

    const readmePath = path.join(project.path, 'README.md');
    if (!fs.existsSync(readmePath)) { issues.push({ severity: 'error', file: 'README.md', message: 'Missing README.md', fixable: false, fixKey: '' }); }
    else if (fs.statSync(readmePath).size < 100) { issues.push({ severity: 'warning', file: 'README.md', message: 'README.md exists but is nearly empty', fixable: false, fixKey: '' }); }

    if (!fs.existsSync(path.join(project.path, 'CHANGELOG.md'))) {
        issues.push({ severity: 'warning', file: 'CHANGELOG.md', message: 'Missing CHANGELOG.md', fixable: true, fixKey: 'create:changelog' });
    }
    if (!fs.existsSync(path.join(project.path, 'LICENSE')) && !fs.existsSync(path.join(project.path, 'LICENSE.txt'))) {
        issues.push({ severity: 'error', file: 'LICENSE', message: 'Missing LICENSE file', fixable: true, fixKey: 'create:license' });
    }
    if (!fs.existsSync(path.join(project.path, 'icon.png'))) {
        issues.push({ severity: 'warning', file: 'icon.png', message: 'Missing icon.png', fixable: true, fixKey: 'create:icon' });
    }

    const errors   = issues.filter(i => i.severity === 'error').length;
    const warnings = issues.filter(i => i.severity === 'warning').length;
    return { project, issues, score: Math.max(0, 100 - errors * 20 - warnings * 8), packageJson: pkg };
}
