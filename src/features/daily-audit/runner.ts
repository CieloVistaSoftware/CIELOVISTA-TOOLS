// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * runner.ts
 *
 * Orchestrates all daily audit checks and writes daily-audit.json.
 * Called from both VS Code (index.ts) and the standalone Node script
 * (scripts/run-audit.js) for the 7:45am scheduled task.
 *
 * Zero VS Code dependency — pure Node.js so the scheduled task
 * can run this without VS Code being open.
 */

import * as fs   from 'fs';
import * as path from 'path';
import { runMarketplaceCheck    } from './checks/marketplace';
import { runReadmeQualityCheck  } from './checks/readme-quality';
import { runClaudeCoverageCheck } from './checks/claude-coverage';
import { runRegistryHealthCheck } from './checks/registry-health';
import { runChangelogCheck      } from './checks/changelog';
import { runTestCoverageCheck   } from './checks/test-coverage';
import type { DailyAuditReport, AuditCheck } from '../../shared/audit-schema';
import { AUDIT_REPORT_PATH } from '../../shared/audit-schema';

const REGISTRY_PATH = 'C:\\Users\\jwpmi\\Downloads\\CieloVistaStandards\\project-registry.json';

interface ProjectEntry {
    name: string;
    path: string;
    type: string;
    description: string;
    status?: 'product' | 'workbench' | 'generated' | 'archived';
}
interface ProjectRegistry { globalDocsPath: string; projects: ProjectEntry[]; }

function loadRegistry(): ProjectRegistry {
    if (!fs.existsSync(REGISTRY_PATH)) {
        throw new Error(`Registry not found: ${REGISTRY_PATH}`);
    }
    return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8')) as ProjectRegistry;
}

export interface RunAuditResult {
    report:  DailyAuditReport;
    written: boolean;
    projectNames: string[];
    error?:  string;
}

/** Run all checks and write the report to AUDIT_REPORT_PATH. */
export async function runDailyAudit(): Promise<RunAuditResult> {
    const t0 = Date.now();

    let registry: ProjectRegistry;
    try {
        registry = loadRegistry();
    } catch (err) {
        const errMsg = String(err);
        const emptyReport: DailyAuditReport = {
            auditId:     new Date().toISOString(),
            generatedAt: new Date().toISOString(),
            durationMs:  Date.now() - t0,
            checks:      [{
                checkId: 'registryHealth', category: 'Registry', title: 'Project Registry',
                status: 'red', summary: 'Registry not found', detail: errMsg,
                affectedProjects: [], affectedFiles: [REGISTRY_PATH],
                action: 'cvs.docs.openRegistry', actionLabel: 'Fix Registry',
                ranAt: new Date().toISOString(), durationMs: 0,
            }],
            summary: { red: 1, yellow: 0, green: 0, grey: 0, total: 1 },
        };
        return { report: emptyReport, written: false, projectNames: [], error: errMsg };
    }

    const projects = registry.projects;
    const strictProjects = projects.filter(p => (p.status ?? 'product') === 'product' || (p.status ?? 'product') === 'workbench');

    // Run all checks — each is independent, failures don't block others
    const checks: AuditCheck[] = await Promise.all([
        safeRun(() => runRegistryHealthCheck(projects)),
        safeRun(() => runMarketplaceCheck(strictProjects)),
        safeRun(() => runReadmeQualityCheck(strictProjects)),
        safeRun(() => runClaudeCoverageCheck(strictProjects)),
        safeRun(() => runChangelogCheck(strictProjects)),
        safeRun(() => runTestCoverageCheck(strictProjects)),
    ]);

    const summary = {
        red:    checks.filter(c => c.status === 'red').length,
        yellow: checks.filter(c => c.status === 'yellow').length,
        green:  checks.filter(c => c.status === 'green').length,
        grey:   checks.filter(c => c.status === 'grey').length,
        total:  checks.length,
    };

    const report: DailyAuditReport = {
        auditId:     new Date().toISOString(),
        generatedAt: new Date().toISOString(),
        durationMs:  Date.now() - t0,
        checks,
        summary,
    };

    // Ensure reports directory exists
    const reportsDir = path.dirname(AUDIT_REPORT_PATH);
    if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
    }

    try {
        fs.writeFileSync(AUDIT_REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
        return { report, written: true, projectNames: projects.map(p => p.name) };
    } catch (err) {
        return { report, written: false, projectNames: projects.map(p => p.name), error: String(err) };
    }
}

/** Loads the last written report from disk. Returns null if none exists. */
export function loadLastReport(): DailyAuditReport | null {
    try {
        if (!fs.existsSync(AUDIT_REPORT_PATH)) { return null; }
        return JSON.parse(fs.readFileSync(AUDIT_REPORT_PATH, 'utf8')) as DailyAuditReport;
    } catch {
        return null;
    }
}

/** Wraps a check so a single failure doesn't crash the whole audit. */
async function safeRun(fn: () => AuditCheck): Promise<AuditCheck> {
    try {
        return fn();
    } catch (err) {
        return {
            checkId: 'unknown', category: 'Error', title: 'Check Failed',
            status: 'grey',
            summary: `Check threw an error: ${String(err).slice(0, 80)}`,
            detail:  String(err),
            affectedProjects: [], affectedFiles: [],
            action: '', actionLabel: '',
            ranAt: new Date().toISOString(), durationMs: 0,
        };
    }
}
