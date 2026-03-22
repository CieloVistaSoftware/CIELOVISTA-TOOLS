"use strict";
// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const output_channel_1 = require("../../shared/output-channel");
const registry_1 = require("../../shared/registry");
const runner_1 = require("./runner");
const html_1 = require("./html");
const actions_1 = require("./actions");
const report_1 = require("./report");
const walkthrough_1 = require("./walkthrough");
const scanner_1 = require("./scanner");
const FEATURE = 'doc-auditor';
let _panel;
// ─── Main panel ───────────────────────────────────────────────────────────────
async function runFullAudit() {
    const results = await (0, runner_1.runAudit)();
    if (!results) {
        return;
    }
    const html = (0, html_1.buildAuditHtml)(results);
    if (_panel) {
        _panel.webview.html = html;
        _panel.reveal();
    }
    else {
        _panel = vscode.window.createWebviewPanel('docAudit', '📋 Docs Audit', vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true });
        _panel.webview.html = html;
        _panel.onDidDispose(() => { _panel = undefined; });
    }
    _panel.webview.onDidReceiveMessage(async (msg) => {
        switch (msg.command) {
            case 'open':
                if (msg.data && fs.existsSync(msg.data)) {
                    const doc = await vscode.workspace.openTextDocument(msg.data);
                    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
                }
                break;
            case 'merge':
                await (0, actions_1.mergeFiles)(Array.isArray(msg.data) ? msg.data : [msg.data]);
                break;
            case 'moveToGlobal':
                await (0, actions_1.moveToGlobal)(msg.data);
                break;
            case 'delete':
                await (0, actions_1.deleteDoc)(msg.data);
                break;
            case 'diff':
                await (0, actions_1.diffFiles)(Array.isArray(msg.data) ? msg.data : [msg.data]);
                break;
            case 'walkGroup': {
                const paths = Array.isArray(msg.data) ? msg.data : [msg.data];
                for (const fp of paths) {
                    if (!fs.existsSync(fp)) {
                        continue;
                    }
                    const d = await vscode.workspace.openTextDocument(fp);
                    await vscode.window.showTextDocument(d, vscode.ViewColumn.Beside);
                    const next = await vscode.window.showInformationMessage(`Reviewing: ${path.basename(fp)}`, 'Next', 'Stop');
                    if (next !== 'Next') {
                        break;
                    }
                }
                break;
            }
        }
    });
    try {
        const reportPath = (0, report_1.saveAuditReport)(results);
        const total = results.duplicates.length + results.similar.length + results.moveCandidates.length + results.orphans.length;
        if (total === 0) {
            vscode.window.showInformationMessage('Audit complete — no issues found. ✅');
        }
        else {
            const choice = await vscode.window.showInformationMessage(`Audit found ${total} issue(s). Walk through them now?`, 'Walk Through Now', 'Open Report', 'Later');
            if (choice === 'Walk Through Now') {
                await (0, walkthrough_1.walkThroughFindings)(results);
            }
            else if (choice === 'Open Report') {
                const doc = await vscode.workspace.openTextDocument(reportPath);
                await vscode.window.showTextDocument(doc);
            }
        }
    }
    catch (err) {
        (0, output_channel_1.logError)(FEATURE, 'Failed to save report', err);
    }
    (0, output_channel_1.log)(FEATURE, `Audit complete — ${results.totalDocsScanned} docs, ${results.duplicates.length} dupes, ${results.similar.length} similar, ${results.moveCandidates.length} move candidates, ${results.orphans.length} orphans`);
}
// ─── Past report ──────────────────────────────────────────────────────────────
async function openPastReport() {
    const reportDir = (0, report_1.getReportDir)();
    const files = fs.readdirSync(reportDir).filter(f => /^audit-.+\.md$/i.test(f)).sort().reverse();
    if (!files.length) {
        vscode.window.showInformationMessage('No audit reports found. Run an audit first.');
        return;
    }
    const now = Date.now();
    const picked = await vscode.window.showQuickPick(files.map(f => {
        const m = f.match(/(\d{4}-\d{2}-\d{2})/);
        const isOld = m ? (now - new Date(m[1]).getTime()) > 86400000 * 30 : false;
        return { label: `${isOld ? '🗑️ ' : ''}$(file) ${f}${isOld ? '  (>30 days)' : ''}`, filePath: path.join(reportDir, f) };
    }), { placeHolder: `${files.length} audit reports — select one to open` });
    if (!picked) {
        return;
    }
    const doc = await vscode.workspace.openTextDocument(picked.filePath);
    await vscode.window.showTextDocument(doc);
}
// ─── Act on report ────────────────────────────────────────────────────────────
async function actOnReport() {
    const reportDir = (0, report_1.getReportDir)();
    const files = fs.readdirSync(reportDir).filter(f => /^audit-.+\.md$/i.test(f)).sort().reverse();
    if (!files.length) {
        vscode.window.showInformationMessage('No audit reports found. Run an audit first.');
        return;
    }
    const now = Date.now();
    const reportPick = await vscode.window.showQuickPick(files.map(f => {
        const m = f.match(/(\d{4}-\d{2}-\d{2})/);
        const isOld = m ? (now - new Date(m[1]).getTime()) > 86400000 * 30 : false;
        return { label: `${isOld ? '🗑️ ' : ''}$(file) ${f}`, filePath: path.join(reportDir, f) };
    }), { placeHolder: 'Select an audit report to act on' });
    if (!reportPick) {
        return;
    }
    let content;
    try {
        content = fs.readFileSync(reportPick.filePath, 'utf8');
    }
    catch (err) {
        (0, output_channel_1.logError)(FEATURE, 'Could not read report', err);
        vscode.window.showErrorMessage(`Could not read report: ${err}`);
        return;
    }
    const actions = (0, report_1.parseReportActions)(content);
    if (!actions.length) {
        vscode.window.showInformationMessage('No actionable items found in this report.');
        return;
    }
    const kindIcon = { delete: 'trash', diff: 'diff', merge: 'git-merge', open: 'go-to-file', 'move-to-global': 'arrow-right' };
    const actionPick = await vscode.window.showQuickPick(actions.map(a => ({ label: `$(${kindIcon[a.kind] ?? 'arrow-right'}) ${a.label}`, description: a.context, detail: a.paths.join('  →  '), action: a })), { placeHolder: `${actions.length} actions available`, matchOnDescription: true, matchOnDetail: true });
    if (!actionPick) {
        return;
    }
    const { kind, paths } = actionPick.action;
    (0, output_channel_1.log)(FEATURE, `Acting on report: ${kind} — ${paths.join(', ')}`);
    switch (kind) {
        case 'open':
            if (fs.existsSync(paths[0])) {
                const doc = await vscode.workspace.openTextDocument(paths[0]);
                await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
            }
            break;
        case 'diff':
            await (0, actions_1.diffFiles)(paths);
            break;
        case 'merge':
            await (0, actions_1.mergeFiles)(paths);
            break;
        case 'move-to-global':
            await (0, actions_1.moveToGlobal)(paths[0]);
            break;
        case 'delete':
            await (0, actions_1.deleteDoc)(paths[0]);
            break;
    }
}
// ─── Quick scan commands ──────────────────────────────────────────────────────
async function quickFindDuplicates() {
    const results = await (0, runner_1.runAudit)();
    if (!results) {
        return;
    }
    if (!results.duplicates.length) {
        vscode.window.showInformationMessage('No duplicate filenames found.');
        return;
    }
    try {
        const p = path.join((0, report_1.getReportDir)(), (0, report_1.reportFileName)('duplicates'));
        const lines = [`# Duplicate Filenames Audit`, ``, `> **Date:** ${new Date().toLocaleString()}`, ``, `---`, ``];
        for (const g of results.duplicates) {
            lines.push(`## ${g.fileName}`, `<!-- AUDIT-ACTION:merge:${g.files.map(f => f.filePath).join('::')} -->`);
            for (const f of g.files) {
                lines.push(`- \`${f.filePath}\` (${f.projectName}, ${f.sizeBytes} bytes)`, `  <!-- AUDIT-ACTION:open:${f.filePath} -->`);
            }
            lines.push(``);
        }
        fs.writeFileSync(p, lines.join('\n'), 'utf8');
        vscode.window.showInformationMessage(`Found ${results.duplicates.length} duplicates.`, 'Act on Report').then(c => { if (c === 'Act on Report') {
            actOnReport();
        } });
    }
    catch (err) {
        (0, output_channel_1.logError)(FEATURE, 'Failed to save duplicates report', err);
    }
    await vscode.window.showQuickPick(results.duplicates.map(g => ({ label: `$(copy) ${g.fileName}`, description: `${g.files.length} copies`, detail: g.files.map(f => `${f.projectName}/${f.fileName}`).join('  |  ') })), { placeHolder: `${results.duplicates.length} duplicate filenames found`, matchOnDescription: true });
}
async function quickFindSimilar() {
    const results = await (0, runner_1.runAudit)();
    if (!results) {
        return;
    }
    if (!results.similar.length) {
        vscode.window.showInformationMessage('No near-duplicate content found.');
        return;
    }
    try {
        const p = path.join((0, report_1.getReportDir)(), (0, report_1.reportFileName)('similar'));
        const lines = [`# Similar Content Audit`, ``, `> **Date:** ${new Date().toLocaleString()}`, ``, `---`, ``];
        for (const g of results.similar) {
            lines.push(`## ${Math.round(g.similarity * 100)}% — ${g.fileA.fileName} ↔ ${g.fileB.fileName}`, `<!-- AUDIT-ACTION:diff:${g.fileA.filePath}::${g.fileB.filePath} -->`, `<!-- AUDIT-ACTION:merge:${g.fileA.filePath}::${g.fileB.filePath} -->`, `- A: \`${g.fileA.filePath}\``, `- B: \`${g.fileB.filePath}\``, ``);
        }
        fs.writeFileSync(p, lines.join('\n'), 'utf8');
        vscode.window.showInformationMessage(`Found ${results.similar.length} similar pairs.`, 'Act on Report').then(c => { if (c === 'Act on Report') {
            actOnReport();
        } });
    }
    catch (err) {
        (0, output_channel_1.logError)(FEATURE, 'Failed to save similar report', err);
    }
    const picked = await vscode.window.showQuickPick(results.similar.map(g => ({ label: `$(git-compare) ${Math.round(g.similarity * 100)}% similar`, description: `${g.fileA.projectName}/${g.fileA.fileName}  ↔  ${g.fileB.projectName}/${g.fileB.fileName}`, detail: g.reason, data: g })), { placeHolder: `${results.similar.length} similar pairs found`, matchOnDescription: true });
    if (picked) {
        await (0, actions_1.diffFiles)([picked.data.fileA.filePath, picked.data.fileB.filePath]);
    }
}
async function quickFindOrphans() {
    const results = await (0, runner_1.runAudit)();
    if (!results) {
        return;
    }
    if (!results.orphans.length) {
        vscode.window.showInformationMessage('No orphaned docs found.');
        return;
    }
    try {
        const p = path.join((0, report_1.getReportDir)(), (0, report_1.reportFileName)('orphans'));
        const lines = [`# Orphaned Docs Audit`, ``, `> **Date:** ${new Date().toLocaleString()}`, ``, `---`, ``];
        for (const o of results.orphans) {
            lines.push(`- \`${o.file.filePath}\``, `  <!-- AUDIT-ACTION:delete:${o.file.filePath} -->`, `  <!-- AUDIT-ACTION:open:${o.file.filePath} -->`, ``);
        }
        fs.writeFileSync(p, lines.join('\n'), 'utf8');
        vscode.window.showInformationMessage(`Found ${results.orphans.length} orphans.`, 'Act on Report').then(c => { if (c === 'Act on Report') {
            actOnReport();
        } });
    }
    catch (err) {
        (0, output_channel_1.logError)(FEATURE, 'Failed to save orphans report', err);
    }
    const picked = await vscode.window.showQuickPick(results.orphans.map(o => ({ label: `$(warning) ${o.file.projectName}/${o.file.fileName}`, description: o.reason, detail: o.file.filePath, data: o })), { placeHolder: `${results.orphans.length} orphaned docs found`, matchOnDescription: true });
    if (picked) {
        const doc = await vscode.workspace.openTextDocument(picked.data.file.filePath);
        await vscode.window.showTextDocument(doc);
    }
}
async function interactiveMerge() {
    const registry = (0, registry_1.loadRegistry)();
    if (!registry) {
        return;
    }
    const all = (0, scanner_1.collectDocs)(registry.globalDocsPath, 'global');
    for (const p of registry.projects) {
        if (fs.existsSync(p.path)) {
            all.push(...(0, scanner_1.collectDocs)(p.path, p.name));
        }
    }
    const selected = await vscode.window.showQuickPick(all.map(f => ({ label: `$(markdown) ${f.fileName}`, description: f.projectName, detail: f.filePath, picked: false, data: f })), { canPickMany: true, placeHolder: 'Select 2 or more docs to merge', matchOnDescription: true });
    if (!selected || selected.length < 2) {
        vscode.window.showWarningMessage('Select at least 2 docs to merge.');
        return;
    }
    await (0, actions_1.mergeFiles)(selected.map(s => s.data.filePath));
}
async function interactiveMoveToGlobal() {
    const registry = (0, registry_1.loadRegistry)();
    if (!registry) {
        return;
    }
    const all = [];
    for (const p of registry.projects) {
        if (fs.existsSync(p.path)) {
            all.push(...(0, scanner_1.collectDocs)(p.path, p.name));
        }
    }
    const picked = await vscode.window.showQuickPick(all.map(f => ({ label: `$(markdown) ${f.fileName}`, description: f.projectName, detail: f.filePath, data: f })), { placeHolder: 'Select a project doc to move to CieloVistaStandards', matchOnDescription: true });
    if (!picked) {
        return;
    }
    await (0, actions_1.moveToGlobal)(picked.data.filePath);
}
// ─── Activate / Deactivate ────────────────────────────────────────────────────
function activate(context) {
    (0, output_channel_1.log)(FEATURE, 'Activating');
    context.subscriptions.push(vscode.commands.registerCommand('cvs.audit.docs', runFullAudit), vscode.commands.registerCommand('cvs.audit.findDuplicates', quickFindDuplicates), vscode.commands.registerCommand('cvs.audit.findSimilar', quickFindSimilar), vscode.commands.registerCommand('cvs.audit.findOrphans', quickFindOrphans), vscode.commands.registerCommand('cvs.audit.mergeFiles', interactiveMerge), vscode.commands.registerCommand('cvs.audit.moveToGlobal', interactiveMoveToGlobal), vscode.commands.registerCommand('cvs.audit.openReport', openPastReport), vscode.commands.registerCommand('cvs.audit.actOnReport', actOnReport), vscode.commands.registerCommand('cvs.audit.walkthrough', async () => {
        const results = await (0, runner_1.runAudit)();
        if (results) {
            await (0, walkthrough_1.walkThroughFindings)(results);
        }
    }));
}
function deactivate() {
    _panel?.dispose();
    _panel = undefined;
}
//# sourceMappingURL=index.js.map