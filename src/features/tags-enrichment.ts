// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * tags-enrichment.ts
 *
 * Scans every .md file across all registered projects and enriches frontmatter
 * with derived tags — without overwriting human-authored tags.
 *
 * Commands registered:
 *   cvs.tags.enrich     — dry-run scan: shows what would change (read-only)
 *   cvs.tags.enrichAuto — apply: writes enriched tags back to files
 */

import * as vscode from 'vscode';
import * as fs     from 'fs';
import * as path   from 'path';
import { log, logError }              from '../shared/output-channel';
import { loadRegistry }               from '../shared/registry';
import { getLauncherTargetColumn }    from '../shared/panel-context';

const FEATURE = 'tags-enrichment';

// ─── Placeholders ─────────────────────────────────────────────────────────────

const PLACEHOLDERS = new Set([
    'tag1', 'tag2', 'tag3', 'tag4', 'tag5',
    'placeholder', 'todo', 'fixme', 'tbd',
]);

// ─── Stop words ───────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
    'the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was',
]);

// ─── Walk directories ─────────────────────────────────────────────────────────

const SKIP_DIRS = new Set(['node_modules', '.git', '.claude', 'out']);

function* walkMdFiles(root: string, depth = 0): Generator<string> {
    if (depth > 5) { return; }
    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
        return;
    }
    for (const entry of entries) {
        const full = path.join(root, entry.name);
        if (entry.isDirectory()) {
            if (!SKIP_DIRS.has(entry.name)) {
                yield* walkMdFiles(full, depth + 1);
            }
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
            yield full;
        }
    }
}

// ─── Frontmatter parsing ──────────────────────────────────────────────────────

function parseFmBlock(block: string): Record<string, unknown> {
    const fm: Record<string, unknown> = {};
    for (const line of block.split('\n')) {
        const kv = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)\s*$/);
        if (!kv) { continue; }
        const val = kv[2].trim();
        if (val.startsWith('[') && val.endsWith(']')) {
            fm[kv[1]] = val.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
        } else {
            fm[kv[1]] = val.replace(/^['"]|['"]$/g, '');
        }
    }
    return fm;
}

function parseFrontmatter(content: string): { fm: Record<string, unknown>; fmBlock: string; body: string; position: 'top' | 'bottom' } | null {
    const topMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)([\s\S]*)$/);
    if (topMatch) { return { fm: parseFmBlock(topMatch[1]), fmBlock: topMatch[1], body: topMatch[3], position: 'top' }; }
    const botMatch = content.match(/^([\s\S]+?)\n---\r?\n([\s\S]*?)\r?\n---\s*$/);
    if (botMatch) { return { fm: parseFmBlock(botMatch[2]), fmBlock: botMatch[2], body: botMatch[1], position: 'bottom' }; }
    return null;
}

// ─── Frontmatter serialization ────────────────────────────────────────────────

function serializeFm(fm: Record<string, unknown>): string {
    const lines: string[] = [];
    for (const [k, v] of Object.entries(fm)) {
        if (Array.isArray(v)) {
            lines.push(`${k}: [${(v as string[]).join(', ')}]`);
        } else {
            lines.push(`${k}: ${v}`);
        }
    }
    return lines.join('\n');
}

// ─── Tag derivation ───────────────────────────────────────────────────────────

function tokenize(str: string): string[] {
    return str
        .split(/[\s\-_/\\]+/)
        .map(w => w.toLowerCase().replace(/[^a-z0-9]/g, ''))
        .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

function deriveTags(fm: Record<string, unknown>, filePath: string): string[] {
    const candidates = new Set<string>();

    // 1. title field — split on spaces/hyphens, filter > 2 chars, lowercase
    const title = fm['title'];
    if (typeof title === 'string' && title) {
        for (const t of tokenize(title)) { candidates.add(t); }
    }

    // 2. description field — first 10 words, filter > 2 chars, lowercase
    const desc = fm['description'];
    if (typeof desc === 'string' && desc) {
        const words = tokenize(desc).slice(0, 10);
        for (const w of words) { candidates.add(w); }
    }

    // 3. category field — take the word after "—" if present, split, lowercase
    const cat = fm['category'];
    if (typeof cat === 'string' && cat) {
        const afterDash = cat.includes('—') ? cat.split('—').slice(1).join('—') : cat;
        for (const t of tokenize(afterDash)) { candidates.add(t); }
    }

    // 4. project field — split on hyphens, filter > 2 chars
    const proj = fm['project'];
    if (typeof proj === 'string' && proj) {
        for (const t of tokenize(proj)) { candidates.add(t); }
    }

    // 5. File path — parent directory name + file basename (no .md/.README)
    const dir  = path.basename(path.dirname(filePath));
    const base = path.basename(filePath, '.md').replace(/\.README$/i, '');
    for (const t of tokenize(dir))  { candidates.add(t); }
    for (const t of tokenize(base)) { candidates.add(t); }

    // 6. Sort and return
    return [...candidates].sort();
}

// ─── Enrich file ──────────────────────────────────────────────────────────────

interface EnrichResult {
    path:     string;
    changed:  boolean;
    added:    string[];
    existing: string[];
    error?:   string;
}

function enrichFile(filePath: string, dryRun: boolean): EnrichResult {
    let content: string;
    try {
        content = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
        return { path: filePath, changed: false, added: [], existing: [], error: err instanceof Error ? (err.stack ?? String(err)) : String(err) };
    }

    const parsed = parseFrontmatter(content);
    if (!parsed) {
        return { path: filePath, changed: false, added: [], existing: [] };
    }

    const { fm, body, position } = parsed;

    // Gather existing non-placeholder tags
    const rawTags = fm['tags'];
    let existingTags: string[];
    if (Array.isArray(rawTags)) {
        existingTags = (rawTags as unknown[]).map(String).filter(t => !PLACEHOLDERS.has(t.toLowerCase()));
    } else if (typeof rawTags === 'string' && rawTags) {
        existingTags = [rawTags].filter(t => !PLACEHOLDERS.has(t.toLowerCase()));
    } else {
        existingTags = [];
    }

    const existingSet = new Set(existingTags.map(t => t.toLowerCase()));

    // Derive candidate tags
    const derived = deriveTags(fm, filePath);
    const toAdd   = derived.filter(t => !existingSet.has(t) && !PLACEHOLDERS.has(t));

    if (toAdd.length === 0) {
        return { path: filePath, changed: false, added: [], existing: existingTags };
    }

    if (dryRun) {
        return { path: filePath, changed: true, added: toAdd, existing: existingTags };
    }

    // Apply — merge and write back
    const mergedTags = [...existingTags, ...toAdd].sort();
    const newFm      = { ...fm, tags: mergedTags };
    const newFmBlock = serializeFm(newFm);

    let newContent: string;
    if (position === 'bottom') {
        newContent = `${body}\n---\n${newFmBlock}\n---`;
    } else {
        newContent = `---\n${newFmBlock}\n---\n${body}`;
    }

    try {
        fs.writeFileSync(filePath, newContent, 'utf8');
    } catch (err) {
        return { path: filePath, changed: false, added: [], existing: existingTags, error: err instanceof Error ? (err.stack ?? String(err)) : String(err) };
    }

    return { path: filePath, changed: true, added: toAdd, existing: existingTags };
}

// ─── Run enrichment ───────────────────────────────────────────────────────────

async function runEnrichment(
    panel:  vscode.WebviewPanel,
    dryRun: boolean
): Promise<void> {
    const registry = loadRegistry();
    if (!registry) {
        log(FEATURE, 'Registry not found — aborting enrichment');
        return;
    }

    const results: EnrichResult[] = [];

    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: dryRun ? 'Tags: Scanning...' : 'Tags: Enriching...', cancellable: false },
        async (progress) => {
            const projects = registry.projects.filter(p => p.status !== 'archived');
            let idx = 0;
            for (const project of projects) {
                idx++;
                progress.report({ message: `${project.name} (${idx}/${projects.length})`, increment: (100 / projects.length) });
                if (!fs.existsSync(project.path)) { continue; }
                for (const filePath of walkMdFiles(project.path)) {
                    try {
                        const result = enrichFile(filePath, dryRun);
                        results.push(result);
                    } catch (err) {
                        results.push({ path: filePath, changed: false, added: [], existing: [], error: err instanceof Error ? (err.stack ?? String(err)) : String(err) });
                        logError('enrichFile threw', err instanceof Error ? (err.stack ?? String(err)) : String(err), FEATURE);
                    }
                }
            }
        }
    );

    const changed   = results.filter(r => r.changed && !r.error);
    const unchanged = results.filter(r => !r.changed && !r.error);
    const errors    = results.filter(r => !!r.error);

    log(FEATURE, `Enrichment ${dryRun ? 'scan' : 'apply'} complete — changed=${changed.length} unchanged=${unchanged.length} errors=${errors.length}`);

    panel.webview.html = buildReportHtml(changed, unchanged, errors, dryRun);
}

// ─── Report webview ───────────────────────────────────────────────────────────

function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildReportHtml(
    changed:   EnrichResult[],
    unchanged: EnrichResult[],
    errors:    EnrichResult[],
    dryRun:    boolean
): string {
    const sectionLabel = dryRun ? 'WOULD CHANGE' : 'CHANGED';

    const changedRows = changed.map(r => `
        <tr>
            <td class="path">${esc(r.path)}</td>
            <td class="tags added">${r.added.map(t => `<span class="tag">${esc(t)}</span>`).join(' ')}</td>
            <td class="tags existing">${r.existing.map(t => `<span class="tag existing">${esc(t)}</span>`).join(' ')}</td>
        </tr>`).join('');

    const unchangedRows = unchanged.map(r => `
        <tr>
            <td class="path" colspan="3">${esc(r.path)}</td>
        </tr>`).join('');

    const errorRows = errors.map(r => `
        <tr>
            <td class="path">${esc(r.path)}</td>
            <td class="error" colspan="2">${esc(r.error ?? '')}</td>
        </tr>`).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: var(--vscode-font-family, sans-serif); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 12px; }
  h1 { font-size: 1.2em; margin-bottom: 4px; }
  .stats { color: var(--vscode-descriptionForeground); margin-bottom: 12px; font-size: 0.9em; }
  .toolbar { display: flex; gap: 8px; margin-bottom: 16px; }
  button { padding: 6px 14px; cursor: pointer; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 3px; font-size: 0.9em; }
  button:hover { background: var(--vscode-button-hoverBackground); }
  h2 { font-size: 1em; margin: 16px 0 6px 0; padding: 4px 8px; border-left: 3px solid var(--vscode-activityBarBadge-background); }
  table { width: 100%; border-collapse: collapse; font-size: 0.85em; margin-bottom: 12px; }
  td { padding: 3px 6px; border-bottom: 1px solid var(--vscode-editorWidget-border); vertical-align: top; word-break: break-all; }
  .path { color: var(--vscode-textLink-foreground); width: 50%; }
  .tag { display: inline-block; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); border-radius: 3px; padding: 1px 5px; margin: 1px; font-size: 0.85em; }
  .tag.existing { background: var(--vscode-editorWidget-background); color: var(--vscode-descriptionForeground); }
  .error { color: var(--vscode-errorForeground); }
  .section-unchanged { opacity: 0.6; }
  details summary { cursor: pointer; margin-bottom: 4px; }
</style>
</head>
<body>
<h1>Tags Enrichment — ${esc(dryRun ? 'Dry-Run Scan' : 'Applied')}</h1>
<div class="stats">Changed: <strong>${changed.length}</strong> &nbsp;|&nbsp; Unchanged: <strong>${unchanged.length}</strong> &nbsp;|&nbsp; Errors: <strong>${errors.length}</strong></div>
<div class="toolbar">
    ${dryRun ? '<button id="btn-run">Run Enrichment</button>' : ''}
    <button id="btn-rescan">Rescan</button>
</div>

${changed.length > 0 ? `
<h2>${esc(sectionLabel)} (${changed.length})</h2>
<table>
<thead><tr><th>File</th><th>Tags to Add</th><th>Existing Tags</th></tr></thead>
<tbody>${changedRows}</tbody>
</table>` : `<p>No files need tag enrichment.</p>`}

${unchanged.length > 0 ? `
<details class="section-unchanged">
<summary>UNCHANGED (${unchanged.length})</summary>
<table><tbody>${unchangedRows}</tbody></table>
</details>` : ''}

${errors.length > 0 ? `
<h2>ERRORS (${errors.length})</h2>
<table><tbody>${errorRows}</tbody></table>` : ''}

<script>
const vscode = acquireVsCodeApi();
document.getElementById('btn-rescan')?.addEventListener('click', () => {
    vscode.postMessage({ command: 'rescan' });
});
document.getElementById('btn-run')?.addEventListener('click', () => {
    vscode.postMessage({ command: 'run-auto' });
});
</script>
</body>
</html>`;
}

// ─── Open panel ───────────────────────────────────────────────────────────────

let _panel: vscode.WebviewPanel | undefined;

async function openPanel(context: vscode.ExtensionContext, dryRun: boolean): Promise<void> {
    if (_panel) {
        _panel.reveal();
    } else {
        _panel = vscode.window.createWebviewPanel(
            'cvsTagsEnrichment',
            'Tags Enrichment',
            getLauncherTargetColumn(),
            { enableScripts: true, retainContextWhenHidden: true }
        );
        _panel.onDidDispose(() => { _panel = undefined; }, null, context.subscriptions);
        _panel.webview.onDidReceiveMessage(async (msg: { command: string }) => {
            if (msg.command === 'rescan') {
                if (_panel) { await runEnrichment(_panel, true); }
            } else if (msg.command === 'run-auto') {
                if (_panel) { await runEnrichment(_panel, false); }
            }
        }, null, context.subscriptions);
    }

    _panel.webview.html = '<body style="font-family:sans-serif;padding:16px">Scanning…</body>';
    await runEnrichment(_panel, dryRun);
}

// ─── Activate / Deactivate ────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.tags.enrich', async () => {
            log(FEATURE, 'cvs.tags.enrich — dry-run scan');
            try {
                await openPanel(context, true);
            } catch (err) {
                logError('cvs.tags.enrich failed', err instanceof Error ? (err.stack ?? String(err)) : String(err), FEATURE);
                vscode.window.showErrorMessage('Tags enrichment scan failed — see output channel.');
            }
        }),
        vscode.commands.registerCommand('cvs.tags.enrichAuto', async () => {
            log(FEATURE, 'cvs.tags.enrichAuto — apply mode');
            try {
                await openPanel(context, false);
            } catch (err) {
                logError('cvs.tags.enrichAuto failed', err instanceof Error ? (err.stack ?? String(err)) : String(err), FEATURE);
                vscode.window.showErrorMessage('Tags enrichment apply failed — see output channel.');
            }
        }),
    );
    log(FEATURE, 'activated');
}

export function deactivate(): void {
    if (_panel) {
        _panel.dispose();
        _panel = undefined;
    }
}
