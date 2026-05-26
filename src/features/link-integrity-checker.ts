// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * link-integrity-checker.ts
 *
 * Scans every .md file across all registered projects and validates every
 * clickable link it contains:
 *
 *   • command: links  — ID must exist in package.json contributes.commands
 *   • relative paths  — target file must exist on disk
 *   • anchor links    — heading must exist in the target file
 *   • external URLs   — HEAD-checked (warn-only; network may be unavailable)
 *
 * Command: cvs.links.check
 */

import * as vscode from 'vscode';
import * as fs     from 'fs';
import * as path   from 'path';
import * as https  from 'https';
import * as http   from 'http';
import { log, logError } from '../shared/output-channel';
import { loadRegistry }  from '../shared/registry';

const FEATURE     = 'link-integrity-checker';
const COMMAND     = 'cvs.links.check';
const DATA_DIR    = path.join(__dirname, '..', 'data');
const REPORT_FILE = path.join(DATA_DIR, 'link-integrity.json');

// ─── Types ────────────────────────────────────────────────────────────────────

type LinkKind = 'command' | 'file' | 'anchor' | 'external';
type LinkStatus = 'ok' | 'broken' | 'warn';

interface LinkResult {
    sourceFile: string;
    text:       string;
    href:       string;
    kind:       LinkKind;
    status:     LinkStatus;
    message:    string;
}

// ─── Link extraction ──────────────────────────────────────────────────────────

const MD_LINK_RE = /\[([^\]]*)\]\(([^)]+)\)/g;

function extractLinks(content: string): Array<{ text: string; href: string }> {
    const links: Array<{ text: string; href: string }> = [];
    let m: RegExpExecArray | null;
    MD_LINK_RE.lastIndex = 0;
    while ((m = MD_LINK_RE.exec(content)) !== null) {
        links.push({ text: m[1], href: m[2].trim() });
    }
    return links;
}

function classifyHref(href: string): LinkKind {
    if (href.startsWith('command:'))           { return 'command'; }
    if (/^https?:\/\//i.test(href))            { return 'external'; }
    if (href.startsWith('#'))                  { return 'anchor'; }
    return 'file';
}

// ─── Validators ───────────────────────────────────────────────────────────────

function validateCommandLink(href: string, commandIds: Set<string>): LinkResult['message'] | null {
    const id = href.replace(/^command:/, '').split('?')[0].trim();
    return commandIds.has(id) ? null : `Command ID '${id}' not found in package.json contributes.commands`;
}

function validateFileLink(href: string, sourceDir: string): LinkResult['message'] | null {
    const filePart = href.split('#')[0];
    if (!filePart) { return null; } // pure anchor on same file
    const resolved = path.resolve(sourceDir, filePart);
    return fs.existsSync(resolved) ? null : `File not found: ${resolved}`;
}

function extractHeadings(content: string): Set<string> {
    const headings = new Set<string>();
    for (const line of content.split('\n')) {
        const m = /^#{1,6}\s+(.+)$/.exec(line.trim());
        if (m) {
            // GitHub/VS Code heading anchor: lowercase, spaces→hyphens, strip punctuation
            const anchor = m[1].toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
            headings.add(anchor);
        }
    }
    return headings;
}

function validateAnchorLink(href: string, sourceFile: string): LinkResult['message'] | null {
    const [filePart, anchorPart] = href.split('#');
    const anchor = (anchorPart ?? '').toLowerCase().trim();
    if (!anchor) { return null; }

    let targetFile = sourceFile;
    if (filePart) {
        targetFile = path.resolve(path.dirname(sourceFile), filePart);
        if (!fs.existsSync(targetFile)) {
            return `Target file not found: ${targetFile}`;
        }
    }

    try {
        const content = fs.readFileSync(targetFile, 'utf8');
        const headings = extractHeadings(content);
        return headings.has(anchor) ? null : `Anchor '#${anchor}' not found in ${path.basename(targetFile)}`;
    } catch {
        return `Could not read target file: ${targetFile}`;
    }
}

function headCheck(url: string): Promise<{ ok: boolean; status: number }> {
    return new Promise(resolve => {
        const mod = url.startsWith('https') ? https : http;
        try {
            const req = mod.request(url, { method: 'HEAD', timeout: 5000 }, res => {
                resolve({ ok: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 400, status: res.statusCode ?? 0 });
                res.resume();
            });
            req.on('error', () => resolve({ ok: false, status: 0 }));
            req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 0 }); });
            req.end();
        } catch {
            resolve({ ok: false, status: 0 });
        }
    });
}

// ─── Scanner ──────────────────────────────────────────────────────────────────

function collectMdFiles(roots: string[]): string[] {
    const files: string[] = [];
    const excluded = new Set(['node_modules', '.git', '.claude', 'out', 'dist', 'playwright-report', 'test-results']);

    function walk(dir: string) {
        let entries: fs.Dirent[];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
        catch { return; }
        for (const e of entries) {
            if (excluded.has(e.name)) { continue; }
            const full = path.join(dir, e.name);
            if (e.isDirectory()) { walk(full); }
            else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) { files.push(full); }
        }
    }

    for (const r of roots) {
        if (fs.existsSync(r)) { walk(r); }
    }
    return files;
}

async function scanLinks(
    roots: string[],
    commandIds: Set<string>,
    progress: vscode.Progress<{ message?: string; increment?: number }>,
    token: vscode.CancellationToken
): Promise<LinkResult[]> {

    const mdFiles = collectMdFiles(roots);
    log(FEATURE, `Scanning ${mdFiles.length} .md files across ${roots.length} root(s)`);

    const results: LinkResult[] = [];
    const step = mdFiles.length > 0 ? 100 / mdFiles.length : 100;

    for (let i = 0; i < mdFiles.length; i++) {
        if (token.isCancellationRequested) { break; }
        const filePath = mdFiles[i];
        progress.report({ message: `(${i + 1}/${mdFiles.length}) ${path.basename(filePath)}`, increment: step });

        let content: string;
        try { content = fs.readFileSync(filePath, 'utf8'); }
        catch { continue; }

        const links = extractLinks(content);
        for (const { text, href } of links) {
            if (token.isCancellationRequested) { break; }
            const kind = classifyHref(href);
            let status: LinkStatus = 'ok';
            let message = '';

            if (kind === 'command') {
                const err = validateCommandLink(href, commandIds);
                if (err) { status = 'broken'; message = err; }
                else { message = 'Command ID verified in package.json'; }

            } else if (kind === 'file') {
                const err = validateFileLink(href, path.dirname(filePath));
                if (err) { status = 'broken'; message = err; }
                else { message = 'File exists'; }

            } else if (kind === 'anchor') {
                const err = validateAnchorLink(href, filePath);
                if (err) { status = 'broken'; message = err; }
                else { message = 'Anchor found'; }

            } else if (kind === 'external') {
                const { ok, status: httpStatus } = await headCheck(href);
                if (!ok) {
                    status = 'warn';
                    message = httpStatus > 0 ? `HTTP ${httpStatus}` : 'Unreachable (timeout/network)';
                } else {
                    message = `HTTP ${httpStatus}`;
                }
            }

            results.push({ sourceFile: filePath, text, href, kind, status, message });
        }
    }

    return results;
}

// ─── Report webview ───────────────────────────────────────────────────────────

function buildReportHtml(results: LinkResult[], roots: string[], reportFile?: string): string {
    const broken   = results.filter(r => r.status === 'broken');
    const warned   = results.filter(r => r.status === 'warn');
    const ok       = results.filter(r => r.status === 'ok');
    const wsRoot   = roots[0] ?? '';

    function relPath(p: string): string {
        try { return path.relative(wsRoot, p).replace(/\\/g, '/'); }
        catch { return p; }
    }

    function renderRows(rows: LinkResult[], cls: string): string {
        return rows.map(r => `
            <tr class="${cls}">
                <td class="cell-file" title="${r.sourceFile}">${relPath(r.sourceFile)}</td>
                <td class="cell-href" title="${r.href}">${r.href.length > 60 ? r.href.slice(0, 57) + '…' : r.href}</td>
                <td class="cell-kind"><span class="badge badge-${r.kind}">${r.kind}</span></td>
                <td class="cell-msg">${r.message}</td>
            </tr>`).join('');
    }

    const reportBar = reportFile
        ? `<div class="report-bar">
  <span class="report-path" title="${reportFile}">&#128190; ${reportFile}</span>
  <button class="btn-open-report" id="btn-open-report">&#128196; Open Report File</button>
</div>`
        : '';

    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);font-size:12px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);padding:16px}
h1{font-size:15px;font-weight:700;margin-bottom:12px}
h2{font-size:13px;font-weight:600;margin:20px 0 8px}
.summary{display:flex;gap:16px;margin-bottom:12px;flex-wrap:wrap;align-items:center}
.pill{padding:4px 14px;border-radius:12px;font-size:12px;font-weight:600}
.pill-broken{background:rgba(248,81,73,.2);color:#f85149}
.pill-warn{background:rgba(204,167,0,.2);color:#cca700}
.pill-ok{background:rgba(63,185,80,.2);color:#3fb950}
.report-bar{display:flex;align-items:center;gap:10px;padding:6px 0;margin-bottom:16px;border-top:1px solid var(--vscode-panel-border)}
.report-path{font-family:var(--vscode-editor-font-family,monospace);font-size:10px;color:var(--vscode-descriptionForeground);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.btn-open-report{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;padding:3px 10px;border-radius:3px;cursor:pointer;font-size:11px;white-space:nowrap;flex-shrink:0}
.btn-open-report:hover{background:var(--vscode-button-secondaryHoverBackground)}
table{width:100%;border-collapse:collapse;font-size:11px}
th{text-align:left;padding:4px 8px;border-bottom:1px solid var(--vscode-panel-border);color:var(--vscode-descriptionForeground);font-weight:600}
td{padding:4px 8px;border-bottom:1px solid var(--vscode-panel-border,#333);vertical-align:top;word-break:break-all}
tr.broken td:first-child{border-left:3px solid #f85149}
tr.warn td:first-child{border-left:3px solid #cca700}
tr.ok td:first-child{border-left:3px solid #3fb950}
.cell-file{color:var(--vscode-textLink-foreground);min-width:200px}
.cell-href{font-family:monospace;color:var(--vscode-editor-foreground)}
.cell-kind{white-space:nowrap}
.badge{font-size:10px;padding:1px 6px;border-radius:8px;font-weight:600;text-transform:uppercase}
.badge-command{background:rgba(88,166,255,.15);color:#58a6ff}
.badge-file{background:rgba(63,185,80,.15);color:#3fb950}
.badge-anchor{background:rgba(204,167,0,.15);color:#cca700}
.badge-external{background:rgba(139,148,158,.15);color:#8b949e}
.empty{color:var(--vscode-descriptionForeground);font-style:italic;padding:8px 0}
</style></head><body>
<h1>&#128279; Link Integrity Report</h1>
<div class="summary">
  <span class="pill pill-broken">&#10060; ${broken.length} broken</span>
  <span class="pill pill-warn">&#9888; ${warned.length} warnings</span>
  <span class="pill pill-ok">&#10003; ${ok.length} ok</span>
  <span style="color:var(--vscode-descriptionForeground)">${results.length} links checked across ${roots.length} root(s)</span>
</div>
${reportBar}

${broken.length > 0 ? `
<h2>❌ Broken Links</h2>
<table><thead><tr><th>Source file</th><th>Link href</th><th>Kind</th><th>Issue</th></tr></thead>
<tbody>${renderRows(broken, 'broken')}</tbody></table>` : '<p class="empty">No broken links found.</p>'}

${warned.length > 0 ? `
<h2>⚠ External URL Warnings</h2>
<table><thead><tr><th>Source file</th><th>URL</th><th>Kind</th><th>HTTP Status</th></tr></thead>
<tbody>${renderRows(warned, 'warn')}</tbody></table>` : ''}

${ok.length > 0 ? `
<h2>&#10003; Verified Links (${ok.length})</h2>
<table><thead><tr><th>Source file</th><th>Link href</th><th>Kind</th><th>Note</th></tr></thead>
<tbody>${renderRows(ok, 'ok')}</tbody></table>` : ''}
${reportFile ? `<script>(function(){
    var vscode = acquireVsCodeApi();
    var btn = document.getElementById('btn-open-report');
    if (btn) { btn.addEventListener('click', function() { vscode.postMessage({ command: 'open-report' }); }); }
})();</script>` : ''}
</body></html>`;
}

// ─── Command handler ──────────────────────────────────────────────────────────

async function checkLinks(): Promise<void> {
    const registry = loadRegistry();
    const roots: string[] = [];

    if (registry) {
        if (registry.globalDocsPath && fs.existsSync(registry.globalDocsPath)) {
            roots.push(registry.globalDocsPath);
        }
        for (const p of registry.projects) {
            if (fs.existsSync(p.path)) { roots.push(p.path); }
        }
    }

    // Also include current workspace
    for (const wf of vscode.workspace.workspaceFolders ?? []) {
        if (!roots.includes(wf.uri.fsPath)) { roots.push(wf.uri.fsPath); }
    }

    if (roots.length === 0) {
        vscode.window.showWarningMessage('Link Integrity: no project roots found.');
        return;
    }

    // Load command IDs from package.json
    const pkgPath = path.join(__dirname, '../../package.json');
    let commandIds = new Set<string>();
    try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        for (const c of (pkg.contributes?.commands ?? [])) {
            commandIds.add(c.command);
        }
    } catch (err) {
        logError('Failed to load package.json for command ID validation', err instanceof Error ? (err.stack ?? String(err)) : String(err), FEATURE);
    }

    log(FEATURE, `Starting link integrity scan — ${roots.length} root(s), ${commandIds.size} known commands`);

    const results = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Link Integrity — scanning…',
        cancellable: true,
    }, async (progress, token) => {
        return scanLinks(roots, commandIds, progress, token);
    });

    const broken = results.filter(r => r.status === 'broken').length;
    const warned = results.filter(r => r.status === 'warn').length;
    log(FEATURE, `Scan complete — ${results.length} links: ${broken} broken, ${warned} warnings`);

    // Save report to data/link-integrity.json
    let savedReportFile: string | undefined;
    try {
        if (!fs.existsSync(DATA_DIR)) { fs.mkdirSync(DATA_DIR, { recursive: true }); }
        const report = {
            scannedAt:   new Date().toISOString(),
            roots,
            totalLinks:  results.length,
            broken:      broken,
            warnings:    warned,
            results,
        };
        fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), 'utf8');
        savedReportFile = REPORT_FILE;
        log(FEATURE, `Report saved: ${REPORT_FILE}`);
    } catch (e) {
        logError('Failed to save link integrity report', e instanceof Error ? (e.stack ?? String(e)) : String(e), FEATURE);
    }

    const panel = vscode.window.createWebviewPanel(
        'cvsLinkIntegrity',
        '🔗 Link Integrity',
        { viewColumn: vscode.ViewColumn.One, preserveFocus: false },
        { enableScripts: !!savedReportFile, retainContextWhenHidden: true }
    );
    panel.webview.html = buildReportHtml(results, roots, savedReportFile);

    if (savedReportFile) {
        panel.webview.onDidReceiveMessage(async msg => {
            if (msg.command === 'open-report') {
                try {
                    const doc = await vscode.workspace.openTextDocument(REPORT_FILE);
                    await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preview: true });
                } catch (e) {
                    logError('Failed to open report file', e instanceof Error ? (e.stack ?? String(e)) : String(e), FEATURE);
                }
            }
        });
    }
}

// ─── Activate / Deactivate ────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMAND, checkLinks)
    );
    log(FEATURE, 'activated');
}

export function deactivate(): void { /* nothing to clean up */ }
