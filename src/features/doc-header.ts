// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * doc-header.ts
 *
 * Adds and maintains YAML frontmatter headers in every .md file across
 * all registered CieloVista projects.
 *
 * FRONTMATTER STANDARD:
 * ---------------------
 * ---
 * title: Human-readable title
 * description: One sentence describing the doc.
 * project: project-name
 * category: 600 — Tools & Extensions
 * relativePath: src/features/doc-catalog.ts   ← relative to project root, forward slashes
 * created: YYYY-MM-DD
 * updated: YYYY-MM-DD
 * version: 1.0.0
 * author: CieloVista Software
 * status: active | draft | deprecated | archived
 * tags: [tag1, tag2, tag3]
 * ---
 *
 * Rules:
 * - NO absolute paths — relativePath only, always forward-slash normalized
 * - relativePath is relative to the project root (from registry)
 * - Global docs use relativePath relative to CieloVistaStandards folder
 * - auto-fill: title (from # heading), description (from first paragraph),
 *              project (from registry), category (from Dewey patterns),
 *              relativePath (computed), created (file mtime), updated (today)
 * - On subsequent runs: only UPDATE the `updated` field + add any missing fields
 *   Never overwrite user-edited fields like title, description, status, tags
 *
 * Commands registered:
 *   cvs.headers.scan      — scan all docs and show header compliance report
 *   cvs.headers.fixAll    — add/update headers across all docs (with confirmation)
 *   cvs.headers.fixOne    — pick a project and fix its docs
 *   cvs.headers.fixFile   — fix the currently open file
 *   cvs.headers.viewStandard — show the frontmatter standard
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { log, logError } from '../shared/output-channel';

const FEATURE       = 'doc-header';
const REGISTRY_PATH = 'C:\\Users\\jwpmi\\Downloads\\CieloVistaStandards\\project-registry.json';
const GLOBAL_DOCS   = 'C:\\Users\\jwpmi\\Downloads\\CieloVistaStandards';
const TODAY         = new Date().toISOString().slice(0, 10);

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

interface Frontmatter {
    title?:        string;
    description?:  string;
    project?:      string;
    category?:     string;
    relativePath?: string;
    created?:      string;
    updated?:      string;
    version?:      string;
    author?:       string;
    status?:       string;
    tags?:         string;
    [key: string]: string | undefined;
}

interface DocHeaderReport {
    filePath:    string;
    relativePath: string;
    projectName: string;
    hasFrontmatter: boolean;
    missingFields:  string[];
    currentFm:      Frontmatter;
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
        logError(FEATURE, 'Failed to load registry', err);
        return undefined;
    }
}

// ─── Frontmatter parser / serializer ─────────────────────────────────────────

/** Parses YAML frontmatter from a markdown string. Returns null if none found. */
function parseFrontmatter(content: string): { fm: Frontmatter; body: string } | null {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!match) { return null; }

    const fm: Frontmatter = {};
    for (const line of match[1].split('\n')) {
        const m = line.match(/^(\w+):\s*(.*)$/);
        if (m) { fm[m[1]] = m[2].trim(); }
    }
    return { fm, body: match[2] };
}

/** Serializes a Frontmatter object back to a YAML block. */
function serializeFrontmatter(fm: Frontmatter): string {
    const FIELD_ORDER = [
        'title', 'description', 'project', 'category',
        'relativePath', 'created', 'updated',
        'version', 'author', 'status', 'tags',
    ];

    const lines: string[] = ['---'];
    for (const key of FIELD_ORDER) {
        if (fm[key] !== undefined && fm[key] !== '') {
            lines.push(`${key}: ${fm[key]}`);
        }
    }
    // Any extra keys not in the standard order
    for (const key of Object.keys(fm)) {
        if (!FIELD_ORDER.includes(key) && fm[key] !== undefined) {
            lines.push(`${key}: ${fm[key]}`);
        }
    }
    lines.push('---');
    return lines.join('\n');
}

// ─── Category assignment (mirrors doc-catalog.ts logic) ──────────────────────

const CATEGORY_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /^audit-/i,          label: '900 — Audit & Reports' },
    { pattern: /consolidation-log/i,label: '900 — Audit & Reports' },
    { pattern: /^claude\.md$/i,      label: '000 — Meta / Session / Status' },
    { pattern: /current.?status/i,  label: '000 — Meta / Session / Status' },
    { pattern: /^session/i,          label: '000 — Meta / Session / Status' },
    { pattern: /tier1|tier2/i,       label: '100 — Architecture & Standards' },
    { pattern: /architectur/i,       label: '100 — Architecture & Standards' },
    { pattern: /standard/i,          label: '100 — Architecture & Standards' },
    { pattern: /laws?\.md$/i,        label: '100 — Architecture & Standards' },
    { pattern: /web.?component/i,    label: '200 — Component & UI Docs' },
    { pattern: /component/i,         label: '200 — Component & UI Docs' },
    { pattern: /git.?workflow/i,     label: '300 — Dev Workflow & Process' },
    { pattern: /workflow|deploy|build|release/i, label: '300 — Dev Workflow & Process' },
    { pattern: /changelog/i,         label: '300 — Dev Workflow & Process' },
    { pattern: /test|spec|quality|compliance/i,  label: '400 — Testing & Quality' },
    { pattern: /api|integration|trace|signalr/i, label: '500 — API & Integration' },
    { pattern: /vscode|extension|copilot|tool/i, label: '600 — Tools & Extensions' },
    { pattern: /readme|guide|how.?to|notes/i,    label: '700 — Project Docs' },
];

function assignCategory(fileName: string, projectName: string): string {
    if (projectName === 'global') {
        if (/^audit-/i.test(fileName) || /consolidation-log/i.test(fileName)) {
            return '900 — Audit & Reports';
        }
        return '800 — Global Standards';
    }
    for (const { pattern, label } of CATEGORY_PATTERNS) {
        if (pattern.test(fileName)) { return label; }
    }
    return '700 — Project Docs';
}

// ─── Content extractors ───────────────────────────────────────────────────────

function extractTitle(body: string, fileName: string): string {
    const h1 = body.match(/^#\s+(.+)$/m);
    if (h1) { return h1[1].trim().replace(/\*\*|__|\*|_|`/g, ''); }
    return fileName.replace(/\.md$/i, '').replace(/[-_.]/g, ' ');
}

function extractDescription(body: string): string {
    const lines = body.split('\n');
    const textLines: string[] = [];
    let pastHeading = false;

    for (const line of lines) {
        const t = line.trim();
        if (!t) { continue; }
        if (t.startsWith('#')) { if (pastHeading && textLines.length) { break; } pastHeading = true; continue; }
        if (t.startsWith('>') || t.startsWith('<!--') || t.startsWith('---') ||
            t.startsWith('|') || t.startsWith('```')) { continue; }
        textLines.push(t.replace(/\*\*|__|\*|_|`/g, ''));
        if (textLines.join(' ').length > 150) { break; }
    }

    const desc = textLines.join(' ').trim();
    return desc.length > 150 ? desc.slice(0, 147) + '…' : desc || 'No description.';
}

function extractTags(body: string, fileName: string): string {
    const tags = new Set<string>();
    fileName.replace(/\.md$/i, '').split(/[-_. ]+/).forEach(w => {
        if (w.length > 2) { tags.add(w.toLowerCase()); }
    });
    const headings = body.match(/^#{1,3}\s+(.+)$/gm) ?? [];
    for (const h of headings.slice(0, 3)) {
        h.replace(/^#+\s+/, '').split(/\s+/).forEach(w => {
            const c = w.replace(/[^a-z0-9]/gi, '').toLowerCase();
            if (c.length > 3) { tags.add(c); }
        });
    }
    const arr = [...tags].slice(0, 3);
    return `[${arr.join(', ')}]`;
}

function fileCreatedDate(filePath: string): string {
    try {
        return fs.statSync(filePath).birthtime.toISOString().slice(0, 10);
    } catch {
        return TODAY;
    }
}

// ─── Compute relative path ────────────────────────────────────────────────────

/** Returns forward-slash relative path from projectRoot to filePath. */
function toRelativePath(filePath: string, projectRoot: string): string {
    return path.relative(projectRoot, filePath).replace(/\\/g, '/');
}

// ─── Build the required frontmatter for a file ────────────────────────────────

function buildRequiredFrontmatter(
    filePath: string,
    projectName: string,
    projectRoot: string,
    existingFm: Frontmatter | null
): Frontmatter {
    let content = '';
    try { content = fs.readFileSync(filePath, 'utf8'); } catch { /* ignore */ }

    // Strip existing frontmatter for body analysis
    const parsed = parseFrontmatter(content);
    const body   = parsed ? parsed.body : content;
    const fileName = path.basename(filePath);

    const relPath = toRelativePath(filePath, projectRoot);

    // Fields we AUTO-set (not overwriting user values):
    const fm: Frontmatter = {
        title:        existingFm?.title        || extractTitle(body, fileName),
        description:  existingFm?.description  || extractDescription(body),
        project:      existingFm?.project      || projectName,
        category:     existingFm?.category     || assignCategory(fileName, projectName),
        relativePath: relPath,                   // always recompute — keep accurate
        created:      existingFm?.created      || fileCreatedDate(filePath),
        updated:      TODAY,                     // always refresh on fix
        version:      existingFm?.version      || '1.0.0',
        author:       existingFm?.author       || 'CieloVista Software',
        status:       existingFm?.status       || 'active',
        tags:         existingFm?.tags         || extractTags(body, fileName),
    };

    return fm;
}

// ─── Scanner ──────────────────────────────────────────────────────────────────

const REQUIRED_FIELDS = ['title', 'description', 'project', 'category', 'relativePath', 'created', 'updated', 'author', 'status', 'tags'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'out', 'dist', 'reports', '.vscode']);

function scanDirectory(rootPath: string, projectName: string, projectRoot: string, maxDepth = 4): DocHeaderReport[] {
    const results: DocHeaderReport[] = [];

    function walk(dir: string, depth: number): void {
        if (depth > maxDepth || !fs.existsSync(dir)) { return; }
        let entries: fs.Dirent[];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }

        for (const entry of entries) {
            if (SKIP_DIRS.has(entry.name)) { continue; }
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath, depth + 1);
            } else if (entry.isFile() && /\.md$/i.test(entry.name)) {
                try {
                    const content   = fs.readFileSync(fullPath, 'utf8');
                    const parsed    = parseFrontmatter(content);
                    const relPath   = toRelativePath(fullPath, projectRoot);
                    const fm        = parsed?.fm ?? {};
                    const missing   = REQUIRED_FIELDS.filter(f => !fm[f] || fm[f]!.trim() === '');

                    results.push({
                        filePath:       fullPath,
                        relativePath:   relPath,
                        projectName,
                        hasFrontmatter: !!parsed,
                        missingFields:  missing,
                        currentFm:      fm,
                    });
                } catch { /* skip */ }
            }
        }
    }

    walk(rootPath, 0);
    return results;
}

// ─── Apply header to a single file ───────────────────────────────────────────

function applyHeader(filePath: string, projectName: string, projectRoot: string): boolean {
    try {
        let content = fs.readFileSync(filePath, 'utf8');
        const parsed = parseFrontmatter(content);
        const existingFm = parsed?.fm ?? null;
        const body = parsed ? parsed.body : content;

        const fm = buildRequiredFrontmatter(filePath, projectName, projectRoot, existingFm);
        const newContent = serializeFrontmatter(fm) + '\n\n' + body.trimStart();

        fs.writeFileSync(filePath, newContent, 'utf8');
        return true;
    } catch (err) {
        logError(FEATURE, `Failed to apply header to ${filePath}`, err);
        return false;
    }
}

// ─── HTML report builder ──────────────────────────────────────────────────────

function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

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
                    ? `<span class="badge badge-warn">Partial (${r.missingFields.length} missing)</span>`
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
    <thead><tr><th>File</th><th>Status</th><th>Missing fields</th><th></th></tr></thead>
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
    }

    _panel.webview.onDidReceiveMessage(async msg => {
        switch (msg.command) {
            case 'fixAll':     await fixAll();                                      break;
            case 'fixProject': await fixProject(msg.project);                       break;
            case 'fixFile':    await fixSingleFile(msg.path, msg.project, msg.root);break;
            case 'open':       await openFile(msg.path);                            break;
            case 'rescan':     await runScan();                                     break;
        }
    });

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
        `Add/update headers in ${toFix.length} doc(s)? Existing content is never touched — only the frontmatter block is added or updated.`,
        { modal: true },
        'Fix All', 'Cancel'
    );
    if (confirm !== 'Fix All') { return; }

    let fixed = 0;
    for (const report of toFix) {
        const proj = registry.projects.find(p => p.name === report.projectName);
        const root = proj?.path ?? registry.globalDocsPath;
        if (applyHeader(report.filePath, report.projectName, root)) { fixed++; }
    }

    _panel?.webview.postMessage({ type: 'done', text: `Updated headers in ${fixed} of ${toFix.length} docs. Rescanning…` });
    require('../shared/show-result-webview').showResultWebview(
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

    const proj  = registry.projects.find(p => p.name === projectName);
    const root  = proj?.path ?? (projectName === 'global' ? registry.globalDocsPath : '');
    const toFix = _allReports.filter(r => r.projectName === projectName && (!r.hasFrontmatter || r.missingFields.length > 0));

    let fixed = 0;
    for (const report of toFix) {
        if (applyHeader(report.filePath, projectName, root)) { fixed++; }
    }

    _panel?.webview.postMessage({ type: 'done', text: `Fixed ${fixed} docs in ${projectName}. Rescanning…` });
    require('../shared/show-result-webview').showResultWebview(
        'Project Doc Headers Updated',
        `Fix Headers in ${projectName}`,
        0,
        `Doc headers updated: <b>${fixed}</b> files in <b>${projectName}</b>.`
    );
    await runScan();
}

async function fixSingleFile(filePath: string, projectName: string, projectRoot: string): Promise<void> {
    if (applyHeader(filePath, projectName, projectRoot)) {
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
    const registry = loadRegistry();
    if (!registry) { return; }

    // Find which project owns this file
    const proj = registry.projects.find(p => filePath.startsWith(p.path));
    const projectName = proj?.name ?? 'global';
    const projectRoot = proj?.path ?? registry.globalDocsPath;

    await editor.document.save();
    if (applyHeader(filePath, projectName, projectRoot)) {
        require('../shared/show-result-webview').showResultWebview(
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
        vscode.commands.registerCommand('cvs.headers.fixOne',       async () => {
            const registry = loadRegistry();
            if (!registry) { return; }
            const items = registry.projects
                .filter(p => fs.existsSync(p.path))
                .map(p => ({ label: `$(file-directory) ${p.name}`, description: p.type, name: p.name }));
            items.unshift({ label: '$(globe) global', description: 'CieloVistaStandards', name: 'global' });
            const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Pick a project to fix headers' });
            if (picked) { await fixProject(picked.name); }
        }),
        vscode.commands.registerCommand('cvs.headers.fixFile',      fixActiveFile),
        vscode.commands.registerCommand('cvs.headers.viewStandard', () => {
            vscode.window.showInformationMessage(
                'Frontmatter standard: title, description, project, category, relativePath, created, updated, version, author, status, tags',
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
