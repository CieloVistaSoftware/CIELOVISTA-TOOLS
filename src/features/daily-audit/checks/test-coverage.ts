// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * test-coverage.ts — Daily audit check for Playwright test setup.
 *
 * For each project, checks:
 *   1. tests/ folder exists
 *   2. package.json has a test script using playwright
 *   3. playwright.config.ts (or .js) exists
 *   4. @playwright/test is in devDependencies
 *
 * Dotnet-only projects (no package.json) are skipped entirely.
 */

import * as fs   from 'fs';
import * as path from 'path';
import type { AuditCheck } from '../../../shared/audit-schema';

interface ProjectEntry { name: string; path: string; type: string; }

export interface TestCoverageResult {
    name:          string;
    projPath:      string;
    type:          string;
    hasTests:      boolean;
    hasPlaywright: boolean;
    hasConfig:     boolean;
    hasDep:        boolean;
    hasNpm:        boolean;     // false = dotnet-only, skip playwright checks
    specFiles:     string[];    // all .spec.ts / .spec.js / .test.ts / .test.js / .test.mjs files found
    realTestCount: number;      // test files with actual test() calls beyond placeholder
    issues:        string[];
}

export function checkTestCoverage(project: ProjectEntry): TestCoverageResult {
    const result: TestCoverageResult = {
        name: project.name, projPath: project.path, type: project.type,
        hasTests: false, hasPlaywright: false, hasConfig: false, hasDep: false,
        hasNpm: false, specFiles: [], realTestCount: 0, issues: [],
    };

    if (!fs.existsSync(project.path)) {
        result.issues.push('Project folder not found on disk');
        return result;
    }

    // Skip non-NPM non-extension projects entirely.
    const pkgPath = path.join(project.path, 'package.json');
    const isExtension = project.type === 'vscode-extension';
    if (!fs.existsSync(pkgPath) && !isExtension) {
        return result;
    }

    // tests/ folder — check existence AND whether it has real tests
    const testsDir = path.join(project.path, 'tests');
    result.hasTests = fs.existsSync(testsDir);
    if (!result.hasTests) {
        result.issues.push('No tests/ folder');
    } else {
        // Find all spec files
        try {
            result.specFiles = fs.readdirSync(testsDir)
                .filter(f => /\.(spec|test)\.(ts|js|mjs)$/.test(f))
                .map(f => path.join(testsDir, f));
        } catch { result.specFiles = []; }

        // Count files that have real test() calls (not just the placeholder)
        const PLACEHOLDER = 'placeholder test';
        const REAL_TEST   = /^\s*(test|it)\s*\(/m;
        result.realTestCount = result.specFiles.filter(f => {
            try {
                const content = fs.readFileSync(f, 'utf8');
                return REAL_TEST.test(content) && !content.includes(PLACEHOLDER);
            } catch { return false; }
        }).length;

        if (result.specFiles.length === 0) {
            result.issues.push('tests/ folder is empty — no .spec.ts or .test.js files');
        } else if (result.realTestCount === 0) {
            result.issues.push(`${result.specFiles.length} test file${result.specFiles.length > 1 ? 's' : ''} contain only placeholder tests — real tests needed`);
        }
    }

    // package.json — if missing, keep only the tests/ signal for extension projects
    if (!fs.existsSync(pkgPath)) {
        result.hasNpm = false;
        result.issues.push('Missing package.json');
        return result;
    }
    result.hasNpm = true;

    let pkg: Record<string, unknown> = {};
    try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')); } catch { /* ignore */ }

    // Test script uses playwright
    const testScript = ((pkg.scripts as Record<string, string> | undefined)?.test ?? '').toLowerCase();
    result.hasPlaywright = testScript.includes('playwright');
    if (!result.hasPlaywright) {
        const current = testScript || '(none)';
        result.issues.push(
            testScript.includes('jest') || testScript.includes('vitest') || testScript.includes('mocha')
                ? `Wrong test runner: "${current}" — must use playwright`
                : `No playwright test script (current: "${current}")`
        );
    }

    // playwright.config.ts / .js
    result.hasConfig = fs.existsSync(path.join(project.path, 'playwright.config.ts'))
                    || fs.existsSync(path.join(project.path, 'playwright.config.js'));
    if (!result.hasConfig) { result.issues.push('Missing playwright.config.ts'); }

    // @playwright/test in devDependencies or dependencies
    const dev  = (pkg.devDependencies  as Record<string, string> | undefined) ?? {};
    const deps = (pkg.dependencies     as Record<string, string> | undefined) ?? {};
    result.hasDep = '@playwright/test' in dev || '@playwright/test' in deps;
    if (!result.hasDep) { result.issues.push('@playwright/test not in devDependencies'); }

    return result;
}

export function runTestCoverageCheck(projects: ProjectEntry[]): AuditCheck {
    const t0 = Date.now();
    const results = projects.map(p => checkTestCoverage(p));

    const failing  = results.filter(r => r.issues.length > 0);
    const passing  = results.filter(r => r.issues.length === 0);

    let status: AuditCheck['status'];
    let summary: string;

    if (failing.length === 0) {
        status  = 'green';
        summary = `All ${passing.length} projects have Playwright tests configured`;
    } else if (failing.length <= 2) {
        status  = 'yellow';
        summary = `${failing.length} project${failing.length > 1 ? 's' : ''} missing Playwright setup: ${failing.map(r => r.name).join(', ')}`;
    } else {
        status  = 'red';
        summary = `${failing.length} projects missing Playwright setup: ${failing.slice(0, 3).map(r => r.name).join(', ')}${failing.length > 3 ? ` +${failing.length - 3} more` : ''}`;
    }

    return {
        checkId:          'testCoverage',
        category:         'Testing',
        title:            'Playwright Test Setup',
        status,
        summary,
        detail:           failing.map(r => `${r.name}: ${r.issues.join(', ')}`).join('\n'),
        affectedProjects: failing.map(r => r.name),
        affectedFiles:    failing.flatMap(r => [path.join(r.projPath, 'tests'), path.join(r.projPath, 'package.json')]),
        action:           'cvs.audit.testCoverage',
        actionLabel:      failing.length > 0 ? 'Fix Now' : 'View',
        ranAt:            new Date().toISOString(),
        durationMs:       Date.now() - t0,
    };
}
