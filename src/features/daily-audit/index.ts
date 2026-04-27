// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * daily-audit/index.ts — activate/deactivate only.
 * Registers cvs.audit.runDaily command.
 */
import * as vscode from 'vscode';
import { log } from '../../shared/output-channel';
import { showInteractiveResultWebview } from '../../shared/show-interactive-result-webview';
import { runDailyAudit } from './runner';
import { AUDIT_REPORT_PATH } from '../../shared/audit-schema';

const FEATURE = 'daily-audit';

function buildMarkdownReport(result: Awaited<ReturnType<typeof runDailyAudit>>): string {
    const r = result.report.summary;
    const lines: string[] = [];

    lines.push('# Daily Audit Report');
    lines.push('');
    lines.push(`Generated: ${result.report.generatedAt}`);
    lines.push(`Projects (${result.projectNames.length}): ${result.projectNames.join(', ')}`);
    lines.push(`Scanned ${result.report.checks.length} checks in ${result.report.durationMs}ms`);
    lines.push(`Summary: ${r.red} red, ${r.yellow} yellow, ${r.green} green, ${r.grey} grey`);
    lines.push('');

    for (const check of result.report.checks) {
        const icon = check.status === 'green' ? '✅'
            : check.status === 'red' ? '❌'
                : check.status === 'yellow' ? '⚠️'
                    : '▫️';

        lines.push(`## ${icon} ${check.title} [${check.category}]`);
        lines.push(check.summary);
        if (check.detail && check.status !== 'green') {
            lines.push('');
            lines.push(check.detail);
        }
        if (check.affectedProjects?.length) {
            lines.push('');
            lines.push(`- Affected: ${check.affectedProjects.join(', ')}`);
        }
        if (check.affectedFiles?.length) {
            lines.push(`- Files: ${check.affectedFiles.slice(0, 10).join(', ')}`);
        }
        if (check.action && check.actionLabel && check.status !== 'green') {
            lines.push(`- Fix: ${check.actionLabel} -> ${check.action}`);
        }
        lines.push('');
    }

    return lines.join('\n');
}

async function offerAuditActions(result: Awaited<ReturnType<typeof runDailyAudit>>): Promise<void> {
    if (!result.written) {
        return;
    }

    const checks = result.report.checks;
    const actionable = checks.filter(c => c.status !== 'green' && !!c.action);

    const choice = await vscode.window.showInformationMessage(
        `Daily Audit found ${actionable.length} actionable issue(s).`,
        'Run Fix Action',
        'View Detailed Report',
        'Open JSON Report'
    );

    if (choice === 'Run Fix Action') {
        if (!actionable.length) {
            vscode.window.showInformationMessage('No actionable fixes were found in this audit run.');
            return;
        }

        const picked = await vscode.window.showQuickPick(
            actionable.map(c => ({
                label: `${c.status === 'red' ? '❌' : '⚠️'} ${c.title}`,
                description: c.summary,
                detail: `${c.actionLabel} -> ${c.action}`,
                action: c.action,
            })),
            {
                title: 'Daily Audit: Run Fix Action',
                placeHolder: 'Select a fix to run',
                matchOnDescription: true,
                matchOnDetail: true,
            }
        );

        if (picked?.action) {
            await vscode.commands.executeCommand(picked.action);
        }
    } else if (choice === 'View Detailed Report') {
        const doc = await vscode.workspace.openTextDocument({
            language: 'markdown',
            content: buildMarkdownReport(result),
        });
        await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.Beside });
    } else if (choice === 'Open JSON Report') {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(AUDIT_REPORT_PATH));
        await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.Beside });
    }
}

export function activate(context: vscode.ExtensionContext): void {
    log(FEATURE, 'Activating');

    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.audit.runDaily', async () => {
            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: '🔍 Running daily audit…', cancellable: false },
                async (progress) => {
                    progress.report({ message: 'Checking marketplace, README, CLAUDE.md, changelog…' });
                    const result = await runDailyAudit();
                    const r = result.report.summary;
                    const failed = !result.written || r.red > 0;

                    // Build detailed output for the webview
                    let output = '';
                    if (result.written) {
                        const checks = result.report.checks;
                        const runAt = result.report.generatedAt || new Date().toISOString();
                        output += `=== Daily Audit Results ===\n`;
                        output += `Run at: ${runAt}\n`;
                        output += `Projects (${result.projectNames.length}): ${result.projectNames.join(', ')}\n`;
                        output += `All projects:\n`;
                        for (const projectName of result.projectNames) {
                            output += `  - ${projectName}\n`;
                        }
                        output += `Scanned ${checks.length} checks in ${result.report.durationMs}ms\n`;
                        output += `Summary: ${r.red} red, ${r.yellow} yellow, ${r.green} green, ${r.grey} grey\n`;
                        output += `\n---\n`;
                        for (const check of checks) {
                            const icon = check.status === 'green' ? '✅'
                                       : check.status === 'red'    ? '❌'
                                       : check.status === 'yellow' ? '⚠️'
                                       : '▫️';
                            output += `${icon} ${check.title} [${check.category}] — ${check.summary}\n`;
                            if (check.detail && check.status !== 'green') {
                                output += `   Detail: ${check.detail.slice(0, 300)}\n`;
                            }
                            if (check.affectedProjects?.length) {
                                output += `   Affected: ${check.affectedProjects.slice(0, 6).join(', ')}\n`;
                            }
                            if (check.affectedFiles?.length) {
                                output += `   Files: ${check.affectedFiles.slice(0, 3).join(', ')}\n`;
                            }
                            if (check.actionLabel && check.action && check.status !== 'green') {
                                output += `   Fix: ${check.actionLabel} → ${check.action}\n`;
                            }
                            output += '\n';
                        }
                        output += `---\n`;
                        output += `Audit complete — ${r.red} red, ${r.yellow} yellow, ${r.green} green`;
                    } else {
                        output = `Audit failed: ${result.error}`;
                    }

                    // Show results in interactive webview — use a dedicated viewType so the
                    // launcher.refresh command (which also calls showInteractiveResultWebview)
                    // cannot overwrite this panel's content.
                    showInteractiveResultWebview({
                        title: 'Daily Audit Results',
                        action: 'Run Daily Health Check',
                        output,
                        durationMs: result.report.durationMs,
                        failed,
                        viewType: 'dailyAuditResults',
                        onRerun: () => {
                            vscode.commands.executeCommand('cvs.audit.runDaily');
                        },
                    });

                    // Also log to output channel
                    if (result.written) {
                        log(FEATURE, '=== Daily Audit Results ===');
                        const checks = result.report.checks;
                        log(FEATURE, `Scanned ${checks.length} checks in ${result.report.durationMs}ms`);
                        log(FEATURE, `Summary: ${r.red} red, ${r.yellow} yellow, ${r.green} green, ${r.grey} grey`);
                        log(FEATURE, `Audit complete — ${r.red} red, ${r.yellow} yellow, ${r.green} green`);
                    } else {
                        log(FEATURE, `Audit failed: ${result.error}`);
                    }

                    // Refresh the launcher panel in place so audit dots update immediately.
                    // Uses executeCommand to avoid a circular import with cvs-command-launcher.
                    vscode.commands.executeCommand('cvs.launcher.refresh');

                    // Let the user immediately inspect and act on findings.
                    await offerAuditActions(result);
                }
            );
        })
    );
}

export function deactivate(): void {}
