// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * doc-header-scan.ts
 *
 * Registers two commands:
 *   cvs.headers.scan       — scan all .md docs against the three-field header contract
 *   cvs.headers.scanAuto   — same scan, then rewrites every non-compliant header to the
 *                            contract and re-verifies each file
 *
 * THE CONTRACT (#707, #708, #730): id, title, description, at the TOP. Until #730
 * this scan called a top block "wrong" and its auto-fix moved every header in every
 * registered project to the bottom, undoing the contract docs/ and src/ follow.
 * Reading, judging and rewriting all go through src/shared/doc-frontmatter.ts.
 *
 * scanAuto only rewrites docs that already HAVE a header. A doc with none is
 * reported, not given one: adding headers everywhere is Headers: Fix All, which
 * asks first.
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { log, logError } from '../shared/output-channel';
import { readFrontmatter, contractViolations, toContract, Placement } from '../shared/doc-frontmatter';
import { walkDocTree } from '../shared/doc-collector';

const FEATURE = 'doc-header-scan';
const REGISTRY_PATH = path.join(os.homedir(), 'Downloads', 'CieloVistaStandards', 'project-registry.json');

interface ProjectEntry {
    name: string;
    path: string;
    type: string;
    description: string;
}
interface ProjectRegistry {
    globalDocsPath: string;
    projects: ProjectEntry[];
}
interface DocHeaderReport {
    filePath:     string;
    relativePath: string;
    projectName:  string;
    position:     Placement;
    /** Everything wrong under the contract; empty when compliant. */
    violations:   string[];
}

interface FixResult {
    filePath:     string;
    relativePath: string;
    projectName:  string;
    success:      boolean;
    verified:     boolean;          // re-read after write is compliant
    error?:       string;
}

// ── Fix ───────────────────────────────────────────────────────────────────────

function fixToContract(r: DocHeaderReport): Omit<FixResult, 'filePath' | 'relativePath' | 'projectName'> {
    try {
        const content = fs.readFileSync(r.filePath, 'utf8');
        const fixed   = toContract(content, path.basename(r.filePath));
        if (fixed !== content) { fs.writeFileSync(r.filePath, fixed, 'utf8'); }
        const verified = contractViolations(fs.readFileSync(r.filePath, 'utf8')).length === 0;
        return { success: true, verified };
    } catch (err) {
        return { success: false, verified: false, error: err instanceof Error ? err.message : String(err) };
    }
}

// ── Directory scanner ─────────────────────────────────────────────────────────

function toRelativePath(filePath: string, projectRoot: string): string {
    return path.relative(projectRoot, filePath).replace(/\\/g, '/');
}

function scanDirectory(rootPath: string, projectName: string, projectRoot: string, maxDepth = 4): DocHeaderReport[] {
    const results: DocHeaderReport[] = [];
    for (const fullPath of walkDocTree(rootPath, { maxDepth })) {
        try {
            const content  = fs.readFileSync(fullPath, 'utf8');
            results.push({
                filePath:     fullPath,
                relativePath: toRelativePath(fullPath, projectRoot),
                projectName,
                position:     readFrontmatter(content).placement,
                violations:   contractViolations(content),
            });
        } catch { /* skip unreadable */ }
    }
    return results;
}

// ── Registry ──────────────────────────────────────────────────────────────────

function loadRegistry(): ProjectRegistry | undefined {
    try {
        if (!fs.existsSync(REGISTRY_PATH)) {
            vscode.window.showErrorMessage(`Registry not found: ${REGISTRY_PATH}`);
            return undefined;
        }
        return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8')) as ProjectRegistry;
    } catch (err) {
        logError('Failed to load registry', err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
        return undefined;
    }
}

// ── Report ────────────────────────────────────────────────────────────────────

function logReport(reports: DocHeaderReport[], fixResults: FixResult[], autoFix: boolean, projectCount: number): void {
    const total     = reports.length;
    const compliant = reports.filter(r => r.violations.length === 0);
    const toFix     = reports.filter(r => r.position !== 'none' && r.violations.length > 0);
    const noFm      = reports.filter(r => r.position === 'none');

    const mode = autoFix ? 'Scan + Auto-Fix' : 'Scan';
    log(FEATURE, `=== Doc Header Contract ${mode} ===`);
    log(FEATURE, `Scanned ${total} markdown files across ${projectCount} projects`);
    log(FEATURE, 'Contract: id, title, description at the top of the file');
    log(FEATURE, '');
    log(FEATURE, `  ✅ Compliant:                    ${compliant.length}`);
    log(FEATURE, `  ⚠️  Header needs rewriting:      ${toFix.length}`);
    log(FEATURE, `  ❌ No header (Headers: Fix All): ${noFm.length}`);

    if (toFix.length === 0) {
        log(FEATURE, '');
        log(FEATURE, 'Every header present follows the contract — nothing for auto-fix to do.');
        log(FEATURE, `=== End of ${mode} ===`);
        return;
    }

    log(FEATURE, '');
    log(FEATURE, '─── NEEDS REWRITING ──────────────────────────────────────────');
    const byProject = new Map<string, DocHeaderReport[]>();
    for (const r of toFix) {
        if (!byProject.has(r.projectName)) { byProject.set(r.projectName, []); }
        byProject.get(r.projectName)!.push(r);
    }
    for (const [proj, items] of byProject) {
        log(FEATURE, `  [${proj}] — ${items.length} file(s)`);
        for (const r of items.slice(0, 20)) {
            log(FEATURE, `    ⚠️  ${r.relativePath} — ${r.violations.join('; ')}`);
        }
        if (items.length > 20) { log(FEATURE, `    … and ${items.length - 20} more`); }
    }

    if (!autoFix) {
        log(FEATURE, '');
        log(FEATURE, '─── No fixes applied (scan-only mode) ───────────────────────');
        log(FEATURE, '  Run: Headers: Scan + Auto-Fix   (cvs.headers.scanAuto)');
        log(FEATURE, '=== End of Scan ===');
        return;
    }

    const fixed    = fixResults.filter(r => r.success);
    const failed   = fixResults.filter(r => !r.success);
    const verified = fixed.filter(r => r.verified);

    log(FEATURE, '');
    log(FEATURE, '─── FIXED ────────────────────────────────────────────────────');
    log(FEATURE, `  Applied: ${fixResults.length}   Success: ${fixed.length}   Failed: ${failed.length}`);
    for (const f of failed) {
        log(FEATURE, `    ❌ FAILED  ${f.relativePath}  — ${f.error ?? 'unknown error'}`);
    }

    log(FEATURE, '');
    log(FEATURE, '─── RE-VERIFIED (re-read after write) ────────────────────────');
    log(FEATURE, `  Compliant after fix: ${verified.length}   Still non-compliant: ${fixed.length - verified.length}`);
    for (const f of fixed.filter(r => !r.verified)) {
        log(FEATURE, `    ⚠️  ${f.relativePath}  (still non-compliant after rewrite)`);
    }

    log(FEATURE, '');
    log(FEATURE, '=== End of Auto-Fix ===');
}

// ── Core runner ───────────────────────────────────────────────────────────────

async function runScan(autoFix: boolean): Promise<void> {
    const registry = loadRegistry();
    if (!registry) { return; }

    const reports: DocHeaderReport[] = await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: autoFix ? 'Scanning + fixing doc headers…' : 'Scanning doc headers…',
            cancellable: false,
        },
        async (progress) => {
            const all: DocHeaderReport[] = [];
            all.push(...scanDirectory(registry.globalDocsPath, 'global', registry.globalDocsPath));
            for (const project of registry.projects) {
                progress.report({ message: `Scanning ${project.name}…` });
                if (fs.existsSync(project.path)) {
                    all.push(...scanDirectory(project.path, project.name, project.path));
                }
            }
            return all;
        }
    ) as DocHeaderReport[];

    const toFix = reports.filter(r => r.position !== 'none' && r.violations.length > 0);

    let fixResults: FixResult[] = [];
    if (autoFix && toFix.length > 0) {
        fixResults = toFix.map(r => {
            const outcome = fixToContract(r);
            return { filePath: r.filePath, relativePath: r.relativePath, projectName: r.projectName, ...outcome };
        });
    }

    const projectCount = registry.projects.length + 1; // +1 for global
    logReport(reports, fixResults, autoFix, projectCount);
}

// ── Activate / Deactivate ─────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
    log(FEATURE, 'Activating');
    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.headers.scan',     () => runScan(false)),
        vscode.commands.registerCommand('cvs.headers.scanAuto', () => runScan(true)),
    );
}
export function deactivate(): void {}

/** @internal — exported for unit testing only */
export const _test = { scanDirectory, fixToContract };
