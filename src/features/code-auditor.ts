// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

// component: aud

/**
 * code-auditor.ts
 *
 * Command: cvs.tools.codeAuditor
 * Runs scripts/code-auditor.js and renders a clickable webview report.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { execFile } from 'child_process';
import { fileHealthBugAsIssue } from '../shared/github-issue-filer';
import { log } from '../shared/output-channel';
import { esc } from '../shared/webview-utils';

const FEATURE = 'code-auditor';
let _panel: vscode.WebviewPanel | undefined;
let _latestReport: CodeAuditorReport | undefined;

interface CodeOccurrence {
    filePath: string;
    startLine: number;
    endLine: number;
}

interface CodeCluster {
    type: 'exact' | 'near' | 'pattern';
    similarity: number;
    suggestedSharedPath: string;
    summary: string;
    occurrences: CodeOccurrence[];
    hasSharedVersion: boolean;
}

interface CodeAuditorReport {
    generatedAt: string;
    stats: {
        projectsScanned: number;
        filesScanned: number;
        blocksAnalyzed: number;
        clusters: number;
        exactClusters: number;
        nearClusters: number;
        patternClusters: number;
        importDuplicationFindings: number;
    };
    clusters: CodeCluster[];
}

async function runAuditorJson(extensionPath: string): Promise<CodeAuditorReport> {
    const scriptPath = path.join(extensionPath, 'scripts', 'code-auditor.js');
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? extensionPath;

    return await new Promise<CodeAuditorReport>((resolve, reject) => {
        execFile(
            process.execPath,
            [scriptPath, '--json'],
            {
                cwd: workspaceRoot,
                maxBuffer: 16 * 1024 * 1024,
            },
            (err, stdout, stderr) => {
                if (err) {
                    reject(new Error(stderr?.trim() || err.message));
                    return;
                }
                try {
                    const parsed = JSON.parse(stdout) as CodeAuditorReport;
                    resolve(parsed);
                } catch (parseErr) {
                    reject(new Error(parseErr instanceof Error ? parseErr.message : String(parseErr)));
                }
            }
        );
    });
}

function buildHtml(report: CodeAuditorReport): string {
    const rows = report.clusters.map((cluster, idx) => {
        const occ = cluster.occurrences
            .map((o) => {
                const label = `${o.filePath}:${o.startLine}-${o.endLine}`;
                return `<button class="occ" data-action="open" data-path="${esc(o.filePath)}" data-line="${o.startLine}">${esc(label)}</button>`;
            })
            .join('');

        return `<div class="card">
  <div class="head">
    <span class="type">${esc(cluster.type.toUpperCase())}</span>
    <span class="sim">${cluster.similarity}%</span>
    <span class="n">${cluster.occurrences.length} occurrence(s)</span>
  </div>
  <div class="summary">${esc(cluster.summary)}</div>
  <div class="shared">Suggested shared path: <code>${esc(cluster.suggestedSharedPath)}</code> ${cluster.hasSharedVersion ? '<b>(exists)</b>' : '<b>(missing)</b>'}</div>
  <div class="occ-list">${occ}</div>
  <div class="actions">
    <button class="file" data-action="abstract" data-cluster-index="${idx}">Abstract</button>
  </div>
</div>`;
    }).join('');

    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<style>
*{box-sizing:border-box} body{font-family:var(--vscode-font-family);background:var(--vscode-editor-background);color:var(--vscode-editor-foreground);margin:0}
.top{position:sticky;top:0;padding:10px 14px;border-bottom:1px solid var(--vscode-panel-border);background:var(--vscode-editor-background);display:flex;gap:8px;align-items:center;z-index:2}
.pill{padding:2px 9px;border:1px solid var(--vscode-panel-border);border-radius:999px;font-size:11px}
.wrap{padding:12px 14px 28px;display:grid;gap:10px}
.card{border:1px solid var(--vscode-panel-border);background:var(--vscode-textCodeBlock-background);padding:10px;border-radius:6px}
.head{display:flex;gap:8px;align-items:center;margin-bottom:8px}.type{font-weight:700}.sim{font-size:12px;color:#58a6ff}.n{font-size:12px;color:var(--vscode-descriptionForeground)}
.summary{font-size:12px;margin-bottom:8px;line-height:1.4}
.shared{font-size:11px;margin-bottom:8px;color:var(--vscode-descriptionForeground)}
.occ-list{display:flex;flex-wrap:wrap;gap:6px}.occ{border:1px solid var(--vscode-panel-border);background:var(--vscode-editor-background);color:var(--vscode-editor-foreground);padding:3px 7px;border-radius:4px;cursor:pointer;font-size:11px}
.actions{margin-top:8px}.file{border:none;background:var(--vscode-button-background);color:var(--vscode-button-foreground);padding:4px 10px;border-radius:4px;cursor:pointer;font-size:12px}
.note{padding:20px;color:var(--vscode-descriptionForeground)}
</style></head><body>
<div class="top">
  <b>Code Auditor</b>
  <span class="pill">Projects: ${report.stats.projectsScanned}</span>
  <span class="pill">Files: ${report.stats.filesScanned}</span>
  <span class="pill">Clusters: ${report.stats.clusters}</span>
  <span class="pill">Import Dup: ${report.stats.importDuplicationFindings}</span>
</div>
<div class="wrap">${rows || '<div class="note">No clusters found.</div>'}</div>
<script>
(function(){
  const vscode = acquireVsCodeApi();
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'open') {
      vscode.postMessage({ command: 'open', path: btn.dataset.path, line: Number(btn.dataset.line || '1') });
      return;
    }
    if (action === 'abstract') {
      vscode.postMessage({ command: 'abstract', clusterIndex: Number(btn.dataset.clusterIndex || '-1') });
    }
  });
})();
</script>
</body></html>`;
}

async function showCodeAuditor(context: vscode.ExtensionContext): Promise<void> {
    const report = await runAuditorJson(context.extensionPath);
    _latestReport = report;

    if (_panel) {
        _panel.webview.html = buildHtml(report);
        _panel.reveal(vscode.ViewColumn.One, false);
    } else {
        _panel = vscode.window.createWebviewPanel(
            'codeAuditor',
            'Code Auditor',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        _panel.webview.html = buildHtml(report);
        _panel.onDidDispose(() => {
            _panel = undefined;
            _latestReport = undefined;
        });
        _panel.webview.onDidReceiveMessage(async (msg) => {
            if (msg.command === 'open' && typeof msg.path === 'string') {
                const uri = vscode.Uri.file(msg.path);
                const doc = await vscode.workspace.openTextDocument(uri);
                const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
                const targetLine = Math.max(0, Number(msg.line || 1) - 1);
                const pos = new vscode.Position(targetLine, 0);
                editor.selection = new vscode.Selection(pos, pos);
                editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
                return;
            }

            if (msg.command === 'abstract' && typeof msg.clusterIndex === 'number' && _latestReport) {
                const idx = msg.clusterIndex;
                if (idx < 0 || idx >= _latestReport.clusters.length) {
                    return;
                }
                const cluster = _latestReport.clusters[idx];
                const title = `Code Auditor: ${cluster.type} cluster (${cluster.occurrences.length} occurrences)`;
                const detail = [
                    `Similarity: ${cluster.similarity}%`,
                    `Suggested shared path: ${cluster.suggestedSharedPath}`,
                    `Summary: ${cluster.summary}`,
                    `Occurrences:`,
                    ...cluster.occurrences.map((o) => `- ${o.filePath}:${o.startLine}-${o.endLine}`),
                ].join('\n');

                const result = await fileHealthBugAsIssue({
                    id: `code-auditor-${cluster.type}-${idx}-${Date.now()}`,
                    title,
                    detail,
                    category: 'code-auditor',
                    priority: cluster.occurrences.length >= 5 ? 'high' : 'medium',
                    checkId: 'code-auditor-duplication',
                    detectedAt: new Date().toISOString(),
                    recommendation: `Abstract shared logic to ${cluster.suggestedSharedPath}`,
                    evidence: cluster.occurrences.map((o) => `${o.filePath}:${o.startLine}-${o.endLine}`),
                });

                if (result.ok && result.issueNumber) {
                    log(FEATURE, `Filed abstract issue #${result.issueNumber}`);
                    void vscode.window.showInformationMessage(`Filed issue #${result.issueNumber} for cluster ${idx + 1}.`);
                } else {
                    void vscode.window.showErrorMessage(result.error || 'Failed to file issue for cluster.');
                }
            }
        });
    }
}

export function activate(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.tools.codeAuditor', async () => {
            try {
                await showCodeAuditor(context);
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                log(FEATURE, `Code auditor failed: ${message}`);
                void vscode.window.showErrorMessage(`Code auditor failed: ${message}`);
            }
        })
    );
}

export function deactivate(): void {
    if (_panel) {
        _panel.dispose();
        _panel = undefined;
    }
}
