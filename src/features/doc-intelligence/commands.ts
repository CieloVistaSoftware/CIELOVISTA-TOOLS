/**
 * Pure function: executes all accepted findings in the given array.
 * Returns the number of findings executed.
 * This is testable outside VS Code extension host.
 */
export async function executeAcceptedFindings(findings: Finding[]): Promise<number> {
    let done = 0;
    for (const finding of findings) {
        if (finding.decision === 'accepted') {
            const ok = await executeFinding(finding);
            finding.decision = ok ? 'accepted' : 'pending';
            done++;
        }
    }
    return done;
}
// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * commands.ts — Orchestrates scan → recommend → dashboard → execute.
 *
 * Flow:
 *   1. Load registry
 *   2. Collect all docs
 *   3. Run analyzer (5 checks in one pass)
 *   4. Build IntelligenceReport
 *   5. Show dashboard panel
 *   6. User accepts/skips each finding
 *   7. "Execute Accepted" runs each action, logs everything
 */

import * as vscode from 'vscode';
import * as fs     from 'fs';
import * as path   from 'path';
import { log, logError } from '../../shared/output-channel';
import { collectDocs }   from './scanner';
import { analyze }       from './analyzer';
import { buildDashboardHtml } from './html';
import type {
    Finding, IntelligenceReport,
    ProjectRegistry,
} from './types';

const FEATURE       = 'doc-intelligence';
const REGISTRY_PATH = 'C:\\Users\\jwpmi\\Downloads\\CieloVistaStandards\\project-registry.json';
const LOG_PATH      = 'C:\\Users\\jwpmi\\Downloads\\CieloVistaStandards\\reports\\intelligence-log.md';

let _panel:     vscode.WebviewPanel | undefined;
let _report:    IntelligenceReport  | undefined;

// ─── Registry ─────────────────────────────────────────────────────────────────

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

// ─── Scan ─────────────────────────────────────────────────────────────────────

async function runScan(): Promise<IntelligenceReport | undefined> {
    const registry = loadRegistry();
    if (!registry) { return undefined; }

    return vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: '🧠 Doc Intelligence — scanning…',
            cancellable: false,
        },
        async (progress) => {
            const t0 = Date.now();

            progress.report({ message: 'Collecting global docs…' });
            const allDocs = collectDocs(registry.globalDocsPath, 'global');

            for (const project of registry.projects) {
                progress.report({ message: `Scanning ${project.name}…` });
                if (fs.existsSync(project.path)) {
                    allDocs.push(...collectDocs(project.path, project.name));
                }
            }

            progress.report({ message: 'Analyzing…' });
            const findings = analyze({ allDocs, projects: registry.projects, globalDocsPath: registry.globalDocsPath });

            const summary = {
                red:    findings.filter(f => f.severity === 'red').length,
                yellow: findings.filter(f => f.severity === 'yellow').length,
                info:   findings.filter(f => f.severity === 'info').length,
                total:  findings.length,
            };

            const report: IntelligenceReport = {
                scannedAt:  new Date().toISOString(),
                durationMs: Date.now() - t0,
                totalDocs:  allDocs.length,
                projects:   registry.projects.length + 1,
                findings,
                summary,
            };

            log(FEATURE, `Scan complete — ${allDocs.length} docs, ${findings.length} findings (${summary.red} red, ${summary.yellow} yellow, ${summary.info} info) in ${report.durationMs}ms`);
            return report;
        }
    ) as unknown as IntelligenceReport | undefined;
}

// ─── Execute a single finding ─────────────────────────────────────────────────

async function executeFinding(finding: Finding): Promise<boolean> {
    try {
        switch (finding.action) {
            case 'merge':
                await mergeFiles(finding.paths, finding.title);
                break;

            case 'diff':
                if (finding.paths.length >= 2) {
                    await vscode.commands.executeCommand(
                        'vscode.diff',
                        vscode.Uri.file(finding.paths[0]),
                        vscode.Uri.file(finding.paths[1]),
                        `Diff: ${path.basename(finding.paths[0])} ↔ ${path.basename(finding.paths[1])}`
                    );
                }
                break;

            case 'move-to-global': {
                const registry = loadRegistry();
                if (!registry) { return false; }
                await moveToGlobal(finding.paths[0], registry.globalDocsPath);
                break;
            }

            case 'delete':
                await deleteFile(finding.paths[0]);
                break;

            case 'open':
                if (fs.existsSync(finding.paths[0])) {
                    const doc = await vscode.workspace.openTextDocument(finding.paths[0]);
                    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
                }
                break;

            case 'create':
                await createMissingFile(finding);
                break;

            case 'none':
                break;
        }

        appendLog(finding, 'executed');
        return true;
    } catch (err) {
        logError(`Failed to execute finding ${finding.id}: ${finding.title}`, err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
        appendLog(finding, 'failed', String(err));
        return false;
    }
}

// ─── Action helpers ───────────────────────────────────────────────────────────

async function mergeFiles(filePaths: string[], title: string): Promise<void> {
    const existing = filePaths.filter(p => fs.existsSync(p));
    if (existing.length < 2) {
        vscode.window.showWarningMessage('Need at least 2 existing files to merge.');
        return;
    }

    // Pick output destination
    const destPick = await vscode.window.showOpenDialog({
        canSelectFiles: false, canSelectFolders: true, canSelectMany: false,
        openLabel: 'Save merged file here',
    });
    if (!destPick?.[0]) { return; }

    const defaultName = path.basename(existing[0]);
    const outputName  = await vscode.window.showInputBox({
        prompt: 'Output filename', value: defaultName,
    });
    if (!outputName?.trim()) { return; }

    let merged = `# ${outputName.replace('.md','')}\n\n`;
    merged    += `> Merged from: ${existing.map(p => path.basename(p)).join(', ')}\n`;
    merged    += `> Date: ${new Date().toISOString().slice(0, 10)}\n\n---\n\n`;

    for (const fp of existing) {
        const content = fs.readFileSync(fp, 'utf8').trim();
        merged += `## From: ${path.basename(fp, '.md')}\n\n${content}\n\n---\n\n`;
    }

    const outPath = path.join(destPick[0].fsPath, outputName.trim());
    fs.writeFileSync(outPath, merged, 'utf8');
    log(FEATURE, `Merged ${existing.length} files → ${outPath}`);

    const open = await vscode.window.showInformationMessage(
        `Merged into ${outputName}. Open it?`, 'Open', 'No'
    );
    if (open === 'Open') {
        const doc = await vscode.workspace.openTextDocument(outPath);
        await vscode.window.showTextDocument(doc);
    }
}

async function moveToGlobal(filePath: string, globalDocsPath: string): Promise<void> {
    if (!fs.existsSync(filePath)) {
        vscode.window.showWarningMessage(`File no longer exists: ${filePath}`);
        return;
    }
    const fileName = path.basename(filePath);
    const destPath = path.join(globalDocsPath, fileName);

    if (fs.existsSync(destPath)) {
        const ow = await vscode.window.showWarningMessage(
            `${fileName} already exists in CieloVistaStandards. Overwrite?`,
            { modal: true }, 'Overwrite', 'Cancel'
        );
        if (ow !== 'Overwrite') { return; }
    }

    fs.copyFileSync(filePath, destPath);
    fs.unlinkSync(filePath);
    log(FEATURE, `Moved to global: ${filePath} → ${destPath}`);
    vscode.window.showInformationMessage(`Moved to CieloVistaStandards: ${fileName}`);
}

async function deleteFile(filePath: string): Promise<void> {
    if (!fs.existsSync(filePath)) { return; }
    const confirm = await vscode.window.showWarningMessage(
        `Delete ${path.basename(filePath)}?\n${filePath}`,
        { modal: true }, 'Delete', 'Cancel'
    );
    if (confirm !== 'Delete') { return; }
    fs.unlinkSync(filePath);
    log(FEATURE, `Deleted: ${filePath}`);
}

async function createMissingFile(finding: Finding): Promise<void> {
    const targetPath = finding.paths[0];
    if (fs.existsSync(targetPath)) {
        vscode.window.showInformationMessage(`${path.basename(targetPath)} already exists.`);
        return;
    }

    const templates: Record<string, string> = {
        'missing-readme': `# ${finding.projects[0]}\n\n## What it does\n\n_TODO: describe this project._\n\n## Quick Start\n\n\`\`\`powershell\n# TODO\n\`\`\`\n`,
        'missing-claude': `# CLAUDE.md — ${finding.projects[0]}\n\n## Session Start\n\n1. Read this file\n2. Start working\n\n## Project\n\n**Location:** ${path.dirname(targetPath)}\n\n## Build\n\n\`\`\`powershell\n# TODO: build command\n\`\`\`\n`,
        'missing-changelog': `# Changelog — ${finding.projects[0]}\n\n## [1.0.0] — ${new Date().toISOString().slice(0,10)}\n\n### Added\n- Initial release\n`,
    };

    const content = templates[finding.kind] ?? `# ${path.basename(targetPath, '.md')}\n\n_TODO_\n`;
    fs.writeFileSync(targetPath, content, 'utf8');
    log(FEATURE, `Created: ${targetPath}`);

    const doc = await vscode.workspace.openTextDocument(targetPath);
    await vscode.window.showTextDocument(doc);
    vscode.window.showInformationMessage(`Created: ${path.basename(targetPath)}`);
}

// ─── Audit log ────────────────────────────────────────────────────────────────

function appendLog(finding: Finding, outcome: 'executed' | 'skipped' | 'failed', error?: string): void {
    try {
        const dir = path.dirname(LOG_PATH);
        if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }

        const line = [
            `\n## ${new Date().toLocaleString()}`,
            `- **Finding:** ${finding.title}`,
            `- **Kind:** ${finding.kind}`,
            `- **Action:** ${finding.action}`,
            `- **Outcome:** ${outcome}`,
            `- **Paths:** ${finding.paths.join(', ')}`,
            error ? `- **Error:** ${error}` : '',
        ].filter(Boolean).join('\n');

        fs.appendFileSync(LOG_PATH, line + '\n', 'utf8');
    } catch { /* log write failures are non-fatal */ }
}

// ─── Main command ─────────────────────────────────────────────────────────────

export async function runIntelligence(): Promise<void> {
    const report = await runScan();
    if (!report) { return; }
    _report = report;

    showPanel(report);
}

function showPanel(report: IntelligenceReport): void {
    const html = buildDashboardHtml(report);

    if (_panel) {
        _panel.webview.html = html;
        _panel.reveal(vscode.ViewColumn.Beside, true);
    } else {
        _panel = vscode.window.createWebviewPanel(
            'docIntelligence', '🧠 Doc Intelligence',
            vscode.ViewColumn.Beside,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        _panel.webview.html = html;
        _panel.onDidDispose(() => { _panel = undefined; });
    }

    _panel.webview.onDidReceiveMessage(async msg => {
        if (!_report) { return; }

        switch (msg.command) {

            case 'rescan': {
                const newReport = await runScan();
                if (newReport) { _report = newReport; showPanel(newReport); }
                break;
            }

            case 'openFile': {
                const fp = msg.paths?.[0];
                if (fp && fs.existsSync(fp)) {
                    const doc = await vscode.workspace.openTextDocument(fp);
                    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
                }
                _panel?.webview.postMessage({ type: 'done' });
                break;
            }

            case 'diffPair': {
                const [a, b] = msg.paths ?? [];
                if (a && b && fs.existsSync(a) && fs.existsSync(b)) {
                    await vscode.commands.executeCommand(
                        'vscode.diff',
                        vscode.Uri.file(a),
                        vscode.Uri.file(b),
                        `Diff: ${path.basename(a)} ↔ ${path.basename(b)}`
                    );
                }
                _panel?.webview.postMessage({ type: 'done' });
                break;
            }

            case 'mergeAll': {
                const finding = _report?.findings.find(f => f.id === msg.id);
                if (finding) { await executeFinding({ ...finding, action: 'merge' }); }
                _panel?.webview.postMessage({ type: 'done' });
                break;
            }

            case 'preview': {
                // Preview the finding without executing (diff or open)
                const finding = _report.findings.find(f => f.id === msg.id);
                if (!finding) { break; }
                if (finding.action === 'diff' && msg.paths?.length >= 2) {
                    await vscode.commands.executeCommand(
                        'vscode.diff',
                        vscode.Uri.file(msg.paths[0]),
                        vscode.Uri.file(msg.paths[1]),
                        `Preview: ${path.basename(msg.paths[0])} ↔ ${path.basename(msg.paths[1])}`
                    );
                } else if (msg.paths?.[0] && fs.existsSync(msg.paths[0])) {
                    const doc = await vscode.workspace.openTextDocument(msg.paths[0]);
                    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
                }
                _panel?.webview.postMessage({ type: 'done' });
                break;
            }

            case 'executeOne': {
                const finding = _report.findings.find(f => f.id === msg.id);
                if (!finding) { break; }
                _panel?.webview.postMessage({ type: 'progress', text: `Executing: ${finding.title}…` });
                const ok = await executeFinding(finding);
                finding.decision = ok ? 'accepted' : 'pending';
                _panel?.webview.postMessage({ type: 'decision', id: finding.id, decision: finding.decision });
                _panel?.webview.postMessage({ type: 'done' });
                break;
            }

            case 'executeAll': {
                const ids: string[] = msg.ids ?? [];
                const toRun = _report.findings.filter(f => ids.includes(f.id));
                if (!toRun.length) { break; }

                const confirm = await vscode.window.showWarningMessage(
                    `Execute ${toRun.length} accepted action(s)? This may move, merge, or delete files.`,
                    { modal: true }, 'Execute', 'Cancel'
                );
                if (confirm !== 'Execute') {
                    _panel?.webview.postMessage({ type: 'done' });
                    break;
                }

                let done = 0;
                for (const finding of toRun) {
                    _panel?.webview.postMessage({
                        type: 'progress',
                        text: `(${++done}/${toRun.length}) ${finding.title}…`,
                    });
                    const ok = await executeFinding(finding);
                    finding.decision = ok ? 'accepted' : 'pending';
                    _panel?.webview.postMessage({ type: 'decision', id: finding.id, decision: finding.decision });
                }

                _panel?.webview.postMessage({ type: 'done' });
                vscode.window.showInformationMessage(
                    `Doc Intelligence: executed ${done} action(s). Log saved to reports/intelligence-log.md`,
                    'Rescan'
                ).then(c => { if (c === 'Rescan') { runIntelligence(); } });
                log(FEATURE, `Executed ${done} accepted findings`);
                break;
            }
        }
    });
}

export function deactivateIntelligence(): void {
    _panel?.dispose();
    _panel  = undefined;
    _report = undefined;
}
