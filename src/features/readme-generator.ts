// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * readme-generator.ts
 *
 * Scans every registered project for a missing README.md, then uses the
 * Anthropic API to generate a compliant README for each one based on:
 *   - CLAUDE.md (if present)
 *   - package.json or .csproj files
 *   - Top-level directory structure
 *   - Project name, type, and description from the registry
 *
 * The generated README follows the CieloVista README Standard (Project type).
 * Every generated README is shown for review first (src/shared/file-review),
 * as a new file, and nothing is written until the user approves it (#798).
 * The generator never overwrites a README: existence is re-checked before the
 * AI is called and again when it returns (a README that appeared after the
 * scan is skipped and reported), and an approved file is created with 'wx',
 * so one that appears while the review is open is not replaced either.
 * After an approved write, the catalog is rebuilt.
 *
 * Commands registered:
 *   cvs.readme.generate.scan    — scan for missing READMEs and report
 *   cvs.readme.generate.run     — generate missing READMEs with AI
 *   cvs.readme.generate.single  — pick one project and generate its README
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { log, logError } from '../shared/output-channel';
import { callClaude } from '../shared/anthropic-client';
import { REGISTRY_PATH, loadRegistry, ProjectRegistry, ProjectEntry } from '../shared/registry';
import { showFileReview, disposeFileReview, buildNewFileReviewItem, ReviewItem } from '../shared/file-review';

const FEATURE  = 'readme-generator';

// ─── Types ────────────────────────────────────────────────────────────────────

// ProjectEntry and ProjectRegistry types are now imported from shared/registry

interface MissingReadme {
    project: ProjectEntry;
    /** Contextual info gathered from the project folder */
    context: ProjectContext;
}

interface ProjectContext {
    claudeMd:       string | null;
    packageJson:    string | null;
    csprojContent:  string | null;
    dirListing:     string;
    scripts:        string[];
    techStack:      string[];
}

// Registry helpers now imported from shared/registry

// ─── Context gatherer ─────────────────────────────────────────────────────────

function gatherContext(projPath: string): ProjectContext {
    const ctx: ProjectContext = {
        claudeMd:      null,
        packageJson:   null,
        csprojContent: null,
        dirListing:    '',
        scripts:       [],
        techStack:     [],
    };

    // CLAUDE.md
    const claudePath = path.join(projPath, 'CLAUDE.md');
    if (fs.existsSync(claudePath)) {
        ctx.claudeMd = fs.readFileSync(claudePath, 'utf8').slice(0, 3000);
    }

    // package.json
    const pkgPath = path.join(projPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
        const raw = fs.readFileSync(pkgPath, 'utf8');
        ctx.packageJson = raw.slice(0, 2000);
        try {
            const pkg = JSON.parse(raw);
            ctx.scripts   = Object.keys(pkg.scripts ?? {});
            ctx.techStack = [
                ...Object.keys(pkg.dependencies ?? {}),
                ...Object.keys(pkg.devDependencies ?? {}),
            ].slice(0, 20);
        } catch { /* ignore */ }
        ctx.techStack.unshift('Node.js', 'TypeScript/JavaScript');
    }

    // .csproj or .sln
    try {
        const entries = fs.readdirSync(projPath);
        const csproj = entries.find(e => /\.csproj$/i.test(e));
        const sln    = entries.find(e => /\.sln[x]?$/i.test(e));
        if (csproj) {
            ctx.csprojContent = fs.readFileSync(path.join(projPath, csproj), 'utf8').slice(0, 1500);
            ctx.techStack.unshift('C#', '.NET 8', 'ASP.NET Core');
        }
        if (sln && !csproj) {
            ctx.techStack.unshift('C#', '.NET');
        }
    } catch { /* ignore */ }

    // Top-level dir listing (skip noise)
    const SKIP = new Set(['node_modules', '.git', '.vs', 'bin', 'obj', 'out', 'dist']);
    try {
        const entries = fs.readdirSync(projPath, { withFileTypes: true })
            .filter(e => !SKIP.has(e.name) && !e.name.startsWith('.'))
            .map(e => `${e.isDirectory() ? '[DIR]' : '[FILE]'} ${e.name}`);
        ctx.dirListing = entries.join('\n');
    } catch { /* ignore */ }

    return ctx;
}

// ─── AI README generator ──────────────────────────────────────────────────────

const README_STANDARD = `
# CieloVista README Standard — Project Type

Required sections IN THIS ORDER:
1. # Project Name  (one-line tagline on next line)
2. ## What it does  (2-5 sentences)
3. ## Quick Start  (minimum commands to run)
4. ## Architecture  (tech stack + key decisions, max 10 lines)
5. ## Project Structure  (directory tree with annotations)
6. ## Common Commands  (5-10 most-used commands, table or code block)
7. ## Prerequisites  (bullet list of required tools)
8. ## License  (one line: Copyright (c) YYYY CieloVista Software)

Rules:
- Maximum 200 lines
- First line must be # heading
- Code blocks must have a language tag (powershell, typescript, json, csharp etc.)
- No duplicate headings
- No session management instructions
- Be concise and accurate — do not invent features
`.trim();

async function generateReadme(project: ProjectEntry, ctx: ProjectContext): Promise<string> {
    const contextParts: string[] = [
        `Project name: ${project.name}`,
        `Project type: ${project.type}`,
        `Description: ${project.description}`,
        `Tech stack detected: ${ctx.techStack.join(', ') || 'unknown'}`,
        '',
        '--- Directory structure ---',
        ctx.dirListing || '(empty)',
    ];

    if (ctx.claudeMd) {
        contextParts.push('', '--- CLAUDE.md (project context) ---', ctx.claudeMd);
    }
    if (ctx.packageJson) {
        contextParts.push('', '--- package.json ---', ctx.packageJson);
    }
    if (ctx.csprojContent) {
        contextParts.push('', '--- .csproj ---', ctx.csprojContent);
    }
    if (ctx.scripts.length) {
        contextParts.push('', `--- npm scripts ---`, ctx.scripts.join(', '));
    }

    const prompt = `You are generating a README.md for a CieloVista Software project.

Here is the README standard to follow:
${README_STANDARD}

Here is the project context:
${contextParts.join('\n')}

Generate a complete, accurate README.md for this project following the standard exactly.
- Only include information you can infer from the context above
- Do not invent features or capabilities not evident from the context
- Use real script names from package.json if available
- Keep it concise and developer-focused
- Output ONLY the markdown content, no preamble or explanation`;

    return await callClaude(prompt, 2000);
}

// ─── Scanner ──────────────────────────────────────────────────────────────────

function findMissingReadmes(registry: ProjectRegistry): MissingReadme[] {
    const missing: MissingReadme[] = [];

    for (const project of registry.projects) {
        if (!fs.existsSync(project.path)) { continue; }

        const readmePath = path.join(project.path, 'README.md');
        if (!fs.existsSync(readmePath)) {
            missing.push({
                project,
                context: gatherContext(project.path),
            });
        }
    }

    return missing;
}

// ─── Report panel ─────────────────────────────────────────────────────────────

function buildScanReportHtml(missing: MissingReadme[], all: ProjectEntry[]): string {
    const hasReadme = all.filter(p =>
        fs.existsSync(p.path) && fs.existsSync(path.join(p.path, 'README.md'))
    );

    const missingRows = missing.map(m => `
      <tr>
        <td><strong>${m.project.name}</strong></td>
        <td><span class="type">${m.project.type}</span></td>
        <td class="path">${m.project.path}</td>
        <td><button data-action="generate-one" data-proj="${m.project.name}">🤖 Generate</button></td>
      </tr>`).join('');

    const hasRows = hasReadme.map(p => `
      <tr class="ok-row">
        <td>${p.name}</td>
        <td><span class="type">${p.type}</span></td>
        <td class="path">${p.path}</td>
        <td><span class="ok-badge">✅ Has README</span></td>
      </tr>`).join('');

    return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:var(--vscode-font-family);font-size:13px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);padding:16px 20px}
  h1{font-size:1.2em;margin-bottom:12px}
  .summary{display:flex;gap:16px;margin-bottom:20px;flex-wrap:wrap}
  .pill{padding:4px 12px;border-radius:12px;font-size:12px;font-weight:600;border:1px solid}
  .pill-err{color:var(--vscode-inputValidation-errorForeground);border-color:var(--vscode-inputValidation-errorBorder)}
  .pill-ok{color:var(--vscode-testing-iconPassed);border-color:var(--vscode-testing-iconPassed)}
  .actions{margin-bottom:16px;display:flex;gap:8px}
  table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:24px}
  th{text-align:left;padding:6px 8px;background:var(--vscode-textCodeBlock-background);border-bottom:1px solid var(--vscode-panel-border);font-weight:600}
  td{padding:6px 8px;border-bottom:1px solid var(--vscode-panel-border);vertical-align:middle}
  .path{font-family:var(--vscode-editor-font-family);font-size:10px;color:var(--vscode-descriptionForeground);max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .type{font-size:10px;padding:1px 6px;border-radius:3px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground)}
  .ok-row td{opacity:0.6}
  .ok-badge{color:var(--vscode-testing-iconPassed);font-size:11px}
  button{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;padding:4px 12px;border-radius:3px;cursor:pointer;font-size:12px;font-weight:600}
  button:hover{background:var(--vscode-button-hoverBackground)}
  button.secondary{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}
  button.secondary:hover{background:var(--vscode-button-secondaryHoverBackground)}
  h2{font-size:0.95em;font-weight:700;border-bottom:2px solid var(--vscode-focusBorder);padding-bottom:5px;margin:16px 0 10px}
  .status-msg{padding:8px 12px;border-radius:3px;margin-bottom:12px;font-size:12px;display:none}
  .status-msg.visible{display:block}
  .status-msg.working{background:var(--vscode-textCodeBlock-background);border-left:3px solid var(--vscode-focusBorder)}
  .status-msg.done{background:var(--vscode-textCodeBlock-background);border-left:3px solid var(--vscode-testing-iconPassed)}
  .status-msg.error{background:var(--vscode-inputValidation-errorBackground);border-left:3px solid var(--vscode-inputValidation-errorBorder)}
</style>
</head><body>
<h1>🤖 README Generator</h1>

<div class="summary">
  <span class="pill pill-err">⚠️ ${missing.length} missing README</span>
  <span class="pill pill-ok">✅ ${hasReadme.length} have README</span>
</div>

<div id="status" class="status-msg"></div>

${missing.length > 0 ? `
<div class="actions">
  <button data-action="generate-all">🤖 Generate All ${missing.length} Missing READMEs</button>
</div>

<h2>❌ Missing READMEs</h2>
<table>
  <thead><tr><th>Project</th><th>Type</th><th>Path</th><th>Action</th></tr></thead>
  <tbody>${missingRows}</tbody>
</table>` : '<p style="color:var(--vscode-testing-iconPassed);margin-bottom:16px">✅ All registered projects have README files!</p>'}

<h2>✅ Projects with READMEs</h2>
<table>
  <thead><tr><th>Project</th><th>Type</th><th>Path</th><th></th></tr></thead>
  <tbody>${hasRows}</tbody>
</table>

<script>
const vscode = acquireVsCodeApi();

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) { return; }
  const action = btn.dataset.action;

  if (action === 'generate-all') {
    setStatus('working', '🤖 Generating READMEs for all ${missing.length} projects — this may take a minute…');
    vscode.postMessage({ command: 'generateAll' });
  }

  if (action === 'generate-one') {
    const proj = btn.dataset.proj;
    setStatus('working', \`🤖 Generating README for \${proj}…\`);
    btn.disabled = true;
    btn.textContent = '⏳ Generating…';
    vscode.postMessage({ command: 'generateOne', project: proj });
  }
});

window.addEventListener('message', e => {
  const msg = e.data;
  if (msg.type === 'done') {
    setStatus('done', msg.text);
  }
  if (msg.type === 'error') {
    setStatus('error', msg.text);
  }
  if (msg.type === 'progress') {
    setStatus('working', msg.text);
  }
});

function setStatus(kind, text) {
  const el = document.getElementById('status');
  el.className = 'status-msg visible ' + kind;
  el.textContent = text;
}
</script>
</body></html>`;
}

// ─── Commands ─────────────────────────────────────────────────────────────────

let _panel: vscode.WebviewPanel | undefined;
let _missingCache: MissingReadme[] = [];
let _registryCache: ProjectRegistry | undefined;

const REVIEW_VIEW_TYPE = 'readmeGeneratorReview';

async function runScan(): Promise<void> {
    const registry = loadRegistry();
    if (!registry) { return; }

    _registryCache = registry;
    _missingCache  = findMissingReadmes(registry);

    const html = buildScanReportHtml(_missingCache, registry.projects);

    if (_panel) {
        _panel.webview.html = html;
        _panel.reveal(vscode.ViewColumn.Beside, true);
    } else {
        _panel = vscode.window.createWebviewPanel(
            'readmeGenerator', '🤖 README Generator', vscode.ViewColumn.Beside,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        _panel.webview.html = html;
        _panel.onDidDispose(() => { _panel = undefined; });
        // Attached once per panel, not once per scan: every rescan reuses the
        // panel, and a second listener made one click generate twice (#807).
        _panel.webview.onDidReceiveMessage(async msg => {
            switch (msg.command) {
                case 'generateAll':
                    await generateAllMissing();
                    break;
                case 'generateOne':
                    await generateSingleByName(msg.project);
                    break;
            }
        });
    }

    if (_missingCache.length === 0) {
        vscode.window.showInformationMessage('All registered projects already have README files. ✅');
    } else {
        vscode.window.showInformationMessage(
            `Found ${_missingCache.length} project(s) without README.md`,
            'Generate All'
        ).then(c => { if (c === 'Generate All') { generateAllMissing(); } });
    }

    log(FEATURE, `Scan complete — ${_missingCache.length} missing READMEs`);
}

function postProgress(text: string): void {
    _panel?.webview.postMessage({ type: 'progress', text });
}

function postDone(text: string): void {
    _panel?.webview.postMessage({ type: 'done', text });
}

function postError(text: string): void {
    _panel?.webview.postMessage({ type: 'error', text });
}

function readmePathOf(project: ProjectEntry): string {
    return path.join(project.path, 'README.md');
}

/**
 * True if the project has a README.md now. The missing list is made at scan
 * time; a README can appear after that (by hand, git pull, README
 * Compliance's New README), and the generator never replaces one (#798).
 */
function readmeExistsNow(project: ProjectEntry): boolean {
    return fs.existsSync(readmePathOf(project));
}

/**
 * Shows the generated READMEs for review, each as a new file. Nothing is
 * written until the user approves a file there, and then only that file, with
 * the text shown, created with 'wx' so an existing README is never replaced.
 * `skipped` names projects whose README appeared after the scan; they were
 * not generated and the user is told so.
 */
function reviewGenerated(items: ReviewItem[], skipped: string[] = []): void {
    if (skipped.length) {
        const list = skipped.join(', ');
        const msg  = `README.md appeared after the scan, not generated (an existing README is never overwritten): ${list}`;
        log(FEATURE, msg);
        vscode.window.showWarningMessage(msg);
    }
    if (!items.length) {
        postDone('Nothing to review: every README in the list exists now.');
        if (_panel) { void runScan(); }
        return;
    }

    showFileReview(items, {
        title:    'Generated README Review',
        viewType: REVIEW_VIEW_TYPE,
        onApplied: async (result) => {
            for (const p of result.ignored) { log(FEATURE, `Review: ignored a path it was not given: ${p}`); }
            for (const r of result.refused) {
                const err = r.error ?? r.detail;
                if (r.reason === 'error') { logError(`Failed to write ${r.filePath}`, err instanceof Error ? err.stack || String(err) : String(err), FEATURE); }
                else { log(FEATURE, `Not written, ${r.detail}: ${r.filePath}`); }
            }
            for (const p of result.written) { log(FEATURE, `Generated README: ${p}`); }

            const n = result.written.length;
            let msg = `✅ Wrote ${n} README${n !== 1 ? 's' : ''}.`;
            const kept = result.refused.filter(r => r.reason === 'exists').map(r => r.filePath);
            if (kept.length) { msg += ` ${kept.length} not written because README.md was created while the review was open: ${kept.join(', ')}`; }
            const errors = result.refused.filter(r => r.reason === 'error').length;
            if (errors) { msg += ` ${errors} failed — see the output channel.`; }
            postDone(msg);

            if (kept.length || errors) {
                vscode.window.showWarningMessage(msg);
            } else if (n === 1) {
                const written = result.written[0];
                vscode.window.showInformationMessage(msg, 'Open It').then(async c => {
                    if (c === 'Open It') {
                        const doc = await vscode.workspace.openTextDocument(written);
                        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
                    }
                });
            } else {
                vscode.window.showInformationMessage(msg);
            }

            if (n) {
                try { await vscode.commands.executeCommand('cvs.catalog.rebuild'); } catch { /* catalog may not be open */ }
            }
            if (_panel) { await runScan(); }
        },
    });

    const plural = items.length !== 1 ? 's' : '';
    postDone(`Review ${items.length} generated README${plural} in the side panel — nothing is written until you approve.`);
}

/**
 * Calls the AI for one project and returns its review item, or undefined if
 * the project has a README now (checked before the call and again after it).
 */
async function generateForReview(item: MissingReadme, generate: () => Promise<string>): Promise<ReviewItem | undefined> {
    if (readmeExistsNow(item.project)) { return undefined; }
    const readme = await generate();
    if (!readme || !readme.trim()) { throw new Error('Empty AI response'); }
    if (readmeExistsNow(item.project)) { return undefined; }
    return buildNewFileReviewItem(readmePathOf(item.project), `${item.project.name}/README.md`, readme, 'generated (AI)');
}

async function generateAllMissing(): Promise<void> {
    // Freshen the cache if it's empty — don't force user to run scan first
    if (!_missingCache.length) {
        const registry = loadRegistry();
        if (!registry) { return; }
        _missingCache = findMissingReadmes(registry);
    }

    if (!_missingCache.length) {
        vscode.window.showInformationMessage('All registered projects already have README files. ✅');
        return;
    }

    const total = _missingCache.length;
    const items: ReviewItem[] = [];
    const skipped: string[] = [];
    let failed = 0;

    for (const [i, item] of [..._missingCache].entries()) {
        postProgress(`🤖 Generating ${item.project.name} (${i + 1} of ${total})…`);
        try {
            const reviewItem = await generateForReview(item, () => generateReadme(item.project, item.context));
            if (reviewItem) { items.push(reviewItem); } else { skipped.push(item.project.name); }
        } catch (err) {
            logError(`Failed for ${item.project.name}`, err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
            failed++;
        }
    }

    if (!items.length && failed) {
        const msg = `❌ README generation failed for ${failed} of ${total} project(s) — see the output channel.`;
        postError(msg);
        vscode.window.showErrorMessage(msg);
        return;
    }
    if (failed) { log(FEATURE, `${failed} of ${total} README(s) failed to generate`); }
    reviewGenerated(items, skipped);
}

async function generateSingleByName(projectName: string): Promise<void> {
    const item = _missingCache.find(m => m.project.name === projectName);
    if (!item) {
        postError(`Project "${projectName}" not found in missing list.`);
        return;
    }

    try {
        postProgress(`🤖 Calling AI for ${item.project.name}…`);
        const reviewItem = await generateForReview(item, () => generateReadme(item.project, item.context));
        reviewGenerated(reviewItem ? [reviewItem] : [], reviewItem ? [] : [item.project.name]);
    } catch (err) {
        logError(`Failed for ${item.project.name}`, err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
        postError(`❌ Failed for ${item.project.name}: ${err}`);
        vscode.window.showErrorMessage(`README generation failed for ${item.project.name}: ${err}`);
    }
}

async function generateSingleInteractive(): Promise<void> {
    const registry = loadRegistry();
    if (!registry) { return; }

    const missing = findMissingReadmes(registry);

    if (!missing.length) {
        vscode.window.showInformationMessage('All projects already have README files. ✅');
        return;
    }

    const picked = await vscode.window.showQuickPick(
        missing.map(m => ({
            label: `$(file) ${m.project.name}`,
            description: m.project.type,
            detail: m.project.path,
            item: m,
        })),
        { placeHolder: `${missing.length} projects missing README — pick one to generate` }
    );
    if (!picked) { return; }

    try {
        const reviewItem = await generateForReview(picked.item, () => Promise.resolve(vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: `Generating README for ${picked.item.project.name}…` },
            () => generateReadme(picked.item.project, picked.item.context)
        )));
        reviewGenerated(reviewItem ? [reviewItem] : [], reviewItem ? [] : [picked.item.project.name]);
    } catch (err) {
        logError(`Failed for ${picked.item.project.name}`, err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
        vscode.window.showErrorMessage(`README generation failed for ${picked.item.project.name}: ${err}`);
    }
}

// ─── Activate / Deactivate ────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
    log(FEATURE, 'Activating');

    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.readme.generate.scan',   runScan),
        vscode.commands.registerCommand('cvs.readme.generate.run',    async () => {
            // Always freshen before running all
            const registry = loadRegistry();
            if (registry) { _missingCache = findMissingReadmes(registry); }
            await generateAllMissing();
        }),
        vscode.commands.registerCommand('cvs.readme.generate.single', generateSingleInteractive),
    );
}

export function deactivate(): void {
    disposeFileReview(REVIEW_VIEW_TYPE);
    _panel?.dispose();
    _panel         = undefined;
    _missingCache  = [];
    _registryCache = undefined;
}
