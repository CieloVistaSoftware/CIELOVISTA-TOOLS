// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

// component: aud

/**
 * daily-audit/index.ts — activate/deactivate only.
 * Registers cvs.audit.runDaily command.
 */
import * as vscode from 'vscode';
import { log } from '../../shared/output-channel';
import { showInteractiveResultWebview } from '../../shared/show-interactive-result-webview';
import { runDailyAudit } from './runner';
import { AUDIT_REPORT_PATH } from '../../shared/audit-schema';
import { fileDailyAuditCheckAsIssue } from '../../shared/github-issue-filer';

const FEATURE = 'daily-audit';

type IssueLink = { issueUrl: string; issueNumber: number };

function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildAuditOutputHtml(
    result: Awaited<ReturnType<typeof runDailyAudit>>,
    issueMap: Map<string, IssueLink>
): string {
    const r      = result.report.summary;
    const checks = result.report.checks;
    const runAt  = new Date(result.report.generatedAt).toLocaleTimeString();
    let html = `<pre style="font-family:var(--vscode-editor-font-family);white-space:pre-wrap;margin:0">`;
    html += `Projects audited (${result.projectNames.length}): ${esc(result.projectNames.join(', '))}\n`;
    html += `\n=== Daily Audit Results ===\n`;
    html += `Fresh scan — ran at ${runAt}\n`;
    html += `Scanned ${checks.length} checks in ${result.report.durationMs}ms\n`;
    html += `Summary: ${r.red} red, ${r.yellow} yellow, ${r.green} green, ${r.grey} grey\n\n---\n`;
    for (const check of checks) {
        const icon = check.status === 'green' ? '✅' : check.status === 'red' ? '❌' : check.status === 'yellow' ? '⚠️' : '▫️';
        html += `${icon} ${esc(check.title)} [${esc(check.category)}] — ${esc(check.summary)}`;
        const link = issueMap.get(check.checkId);
        if (link) {
            html += ` <a href="#" data-issue-url="${esc(link.issueUrl)}" style="color:var(--vscode-textLink-foreground);text-decoration:none" title="View GitHub issue #${link.issueNumber}">#${link.issueNumber}</a>`;
        }
        html += '\n';
        if (check.detail && check.status !== 'green') {
            html += `   Detail: ${esc(check.detail.slice(0, 300))}\n`;
        }
        if (check.affectedProjects?.length) {
            html += `   Affected: ${esc(check.affectedProjects.slice(0, 6).join(', '))}\n`;
        }
        if (check.affectedFiles?.length) {
            html += `   Files: ${esc(check.affectedFiles.slice(0, 3).join(', '))}\n`;
        }
        if (check.actionLabel && check.action && check.status !== 'green') {
            html += `   Fix: ${esc(check.actionLabel)} → ${esc(check.action)}\n`;
        }
        html += '\n';
    }
    html += `---\nAudit complete — ${r.red} red, ${r.yellow} yellow, ${r.green} green`;
    html += `</pre>`;
    return html;
}

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
            let _auditResult: Awaited<ReturnType<typeof runDailyAudit>> | undefined;
            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: '🔍 Running daily audit…', cancellable: true },
                async (progress) => {
                    progress.report({ increment: 0, message: 'Starting checks…' });

                    // Race the audit against a 90-second hard timeout so the spinner
                    // never runs forever if a file-system call hangs (e.g. disconnected
                    // network drive in the project registry).
                    const timeout = new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error('Audit timed out after 90 seconds')), 90_000)
                    );

                    let result: Awaited<ReturnType<typeof runDailyAudit>>;
                    try {
                        result = await Promise.race([
                            runDailyAudit((msg, inc) => progress.report({ message: msg, increment: inc })),
                            timeout,
                        ]);
                    } catch (err) {
                        result = {
                            report: {
                                auditId: new Date().toISOString(),
                                generatedAt: new Date().toISOString(),
                                durationMs: 90_000,
                                checks: [],
                                summary: { red: 1, yellow: 0, green: 0, grey: 0, total: 1 },
                            },
                            written: false,
                            projectNames: [],
                            error: String(err),
                        };
                    }
                    _auditResult = result;
                    const r = result.report.summary;
                    const failed = !result.written || r.red > 0;

                    // Build detailed output for the webview
                    let output = '';
                    if (result.written) {
                        const checks = result.report.checks;
                        const runAt = result.report.generatedAt || new Date().toISOString();
                        // First line: Projects audited
                        output += `Projects audited (${result.projectNames.length}): ${result.projectNames.join(', ')}\n`;
                        output += `\n=== Daily Audit Results ===\n`;
                        const runAtLocal = new Date(runAt).toLocaleTimeString();
                        output += `Fresh scan — ran at ${runAtLocal}\n`;
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
                    const title = result.written 
                        ? `Daily Audit Results — ${result.projectNames.length} project${result.projectNames.length === 1 ? '' : 's'}`
                        : 'Daily Audit Results';
                    
                    showInteractiveResultWebview({
                        title,
                        action: 'Run Daily Health Check',
                        output,
                        durationMs: result.report.durationMs,
                        failed,
                        viewType: 'dailyAuditResults',
                        onRerun: () => {
                            vscode.commands.executeCommand('cvs.audit.runDaily');
                        },
                    });

                    // Fire-and-forget: auto-file issues for red/yellow checks, then
                    // update the panel with clickable issue links once filing is done.
                    if (result.written) {
                        const _capturedResult = result;
                        const _capturedTitle  = title;
                        const _capturedFailed = failed;
                        void (async () => {
                            const failures = _capturedResult.report.checks.filter(c => c.status === 'red' || c.status === 'yellow');
                            if (!failures.length) { return; }
                            const issueMap = new Map<string, IssueLink>();
                            for (const check of failures) {
                                try {
                                    const r = await fileDailyAuditCheckAsIssue(check);
                                    if (r.ok && r.issueUrl && r.issueNumber != null) {
                                        issueMap.set(check.checkId, { issueUrl: r.issueUrl, issueNumber: r.issueNumber });
                                    }
                                } catch { /* best-effort */ }
                            }
                            if (!issueMap.size) { return; }
                            showInteractiveResultWebview({
                                title: _capturedTitle,
                                action: 'Run Daily Health Check',
                                output: buildAuditOutputHtml(_capturedResult, issueMap),
                                durationMs: _capturedResult.report.durationMs,
                                failed: _capturedFailed,
                                viewType: 'dailyAuditResults',
                                onRerun: () => { vscode.commands.executeCommand('cvs.audit.runDaily'); },
                            });
                        })();
                    }

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
                }
            );

            // Offer follow-up actions AFTER the progress notification closes so the
            // spinner does not appear to run indefinitely while waiting for user input.
            if (_auditResult) {
                await offerAuditActions(_auditResult);
            }
        })
    );
}

export function deactivate(): void {}
