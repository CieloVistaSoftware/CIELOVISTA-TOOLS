// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * doc-header-scan.ts
 *
 * Registers two commands:
 *   cvs.headers.scan       — scan all .md docs, report position violations (frontmatter at top)
 *   cvs.headers.scanAuto   — same scan, then auto-moves frontmatter from top to bottom, re-verifies
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { log, logError } from '../shared/output-channel';

const FEATURE = 'doc-header-scan';
const REGISTRY_PATH = 'C:\\Users\\jwpmi\\Downloads\\CieloVistaStandards\\project-registry.json';

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
interface Frontmatter {
    [key: string]: string | undefined;
}

type FmPosition = 'top' | 'bottom' | 'none';

interface ParseResult {
    fm:       Frontmatter;
    position: FmPosition;
    fmBlock:  string;   // raw YAML lines between the --- delimiters
    body:     string;   // content excluding the frontmatter block
}

interface DocHeaderReport {
    filePath:    string;
    relativePath: string;
    projectName: string;
    position:    FmPosition;
    missingFields: string[];
    currentFm:   Frontmatter;
}

interface FixResult {
    filePath:    string;
    relativePath: string;
    projectName: string;
    success:     boolean;
    verified:    boolean;          // re-read after write confirmed bottom position
    error?:      string;
}

// ── Parsing ───────────────────────────────────────────────────────────────────

function parseFmBlock(raw: string): Frontmatter {
    const fm: Frontmatter = {};
    for (const line of raw.split('\n')) {
        const m = line.match(/^(\w[\w-]*):\s*(.*)$/);
        if (m) { fm[m[1]] = m[2].trim(); }
    }
    return fm;
}

function parseFrontmatter(content: string): ParseResult | null {
    // Top-position: file starts with ---
    const topMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)([\s\S]*)$/);
    if (topMatch) {
        return {
            fm:       parseFmBlock(topMatch[1]),
            position: 'top',
            fmBlock:  topMatch[1],
            body:     topMatch[3],
        };
    }
    // Bottom-position: file ends with ---\n...\n---\n? (with content before)
    const botMatch = content.match(/^([\s\S]+?)\n---\r?\n([\s\S]*?)\r?\n---\s*$/);
    if (botMatch) {
        return {
            fm:       parseFmBlock(botMatch[2]),
            position: 'bottom',
            fmBlock:  botMatch[2],
            body:     botMatch[1],
        };
    }
    return null;
}

// ── Fix ───────────────────────────────────────────────────────────────────────

function moveFrontmatterToBottom(r: DocHeaderReport): Omit<FixResult, 'filePath' | 'relativePath' | 'projectName'> {
    try {
        const content  = fs.readFileSync(r.filePath, 'utf8');
        const parsed   = parseFrontmatter(content);
        if (!parsed || parsed.position !== 'top') {
            return { success: false, verified: false, error: 'Frontmatter not at top — nothing to move' };
        }
        const body    = parsed.body.trimEnd();
        const fixed   = body.length > 0
            ? `${body}\n\n---\n${parsed.fmBlock}\n---\n`
            : `---\n${parsed.fmBlock}\n---\n`;
        fs.writeFileSync(r.filePath, fixed, 'utf8');

        // Re-verify
        const verifiedContent = fs.readFileSync(r.filePath, 'utf8');
        const verifiedParsed  = parseFrontmatter(verifiedContent);
        const verified        = verifiedParsed?.position === 'bottom';
        return { success: true, verified };
    } catch (err) {
        return { success: false, verified: false, error: err instanceof Error ? err.message : String(err) };
    }
}

// ── Directory scanner ─────────────────────────────────────────────────────────

const REQUIRED_FIELDS = ['title', 'description', 'project', 'category', 'relativePath', 'created', 'updated', 'author', 'status', 'tags'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'out', 'dist', 'reports', '.vscode', '.vscode-test', '.claude', 'CommandHelp', 'image-reader-assets']);

function toRelativePath(filePath: string, projectRoot: string): string {
    return path.relative(projectRoot, filePath).replace(/\\/g, '/');
}

function scanDirectory(rootPath: string, projectName: string, projectRoot: string, maxDepth = 4): DocHeaderReport[] {
    const results: DocHeaderReport[] = [];
    function walk(dir: string, depth: number): void {
        if (depth > maxDepth || !fs.existsSync(dir)) { return; }
        let entries: fs.Dirent[];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const entry of entries) {
            if (SKIP_DIRS.has(entry.name)) { continue; }
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath, depth + 1);
            } else if (entry.isFile() && /\.md$/i.test(entry.name)) {
                try {
                    const content  = fs.readFileSync(fullPath, 'utf8');
                    const parsed   = parseFrontmatter(content);
                    const relPath  = toRelativePath(fullPath, projectRoot);
                    const fm       = parsed?.fm ?? {};
                    const missing  = REQUIRED_FIELDS.filter(f => !fm[f] || fm[f]!.trim() === '');
                    results.push({
                        filePath:      fullPath,
                        relativePath:  relPath,
                        projectName,
                        position:      parsed?.position ?? 'none',
                        missingFields: missing,
                        currentFm:     fm,
                    });
                } catch { /* skip unreadable */ }
            }
        }
    }
    walk(rootPath, 0);
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
    const total       = reports.length;
    const atTop       = reports.filter(r => r.position === 'top');
    const atBottom    = reports.filter(r => r.position === 'bottom');
    const noFm        = reports.filter(r => r.position === 'none');

    const mode = autoFix ? 'Scan + Auto-Fix' : 'Scan';
    log(FEATURE, `=== Frontmatter Position ${mode} ===`);
    log(FEATURE, `Scanned ${total} markdown files across ${projectCount} projects`);
    log(FEATURE, '');
    log(FEATURE, `  ✅ Correct (bottom):          ${atBottom.length}`);
    log(FEATURE, `  ⚠️  Wrong (top — must move):   ${atTop.length}`);
    log(FEATURE, `  ❌ No frontmatter:             ${noFm.length}`);

    if (atTop.length === 0) {
        log(FEATURE, '');
        log(FEATURE, '🎉 All files have frontmatter at the bottom — nothing to fix.');
        log(FEATURE, `=== End of ${mode} ===`);
        return;
    }

    // ── Section 1: WRONG ─────────────────────────────────────────────────────
    log(FEATURE, '');
    log(FEATURE, '─── WRONG — frontmatter at top ───────────────────────────────');
    const byProject = new Map<string, DocHeaderReport[]>();
    for (const r of atTop) {
        if (!byProject.has(r.projectName)) { byProject.set(r.projectName, []); }
        byProject.get(r.projectName)!.push(r);
    }
    for (const [proj, items] of byProject) {
        log(FEATURE, `  [${proj}] — ${items.length} file(s)`);
        for (const r of items.slice(0, 20)) {
            log(FEATURE, `    ⚠️  ${r.relativePath}`);
        }
        if (items.length > 20) { log(FEATURE, `    … and ${items.length - 20} more`); }
    }

    if (!autoFix) {
        log(FEATURE, '');
        log(FEATURE, `─── No fixes applied (scan-only mode) ───────────────────────`);
        log(FEATURE, `  Run: Headers: Scan + Auto-Fix   (cvs.headers.scanAuto)`);
        log(FEATURE, `=== End of Scan ===`);
        return;
    }

    // ── Section 2: FIXED ─────────────────────────────────────────────────────
    const fixed   = fixResults.filter(r => r.success);
    const failed  = fixResults.filter(r => !r.success);
    const verified = fixed.filter(r => r.verified);

    log(FEATURE, '');
    log(FEATURE, '─── FIXED ────────────────────────────────────────────────────');
    log(FEATURE, `  Applied:  ${fixResults.length}`);
    log(FEATURE, `  Success:  ${fixed.length}`);
    log(FEATURE, `  Failed:   ${failed.length}`);

    const fixByProject = new Map<string, FixResult[]>();
    for (const f of fixResults) {
        if (!fixByProject.has(f.projectName)) { fixByProject.set(f.projectName, []); }
        fixByProject.get(f.projectName)!.push(f);
    }
    for (const [proj, items] of fixByProject) {
        log(FEATURE, `  [${proj}]`);
        for (const f of items) {
            if (f.success) {
                log(FEATURE, `    ✅ FIXED   ${f.relativePath}`);
            } else {
                log(FEATURE, `    ❌ FAILED  ${f.relativePath}  — ${f.error ?? 'unknown error'}`);
            }
        }
    }

    // ── Section 3: RE-VERIFIED ────────────────────────────────────────────────
    log(FEATURE, '');
    log(FEATURE, '─── RE-VERIFIED (re-read after write) ────────────────────────');
    log(FEATURE, `  Verified correct (position: bottom):  ${verified.length}`);
    log(FEATURE, `  Verify failed (position mismatch):    ${fixed.length - verified.length}`);

    for (const [proj, items] of fixByProject) {
        const projFixed = items.filter(f => f.success);
        if (projFixed.length === 0) { continue; }
        log(FEATURE, `  [${proj}]`);
        for (const f of projFixed) {
            if (f.verified) {
                log(FEATURE, `    ✅ OK      ${f.relativePath}`);
            } else {
                log(FEATURE, `    ⚠️  MISMATCH ${f.relativePath}  (position did not become bottom)`);
            }
        }
    }

    log(FEATURE, '');
    log(FEATURE, `=== End of Auto-Fix ===`);
}

// ── Core runner ───────────────────────────────────────────────────────────────

async function runScan(autoFix: boolean): Promise<void> {
    const registry = loadRegistry();
    if (!registry) { return; }

    const reports: DocHeaderReport[] = await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: autoFix ? 'Scanning + auto-fixing frontmatter position…' : 'Scanning frontmatter position…',
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

    const atTop = reports.filter(r => r.position === 'top');

    let fixResults: FixResult[] = [];
    if (autoFix && atTop.length > 0) {
        fixResults = atTop.map(r => {
            const outcome = moveFrontmatterToBottom(r);
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
