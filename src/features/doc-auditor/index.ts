// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

// component: aud

import * as vscode from 'vscode';
import * as fs     from 'fs';
import * as path   from 'path';
import { log, logError }  from '../../shared/output-channel';
import { loadRegistry }   from '../../shared/registry';
import { runAudit }       from './runner';
import { buildAuditHtml, buildAuditLoadingHtml } from './html';
import { mergeFiles, moveToGlobal, deleteDoc, diffFiles } from './actions';
import { saveAuditReport, parseReportActions, getReportDir, reportFileName } from './report';
import { walkThroughFindings } from './walkthrough';
import { collectDocs } from './scanner';
import { sendToCopilotChat } from '../terminal-copy-output';
import type { DocFile } from './types';

const FEATURE = 'doc-auditor';
let _panel: vscode.WebviewPanel | undefined;
let _auditRunId = 0;
let _panelMessagesRegistered = false;

function ensurePanel(): vscode.WebviewPanel {
    if (_panel) { return _panel; }

    _panel = vscode.window.createWebviewPanel('docAudit', '📋 Docs Audit', vscode.ViewColumn.One,
        { enableScripts: true, retainContextWhenHidden: true });
    _panel.onDidDispose(() => { _panel = undefined; });
    _panelMessagesRegistered = false;
    return _panel;
}

function registerPanelMessages(panel: vscode.WebviewPanel): void {
    if (_panelMessagesRegistered) { return; }
    _panelMessagesRegistered = true;
    panel.webview.onDidReceiveMessage(async msg => {
        switch (msg.command) {
            case 'open':
                if (msg.data && fs.existsSync(msg.data)) {
                    const doc = await vscode.workspace.openTextDocument(msg.data);
                    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
                }
                break;
            case 'merge':      await mergeFiles(Array.isArray(msg.data) ? msg.data : [msg.data]); break;
            case 'moveToGlobal': await moveToGlobal(msg.data); break;
            case 'delete':     await deleteDoc(msg.data); break;
            case 'diff':       await diffFiles(Array.isArray(msg.data) ? msg.data : [msg.data]); break;
            case 'copy': {
                const text = typeof msg.data === 'string' ? msg.data : '';
                await vscode.env.clipboard.writeText(text);
                vscode.window.showInformationMessage('Docs audit table copied to clipboard.');
                break;
            }
            case 'copy-chat': {
                const text = typeof msg.data === 'string' ? msg.data : '';
                const sent = await sendToCopilotChat(text);
                if (!sent) {
                    await vscode.env.clipboard.writeText(text);
                    vscode.window.showInformationMessage('Could not inject into Copilot Chat. Copied to clipboard instead.');
                }
                break;
            }
            case 'delete-report': {
                const rp = typeof msg.data === 'string' ? msg.data : '';
                if (!rp) { break; }
                const confirm = await vscode.window.showWarningMessage(
                    `Delete ${path.basename(rp)}? This cannot be undone.`,
                    { modal: true }, 'Delete'
                );
                if (confirm !== 'Delete') { break; }
                try {
                    fs.unlinkSync(rp);
                    if (_panel) {
                        _panel.webview.html = `<!DOCTYPE html><html lang="en"><body style="font-family:var(--vscode-font-family);padding:18px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background)"><p>Report deleted. Run <strong>Docs Audit</strong> to generate a new one.</p></body></html>`;
                    }
                } catch (err) {
                    vscode.window.showErrorMessage(`Could not delete report: ${err}`);
                }
                break;
            }
            case 'walkGroup': {
                const paths: string[] = Array.isArray(msg.data) ? msg.data : [msg.data];
                for (const fp of paths) {
                    if (!fs.existsSync(fp)) { continue; }
                    const d = await vscode.workspace.openTextDocument(fp);
                    await vscode.window.showTextDocument(d, vscode.ViewColumn.Beside);
                    const next = await vscode.window.showInformationMessage(`Reviewing: ${path.basename(fp)}`, 'Next', 'Stop');
                    if (next !== 'Next') { break; }
                }
                break;
            }
        }
    });
}

// ─── Main panel ───────────────────────────────────────────────────────────────

async function runFullAudit(): Promise<void> {
    const panel = ensurePanel();
    registerPanelMessages(panel);
    panel.webview.html = buildAuditLoadingHtml('Starting…');
    panel.reveal(vscode.ViewColumn.One);

    const runId = ++_auditRunId;
    void (async () => {
        try {
            const results = await runAudit({
                report: (message: string) => {
                    if (_panel && runId === _auditRunId) {
                        _panel.webview.postMessage({ type: 'progress', status: message });
                    }
                },
            });
            if (!results || !_panel || runId !== _auditRunId) { return; }

            const reportPath = saveAuditReport(results);
            const writtenAt = (() => { try { return fs.statSync(reportPath).mtime.toLocaleString(); } catch { return new Date().toLocaleString(); } })();
            _panel.webview.html = buildAuditHtml(results, { reportPath, writtenAt });
            const total = results.duplicates.length + results.similar.length + results.moveCandidates.length + results.orphans.length;
            if (total === 0) {
                vscode.window.showInformationMessage('Audit complete — no issues found. ✅');
            } else {
                const choice = await vscode.window.showInformationMessage(`Audit found ${total} issue(s). Walk through them now?`, 'Walk Through Now', 'Open Report', 'Later');
                if (choice === 'Walk Through Now') { await walkThroughFindings(results); }
                else if (choice === 'Open Report') { const doc = await vscode.workspace.openTextDocument(reportPath); await vscode.window.showTextDocument(doc); }
            }

            log(FEATURE, `Audit complete — ${results.totalDocsScanned} docs, ${results.duplicates.length} dupes, ${results.similar.length} similar, ${results.moveCandidates.length} move candidates, ${results.orphans.length} orphans`);
        } catch (err) {
            // VS Code cancels in-flight promises on extension host shutdown — not a real error
            const msg = err instanceof Error ? err.message : String(err);
            if (msg === 'Canceled' || msg.startsWith('Canceled:')) { return; }
            if (_panel && runId === _auditRunId) {
                _panel.webview.postMessage({ type: 'progress', status: 'Audit failed.' });
            }
            logError('Failed to run doc audit', err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
        }
    })();
}

// ─── Past report ──────────────────────────────────────────────────────────────

async function openPastReport(): Promise<void> {
    const reportDir = getReportDir();
    const files = fs.readdirSync(reportDir).filter(f => /^audit-.+\.md$/i.test(f)).sort().reverse();
    if (!files.length) { vscode.window.showInformationMessage('No audit reports found. Run an audit first.'); return; }
    const now = Date.now();
    const picked = await vscode.window.showQuickPick(
        files.map(f => {
            const m = f.match(/(\d{4}-\d{2}-\d{2})/);
            const isOld = m ? (now - new Date(m[1]).getTime()) > 86400000*30 : false;
            return { label:`${isOld?'🗑️ ':''}$(file) ${f}${isOld?'  (>30 days)':''}`, filePath:path.join(reportDir,f) };
        }),
        { placeHolder:`${files.length} audit reports — select one to open` }
    );
    if (!picked) { return; }
    const doc = await vscode.workspace.openTextDocument(picked.filePath);
    await vscode.window.showTextDocument(doc);
}

// ─── Act on report ────────────────────────────────────────────────────────────

async function actOnReport(): Promise<void> {
    const reportDir = getReportDir();
    const files = fs.readdirSync(reportDir).filter(f => /^audit-.+\.md$/i.test(f)).sort().reverse();
    if (!files.length) { vscode.window.showInformationMessage('No audit reports found. Run an audit first.'); return; }
    const now = Date.now();
    const reportPick = await vscode.window.showQuickPick(
        files.map(f => {
            const m = f.match(/(\d{4}-\d{2}-\d{2})/);
            const isOld = m ? (now - new Date(m[1]).getTime()) > 86400000*30 : false;
            return { label:`${isOld?'🗑️ ':''}$(file) ${f}`, filePath:path.join(reportDir,f) };
        }),
        { placeHolder:'Select an audit report to act on' }
    );
    if (!reportPick) { return; }
    let content: string;
    try { content = fs.readFileSync(reportPick.filePath, 'utf8'); }
    catch (err) { logError('Could not read report', err instanceof Error ? err.stack || String(err) : String(err), FEATURE); vscode.window.showErrorMessage(`Could not read report: ${err}`); return; }
    const actions = parseReportActions(content);
    if (!actions.length) { vscode.window.showInformationMessage('No actionable items found in this report.'); return; }
    const kindIcon: Record<string,string> = { delete:'trash', diff:'diff', merge:'git-merge', open:'go-to-file', 'move-to-global':'arrow-right' };
    const actionPick = await vscode.window.showQuickPick(
        actions.map(a => ({ label:`$(${kindIcon[a.kind]??'arrow-right'}) ${a.label}`, description:a.context, detail:a.paths.join('  →  '), action:a })),
        { placeHolder:`${actions.length} actions available`, matchOnDescription:true, matchOnDetail:true }
    );
    if (!actionPick) { return; }
    const { kind, paths } = actionPick.action;
    log(FEATURE, `Acting on report: ${kind} — ${paths.join(', ')}`);
    switch (kind) {
        case 'open':           if(fs.existsSync(paths[0])){ const doc=await vscode.workspace.openTextDocument(paths[0]); await vscode.window.showTextDocument(doc,vscode.ViewColumn.Beside); } break;
        case 'diff':           await diffFiles(paths); break;
        case 'merge':          await mergeFiles(paths); break;
        case 'move-to-global': await moveToGlobal(paths[0]); break;
        case 'delete':         await deleteDoc(paths[0]); break;
    }
}

// ─── Quick scan commands ──────────────────────────────────────────────────────

async function quickFindDuplicates(): Promise<void> {
    const results = await runAudit();
    if (!results) { return; }
    if (!results.duplicates.length) { vscode.window.showInformationMessage('No duplicate filenames found.'); return; }
    try {
        const p = path.join(getReportDir(), reportFileName('duplicates'));
        const lines = [
            `# Duplicate Filenames Audit`,
            ``,
            `**Date:** ${new Date().toLocaleString()} — **${results.duplicates.length} duplicate filename group${results.duplicates.length === 1 ? '' : 's'} found**`,
            ``,
            `| Filename | Project | Size | Path |`,
            `|----------|---------|------|------|`,
        ];
        const actionLines: string[] = [];
        for (const g of results.duplicates) {
            actionLines.push(`<!-- AUDIT-ACTION:merge:${g.files.map(f=>f.filePath).join('::')} -->`);
            for (const f of g.files) {
                const kb = (f.sizeBytes / 1024).toFixed(1);
                lines.push(`| ${g.fileName} | ${f.projectName} | ${kb} KB | \`${f.filePath}\` |`);
                actionLines.push(`<!-- AUDIT-ACTION:open:${f.filePath} -->`);
            }
        }
        lines.push(``, ...actionLines);
        fs.writeFileSync(p, lines.join('\n'), 'utf8');
        vscode.window.showInformationMessage(`Found ${results.duplicates.length} duplicates.`, 'Act on Report').then(c => { if(c==='Act on Report'){ actOnReport(); } });
    } catch (err) { logError('Failed to save duplicates report', err instanceof Error ? err.stack || String(err) : String(err), FEATURE); }
    await vscode.window.showQuickPick(
        results.duplicates.map(g => ({ label:`$(copy) ${g.fileName}`, description:`${g.files.length} copies`, detail:g.files.map(f=>`${f.projectName}/${f.fileName}`).join('  |  ') })),
        { placeHolder:`${results.duplicates.length} duplicate filenames found`, matchOnDescription:true }
    );
}

async function quickFindSimilar(): Promise<void> {
    const results = await runAudit();
    if (!results) { return; }
    if (!results.similar.length) { vscode.window.showInformationMessage('No near-duplicate content found.'); return; }
    try {
        const p = path.join(getReportDir(), reportFileName('similar'));
        const lines = [`# Similar Content Audit`, ``, `> **Date:** ${new Date().toLocaleString()}`, ``, `---`, ``];
        for (const g of results.similar) {
            lines.push(`## ${Math.round(g.similarity*100)}% — ${g.fileA.fileName} ↔ ${g.fileB.fileName}`,
                `<!-- AUDIT-ACTION:diff:${g.fileA.filePath}::${g.fileB.filePath} -->`,
                `<!-- AUDIT-ACTION:merge:${g.fileA.filePath}::${g.fileB.filePath} -->`,
                `- A: \`${g.fileA.filePath}\``, `- B: \`${g.fileB.filePath}\``, ``);
        }
        fs.writeFileSync(p, lines.join('\n'), 'utf8');
        vscode.window.showInformationMessage(`Found ${results.similar.length} similar pairs.`, 'Act on Report').then(c => { if(c==='Act on Report'){ actOnReport(); } });
    } catch (err) { logError('Failed to save similar report', err instanceof Error ? err.stack || String(err) : String(err), FEATURE); }
    const picked = await vscode.window.showQuickPick(
        results.similar.map(g => ({ label:`$(git-compare) ${Math.round(g.similarity*100)}% similar`, description:`${g.fileA.projectName}/${g.fileA.fileName}  ↔  ${g.fileB.projectName}/${g.fileB.fileName}`, detail:g.reason, data:g })),
        { placeHolder:`${results.similar.length} similar pairs found`, matchOnDescription:true }
    );
    if (picked) { await diffFiles([picked.data.fileA.filePath, picked.data.fileB.filePath]); }
}

async function quickFindOrphans(): Promise<void> {
    const results = await runAudit();
    if (!results) { return; }
    if (!results.orphans.length) { vscode.window.showInformationMessage('No orphaned docs found.'); return; }
    try {
        const p = path.join(getReportDir(), reportFileName('orphans'));
        const lines = [`# Orphaned Docs Audit`, ``, `> **Date:** ${new Date().toLocaleString()}`, ``, `---`, ``];
        for (const o of results.orphans) {
            lines.push(`- \`${o.file.filePath}\``, `  <!-- AUDIT-ACTION:delete:${o.file.filePath} -->`, `  <!-- AUDIT-ACTION:open:${o.file.filePath} -->`, ``);
        }
        fs.writeFileSync(p, lines.join('\n'), 'utf8');
        vscode.window.showInformationMessage(`Found ${results.orphans.length} orphans.`, 'Act on Report').then(c => { if(c==='Act on Report'){ actOnReport(); } });
    } catch (err) { logError('Failed to save orphans report', err instanceof Error ? err.stack || String(err) : String(err), FEATURE); }
    const picked = await vscode.window.showQuickPick(
        results.orphans.map(o => ({ label:`$(warning) ${o.file.projectName}/${o.file.fileName}`, description:o.reason, detail:o.file.filePath, data:o })),
        { placeHolder:`${results.orphans.length} orphaned docs found`, matchOnDescription:true }
    );
    if (picked) { const doc = await vscode.workspace.openTextDocument(picked.data.file.filePath); await vscode.window.showTextDocument(doc); }
}

async function interactiveMerge(): Promise<void> {
    const registry = loadRegistry();
    if (!registry) { return; }
    const all: DocFile[] = collectDocs(registry.globalDocsPath, 'global');
    for (const p of registry.projects) { if (fs.existsSync(p.path)) { all.push(...collectDocs(p.path, p.name)); } }
    const selected = await vscode.window.showQuickPick(
        all.map(f => ({ label:`$(markdown) ${f.fileName}`, description:f.projectName, detail:f.filePath, picked:false, data:f })),
        { canPickMany:true, placeHolder:'Select 2 or more docs to merge', matchOnDescription:true }
    );
    if (!selected || selected.length < 2) { vscode.window.showWarningMessage('Select at least 2 docs to merge.'); return; }
    await mergeFiles(selected.map(s => s.data.filePath));
}

async function interactiveMoveToGlobal(): Promise<void> {
    const registry = loadRegistry();
    if (!registry) { return; }
    const all: DocFile[] = [];
    for (const p of registry.projects) { if (fs.existsSync(p.path)) { all.push(...collectDocs(p.path, p.name)); } }
    const picked = await vscode.window.showQuickPick(
        all.map(f => ({ label:`$(markdown) ${f.fileName}`, description:f.projectName, detail:f.filePath, data:f })),
        { placeHolder:'Select a project doc to move to CieloVistaStandards', matchOnDescription:true }
    );
    if (!picked) { return; }
    await moveToGlobal(picked.data.filePath);
}

// ─── Activate / Deactivate ────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
    log(FEATURE, 'Activating');
    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.audit.docs',          runFullAudit),
        vscode.commands.registerCommand('cvs.audit.findDuplicates', quickFindDuplicates),
        vscode.commands.registerCommand('cvs.audit.findSimilar',    quickFindSimilar),
        vscode.commands.registerCommand('cvs.audit.findOrphans',    quickFindOrphans),
        vscode.commands.registerCommand('cvs.audit.mergeFiles',     interactiveMerge),
        vscode.commands.registerCommand('cvs.audit.moveToGlobal',   interactiveMoveToGlobal),
        vscode.commands.registerCommand('cvs.audit.openReport',     openPastReport),
        vscode.commands.registerCommand('cvs.audit.actOnReport',    actOnReport),
        vscode.commands.registerCommand('cvs.audit.walkthrough',    async () => {
            const results = await runAudit();
            if (results) { await walkThroughFindings(results); }
        }),
    );
}

export function deactivate(): void {
    _panel?.dispose();
    _panel = undefined;
}
