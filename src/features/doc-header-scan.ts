// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
// FILE REMOVED BY REQUEST
/**
 * doc-header-scan.ts
 *
 * Registers the cvs.headers.scan command — scan all docs and show header compliance report.
 * This file is split from the original doc-header.ts to enforce one job per file.
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { log, logError } from '../shared/output-channel';

const FEATURE = 'doc-header-scan';
const REGISTRY_PATH = 'C:\\Users\\jwpmi\\Downloads\\CieloVistaStandards\\project-registry.json';
const GLOBAL_DOCS = 'C:\\Users\\jwpmi\\Downloads\\CieloVistaStandards';
const TODAY = new Date().toISOString().slice(0, 10);

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
interface DocHeaderReport {
    filePath:    string;
    relativePath: string;
    projectName: string;
    hasFrontmatter: boolean;
    missingFields:  string[];
    currentFm:      Frontmatter;
}

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

function parseFrontmatter(content: string): { fm: Frontmatter; body: string } | null {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!match) { return null; }
    const fm: Frontmatter = {};
    for (const line of match[1].split('\n')) {
        const m = line.match(/^(\w+):\s*(.*)$/);
        if (m) { fm[m[1]] = m[2].trim(); }
    }
    return { fm, body: match[2] };
}
function toRelativePath(filePath: string, projectRoot: string): string {
    return path.relative(projectRoot, filePath).replace(/\\/g, '/');
}
const REQUIRED_FIELDS = ['title', 'description', 'project', 'category', 'relativePath', 'created', 'updated', 'author', 'status', 'tags'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'out', 'dist', 'reports', '.vscode']);
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
                    const content   = fs.readFileSync(fullPath, 'utf8');
                    const parsed    = parseFrontmatter(content);
                    const relPath   = toRelativePath(fullPath, projectRoot);
                    const fm        = parsed?.fm ?? {};
                    const missing   = REQUIRED_FIELDS.filter(f => !fm[f] || fm[f]!.trim() === '');
                    results.push({
                        filePath:       fullPath,
                        relativePath:   relPath,
                        projectName,
                        hasFrontmatter: !!parsed,
                        missingFields:  missing,
                        currentFm:      fm,
                    });
                } catch { /* skip */ }
            }
        }
    }
    walk(rootPath, 0);
    return results;
}
function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
export function activate(context: vscode.ExtensionContext): void {
    log(FEATURE, 'Activating');
    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.headers.scan', runScan)
    );
}
export function deactivate(): void {}

async function runScan(): Promise<void> {
    const registry = loadRegistry();
    if (!registry) { return; }

    const reports: DocHeaderReport[] = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Scanning doc headers…', cancellable: false },
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

    // Log a concise summary to the output channel.
    // The streaming result panel captures this — no separate webview panel needed.
    const total     = reports.length;
    const compliant = reports.filter(r => r.missingFields.length === 0).length;
    const issues    = reports.filter(r => r.missingFields.length > 0);
    const noFm      = issues.filter(r => !r.hasFrontmatter).length;
    const partial   = issues.filter(r =>  r.hasFrontmatter).length;

    log(FEATURE, `=== Doc Header Scan Results ===`);
    log(FEATURE, `Scanned ${total} markdown files across ${registry.projects.length + 1} projects`);
    log(FEATURE, `  ✅ Compliant:        ${compliant}`);
    log(FEATURE, `  ⚠️  Partial (has FM):  ${partial}`);
    log(FEATURE, `  ❌ No frontmatter:   ${noFm}`);
    log(FEATURE, `  🚨 Total issues:      ${issues.length}`);

    if (issues.length > 0) {
        log(FEATURE, '');
        log(FEATURE, '--- Files needing attention ---');
        // Group by project
        const byProject = new Map<string, DocHeaderReport[]>();
        for (const r of issues) {
            if (!byProject.has(r.projectName)) { byProject.set(r.projectName, []); }
            byProject.get(r.projectName)!.push(r);
        }
        for (const [proj, projIssues] of byProject) {
            log(FEATURE, `\n[${proj}] — ${projIssues.length} file(s)`);
            for (const r of projIssues.slice(0, 15)) {
                const status = r.hasFrontmatter ? '⚠️ partial' : '❌ no FM';
                const missing = r.missingFields.slice(0, 5).join(', ');
                const more = r.missingFields.length > 5 ? ` +${r.missingFields.length - 5} more` : '';
                log(FEATURE, `  ${status}  ${r.relativePath}`);
                log(FEATURE, `    Missing: ${missing}${more}`);
            }
            if (projIssues.length > 15) {
                log(FEATURE, `  ... and ${projIssues.length - 15} more files`);
            }
        }
        log(FEATURE, '');
        log(FEATURE, `--- Fix command ---`);
        log(FEATURE, `Run: Headers: Add/Fix All Headers   (cvs.headers.fixAll)`);
        log(FEATURE, `Or:  Headers: Fix Headers in One Project (cvs.headers.fixOne)`);
    } else {
        log(FEATURE, '');
        log(FEATURE, '🎉 All files have complete frontmatter — nothing to fix.');
    }
    log(FEATURE, `=== End of Scan ===`);
}
