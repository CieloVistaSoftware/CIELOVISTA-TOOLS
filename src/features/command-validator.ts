// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * command-validator.ts
 *
 * Part 1 — Command Validation (cvs.commands.validate):
 *   Walks src/features/**\/*.README.md, parses Commands tables, and verifies
 *   each command ID is registered in package.json AND wired via registerCommand().
 *   Reports: VALID / MISSING-PKG / MISSING-REGISTER / ORPHAN
 *
 * Part 2 — Tags Sync (cvs.commands.syncTags / cvs.commands.syncTagsDry):
 *   Merges command IDs from each README's Commands table into that file's
 *   frontmatter tags field. Safe and idempotent — never removes existing tags.
 */

import * as vscode from 'vscode';
import * as fs     from 'fs';
import * as path   from 'path';
import { log, logError } from '../shared/output-channel';

const FEATURE = 'command-validator';

// ─── Types ────────────────────────────────────────────────────────────────────

type CmdStatus = 'valid' | 'missing-pkg' | 'missing-register' | 'orphan';

interface CmdResult {
    commandId:  string;
    sourceFile: string;   // README.md that referenced it (or 'package.json' for orphans)
    status:     CmdStatus;
    detail:     string;
}

interface TagSyncResult {
    file:    string;
    added:   string[];
    skipped: string[];
    written: boolean;
    error?:  string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract all cvs.* command IDs from a README's Commands section. */
function extractCommandIds(content: string): string[] {
    // Isolate the Commands section (## Commands … until next ## or EOF)
    const cmdSection = content.match(/##\s+Commands[\s\S]*?(?=\n##\s|\n---\s*\n##\s|$)/i)?.[0] ?? content;
    // Match command IDs in any of these forms:
    //   command:cvs.foo.bar   (inside a markdown link)
    //   `cvs.foo.bar`         (backtick code)
    //   | cvs.foo.bar |       (bare table cell)
    const ids = new Set<string>();
    const re = /(?:command:|`)?(cvs\.[\w.]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(cmdSection)) !== null) {
        ids.add(m[1]);
    }
    return [...ids];
}

/** Read package.json contributes.commands → Set of command IDs. */
function loadPackageCommandIds(root: string): Set<string> {
    const ids = new Set<string>();
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
        for (const c of (pkg.contributes?.commands ?? [])) {
            ids.add(c.command);
        }
    } catch { /* skip */ }
    return ids;
}

/** Return true if the corresponding .ts feature file has registerCommand(commandId). */
function isRegisteredInSource(commandId: string, readmePath: string, root: string): boolean {
    // README: src/features/foo.README.md → source: src/features/foo.ts
    const tsPath = readmePath.replace(/\.README\.md$/i, '.ts');
    if (!fs.existsSync(tsPath)) {
        // Try the feature subfolder pattern (e.g. src/features/foo/index.ts)
        const dir = readmePath.replace(/\.README\.md$/i, '');
        for (const candidate of ['index.ts', 'feature.ts']) {
            const p = path.join(dir, candidate);
            if (fs.existsSync(p)) {
                return fs.readFileSync(p, 'utf8').includes(`'${commandId}'`) ||
                       fs.readFileSync(p, 'utf8').includes(`"${commandId}"`);
            }
        }
        // Fall back: scan all .ts files under src/
        const srcDir = path.join(root, 'src');
        return scanDirForString(srcDir, commandId);
    }
    const src = fs.readFileSync(tsPath, 'utf8');
    return src.includes(`'${commandId}'`) || src.includes(`"${commandId}"`);
}

function scanDirForString(dir: string, needle: string): boolean {
    try {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (e.name === 'node_modules' || e.name === 'out') { continue; }
            const full = path.join(dir, e.name);
            if (e.isDirectory()) { if (scanDirForString(full, needle)) { return true; } }
            else if (e.name.endsWith('.ts')) {
                try {
                    const c = fs.readFileSync(full, 'utf8');
                    if (c.includes(`'${needle}'`) || c.includes(`"${needle}"`)) { return true; }
                } catch { /* skip */ }
            }
        }
    } catch { /* skip */ }
    return false;
}

/** Find all feature README files under src/features/. */
function findReadmeFiles(srcDir: string): string[] {
    const files: string[] = [];
    function walk(dir: string) {
        try {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                if (e.name === 'node_modules') { continue; }
                const full = path.join(dir, e.name);
                if (e.isDirectory()) { walk(full); }
                else if (/\.README\.md$/i.test(e.name)) { files.push(full); }
            }
        } catch { /* skip */ }
    }
    walk(srcDir);
    return files;
}

// ─── Frontmatter helpers ──────────────────────────────────────────────────────

function parseFmBlock(block: string): Record<string, unknown> {
    const fm: Record<string, unknown> = {};
    const lines = block.split('\n');
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        const colonIdx = line.indexOf(':');
        if (colonIdx < 0) { i++; continue; }
        const key = line.slice(0, colonIdx).trim();
        const rest = line.slice(colonIdx + 1).trim();
        if (!key) { i++; continue; }
        if (rest === '' || rest === '[]') {
            // Check if next lines are array items
            const arr: string[] = [];
            let j = i + 1;
            while (j < lines.length && /^\s*-\s+/.test(lines[j])) {
                arr.push(lines[j].replace(/^\s*-\s+/, '').replace(/^['"]|['"]$/g, ''));
                j++;
            }
            if (arr.length > 0) { fm[key] = arr; i = j; continue; }
            if (rest === '[]') { fm[key] = []; }
        } else if (rest.startsWith('[')) {
            // Inline array: [a, b, c]
            const inner = rest.slice(1, rest.lastIndexOf(']'));
            fm[key] = inner.split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
        } else {
            fm[key] = rest.replace(/^['"]|['"]$/g, '');
        }
        i++;
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

function serializeFm(fm: Record<string, unknown>): string {
    const lines: string[] = [];
    for (const [k, v] of Object.entries(fm)) {
        if (Array.isArray(v)) {
            lines.push(`${k}: [${v.map(s => String(s)).join(', ')}]`);
        } else {
            lines.push(`${k}: ${v}`);
        }
    }
    return lines.join('\n');
}

// ─── Part 1: Validation ───────────────────────────────────────────────────────

async function runValidation(root: string): Promise<CmdResult[]> {
    const pkgIds    = loadPackageCommandIds(root);
    const srcDir    = path.join(root, 'src', 'features');
    const readmes   = findReadmeFiles(srcDir);
    const results:  CmdResult[] = [];
    const seenInReadme = new Set<string>();

    for (const readme of readmes) {
        let content: string;
        try { content = fs.readFileSync(readme, 'utf8'); }
        catch { continue; }

        const ids = extractCommandIds(content);
        for (const id of ids) {
            seenInReadme.add(id);
            const inPkg = pkgIds.has(id);
            const inSrc = isRegisteredInSource(id, readme, root);
            let status: CmdStatus;
            let detail: string;

            if (inPkg && inSrc) {
                status = 'valid';
                detail = 'Found in package.json and registerCommand()';
            } else if (!inPkg && !inSrc) {
                status = 'missing-pkg';
                detail = 'Not in package.json contributes.commands; not in any registerCommand() call';
            } else if (!inPkg) {
                status = 'missing-pkg';
                detail = 'Missing from package.json contributes.commands';
            } else {
                status = 'missing-register';
                detail = 'In package.json but no registerCommand() call found in source';
            }

            results.push({ commandId: id, sourceFile: readme, status, detail });
        }
    }

    // ORPHAN: in package.json but not documented in any README
    for (const id of pkgIds) {
        if (!seenInReadme.has(id)) {
            results.push({
                commandId:  id,
                sourceFile: 'package.json',
                status:     'orphan',
                detail:     'Registered in package.json but not documented in any feature README',
            });
        }
    }

    return results;
}

// ─── Part 2: Tags sync ────────────────────────────────────────────────────────

function syncTagsForFile(readmePath: string, dryRun: boolean): TagSyncResult {
    let content: string;
    try { content = fs.readFileSync(readmePath, 'utf8'); }
    catch (err) { return { file: readmePath, added: [], skipped: [], written: false, error: String(err) }; }

    const ids = extractCommandIds(content);
    if (ids.length === 0) {
        return { file: readmePath, added: [], skipped: [], written: false };
    }

    const parsed = parseFrontmatter(content);
    if (!parsed) {
        return { file: readmePath, added: [], skipped: ids, written: false, error: 'No frontmatter found' };
    }

    const existingTags = Array.isArray(parsed.fm.tags)
        ? (parsed.fm.tags as string[]).map(String)
        : (parsed.fm.tags ? [String(parsed.fm.tags)] : []);

    const added: string[] = [];
    const skipped: string[] = [];

    for (const id of ids) {
        if (existingTags.includes(id)) { skipped.push(id); }
        else { added.push(id); existingTags.push(id); }
    }

    if (added.length === 0) {
        return { file: readmePath, added: [], skipped, written: false };
    }

    existingTags.sort();
    parsed.fm.tags = existingTags;

    if (dryRun) {
        return { file: readmePath, added, skipped, written: false };
    }

    try {
        const newFmBlock = serializeFm(parsed.fm);
        let newContent: string;
        if (parsed.position === 'bottom') {
            newContent = `${parsed.body}\n---\n${newFmBlock}\n---`;
        } else {
            newContent = `---\n${newFmBlock}\n---\n${parsed.body}`;
        }
        fs.writeFileSync(readmePath, newContent, 'utf8');
        return { file: readmePath, added, skipped, written: true };
    } catch (err) {
        return { file: readmePath, added, skipped, written: false, error: String(err) };
    }
}

async function runTagSync(root: string, dryRun: boolean): Promise<TagSyncResult[]> {
    const srcDir  = path.join(root, 'src', 'features');
    const readmes = findReadmeFiles(srcDir);
    return readmes.map(r => syncTagsForFile(r, dryRun));
}

// ─── Webview: Validation Report ───────────────────────────────────────────────

function buildValidationHtml(results: CmdResult[], root: string): string {
    function rel(p: string) {
        try { return path.relative(root, p).replace(/\\/g, '/'); } catch { return p; }
    }

    const valid   = results.filter(r => r.status === 'valid');
    const missPkg = results.filter(r => r.status === 'missing-pkg');
    const missReg = results.filter(r => r.status === 'missing-register');
    const orphan  = results.filter(r => r.status === 'orphan');

    function rows(items: CmdResult[], cls: string): string {
        return items.map(r => `<tr class="${cls}">
            <td class="cell-cmd"><code>${r.commandId}</code></td>
            <td class="cell-file" title="${r.sourceFile}">${rel(r.sourceFile)}</td>
            <td class="cell-detail">${r.detail}</td>
        </tr>`).join('');
    }

    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);font-size:12px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);padding:16px}
h1{font-size:15px;font-weight:700;margin-bottom:12px}
h2{font-size:13px;font-weight:600;margin:20px 0 8px}
.summary{display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;align-items:center}
.pill{padding:4px 14px;border-radius:12px;font-size:12px;font-weight:600}
.pill-ok{background:rgba(63,185,80,.2);color:#3fb950}
.pill-bad{background:rgba(248,81,73,.2);color:#f85149}
.pill-warn{background:rgba(204,167,0,.2);color:#cca700}
.pill-info{background:rgba(88,166,255,.15);color:#58a6ff}
table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:4px}
th{text-align:left;padding:4px 8px;border-bottom:1px solid var(--vscode-panel-border);color:var(--vscode-descriptionForeground);font-weight:600}
td{padding:4px 8px;border-bottom:1px solid var(--vscode-panel-border,#333);vertical-align:top;word-break:break-all}
tr.valid td:first-child{border-left:3px solid #3fb950}
tr.bad td:first-child{border-left:3px solid #f85149}
tr.warn td:first-child{border-left:3px solid #cca700}
tr.info td:first-child{border-left:3px solid #58a6ff}
.cell-cmd{font-family:monospace;white-space:nowrap}
.cell-file{color:var(--vscode-textLink-foreground)}
.empty{color:var(--vscode-descriptionForeground);font-style:italic;padding:4px 0}
</style></head><body>
<h1>✅ Command Validation Report</h1>
<div class="summary">
  <span class="pill pill-ok">✓ ${valid.length} valid</span>
  <span class="pill pill-bad">❌ ${missPkg.length} missing-pkg</span>
  <span class="pill pill-warn">⚠ ${missReg.length} missing-register</span>
  <span class="pill pill-info">ℹ ${orphan.length} orphan</span>
</div>

${(missPkg.length + missReg.length) > 0 ? `
<h2>❌ Broken / Missing Commands</h2>
<table><thead><tr><th>Command ID</th><th>Source README</th><th>Issue</th></tr></thead>
<tbody>${rows(missPkg, 'bad')}${rows(missReg, 'warn')}</tbody></table>` : '<p class="empty">No broken commands — all documented commands are properly wired.</p>'}

${orphan.length > 0 ? `
<h2>ℹ Orphan Commands (in package.json but undocumented)</h2>
<table><thead><tr><th>Command ID</th><th>Source</th><th>Note</th></tr></thead>
<tbody>${rows(orphan, 'info')}</tbody></table>` : ''}

${valid.length > 0 ? `
<h2>✓ Valid Commands (${valid.length})</h2>
<table><thead><tr><th>Command ID</th><th>Source README</th><th>Note</th></tr></thead>
<tbody>${rows(valid, 'valid')}</tbody></table>` : ''}
</body></html>`;
}

function buildTagSyncHtml(results: TagSyncResult[], root: string, dryRun: boolean): string {
    function rel(p: string) {
        try { return path.relative(root, p).replace(/\\/g, '/'); } catch { return p; }
    }

    const withChanges = results.filter(r => r.added.length > 0);
    const noChange    = results.filter(r => r.added.length === 0 && !r.error);
    const errors      = results.filter(r => r.error);
    const totalAdded  = results.reduce((n, r) => n + r.added.length, 0);

    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);font-size:12px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);padding:16px}
h1{font-size:15px;font-weight:700;margin-bottom:12px}
h2{font-size:13px;font-weight:600;margin:20px 0 8px}
.summary{display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;align-items:center}
.pill{padding:4px 14px;border-radius:12px;font-size:12px;font-weight:600}
.pill-ok{background:rgba(63,185,80,.2);color:#3fb950}
.pill-bad{background:rgba(248,81,73,.2);color:#f85149}
.mode{font-size:11px;padding:3px 10px;border-radius:8px;background:rgba(88,166,255,.15);color:#58a6ff;font-weight:600}
table{width:100%;border-collapse:collapse;font-size:11px}
th{text-align:left;padding:4px 8px;border-bottom:1px solid var(--vscode-panel-border);color:var(--vscode-descriptionForeground);font-weight:600}
td{padding:4px 8px;border-bottom:1px solid var(--vscode-panel-border,#333);vertical-align:top;word-break:break-all}
code{font-family:monospace;font-size:10px}
.empty{color:var(--vscode-descriptionForeground);font-style:italic}
</style></head><body>
<h1>🏷 Tags Sync Report</h1>
<div class="summary">
  <span class="mode">${dryRun ? '🔍 DRY RUN — no files written' : '✏ APPLIED'}</span>
  <span class="pill pill-ok">${totalAdded} tag${totalAdded === 1 ? '' : 's'} added across ${withChanges.length} file${withChanges.length === 1 ? '' : 's'}</span>
  ${errors.length > 0 ? `<span class="pill pill-bad">${errors.length} error${errors.length === 1 ? '' : 's'}</span>` : ''}
</div>

${withChanges.length > 0 ? `
<h2>${dryRun ? 'Would add tags to' : 'Tags added to'} (${withChanges.length} files)</h2>
<table><thead><tr><th>README</th><th>Tags added</th></tr></thead>
<tbody>${withChanges.map(r => `<tr>
    <td>${rel(r.file)}</td>
    <td>${r.added.map(t => `<code>${t}</code>`).join(', ')}</td>
</tr>`).join('')}</tbody></table>` : '<p class="empty">No new tags to add — all command IDs already present in frontmatter.</p>'}

${errors.length > 0 ? `
<h2>Errors</h2>
<table><thead><tr><th>File</th><th>Error</th></tr></thead>
<tbody>${errors.map(r => `<tr><td>${rel(r.file)}</td><td>${r.error}</td></tr>`).join('')}</tbody></table>` : ''}
</body></html>`;
}

// ─── Command handlers ─────────────────────────────────────────────────────────

function getRoot(): string {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
        ?? path.resolve(__dirname, '../../');
}

async function cmdValidate(): Promise<void> {
    log(FEATURE, 'Running command validation scan');
    const root = getRoot();

    const results = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Command Validation — scanning…',
        cancellable: false,
    }, async () => runValidation(root));

    const broken = results.filter(r => r.status === 'missing-pkg' || r.status === 'missing-register').length;
    log(FEATURE, `Validation complete — ${results.length} commands: ${broken} broken, ${results.filter(r => r.status === 'orphan').length} orphan`);

    const panel = vscode.window.createWebviewPanel(
        'cvsCommandValidate', '✅ Command Validation',
        { viewColumn: vscode.ViewColumn.One, preserveFocus: false },
        { enableScripts: false, retainContextWhenHidden: true }
    );
    panel.webview.html = buildValidationHtml(results, root);
}

async function cmdSyncTags(dryRun: boolean): Promise<void> {
    const root = getRoot();
    log(FEATURE, `Running tags sync (${dryRun ? 'dry-run' : 'apply'})`);

    const results = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Tags Sync — ${dryRun ? 'dry-run' : 'applying'}…`,
        cancellable: false,
    }, async () => runTagSync(root, dryRun));

    const totalAdded = results.reduce((n, r) => n + r.added.length, 0);
    log(FEATURE, `Tags sync complete — ${totalAdded} tags added across ${results.filter(r => r.written).length} files`);

    const panel = vscode.window.createWebviewPanel(
        'cvsCommandSyncTags', '🏷 Tags Sync',
        { viewColumn: vscode.ViewColumn.One, preserveFocus: false },
        { enableScripts: false, retainContextWhenHidden: true }
    );
    panel.webview.html = buildTagSyncHtml(results, root, dryRun);
}

// ─── Activate / Deactivate ────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.commands.validate',    cmdValidate),
        vscode.commands.registerCommand('cvs.commands.syncTags',    () => cmdSyncTags(false)),
        vscode.commands.registerCommand('cvs.commands.syncTagsDry', () => cmdSyncTags(true)),
    );
    log(FEATURE, 'activated');
}

export function deactivate(): void { /* nothing to clean up */ }
