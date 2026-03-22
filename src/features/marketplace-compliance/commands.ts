// Copyright (c) 2025 CieloVista Software. All rights reserved.
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { log } from '../../shared/output-channel';
import { loadRegistry } from './registry';
import { checkProject } from './checker';
import { fixProject } from './fixer';
import { buildComplianceHtml, buildSummaryHtml } from './html';
import type { ProjectCompliance } from './types';

const FEATURE = 'marketplace-compliance';

let _panel: vscode.WebviewPanel | undefined;
let _lastResults: ProjectCompliance[] = [];

function showFixSummary(lines: string[], totalFiles: number, totalProjects: number): void {
    if (!lines.length) { vscode.window.showInformationMessage('No files were changed.'); return; }
    const html = buildSummaryHtml(lines, totalFiles, totalProjects);
    const summaryPanel = vscode.window.createWebviewPanel('marketplaceSummary', '✅ Fix Summary', vscode.ViewColumn.Beside, { enableScripts: false });
    summaryPanel.webview.html = html;
}

export async function runScan(): Promise<void> {
    const registry = loadRegistry();
    if (!registry) { return; }

    const results = registry.projects.filter(p => fs.existsSync(p.path)).map(p => checkProject(p));
    _lastResults = results;
    const html = buildComplianceHtml(results);

    if (_panel) { _panel.webview.html = html; _panel.reveal(); }
    else {
        _panel = vscode.window.createWebviewPanel('marketplaceCompliance', '🛒 Marketplace Compliance', vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true });
        _panel.webview.html = html;
        _panel.onDidDispose(() => { _panel = undefined; });
    }

    _panel.webview.onDidReceiveMessage(async msg => {
        switch (msg.command) {
            case 'fixAll':   await fixAll(); break;
            case 'fixOne':   await fixOneByName(msg.project); break;
            case 'openFolder':
                if (msg.path && fs.existsSync(msg.path)) {
                    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(msg.path), { forceNewWindow: false });
                }
                break;
            case 'rescan':   await runScan(); break;
        }
    });

    const issues = results.reduce((n, r) => n + r.issues.length, 0);
    if (issues === 0) { vscode.window.showInformationMessage('All projects are marketplace-compliant. ✅'); }
    else {
        const fixable = results.filter(r => r.issues.some(i => i.fixable)).length;
        vscode.window.showInformationMessage(`${issues} issue(s) found — ${fixable} have auto-fixes.`, 'Fix All')
            .then(c => { if (c === 'Fix All') { fixAll(); } });
    }
    log(FEATURE, `Scan complete — ${results.length} projects, ${issues} issues`);
}

export async function fixAll(): Promise<void> {
    const toFix = _lastResults.filter(r => r.issues.some(i => i.fixable));
    if (!toFix.length) { vscode.window.showInformationMessage('Nothing to auto-fix.'); return; }

    const summaryLines: string[] = [];
    let totalFixed = 0;
    for (const result of toFix) {
        const fixed = fixProject(result);
        if (fixed.length) { totalFixed += fixed.length; summaryLines.push(`${result.project.name}: ${fixed.join(', ')}`); }
    }

    showFixSummary(summaryLines, totalFixed, toFix.length);
    _panel?.webview.postMessage({ type: 'done', text: `Fixed ${totalFixed} file(s) across ${toFix.length} project(s).` });
    await runScan();
}

export async function fixOneByName(projectName: string): Promise<void> {
    const result = _lastResults.find(r => r.project.name === projectName);
    if (!result) { return; }
    const fixed = fixProject(result);
    if (!fixed.length) { _panel?.webview.postMessage({ type: 'done', text: `No auto-fixable issues in ${projectName}.` }); return; }
    showFixSummary([`${projectName}: ${fixed.join(', ')}`], fixed.length, 1);
    _panel?.webview.postMessage({ type: 'done', text: `Fixed in ${projectName}: ${fixed.join(', ')}.` });
    await runScan();
}

export async function fixOneInteractive(): Promise<void> {
    const registry = loadRegistry();
    if (!registry) { return; }
    const results = registry.projects.filter(p => fs.existsSync(p.path)).map(p => checkProject(p)).filter(r => r.issues.some(i => i.fixable));
    if (!results.length) { vscode.window.showInformationMessage('No auto-fixable issues found. ✅'); return; }

    const picked = await vscode.window.showQuickPick(
        results.map(r => ({ label: `$(tools) ${r.project.name}`, description: `${r.score}/100 · ${r.issues.filter(i => i.fixable).length} fixable`, result: r })),
        { placeHolder: 'Pick a project to auto-fix' }
    );
    if (!picked) { return; }
    const fixed = fixProject(picked.result);
    if (fixed.length) { vscode.window.showInformationMessage(`Fixed in ${picked.result.project.name}: ${fixed.join(', ')}`); }
}
