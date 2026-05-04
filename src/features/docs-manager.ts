// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * docs-manager.ts
 *
 * Global documentation manager for all CieloVista projects.
 *
 * This is the single tool for finding, opening, creating, and searching
 * documentation across EVERY CieloVista project from any workspace.
 *
 * The master project registry lives at:
 *   C:\Users\jwpmi\Downloads\CieloVistaStandards\project-registry.json
 *
 * Global standards docs live at:
 *   C:\Users\jwpmi\Downloads\CieloVistaStandards\
 *
 * Commands registered:
 *   cvs.docs.openGlobal      — open any global standards doc
 *   cvs.docs.openProject     — open any doc in any registered project
 *   cvs.docs.newGlobal       — create a new global standards doc
 *   cvs.docs.newProjectDoc   — create a new doc in a project
 *   cvs.docs.searchAll       — search text across all docs everywhere
 *   cvs.docs.syncCheck       — show which projects are missing CLAUDE.md or copilot-rules link
 *   cvs.docs.openRegistry    — open project-registry.json directly
 *   cvs.docs.addProject      — add a new project to the registry
 */
import * as vscode from 'vscode';

import * as fs from 'fs';
import * as path from 'path';
import { log, logError } from '../shared/output-channel';
import { REGISTRY_PATH, loadRegistry, saveRegistry, ProjectRegistry, ProjectEntry } from '../shared/registry';
import { showContentViewer } from '../shared/content-viewer';

const FEATURE = 'docs-manager';

// ─── Types ────────────────────────────────────────────────────────────────────

// ProjectEntry and ProjectRegistry types are imported from shared/registry

// ─── Doc file discovery ───────────────────────────────────────────────────────

/** Returns all .md files in a directory (non-recursive). */
function listMarkdownFiles(dirPath: string): string[] {
    if (!fs.existsSync(dirPath)) { return []; }
    try {
        return fs.readdirSync(dirPath)
            .filter(f => f.endsWith('.md') || f.endsWith('.MD'))
            .sort();
    } catch { return []; }
}

/** Returns all .md files under a project's docs folder and root. */
function listProjectDocs(projectPath: string): string[] {
    const results: string[] = [];
    const candidates = [
        projectPath,
        path.join(projectPath, 'docs'),
        path.join(projectPath, 'docs', '_today'),
        path.join(projectPath, 'docs', 'claude'),
    ];
    for (const dir of candidates) {
        for (const file of listMarkdownFiles(dir)) {
            results.push(path.join(dir, file));
        }
    }
    return results;
}

/** Opens a file: .md files in ContentViewer (Markdown or HTML), others in the editor, always to the right. */
async function openDoc(filePath: string): Promise<void> {
    if (filePath.toLowerCase().endsWith('.md')) {
        const content = fs.readFileSync(filePath, 'utf8');
        // For now, always treat as Markdown. To use raw HTML, set isHtml: true.
        showContentViewer({ title: path.basename(filePath), content, isHtml: false });
        log(FEATURE, `Opened (ContentViewer): ${filePath}`);
    } else {
        const doc = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
        log(FEATURE, `Opened: ${filePath}`);
    }
}
// --- Extension activation: sync left panel highlight with active editor ---
import { getCatalogPanel } from './doc-catalog/commands';

// ─── Commands ─────────────────────────────────────────────────────────────────

/** Open any file in the global CieloVistaStandards folder — uses the View a Doc webview. */
async function openGlobalDoc(): Promise<void> {
    // Redirect to the View a Doc webview pre-filtered to global standards
    await vscode.commands.executeCommand('cvs.catalog.view', { filterScope: 'global-standards' });
}

/** Open any doc from any registered project — uses the View a Doc webview. */
async function openProjectDoc(): Promise<void> {
    // Redirect to the View a Doc webview — user browses and clicks any doc
    await vscode.commands.executeCommand('cvs.catalog.view');
}

/** Create a new global standards document from a name prompt. */
async function newGlobalDoc(): Promise<void> {
    const registry = loadRegistry();
    if (!registry) { return; }

    const name = await vscode.window.showInputBox({
        prompt: 'Document name (e.g. TIER1-LAWS or CODING-STANDARDS)',
        placeHolder: 'MY-DOCUMENT',
        validateInput: v => v.trim() ? undefined : 'Name is required',
    });
    if (!name?.trim()) { return; }

    const fileName = name.trim().toUpperCase().replace(/\.MD$/i, '') + '.md';
    const filePath = path.join(registry.globalDocsPath, fileName);

    if (fs.existsSync(filePath)) {
        const overwrite = await vscode.window.showWarningMessage(
            `${fileName} already exists. Open it instead?`, 'Open', 'Cancel'
        );
        if (overwrite === 'Open') { await openDoc(filePath); }
        return;
    }

    const content = `# ${name.trim()}\n\n> CieloVista Software — Global Standard\n\n## Overview\n\n_Describe this standard here._\n\n## Rules\n\n1. Rule one\n2. Rule two\n`;
    fs.writeFileSync(filePath, content, 'utf8');
    log(FEATURE, `Created global doc: ${filePath}`);
    await openDoc(filePath);
}

/** Create a new doc inside a specific project's docs folder. */
async function newProjectDoc(): Promise<void> {
    const registry = loadRegistry();
    if (!registry) { return; }

    const projectPick = await vscode.window.showQuickPick(
        registry.projects.map(p => ({
            label: `$(folder) ${p.name}`,
            description: p.type,
            detail: p.path,
            project: p,
        })),
        { placeHolder: 'Select a project to create the doc in' }
    );
    if (!projectPick) { return; }

    const name = await vscode.window.showInputBox({
        prompt: `Doc name for ${projectPick.project.name}`,
        placeHolder: 'MY-DOCUMENT',
        validateInput: v => v.trim() ? undefined : 'Name is required',
    });
    if (!name?.trim()) { return; }

    const docsDir = path.join(projectPick.project.path, 'docs');
    if (!fs.existsSync(docsDir)) { fs.mkdirSync(docsDir, { recursive: true }); }

    const fileName = name.trim().toUpperCase().replace(/\.MD$/i, '') + '.md';
    const filePath = path.join(docsDir, fileName);
    const content = `# ${name.trim()}\n\n> ${projectPick.project.name}\n\n## Overview\n\n_Document content here._\n`;
    fs.writeFileSync(filePath, content, 'utf8');
    log(FEATURE, `Created project doc: ${filePath}`);
    await openDoc(filePath);
}

/** Search text across ALL docs in global folder and all registered projects. */
async function searchAllDocs(): Promise<void> {
    const registry = loadRegistry();
    if (!registry) { return; }

    const query = await vscode.window.showInputBox({
        prompt: 'Search text across all CieloVista docs',
        placeHolder: 'e.g. one-time-one-place',
    });
    if (!query?.trim()) { return; }

    const term = query.trim().toLowerCase();
    const matches: Array<{ file: string; line: number; text: string }> = [];

    // Collect all doc files
    const allFiles: string[] = listMarkdownFiles(registry.globalDocsPath)
        .map(f => path.join(registry.globalDocsPath, f));

    for (const project of registry.projects) {
        allFiles.push(...listProjectDocs(project.path));
    }

    // Search each file
    for (const file of allFiles) {
        try {
            const lines = fs.readFileSync(file, 'utf8').split('\n');
            lines.forEach((line, i) => {
                if (line.toLowerCase().includes(term)) {
                    matches.push({ file, line: i + 1, text: line.trim() });
                }
            });
        } catch { /* skip unreadable files */ }
    }

    if (!matches.length) {
        vscode.window.showInformationMessage(`No results for "${query}" across ${allFiles.length} docs.`);
        return;
    }

    const picked = await vscode.window.showQuickPick(
        matches.map(m => ({
            label: `$(search) ${path.basename(m.file)}:${m.line}`,
            description: m.text.slice(0, 80),
            detail: m.file,
            match: m,
        })),
        { placeHolder: `${matches.length} results for "${query}"`, matchOnDescription: true }
    );
    if (!picked) { return; }

    const doc = await vscode.workspace.openTextDocument(picked.match.file);
    const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
    const range = new vscode.Range(picked.match.line - 1, 0, picked.match.line - 1, 0);
    editor.selection = new vscode.Selection(range.start, range.end);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
}

// ─── Issue definitions for sync check ───────────────────────────────────────

interface SyncIssue {
    key:        string;   // machine key for fix handler
    label:      string;   // short label shown on the row
    tooltip:    string;   // why this matters
    howToFix:   string;   // what to do
    fixLabel:   string;   // button text
    fixAction:  string;   // command sent to extension host
    fixData:    string;   // payload for the fix
}

interface SyncResult {
    name:   string;
    path:   string;
    ok:     boolean;
    issues: SyncIssue[];
}

function buildSyncIssues(project: ProjectEntry, globalDocsPath: string): SyncIssue[] {
    const issues: SyncIssue[] = [];
    const claudePath = path.join(project.path, 'CLAUDE.md');
    const docsDir    = path.join(project.path, 'docs');
    const hasClaude  = fs.existsSync(claudePath);
    const hasDocs    = fs.existsSync(docsDir);

    let referencesGlobal = false;
    if (hasClaude) {
        referencesGlobal = fs.readFileSync(claudePath, 'utf8').includes('CieloVistaStandards');
    }

    if (!hasClaude) {
        issues.push({
            key:       'missing-claude',
            label:     'Missing CLAUDE.md',
            tooltip:   'Without CLAUDE.md, Claude starts every session with no project context — no build commands, no architecture notes, no session rules.',
            howToFix:  'Create a CLAUDE.md at the project root. Use the Doc Intelligence command to auto-create one from template.',
            fixLabel:  'Create CLAUDE.md',
            fixAction: 'createClaude',
            fixData:   claudePath,
        });
    }

    if (!referencesGlobal) {
        issues.push({
            key:       'no-global-ref',
            label:     'CLAUDE.md does not reference global standards',
            tooltip:   'CLAUDE.md should point Claude to CieloVistaStandards so it reads the global coding rules, git workflow, and web component guide at the start of every session.',
            howToFix:  'Add a "Global Standards" section to CLAUDE.md referencing C:\\Users\\jwpmi\\Downloads\\CieloVistaStandards.',
            fixLabel:  'Add Reference',
            fixAction: 'addGlobalRef',
            fixData:   claudePath,
        });
    }

    if (!hasDocs) {
        issues.push({
            key:       'no-docs-folder',
            label:     'No docs/ folder',
            tooltip:   'Every CieloVista project should have a docs/ folder for CURRENT-STATUS.md, session notes, and architecture decisions.',
            howToFix:  'Create the docs/ folder and add a CURRENT-STATUS.md file inside it.',
            fixLabel:  'Create docs/',
            fixAction: 'createDocsFolder',
            fixData:   docsDir,
        });
    }

    return issues;
}

function esc(s: string): string {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function buildSyncHtml(results: SyncResult[], registry: ProjectRegistry): string {
    const rows = results.map(r => {
        if (!fs.existsSync(r.path)) {
            return `<tr class="row-err">
  <td class="status-cell"><span class="dot dot-red" title="Path not found on disk. Update project-registry.json with the correct path.">🔴</span></td>
  <td class="name-cell">${esc(r.name)}</td>
  <td class="issues-cell"><span class="issue-label">Path not found: <code>${esc(r.path)}</code></span></td>
  <td class="fix-cell"><button class="fix-btn" data-action="openRegistry" data-payload="">📝 Fix Registry</button></td>
</tr>`;
        }

        // Determine best doc to open for this project: CLAUDE.md > README.md
        const claudeDoc   = path.join(r.path, 'CLAUDE.md');
        const readmeDoc   = path.join(r.path, 'README.md');
        const openDocPath = fs.existsSync(claudeDoc) ? claudeDoc
                          : fs.existsSync(readmeDoc) ? readmeDoc
                          : '';
        const openDocBtn  = openDocPath
            ? `<button class="fix-btn open-doc-btn" data-action="openDoc" data-payload="${esc(openDocPath)}" title="Open ${esc(path.basename(openDocPath))} beside current editor">📄 Open Doc</button>`
            : `<button class="fix-btn open-doc-btn" data-action="openFolder" data-payload="${esc(r.path)}" title="No doc found — open project folder">📂 Open Folder</button>`;

        if (r.ok) {
            return `<tr class="row-ok">
  <td class="status-cell"><span class="dot dot-green">🟢</span></td>
  <td class="name-cell">${esc(r.name)}</td>
  <td class="issues-cell"><span class="ok-label">All checks passed</span></td>
  <td class="fix-cell">${openDocBtn}</td>
</tr>`;
        }

        const issueRows = r.issues.map(issue => `
  <tr class="issue-row">
    <td></td>
    <td></td>
    <td class="issue-detail">
      <span class="dot dot-red issue-dot"
            title="${esc(issue.tooltip)}\n\nHow to fix: ${esc(issue.howToFix)}">🔴</span>
      <span class="issue-label" title="${esc(issue.tooltip)}">${esc(issue.label)}</span>
      <span class="tooltip-hint" title="${esc(issue.tooltip)}\n\nHow to fix: ${esc(issue.howToFix)}">ℹ️</span>
    </td>
    <td class="fix-cell">
      <button class="fix-btn" data-action="${esc(issue.fixAction)}" data-payload="${esc(issue.fixData)}">
        🔧 ${esc(issue.fixLabel)}
      </button>
    </td>
  </tr>`).join('');

        return `<tr class="row-err">
  <td class="status-cell"><span class="dot dot-red" title="${r.issues.length} issue(s) found — hover individual dots for details">🔴</span></td>
  <td class="name-cell">${esc(r.name)}</td>
  <td class="issues-cell"><span class="issue-count">${r.issues.length} issue${r.issues.length > 1 ? 's' : ''}</span></td>
  <td class="fix-cell" style="display:flex;gap:4px">
    <button class="fix-btn fix-all-btn" data-action="fixAll" data-proj="${esc(r.name)}" data-projpath="${esc(r.path)}">🔧 Fix All</button>
    ${openDocBtn}
  </td>
</tr>${issueRows}`;
    }).join('');

    const totalIssues = results.reduce((n, r) => n + r.issues.length, 0);
    const totalOk     = results.filter(r => r.ok).length;

    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);font-size:13px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);padding:0}
.toolbar{position:sticky;top:0;background:var(--vscode-editor-background);border-bottom:1px solid var(--vscode-panel-border);padding:10px 16px;display:flex;align-items:center;gap:10px;z-index:10}
.toolbar h2{font-size:1.05em;font-weight:700;flex:1}
.pill{display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600;border:1px solid}
.pill-ok{border-color:var(--vscode-testing-iconPassed);color:var(--vscode-testing-iconPassed)}
.pill-err{border-color:var(--vscode-inputValidation-warningBorder,#cca700);color:var(--vscode-inputValidation-warningBorder,#cca700)}
.rescan-btn{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;padding:4px 12px;border-radius:3px;cursor:pointer;font-size:12px}
.rescan-btn:hover{background:var(--vscode-button-secondaryHoverBackground)}
.content{padding:12px 16px 40px}
table{width:100%;border-collapse:collapse;font-size:12px}
th{text-align:left;padding:6px 10px;background:var(--vscode-textCodeBlock-background);border-bottom:2px solid var(--vscode-focusBorder);font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;white-space:nowrap}
td{padding:5px 10px;border-bottom:1px solid var(--vscode-panel-border);vertical-align:middle}
tr.row-ok:hover td,tr.row-err:hover td{background:var(--vscode-list-hoverBackground)}
.status-cell{width:32px;text-align:center}
.name-cell{font-weight:700;white-space:nowrap}
.issues-cell{}
.fix-cell{white-space:nowrap;text-align:right;width:1%}
.dot{font-size:14px;cursor:default}
.dot-red{}
.dot-green{}
.issue-row td{padding:3px 10px;border-bottom:none}
.issue-detail{display:flex;align-items:center;gap:6px;padding-left:16px}
.issue-dot{font-size:11px}
.issue-label{color:var(--vscode-inputValidation-warningForeground,#cca700);font-size:11px}
.ok-label{color:var(--vscode-testing-iconPassed);font-size:11px}
.issue-count{color:var(--vscode-inputValidation-warningForeground,#cca700);font-size:11px;font-weight:600}
.tooltip-hint{cursor:help;font-size:11px;opacity:0.7}
.fix-btn{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;padding:3px 10px;border-radius:3px;cursor:pointer;font-size:11px;font-weight:600;white-space:nowrap}
.fix-btn:hover{background:var(--vscode-button-hoverBackground)}
.fix-all-btn{font-size:11px}
.open-doc-btn{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);font-size:11px}
.open-doc-btn:hover{background:var(--vscode-button-secondaryHoverBackground)}
.meta{padding:8px 16px;font-size:11px;color:var(--vscode-descriptionForeground);border-top:1px solid var(--vscode-panel-border);margin-top:12px}
#status-bar{padding:6px 16px;font-size:12px;background:var(--vscode-statusBar-background);color:var(--vscode-statusBar-foreground);border-top:1px solid var(--vscode-panel-border);display:none;position:fixed;bottom:0;left:0;right:0}
#status-bar.visible{display:block}
</style>
</head><body>
<div class="toolbar">
  <h2>Docs Manager — Sync Check</h2>
  <span class="pill pill-ok">✅ ${totalOk} clean</span>
  <span class="pill pill-err">⚠️ ${totalIssues} issue${totalIssues !== 1 ? 's' : ''}</span>
  <button class="rescan-btn" data-action="rescan">↺ Rescan</button>
</div>
<div class="content">
<table>
  <thead><tr><th></th><th>Project</th><th>Issues</th><th>Resolve</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="meta">
  Registry: <code>${esc(registry ? (registry as any).registryPath ?? REGISTRY_PATH : REGISTRY_PATH)}</code><br>
  Global docs: <code>${esc(registry.globalDocsPath)}</code><br>
  Projects checked: ${results.length}
</div>
</div>
<div id="status-bar"></div>
<script>
(function(){
'use strict';
const vscode = acquireVsCodeApi();
function showStatus(t){var b=document.getElementById('status-bar');b.textContent=t;b.className='visible';setTimeout(function(){b.className='';},3500);}
// rescan handled via data-action="rescan" delegation
document.addEventListener('click',function(e){
  var btn=e.target.closest('[data-action]');
  if(!btn){return;}
  var action=btn.dataset.action;
  var payload=btn.dataset.payload||'';
  var proj=btn.dataset.proj||'';
  var projpath=btn.dataset.projpath||'';
  showStatus('Working…');
  if(action==='openDoc'){vscode.postMessage({action:'openDoc',payload:payload});return;}
  vscode.postMessage({action:action,payload:payload,proj:proj,projpath:projpath});
});
window.addEventListener('message',function(e){
  var m=e.data;
  if(m.type==='done'){showStatus('✅ '+m.text);}
  if(m.type==='error'){showStatus('❌ '+m.text);}
});
})();
</script>
</body></html>`;
}

/** Check all registered projects for missing CLAUDE.md or copilot-rules reference. */
async function syncCheck(): Promise<void> {
    const registry = loadRegistry();
    if (!registry) { return; }

    const results: SyncResult[] = registry.projects.map(project => {
        if (!fs.existsSync(project.path)) {
            return { name: project.name, path: project.path, ok: false, issues: [] };
        }
        const issues = buildSyncIssues(project, registry.globalDocsPath);
        return { name: project.name, path: project.path, ok: issues.length === 0, issues };
    });

    const panel = vscode.window.createWebviewPanel(
        'docsSyncCheck', '🔍 Docs Sync Check', vscode.ViewColumn.Beside,
        { enableScripts: true, retainContextWhenHidden: true }
    );

    const GLOBAL_STANDARDS_REF = `\n\n---\n\n## Global Standards\n\nThese apply to ALL CieloVista projects:\n\n| Document | Location |\n|---|---|\n| Copilot Rules | \`${registry.globalDocsPath}\\copilot-rules.md\` |\n| JavaScript Standards | \`${registry.globalDocsPath}\\javascript_standards.md\` |\n| Git Workflow | \`${registry.globalDocsPath}\\git_workflow.md\` |\n| Web Component Guide | \`${registry.globalDocsPath}\\web_component_guide.md\` |\n| Project Registry | \`${REGISTRY_PATH}\` |\n`;

    panel.webview.html = buildSyncHtml(results, registry);
    panel.reveal(vscode.ViewColumn.Beside, true);

    panel.webview.onDidReceiveMessage(async msg => {
        const { action, payload, proj, projpath } = msg as { action: string; payload: string; proj: string; projpath: string };

        try {
            switch (action) {

                case 'openDoc': {
                    // payload = full path to a doc file
                    if (payload && fs.existsSync(payload)) {
                        const doc = await vscode.workspace.openTextDocument(payload);
                        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
                        panel.webview.postMessage({ type: 'done', text: `Opened ${path.basename(payload)}` });
                    } else {
                        panel.webview.postMessage({ type: 'error', text: 'File not found' });
                    }
                    break;
                }

                case 'rescan': {
                    const fresh = loadRegistry();
                    if (!fresh) { break; }
                    const freshResults = fresh.projects.map(p => {
                        const issues = fs.existsSync(p.path) ? buildSyncIssues(p, fresh.globalDocsPath) : [];
                        return { name: p.name, path: p.path, ok: issues.length === 0, issues };
                    });
                    panel.webview.html = buildSyncHtml(freshResults, fresh);
                    break;
                }

                case 'openRegistry': {
                    const doc = await vscode.workspace.openTextDocument(REGISTRY_PATH);
                    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
                    panel.webview.postMessage({ type: 'done', text: 'Registry opened' });
                    break;
                }

                case 'createClaude': {
                    // payload = full path to CLAUDE.md
                    if (!payload) { break; }
                    if (fs.existsSync(payload)) {
                        const doc = await vscode.workspace.openTextDocument(payload);
                        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
                        panel.webview.postMessage({ type: 'done', text: 'CLAUDE.md already exists — opened it' });
                        break;
                    }
                    const projectName = proj || path.basename(path.dirname(payload));
                    const buildBlock = '```powershell\n# TODO: add build command\n```';
                    const content = `# CLAUDE.md — ${projectName}\n\n## Session Start\n\n1. Read this file\n2. Read docs/_today/CURRENT-STATUS.md if it exists\n3. Start working — no questions\n\n## Project\n\n**Name:** ${projectName}\n**Location:** ${path.dirname(payload)}\n\n## Build\n\n${buildBlock}\n${GLOBAL_STANDARDS_REF}`;
                    fs.writeFileSync(payload, content, 'utf8');
                    log(FEATURE, `Created CLAUDE.md: ${payload}`);
                    const doc = await vscode.workspace.openTextDocument(payload);
                    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
                    panel.webview.postMessage({ type: 'done', text: `Created CLAUDE.md for ${projectName}` });
                    break;
                }

                case 'addGlobalRef': {
                    // payload = full path to CLAUDE.md
                    if (!payload || !fs.existsSync(payload)) {
                        // Create it first if missing
                        panel.webview.postMessage({ type: 'error', text: 'CLAUDE.md not found — create it first' });
                        break;
                    }
                    const existing = fs.readFileSync(payload, 'utf8');
                    if (existing.includes('CieloVistaStandards')) {
                        panel.webview.postMessage({ type: 'done', text: 'Reference already exists' });
                        break;
                    }
                    fs.writeFileSync(payload, existing.trimEnd() + GLOBAL_STANDARDS_REF, 'utf8');
                    log(FEATURE, `Added global standards reference: ${payload}`);
                    const doc = await vscode.workspace.openTextDocument(payload);
                    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
                    panel.webview.postMessage({ type: 'done', text: 'Global standards reference added' });
                    break;
                }

                case 'createDocsFolder': {
                    // payload = full path to docs/ folder
                    if (!payload) { break; }
                    if (!fs.existsSync(payload)) {
                        fs.mkdirSync(payload, { recursive: true });
                        log(FEATURE, `Created docs folder: ${payload}`);
                    }
                    const statusPath = path.join(payload, '_today');
                    if (!fs.existsSync(statusPath)) { fs.mkdirSync(statusPath, { recursive: true }); }
                    const statusFile = path.join(statusPath, 'CURRENT-STATUS.md');
                    if (!fs.existsSync(statusFile)) {
                        const pName = proj || path.basename(path.dirname(payload));
                        fs.writeFileSync(statusFile,
                            `# CURRENT-STATUS.md — ${pName}\n\n---\n\n## 🅿️ PARKING LOT\n\n**Last action:** Initial setup\n**Next step:** TODO\n`,
                            'utf8'
                        );
                    }
                    const doc = await vscode.workspace.openTextDocument(statusFile);
                    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
                    panel.webview.postMessage({ type: 'done', text: `Created docs/ folder and CURRENT-STATUS.md` });
                    break;
                }

                case 'fixAll': {
                    // Run all fixes for a project
                    if (!projpath) { break; }
                    const project = { name: proj, path: projpath, type: '', description: '' };
                    const fresh2 = loadRegistry();
                    if (!fresh2) { break; }
                    const issues = buildSyncIssues(project, fresh2.globalDocsPath);
                    let fixed = 0;
                    for (const issue of issues) {
                        const fakeMsg = { action: issue.fixAction, payload: issue.fixData, proj, projpath };
                        // Re-dispatch each fix
                        const claudePath2 = path.join(projpath, 'CLAUDE.md');
                        const docsDir2    = path.join(projpath, 'docs');
                        if (issue.fixAction === 'createClaude' && !fs.existsSync(claudePath2)) {
                            const content2 = `# CLAUDE.md — ${proj}\n\n## Session Start\n\n1. Read this file\n2. Start working\n\n## Project\n\n**Name:** ${proj}\n**Location:** ${projpath}\n${GLOBAL_STANDARDS_REF}`;
                            fs.writeFileSync(claudePath2, content2, 'utf8');
                            fixed++;
                        }
                        if (issue.fixAction === 'addGlobalRef' && fs.existsSync(claudePath2)) {
                            const c2 = fs.readFileSync(claudePath2, 'utf8');
                            if (!c2.includes('CieloVistaStandards')) {
                                fs.writeFileSync(claudePath2, c2.trimEnd() + GLOBAL_STANDARDS_REF, 'utf8');
                                fixed++;
                            }
                        }
                        if (issue.fixAction === 'createDocsFolder' && !fs.existsSync(docsDir2)) {
                            fs.mkdirSync(docsDir2, { recursive: true });
                            fixed++;
                        }
                    }
                    log(FEATURE, `Fixed ${fixed} issues for ${proj}`);
                    panel.webview.postMessage({ type: 'done', text: `Fixed ${fixed} issue${fixed !== 1 ? 's' : ''} in ${proj}` });
                    // Rescan
                    const fresh3 = loadRegistry();
                    if (fresh3) {
                        const r3 = fresh3.projects.map(p => {
                            const iss = fs.existsSync(p.path) ? buildSyncIssues(p, fresh3.globalDocsPath) : [];
                            return { name: p.name, path: p.path, ok: iss.length === 0, issues: iss };
                        });
                        panel.webview.html = buildSyncHtml(r3, fresh3);
                    }
                    break;
                }
            }
        } catch (err) {
            logError(`syncCheck fix failed: ${action}`, err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
            panel.webview.postMessage({ type: 'error', text: String(err) });
        }
    });

    log(FEATURE, `Sync check complete — ${registry.projects.length} projects checked`);
}

/** Open project-registry.json directly for manual editing. */
async function openRegistry(): Promise<void> {
    await openDoc(REGISTRY_PATH);
}

/** Add a new project to the registry interactively. */
async function addProject(): Promise<void> {
    const registry = loadRegistry();
    if (!registry) { return; }

    const name = await vscode.window.showInputBox({ prompt: 'Project name', placeHolder: 'my-project' });
    if (!name?.trim()) { return; }

    const picked = await vscode.window.showOpenDialog({
        canSelectFiles: false, canSelectFolders: true, canSelectMany: false,
        openLabel: 'Select Project Root Folder',
    });
    if (!picked?.[0]) { return; }

    const types = ['vscode-extension', 'dotnet-service', 'component-library', 'app', 'library', 'other'];
    const typePick = await vscode.window.showQuickPick(types, { placeHolder: 'Project type' });
    if (!typePick) { return; }

    const description = await vscode.window.showInputBox({ prompt: 'Short description', placeHolder: 'What does this project do?' });

    registry.projects.push({
        name: name.trim(),
        path: picked[0].fsPath,
        type: typePick,
        description: description?.trim() ?? '',
    });

    saveRegistry(registry);
    vscode.window.showInformationMessage(`Added project: ${name.trim()}`);
    log(FEATURE, `Added project to registry: ${name.trim()} @ ${picked[0].fsPath}`);
}

// ─── Activate ────────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
    log(FEATURE, 'Activating');

    // Listen for active editor changes to sync left panel highlight
    vscode.window.onDidChangeActiveTextEditor(editor => {
        if (!editor || !editor.document) return;
        const filePath = editor.document.fileName;
        // Try to get the catalog panel and post a highlight message
        const panel = getCatalogPanel && getCatalogPanel();
        if (panel) {
            panel.webview.postMessage({ type: 'highlight', filePath });
        }
    });

    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.docs.openGlobal',    openGlobalDoc),
        vscode.commands.registerCommand('cvs.docs.openProject',   openProjectDoc),
        vscode.commands.registerCommand('cvs.docs.newGlobal',     newGlobalDoc),
        vscode.commands.registerCommand('cvs.docs.newProjectDoc', newProjectDoc),
        vscode.commands.registerCommand('cvs.docs.searchAll',     searchAllDocs),
        vscode.commands.registerCommand('cvs.docs.syncCheck',     syncCheck),
        vscode.commands.registerCommand('cvs.docs.openRegistry',  openRegistry),
        vscode.commands.registerCommand('cvs.docs.addProject',    addProject),
    );
}

export function deactivate(): void { /* nothing to clean up */ }
