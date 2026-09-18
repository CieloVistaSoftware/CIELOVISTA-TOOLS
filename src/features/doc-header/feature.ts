// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

// component: cat

/**
 * doc-header.ts
 *
 * Adds and maintains the frontmatter header of every .md file across all
 * registered CieloVista projects.
 *
 * THE CONTRACT (#707, #708, #730) -- three fields, at the top:
 *
 *   ---
 *   id: regression-log
 *   title: Regression Log
 *   description: What each REG-NNN test guards and why it exists.
 *   ---
 *
 * Reading, judging and rewriting headers all go through
 * src/shared/doc-frontmatter.ts. Until #730 this file had its own parser and
 * wrote the retired 13-field block (category, relativePath, created, updated,
 * version, author, status, tags...). Its trailer parser also matched from the
 * FIRST --- line in a document, so "fixing" a doc with a horizontal rule kept
 * only the text above the rule. A fix now keeps the body byte for byte.
 *
 * Commands registered:
 *   cvs.headers.fixAll    — add/update headers across all docs (with confirmation)
 *   cvs.headers.fixOne    — pick a project and fix its docs
 *   cvs.headers.fixFile   — fix the currently open file
 *   cvs.headers.viewStandard — show the frontmatter standard
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { log, logError } from '../../shared/output-channel';
import { esc } from '../../shared/webview-utils';
import { readFrontmatter, contractViolations, toContract } from '../../shared/doc-frontmatter';
import { walkDocTree } from '../../shared/doc-collector';

const FEATURE       = 'doc-header';
const GLOBAL_DOCS   = path.join(os.homedir(), 'Downloads', 'CieloVistaStandards');
const REGISTRY_PATH = path.join(GLOBAL_DOCS, 'project-registry.json');

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface DocHeaderReport {
    filePath:    string;
    relativePath: string;
    projectName: string;
    hasFrontmatter: boolean;
    /** Everything wrong under the three-field contract; empty when compliant. */
    missingFields:  string[];
    currentFm:      Record<string, string>;
}

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

// ─── Paths ────────────────────────────────────────────────────────────────────

/** Returns forward-slash relative path from projectRoot to filePath. */
function toRelativePath(filePath: string, projectRoot: string): string {
    return path.relative(projectRoot, filePath).replace(/\\/g, '/');
}

// ─── Scanner ──────────────────────────────────────────────────────────────────

function scanDirectory(rootPath: string, projectName: string, projectRoot: string, maxDepth = 4): DocHeaderReport[] {
    const results: DocHeaderReport[] = [];
    for (const fullPath of walkDocTree(rootPath, { maxDepth })) {
        try {
            const content   = fs.readFileSync(fullPath, 'utf8');
            const parsed    = readFrontmatter(content);
            results.push({
                filePath:       fullPath,
                relativePath:   toRelativePath(fullPath, projectRoot),
                projectName,
                hasFrontmatter: parsed.placement !== 'none',
                missingFields:  contractViolations(content).filter(v => v !== 'no frontmatter'),
                currentFm:      parsed.fields,
            });
        } catch { /* skip */ }
    }
    return results;
}

// ─── Apply header to a single file ───────────────────────────────────────────

function applyHeader(filePath: string): boolean {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const fixed   = toContract(content, path.basename(filePath));
        if (fixed !== content) { fs.writeFileSync(filePath, fixed, 'utf8'); }
        return true;
    } catch (err) {
        logError(`Failed to apply header to ${filePath}`, err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
        return false;
    }
}

// ─── HTML report builder ──────────────────────────────────────────────────────

function buildReportHtml(reports: DocHeaderReport[], registry: ProjectRegistry): string {
    const total      = reports.length;
    const perfect    = reports.filter(r => r.hasFrontmatter && r.missingFields.length === 0).length;
    const partial    = reports.filter(r => r.hasFrontmatter && r.missingFields.length > 0).length;
    const missing    = reports.filter(r => !r.hasFrontmatter).length;

    // Group by project
    const byProject = new Map<string, DocHeaderReport[]>();
    for (const r of reports) {
        if (!byProject.has(r.projectName)) { byProject.set(r.projectName, []); }
        byProject.get(r.projectName)!.push(r);
    }

    const projectSections = [...byProject.entries()].map(([projName, projReports]) => {
        const projMissing = projReports.filter(r => !r.hasFrontmatter).length;
        const projPartial = projReports.filter(r => r.hasFrontmatter && r.missingFields.length > 0).length;

        const rows = projReports.map(r => {
            const statusIcon = !r.hasFrontmatter
                ? '<span class="badge badge-err">No header</span>'
                : r.missingFields.length > 0
                    ? `<span class="badge badge-warn">${r.missingFields.length} problem(s)</span>`
                    : '<span class="badge badge-ok">✅ Complete</span>';

            const missingHtml = r.missingFields.length
                ? `<div class="missing-fields">${r.missingFields.map(f => `<code>${esc(f)}</code>`).join(' ')}</div>`
                : '';

            return `<tr>
  <td><button class="open-btn" data-action="open" data-path="${esc(r.filePath)}">${esc(r.relativePath)}</button></td>
  <td>${statusIcon}</td>
  <td>${missingHtml}</td>
  <td>
    <button class="fix-btn" data-action="fix-file" data-path="${esc(r.filePath)}" data-proj="${esc(r.projectName)}" data-root="${esc(registry.projects.find(p => p.name === r.projectName)?.path ?? GLOBAL_DOCS)}">Fix</button>
  </td>
</tr>`;
        }).join('');

        return `<section class="proj-section">
  <h2 class="proj-heading">
    ${esc(projName)}
    <span class="proj-stats">
      ${projMissing ? `<span class="badge badge-err">${projMissing} missing</span>` : ''}
      ${projPartial ? `<span class="badge badge-warn">${projPartial} partial</span>` : ''}
      ${!projMissing && !projPartial ? '<span class="badge badge-ok">All complete</span>' : ''}
    </span>
    <button class="btn-primary sm" data-action="fix-project" data-proj="${esc(projName)}">Fix All in Project</button>
  </h2>
  <table>
    <thead><tr><th>File</th><th>Status</th><th>Problems</th><th></th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</section>`;
    }).join('');

    return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);font-size:13px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background)}
#toolbar{position:sticky;top:0;background:var(--vscode-editor-background);border-bottom:1px solid var(--vscode-panel-border);padding:10px 16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;z-index:10}
#toolbar h1{font-size:1.1em;font-weight:700}
.pills{display:flex;gap:8px;flex-wrap:wrap}
.pill{padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;border:1px solid}
.pill-ok{color:var(--vscode-testing-iconPassed);border-color:var(--vscode-testing-iconPassed)}
.pill-warn{color:var(--vscode-inputValidation-warningForeground);border-color:var(--vscode-inputValidation-warningForeground)}
.pill-err{color:var(--vscode-inputValidation-errorForeground);border-color:var(--vscode-inputValidation-errorForeground)}
.btn-primary{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;padding:5px 14px;border-radius:3px;cursor:pointer;font-size:12px;font-weight:600}
.btn-primary:hover{background:var(--vscode-button-hoverBackground)}
.btn-primary.sm{padding:3px 10px;font-size:11px}
.btn-secondary{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;padding:5px 12px;border-radius:3px;cursor:pointer;font-size:12px}
.btn-secondary:hover{background:var(--vscode-button-secondaryHoverBackground)}
#content{padding:12px 16px}
.proj-section{margin-bottom:28px}
.proj-heading{font-size:0.95em;font-weight:700;border-bottom:2px solid var(--vscode-focusBorder);padding-bottom:5px;margin-bottom:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.proj-stats{display:flex;gap:4px;flex:1}
table{width:100%;border-collapse:collapse;font-size:12px}
th{text-align:left;padding:5px 8px;background:var(--vscode-textCodeBlock-background);border-bottom:1px solid var(--vscode-panel-border);font-weight:600;white-space:nowrap}
td{padding:5px 8px;border-bottom:1px solid var(--vscode-panel-border);vertical-align:middle}
tr:hover td{background:var(--vscode-list-hoverBackground)}
.badge{font-size:10px;padding:1px 7px;border-radius:10px;font-weight:600;white-space:nowrap}
.badge-ok{background:rgba(0,180,0,0.15);color:var(--vscode-testing-iconPassed)}
.badge-warn{background:rgba(255,180,0,0.15);color:var(--vscode-inputValidation-warningForeground)}
.badge-err{background:rgba(255,60,60,0.15);color:var(--vscode-inputValidation-errorForeground)}
.open-btn{background:none;border:none;color:var(--vscode-textLink-foreground);cursor:pointer;font-size:11px;font-family:var(--vscode-editor-font-family);text-decoration:underline;padding:0;text-align:left}
.fix-btn{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;padding:2px 8px;border-radius:2px;cursor:pointer;font-size:11px}
.fix-btn:hover{background:var(--vscode-button-secondaryHoverBackground)}
.missing-fields{display:flex;flex-wrap:wrap;gap:3px}
.missing-fields code{font-size:10px;padding:1px 5px;border-radius:2px;background:var(--vscode-textCodeBlock-background);color:var(--vscode-inputValidation-warningForeground)}
#status{padding:7px 16px;font-size:12px;border-left:3px solid var(--vscode-focusBorder);background:var(--vscode-textCodeBlock-background);margin:8px 16px;border-radius:2px;display:none}
#status.visible{display:block}
</style>
</head><body>
<div id="toolbar">
  <h1>📝 Doc Header Compliance</h1>
  <div class="pills">
    <span class="pill pill-ok">✅ ${perfect} complete</span>
    <span class="pill pill-warn">⚠️ ${partial} partial</span>
    <span class="pill pill-err">❌ ${missing} no header</span>
    <span class="pill pill-ok" style="border-color:var(--vscode-descriptionForeground);color:var(--vscode-descriptionForeground)">${total} total</span>
  </div>
  <button class="btn-primary" data-action="fix-all">📝 Add/Fix All Headers</button>
  <button class="btn-secondary" data-action="rescan">↺ Rescan</button>
</div>
<div id="status"></div>
<div id="content">${projectSections}</div>

<script>
const vscode = acquireVsCodeApi();

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) { return; }
  const action = btn.dataset.action;

  if (action === 'fix-all') {
    setStatus('📝 Adding/updating headers across all docs…');
    vscode.postMessage({ command: 'fixAll' });
  }
  if (action === 'fix-project') {
    setStatus('📝 Fixing headers in ' + btn.dataset.proj + '…');
    vscode.postMessage({ command: 'fixProject', project: btn.dataset.proj });
  }
  if (action === 'fix-file') {
    vscode.postMessage({ command: 'fixFile', path: btn.dataset.path, project: btn.dataset.proj, root: btn.dataset.root });
    btn.textContent = '✅';
    btn.disabled = true;
  }
  if (action === 'open') {
    vscode.postMessage({ command: 'open', path: btn.dataset.path });
  }
  if (action === 'rescan') {
    setStatus('↺ Rescanning…');
    vscode.postMessage({ command: 'rescan' });
  }
});

window.addEventListener('message', e => {
  const msg = e.data;
  if (msg.type === 'done')  { setStatus('✅ ' + msg.text); }
  if (msg.type === 'error') { setStatus('❌ ' + msg.text); }
});

function setStatus(text) {
  const el = document.getElementById('status');
  el.textContent = text;
  el.className = 'visible';
}
</script>
</body></html>`;
}

// ─── Commands ─────────────────────────────────────────────────────────────────

let _panel: vscode.WebviewPanel | undefined;
let _allReports: DocHeaderReport[] = [];
let _registry: ProjectRegistry | undefined;

async function runScan(): Promise<void> {
    const registry = loadRegistry();
    if (!registry) { return; }
    _registry = registry;

    const reports: DocHeaderReport[] = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Scanning doc headers…', cancellable: false },
        async (progress) => {
            const all: DocHeaderReport[] = [];

            // Global docs
            progress.report({ message: 'Scanning global docs…' });
            all.push(...scanDirectory(registry.globalDocsPath, 'global', registry.globalDocsPath));

            // All registered projects
            for (const project of registry.projects) {
                progress.report({ message: `Scanning ${project.name}…` });
                if (fs.existsSync(project.path)) {
                    all.push(...scanDirectory(project.path, project.name, project.path));
                }
            }
            return all;
        }
    ) as DocHeaderReport[];

    _allReports = reports;

    const html = buildReportHtml(reports, registry);

    if (_panel) {
        _panel.webview.html = html;
        _panel.reveal();
    } else {
        _panel = vscode.window.createWebviewPanel(
            'docHeaders', '📝 Doc Headers', vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        _panel.webview.html = html;
        _panel.onDidDispose(() => { _panel = undefined; });
        // Register the message handler ONCE per panel lifetime.
        // Do NOT move this outside the else block — runScan() is called
        // repeatedly (after fix operations, rescan) and re-registering here
        // would stack duplicate listeners, opening N windows per click.
        _panel.webview.onDidReceiveMessage(async msg => {
            switch (msg.command) {
                case 'fixAll':     await fixAll();                                      break;
                case 'fixProject': await fixProject(msg.project);                       break;
                case 'fixFile':    await fixSingleFile(msg.path);                        break;
                case 'open':       await openFile(msg.path);                            break;
                case 'rescan':     await runScan();                                     break;
            }
        });
    }

    const noHeader = reports.filter(r => !r.hasFrontmatter).length;
    const partial  = reports.filter(r => r.hasFrontmatter && r.missingFields.length > 0).length;
    log(FEATURE, `Scan: ${reports.length} docs — ${noHeader} no header, ${partial} partial`);
}

async function fixAll(): Promise<void> {
    const registry = _registry ?? loadRegistry();
    if (!registry) { return; }

    const toFix = _allReports.filter(r => !r.hasFrontmatter || r.missingFields.length > 0);
    if (!toFix.length) {
        _panel?.webview.postMessage({ type: 'done', text: 'All headers are already complete.' });
        return;
    }

    const confirm = await vscode.window.showWarningMessage(
        `Rewrite the header of ${toFix.length} doc(s) to the three-field contract (id, title, description at the top)? ` +
        'Existing id/title/description are kept; every other header field is removed. The body is never touched.',
        { modal: true },
        'Fix All', 'Cancel'
    );
    if (confirm !== 'Fix All') { return; }

    let fixed = 0;
    for (const report of toFix) {
        if (applyHeader(report.filePath)) { fixed++; }
    }

    _panel?.webview.postMessage({ type: 'done', text: `Updated headers in ${fixed} of ${toFix.length} docs. Rescanning…` });
    require('../../shared/show-result-webview').showResultWebview(
        'Doc Headers Updated',
        'Fix All Doc Headers',
        0,
        `Doc headers updated: <b>${fixed}</b> files.`
    );
    await runScan();
}

async function fixProject(projectName: string): Promise<void> {
    const registry = _registry ?? loadRegistry();
    if (!registry) { return; }

    const toFix = _allReports.filter(r => r.projectName === projectName && (!r.hasFrontmatter || r.missingFields.length > 0));

    let fixed = 0;
    for (const report of toFix) {
        if (applyHeader(report.filePath)) { fixed++; }
    }

    _panel?.webview.postMessage({ type: 'done', text: `Fixed ${fixed} docs in ${projectName}. Rescanning…` });
    require('../../shared/show-result-webview').showResultWebview(
        'Project Doc Headers Updated',
        `Fix Headers in ${projectName}`,
        0,
        `Doc headers updated: <b>${fixed}</b> files in <b>${projectName}</b>.`
    );
    await runScan();
}

async function fixSingleFile(filePath: string): Promise<void> {
    if (applyHeader(filePath)) {
        log(FEATURE, `Header applied: ${filePath}`);
    }
}

async function openFile(filePath: string): Promise<void> {
    if (fs.existsSync(filePath)) {
        const doc = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
    }
}

/** Fix the currently open editor file. */
async function fixActiveFile(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !editor.document.fileName.endsWith('.md')) {
        vscode.window.showWarningMessage('Open a .md file first.');
        return;
    }

    const filePath = editor.document.fileName;

    await editor.document.save();
    if (applyHeader(filePath)) {
        require('../../shared/show-result-webview').showResultWebview(
            'Header Added/Updated',
            'Fix Header in Current File',
            0,
            `Header added/updated: <b>${path.basename(filePath)}</b>`
        );
        // Reload the document in the editor
        await vscode.commands.executeCommand('workbench.action.revertFile');
    }
}

// ─── Activate / Deactivate ────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
    log(FEATURE, 'Activating');

    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.headers.fixAll',       fixAll),
        vscode.commands.registerCommand('cvs.headers.fixOne', () => {
            // Open the scan panel webview — it shows per-project Fix buttons,
            // which is a richer experience than a plain quick-pick project list.
            void vscode.commands.executeCommand('cvs.headers.scan');
        }),
        vscode.commands.registerCommand('cvs.headers.fixFile',      fixActiveFile),
        vscode.commands.registerCommand('cvs.headers.viewStandard', () => {
            vscode.window.showInformationMessage(
                'Doc header standard: three fields at the top of the file: id, title, description. Nothing else is hand-written.',
                'Open Scan Panel'
            ).then(c => { if (c === 'Open Scan Panel') { runScan(); } });
        }),
    );
}

export function deactivate(): void {
    _panel?.dispose();
    _panel      = undefined;
    _allReports = [];
    _registry   = undefined;
}

/** @internal — exported for unit testing only */
export const _test = {
    scanDirectory,
    applyHeader,
    toRelativePath,
};
