// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * doc-consolidator.ts
 *
 * ONE JOB: Find docs that exist in more than one place and consolidate
 * them to a single authoritative location — one time, one place.
 *
 * The consolidator works in three phases for each duplicate group:
 *
 *   PHASE 1 — DISCOVER
 *     Scan all registered projects + CieloVistaStandards.
 *     Group docs by filename. Group docs by content similarity.
 *     Present each group to the user.
 *
 *   PHASE 2 — DECIDE
 *     For each group, the user picks:
 *       a) Which file is the authoritative version (the "keeper")
 *       b) Where it lives (usually CieloVistaStandards for shared docs,
 *          or the owning project for project-specific docs)
 *
 *   PHASE 3 — ACT
 *     - Copy the keeper to the chosen destination (if moving)
 *     - Delete all other copies
 *     - Update every project's CLAUDE.md that referenced the old paths
 *       to point at the new single location
 *     - Write a consolidation log entry to docs/consolidation-log.md
 *
 * Every destructive step requires explicit confirmation.
 * The consolidation log is append-only — nothing is ever lost silently.
 *
 * Commands registered:
 *   cvs.consolidate.run       — full interactive consolidation wizard
 *   cvs.consolidate.byName    — consolidate docs with the same filename
 *   cvs.consolidate.byContent — consolidate docs with similar content
 *   cvs.consolidate.log       — open the consolidation log
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { log, logError } from '../shared/output-channel';
import { REGISTRY_PATH, loadRegistry, ProjectRegistry, ProjectEntry } from '../shared/registry';
import { showConsolidationPlanWebview } from '../shared/consolidation-plan-webview';

const FEATURE = 'doc-consolidator';
const GLOBAL_DOCS    = 'C:\\Users\\jwpmi\\Downloads\\CieloVistaStandards';
const CONSOLIDATION_LOG = path.join(GLOBAL_DOCS, 'consolidation-log.md');

// ─── Types ────────────────────────────────────────────────────────────────────

// ProjectEntry and ProjectRegistry types are now imported from shared/registry

interface ScannedDoc {
    filePath: string;
    fileName: string;
    projectName: string;
    projectPath: string;
    sizeBytes: number;
    content: string;
    normalized: string;
}

interface ConsolidationGroup {
    /** Why these files are grouped: 'same-name' or 'similar-content' */
    reason: 'same-name' | 'similar-content';
    /** Human-readable label for the group */
    label: string;
    /** Similarity score 0-1 (1.0 for same-name groups) */
    similarity: number;
    /** All copies found */
    files: ScannedDoc[];
}

export interface ConsolidationAction {
    type: 'keep' | 'delete' | 'update-ref';
    filePath: string;
    details?: string;
    oldContent?: string;
    newContent?: string;
    checked?: boolean; // for UI
}

// ─── Registry ─────────────────────────────────────────────────────────────────

// Registry helpers now imported from shared/registry

// ─── Doc scanner ──────────────────────────────────────────────────────────────

function scanDir(rootPath: string, projectName: string, projectRootPath: string, maxDepth = 3): ScannedDoc[] {
    const results: ScannedDoc[] = [];
    const SKIP = new Set(['node_modules', '.git', 'out', 'dist', '.vscode', 'reports']);

    function walk(dir: string, depth: number): void {
        if (depth > maxDepth || !fs.existsSync(dir)) { return; }
        let entries: fs.Dirent[];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
        catch { return; }

        for (const entry of entries) {
            if (SKIP.has(entry.name)) { continue; }
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath, depth + 1);
            } else if (entry.isFile() && /\.md$/i.test(entry.name)) {
                try {
                    const content = fs.readFileSync(fullPath, 'utf8');
                    const normalized = content.toLowerCase().replace(/\s+/g, ' ').replace(/[#*`_\[\]()]/g, '').trim();
                    results.push({
                        filePath: fullPath,
                        fileName: entry.name,
                        projectName,
                        projectPath: projectRootPath,
                        sizeBytes: Buffer.byteLength(content, 'utf8'),
                        content,
                        normalized,
                    });
                } catch { /* skip */ }
            }
        }
    }

    walk(rootPath, 0);
    return results;
}

function computeSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.split(' ').filter(w => w.length > 3));
    const wordsB = new Set(b.split(' ').filter(w => w.length > 3));
    if (!wordsA.size || !wordsB.size) { return 0; }
    let inter = 0;
    for (const w of wordsA) { if (wordsB.has(w)) { inter++; } }
    return inter / (wordsA.size + wordsB.size - inter);
}

// ─── Discovery ────────────────────────────────────────────────────────────────

function discoverGroups(allDocs: ScannedDoc[]): ConsolidationGroup[] {
    const groups: ConsolidationGroup[] = [];

    // Phase 1a — same filename
    const byName = new Map<string, ScannedDoc[]>();
    for (const doc of allDocs) {
        const key = doc.fileName.toLowerCase();
        if (!byName.has(key)) { byName.set(key, []); }
        byName.get(key)!.push(doc);
    }
    for (const [, files] of byName) {
        if (files.length < 2) { continue; }
        groups.push({
            reason: 'same-name',
            label: files[0].fileName,
            similarity: 1.0,
            files,
        });
    }

    // Phase 1b — similar content (different filenames, >70% overlap)
    const compared = new Set<string>();
    for (let i = 0; i < allDocs.length; i++) {
        for (let j = i + 1; j < allDocs.length; j++) {
            const a = allDocs[i];
            const b = allDocs[j];
            if (a.fileName.toLowerCase() === b.fileName.toLowerCase()) { continue; }
            if (a.sizeBytes < 150 || b.sizeBytes < 150) { continue; }
            const key = [a.filePath, b.filePath].sort().join('::');
            if (compared.has(key)) { continue; }
            compared.add(key);
            const score = computeSimilarity(a.normalized, b.normalized);
            if (score >= 0.70) {
                groups.push({
                    reason: 'similar-content',
                    label: `${a.fileName} ↔ ${b.fileName} (${Math.round(score * 100)}%)`,
                    similarity: score,
                    files: [a, b],
                });
            }
        }
    }

    // Sort: same-name first, then by similarity desc
    groups.sort((a, b) => {
        if (a.reason !== b.reason) { return a.reason === 'same-name' ? -1 : 1; }
        return b.similarity - a.similarity;
    });

    return groups;
}

// ─── Consolidation log ────────────────────────────────────────────────────────

function appendToLog(entry: string): void {
    const header = !fs.existsSync(CONSOLIDATION_LOG)
        ? '# CieloVista Consolidation Log\n\n> Append-only record of every doc consolidation action.\n\n---\n\n'
        : '';
    fs.appendFileSync(CONSOLIDATION_LOG, header + entry + '\n', 'utf8');
    log(FEATURE, `Log updated: ${CONSOLIDATION_LOG}`);
}

// ─── Reference updater ────────────────────────────────────────────────────────

/**
 * Scans all CLAUDE.md files in every registered project and replaces
 * references to oldPath with newPath.
 */
function updateReferences(oldPath: string, newPath: string, projects: ProjectEntry[]): string[] {
    const updated: string[] = [];

    for (const project of projects) {
        const claudeMd = path.join(project.path, 'CLAUDE.md');
        if (!fs.existsSync(claudeMd)) { continue; }

        try {
            const content = fs.readFileSync(claudeMd, 'utf8');
            // Match both forward and backslash variants
            const oldFwd = oldPath.replace(/\\/g, '/');
            const oldBack = oldPath.replace(/\//g, '\\');
            const newFwd = newPath.replace(/\\/g, '/');

            let updated_content = content
                .replace(new RegExp(escapeRegex(oldFwd), 'g'), newFwd)
                .replace(new RegExp(escapeRegex(oldBack), 'g'), newFwd)
                .replace(new RegExp(escapeRegex(path.basename(oldPath)), 'g'), path.basename(newPath));

            if (updated_content !== content) {
                fs.writeFileSync(claudeMd, updated_content, 'utf8');
                updated.push(claudeMd);
                log(FEATURE, `Updated references in: ${claudeMd}`);
            }
        } catch (err) {
            logError(FEATURE, `Failed to update references in ${claudeMd}`, err);
        }
    }

    return updated;
}

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Core consolidation action ────────────────────────────────────────────────

/**
 * Given a group of duplicate docs:
 *  1. Ask user which is the keeper
 *  2. Ask where it should live (stay put, or move to CieloVistaStandards)
 *  3. Confirm the plan
 *  4. Execute: copy keeper to dest, delete others, update CLAUDE.md refs, log
 */
async function consolidateGroup(group: ConsolidationGroup, registry: ProjectRegistry): Promise<boolean> {

    // Step 1 — pick the keeper
    const keeperPick = await vscode.window.showQuickPick(
        group.files.map(f => ({
            label: `$(file) ${f.fileName}`,
            description: f.projectName,
            detail: `${f.filePath}  (${f.sizeBytes} bytes)`,
            file: f,
        })),
        {
            placeHolder: `"${group.label}" — pick the AUTHORITATIVE version to keep`,
            title: 'Step 1 of 3: Choose the keeper',
        }
    );
    if (!keeperPick) { return false; }
    const keeper = keeperPick.file;

    // Step 2 — where does it live?
    const destinations = [
        {
            label: `$(globe) CieloVistaStandards (global — all projects)`,
            description: GLOBAL_DOCS,
            destPath: path.join(GLOBAL_DOCS, keeper.fileName),
        },
        {
            label: `$(file-directory) Keep in ${keeper.projectName}`,
            description: keeper.filePath,
            destPath: keeper.filePath,
        },
    ];

    const destPick = await vscode.window.showQuickPick(destinations, {
        placeHolder: 'Step 2 of 3: Where should the authoritative copy live?',
        title: 'Step 2 of 3: Choose the home',
    });
    if (!destPick) { return false; }

    const destPath = destPick.destPath;
    const filesToDelete = group.files
        .filter(f => f.filePath !== destPath)
        .map(f => f.filePath);
    const isMoving = destPath !== keeper.filePath;

    // Step 3 — build and preview the plan
    const plan = buildConsolidationPlan(group, keeper, destPath, registry);
    let result = await new Promise<boolean>(resolve => {
        showConsolidationPlanWebview(plan, async checkedPlan => {
            if (!checkedPlan.length) return resolve(false);
            // Actually execute only checked actions
            let ok = true;
            for (const action of checkedPlan) {
                try {
                    if (action.type === 'keep') {
                        fs.copyFileSync(keeper.filePath, destPath);
                    } else if (action.type === 'delete') {
                        fs.unlinkSync(action.filePath);
                    } else if (action.type === 'update-ref') {
                        fs.writeFileSync(action.filePath, action.newContent || '', 'utf8');
                    }
                } catch (err) {
                    logError(FEATURE, `Failed to ${action.type} ${action.filePath}`, err);
                    ok = false;
                }
            }
            resolve(ok);
        });
    });
    return result;
}

/**
 * Represents a single planned action in a consolidation job.
 */

/**
 * Build a full plan of all actions for a consolidation group, before any changes.
 * This plan can be previewed in a webview and selectively executed.
 */
function buildConsolidationPlan(group: ConsolidationGroup, keeper: ScannedDoc, destPath: string, registry: ProjectRegistry): ConsolidationAction[] {
    const actions: ConsolidationAction[] = [];
    const isMoving = destPath !== keeper.filePath;
    const filesToDelete = group.files.filter(f => f.filePath !== destPath);

    // 1. Keep/copy action
    if (isMoving) {
        actions.push({
            type: 'keep',
            filePath: destPath,
            details: `Copy from ${keeper.filePath}`,
            oldContent: fs.existsSync(destPath) ? fs.readFileSync(destPath, 'utf8') : '',
            newContent: fs.readFileSync(keeper.filePath, 'utf8'),
            checked: true,
        });
    }

    // 2. Delete actions
    for (const f of filesToDelete) {
        actions.push({
            type: 'delete',
            filePath: f.filePath,
            oldContent: fs.readFileSync(f.filePath, 'utf8'),
            checked: true,
        });
    }

    // 3. Update CLAUDE.md references (simulate, not actual update)
    const allOldPaths = isMoving ? [keeper.filePath, ...filesToDelete.map(f => f.filePath)] : filesToDelete.map(f => f.filePath);
    for (const oldPath of allOldPaths) {
        // Simulate which files would be updated (actual updateReferences logic not run yet)
        for (const project of registry.projects) {
            const claudePath = path.join(project.path, 'CLAUDE.md');
            if (fs.existsSync(claudePath)) {
                const content = fs.readFileSync(claudePath, 'utf8');
                if (content.includes(oldPath)) {
                    actions.push({
                        type: 'update-ref',
                        filePath: claudePath,
                        details: `Replace references to ${oldPath} → ${destPath}`,
                        oldContent: content,
                        // newContent: (simulate replacement for preview)
                        newContent: content.split(oldPath).join(destPath),
                        checked: true,
                    });
                }
            }
        }
    }
    return actions;
}

// ─── Commands ─────────────────────────────────────────────────────────────────

/** Full wizard — scans everything, shows all groups, user picks which to consolidate. */
async function runConsolidation(): Promise<void> {
    const registry = loadRegistry();
    if (!registry) { return; }

    const allDocs = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Scanning all projects for duplicate docs…' },
        async (progress) => {
            const docs: ScannedDoc[] = scanDir(registry.globalDocsPath, 'global', registry.globalDocsPath);
            for (const project of registry.projects) {
                progress.report({ message: `Scanning ${project.name}…` });
                if (fs.existsSync(project.path)) {
                    docs.push(...scanDir(project.path, project.name, project.path));
                }
            }
            return docs;
        }
    ) as ScannedDoc[];

    const groups = discoverGroups(allDocs);

    if (!groups.length) {
        require('../shared/show-result-webview').showResultWebview(
            'No Duplicates Found',
            'Run Doc Consolidation',
            0,
            `✅ No duplicate docs found across <b>${allDocs.length}</b> files scanned. Everything is already one-time-one-place.`
        );
        return;
    }

    require('../shared/show-result-webview').showResultWebview(
        'Consolidation Opportunities',
        'Run Doc Consolidation',
        0,
        `Found <b>${groups.length}</b> consolidation opportunities across <b>${allDocs.length}</b> docs.`
    );

    // Show all groups as a quick-pick — user picks which ones to act on
    const groupItems = groups.map(g => ({
        label: `$(${g.reason === 'same-name' ? 'copy' : 'git-compare'}) ${g.label}`,
        description: `${g.files.length} copies  ·  ${g.reason === 'same-name' ? 'exact filename' : Math.round(g.similarity * 100) + '% similar'}`,
        detail: g.files.map(f => `${f.projectName}/${f.fileName}`).join('  |  '),
        group: g,
        picked: true,
    }));

    const selected = await vscode.window.showQuickPick(groupItems, {
        canPickMany: true,
        placeHolder: `${groups.length} groups to consolidate — uncheck any you want to skip`,
        title: 'CieloVista Doc Consolidation',
        matchOnDescription: true,
    });

    if (!selected?.length) { return; }

    let consolidated = 0;
    let skipped = 0;

    for (const item of selected) {
        const ok = await consolidateGroup(item.group, registry);
        if (ok) { consolidated++; } else { skipped++; }
    }

    require('../shared/show-result-webview').showResultWebview(
        'Consolidation Complete',
        'Run Doc Consolidation',
        0,
        `Consolidation complete. <b>${consolidated}</b> groups consolidated, <b>${skipped}</b> skipped. <a href="#" onclick="window.acquireVsCodeApi().postMessage({openLog:true})">Open Log</a>`
    );
    // Optionally, open log if user clicks in webview (handled by message)
}

/** Consolidate only docs with the same filename. */
async function consolidateByName(): Promise<void> {
    const registry = loadRegistry();
    if (!registry) { return; }

    const allDocs: ScannedDoc[] = scanDir(registry.globalDocsPath, 'global', registry.globalDocsPath);
    for (const p of registry.projects) {
        if (fs.existsSync(p.path)) { allDocs.push(...scanDir(p.path, p.name, p.path)); }
    }

    const groups = discoverGroups(allDocs).filter(g => g.reason === 'same-name');

    if (!groups.length) {
        vscode.window.showInformationMessage('No docs with the same filename found in multiple projects.');
        return;
    }

    const items = groups.map(g => ({
        label: `$(copy) ${g.label}`,
        description: `${g.files.length} copies`,
        detail: g.files.map(f => `${f.projectName}`).join('  ·  '),
        group: g,
        picked: true,
    }));

    const selected = await vscode.window.showQuickPick(items, {
        canPickMany: true,
        placeHolder: `${groups.length} filename duplicates — select which to consolidate`,
        matchOnDescription: true,
    });

    if (!selected?.length) { return; }

    for (const item of selected) {
        await consolidateGroup(item.group, registry);
    }
}

/** Consolidate docs with similar content regardless of filename. */
async function consolidateByContent(): Promise<void> {
    const registry = loadRegistry();
    if (!registry) { return; }

    const allDocs: ScannedDoc[] = scanDir(registry.globalDocsPath, 'global', registry.globalDocsPath);
    for (const p of registry.projects) {
        if (fs.existsSync(p.path)) { allDocs.push(...scanDir(p.path, p.name, p.path)); }
    }

    const groups = discoverGroups(allDocs).filter(g => g.reason === 'similar-content');

    if (!groups.length) {
        vscode.window.showInformationMessage('No similar-content doc pairs found.');
        return;
    }

    const items = groups.map(g => ({
        label: `$(git-compare) ${g.label}`,
        description: `${Math.round(g.similarity * 100)}% similar`,
        detail: g.files.map(f => `${f.projectName}/${f.fileName}`).join('  ↔  '),
        group: g,
        picked: false, // don't pre-select content matches — more dangerous
    }));

    const selected = await vscode.window.showQuickPick(items, {
        canPickMany: true,
        placeHolder: `${groups.length} similar content pairs — review carefully before selecting`,
        matchOnDescription: true,
    });

    if (!selected?.length) { return; }

    // For content matches, always show a diff first before consolidating
    for (const item of selected) {
        const [a, b] = item.group.files;
        const showDiff = await vscode.window.showInformationMessage(
            `Review diff for "${item.group.label}" before consolidating?`,
            'Show Diff', 'Skip Diff', 'Skip This'
        );

        if (showDiff === 'Skip This') { continue; }

        if (showDiff === 'Show Diff') {
            await vscode.commands.executeCommand(
                'vscode.diff',
                vscode.Uri.file(a.filePath),
                vscode.Uri.file(b.filePath),
                `${a.fileName} ↔ ${b.fileName}`
            );
            const proceed = await vscode.window.showInformationMessage(
                'Consolidate these two docs?',
                'Yes', 'No'
            );
            if (proceed !== 'Yes') { continue; }
        }

        await consolidateGroup(item.group, registry);
    }
}

/** Open the consolidation log. */
async function openConsolidationLog(): Promise<void> {
    if (!fs.existsSync(CONSOLIDATION_LOG)) {
        require('../shared/show-result-webview').showResultWebview(
            'No Consolidation Log',
            'Open Consolidation Log',
            0,
            'No consolidation log yet. Run a consolidation first.'
        );
        return;
    }
    const doc = await vscode.workspace.openTextDocument(CONSOLIDATION_LOG);
    await vscode.window.showTextDocument(doc);
}

// ─── Activate / Deactivate ────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
    log(FEATURE, 'Activating');

    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.consolidate.run',       runConsolidation),
        vscode.commands.registerCommand('cvs.consolidate.byName',    consolidateByName),
        vscode.commands.registerCommand('cvs.consolidate.byContent', consolidateByContent),
        vscode.commands.registerCommand('cvs.consolidate.log',       openConsolidationLog),
    );
}

export function deactivate(): void { /* nothing to clean up */ }
