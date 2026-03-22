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
 * After generation, triggers a catalog rebuild so the new files appear.
 *
 * Commands registered:
 *   cvs.readme.generate.scan    — scan for missing READMEs and report
 *   cvs.readme.generate.run     — generate missing READMEs with AI
 *   cvs.readme.generate.single  — pick one project and generate its README
 */
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const output_channel_1 = require("../shared/output-channel");
const anthropic_client_1 = require("../shared/anthropic-client");
const registry_1 = require("../shared/registry");
const FEATURE = 'readme-generator';
// Registry helpers now imported from shared/registry
// ─── Context gatherer ─────────────────────────────────────────────────────────
function gatherContext(projPath) {
    const ctx = {
        claudeMd: null,
        packageJson: null,
        csprojContent: null,
        dirListing: '',
        scripts: [],
        techStack: [],
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
            ctx.scripts = Object.keys(pkg.scripts ?? {});
            ctx.techStack = [
                ...Object.keys(pkg.dependencies ?? {}),
                ...Object.keys(pkg.devDependencies ?? {}),
            ].slice(0, 20);
        }
        catch { /* ignore */ }
        ctx.techStack.unshift('Node.js', 'TypeScript/JavaScript');
    }
    // .csproj or .sln
    try {
        const entries = fs.readdirSync(projPath);
        const csproj = entries.find(e => /\.csproj$/i.test(e));
        const sln = entries.find(e => /\.sln[x]?$/i.test(e));
        if (csproj) {
            ctx.csprojContent = fs.readFileSync(path.join(projPath, csproj), 'utf8').slice(0, 1500);
            ctx.techStack.unshift('C#', '.NET 8', 'ASP.NET Core');
        }
        if (sln && !csproj) {
            ctx.techStack.unshift('C#', '.NET');
        }
    }
    catch { /* ignore */ }
    // Top-level dir listing (skip noise)
    const SKIP = new Set(['node_modules', '.git', '.vs', 'bin', 'obj', 'out', 'dist']);
    try {
        const entries = fs.readdirSync(projPath, { withFileTypes: true })
            .filter(e => !SKIP.has(e.name) && !e.name.startsWith('.'))
            .map(e => `${e.isDirectory() ? '[DIR]' : '[FILE]'} ${e.name}`);
        ctx.dirListing = entries.join('\n');
    }
    catch { /* ignore */ }
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
async function generateReadme(project, ctx) {
    const contextParts = [
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
    return await (0, anthropic_client_1.callClaude)(prompt, 2000);
}
// ─── Scanner ──────────────────────────────────────────────────────────────────
function findMissingReadmes(registry) {
    const missing = [];
    for (const project of registry.projects) {
        if (!fs.existsSync(project.path)) {
            continue;
        }
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
function buildScanReportHtml(missing, all) {
    const hasReadme = all.filter(p => fs.existsSync(p.path) && fs.existsSync(path.join(p.path, 'README.md')));
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
let _panel;
let _missingCache = [];
let _registryCache;
async function runScan() {
    const registry = (0, registry_1.loadRegistry)();
    if (!registry) {
        return;
    }
    _registryCache = registry;
    _missingCache = findMissingReadmes(registry);
    const html = buildScanReportHtml(_missingCache, registry.projects);
    if (_panel) {
        _panel.webview.html = html;
        _panel.reveal();
    }
    else {
        _panel = vscode.window.createWebviewPanel('readmeGenerator', '🤖 README Generator', vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true });
        _panel.webview.html = html;
        _panel.onDidDispose(() => { _panel = undefined; });
    }
    _panel.webview.onDidReceiveMessage(async (msg) => {
        switch (msg.command) {
            case 'generateAll':
                await generateAllMissing();
                break;
            case 'generateOne':
                await generateSingleByName(msg.project);
                break;
        }
    });
    if (_missingCache.length === 0) {
        vscode.window.showInformationMessage('All registered projects already have README files. ✅');
    }
    else {
        vscode.window.showInformationMessage(`Found ${_missingCache.length} project(s) without README.md`, 'Generate All').then(c => { if (c === 'Generate All') {
            generateAllMissing();
        } });
    }
    (0, output_channel_1.log)(FEATURE, `Scan complete — ${_missingCache.length} missing READMEs`);
}
function postProgress(text) {
    _panel?.webview.postMessage({ type: 'progress', text });
}
function postDone(text) {
    _panel?.webview.postMessage({ type: 'done', text });
}
function postError(text) {
    _panel?.webview.postMessage({ type: 'error', text });
}
async function generateAllMissing() {
    // Freshen the cache if it's empty — don't force user to run scan first
    if (!_missingCache.length) {
        const registry = (0, registry_1.loadRegistry)();
        if (!registry) {
            return;
        }
        _missingCache = findMissingReadmes(registry);
    }
    if (!_missingCache.length) {
        vscode.window.showInformationMessage('All registered projects already have README files. ✅');
        return;
    }
    const total = _missingCache.length;
    let generated = 0;
    let failed = 0;
    for (const item of _missingCache) {
        postProgress(`🤖 Generating ${item.project.name} (${generated + 1} of ${total})…`);
        try {
            const readme = await generateReadme(item.project, item.context);
            const outPath = path.join(item.project.path, 'README.md');
            fs.writeFileSync(outPath, readme, 'utf8');
            (0, output_channel_1.log)(FEATURE, `Generated README: ${outPath}`);
            generated++;
        }
        catch (err) {
            (0, output_channel_1.logError)(FEATURE, `Failed for ${item.project.name}`, err);
            failed++;
        }
    }
    const msg = `✅ Generated ${generated} README(s)${failed ? `, ${failed} failed` : ''}. Refreshing catalog…`;
    postDone(msg);
    vscode.window.showInformationMessage(msg);
    // Rebuild catalog so new READMEs appear
    try {
        await vscode.commands.executeCommand('cvs.catalog.rebuild');
    }
    catch { /* catalog may not be open */ }
    // Refresh panel
    await runScan();
}
async function generateSingleByName(projectName) {
    const item = _missingCache.find(m => m.project.name === projectName);
    if (!item) {
        postError(`Project "${projectName}" not found in missing list.`);
        return;
    }
    try {
        postProgress(`🤖 Calling AI for ${item.project.name}…`);
        const readme = await generateReadme(item.project, item.context);
        const outPath = path.join(item.project.path, 'README.md');
        fs.writeFileSync(outPath, readme, 'utf8');
        (0, output_channel_1.log)(FEATURE, `Generated README: ${outPath}`);
        postDone(`✅ README generated for ${item.project.name} → ${outPath}`);
        vscode.window.showInformationMessage(`README generated for ${item.project.name}`, 'Open It').then(async (c) => {
            if (c === 'Open It') {
                const doc = await vscode.workspace.openTextDocument(outPath);
                await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
            }
        });
        // Rebuild catalog
        try {
            await vscode.commands.executeCommand('cvs.catalog.rebuild');
        }
        catch { /* ignore */ }
        // Refresh panel after short delay
        setTimeout(() => runScan(), 1500);
    }
    catch (err) {
        (0, output_channel_1.logError)(FEATURE, `Failed for ${item.project.name}`, err);
        postError(`❌ Failed for ${item.project.name}: ${err}`);
        vscode.window.showErrorMessage(`README generation failed for ${item.project.name}: ${err}`);
    }
}
async function generateSingleInteractive() {
    const registry = (0, registry_1.loadRegistry)();
    if (!registry) {
        return;
    }
    const missing = findMissingReadmes(registry);
    if (!missing.length) {
        vscode.window.showInformationMessage('All projects already have README files. ✅');
        return;
    }
    const picked = await vscode.window.showQuickPick(missing.map(m => ({
        label: `$(file) ${m.project.name}`,
        description: m.project.type,
        detail: m.project.path,
        item: m,
    })), { placeHolder: `${missing.length} projects missing README — pick one to generate` });
    if (!picked) {
        return;
    }
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Generating README for ${picked.item.project.name}…` }, async () => {
        const readme = await generateReadme(picked.item.project, picked.item.context);
        const outPath = path.join(picked.item.project.path, 'README.md');
        fs.writeFileSync(outPath, readme, 'utf8');
        (0, output_channel_1.log)(FEATURE, `Generated: ${outPath}`);
    });
    const outPath = path.join(picked.item.project.path, 'README.md');
    vscode.window.showInformationMessage(`README generated for ${picked.item.project.name}`, 'Open It').then(async (c) => {
        if (c === 'Open It') {
            const doc = await vscode.workspace.openTextDocument(outPath);
            await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
        }
    });
    try {
        await vscode.commands.executeCommand('cvs.catalog.rebuild');
    }
    catch { /* ignore */ }
}
// ─── Activate / Deactivate ────────────────────────────────────────────────────
function activate(context) {
    (0, output_channel_1.log)(FEATURE, 'Activating');
    context.subscriptions.push(vscode.commands.registerCommand('cvs.readme.generate.scan', runScan), vscode.commands.registerCommand('cvs.readme.generate.run', async () => {
        // Always freshen before running all
        const registry = (0, registry_1.loadRegistry)();
        if (registry) {
            _missingCache = findMissingReadmes(registry);
        }
        await generateAllMissing();
    }), vscode.commands.registerCommand('cvs.readme.generate.single', generateSingleInteractive));
}
function deactivate() {
    _panel?.dispose();
    _panel = undefined;
    _missingCache = [];
    _registryCache = undefined;
}
//# sourceMappingURL=readme-generator.js.map