// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * playwright-check.ts
 *
 * Scans all registered projects for proper Playwright test setup.
 * Shows a rich webview with per-project status and per-issue fix buttons.
 *
 * Fix actions:
 *   - Create tests/ folder with a starter test
 *   - Fix package.json test script to use playwright
 *   - Create playwright.config.ts
 *   - Add @playwright/test to devDependencies (updates package.json)
 *   - Fix All — runs all four fixes for one project
 *
 * Command: cvs.audit.testCoverage
 */

import * as vscode from 'vscode';
import * as fs     from 'fs';
import * as path   from 'path';
import { log, logError } from '../shared/output-channel';
import { callClaude } from '../shared/anthropic-client';
import { REGISTRY_PATH, loadRegistry } from '../shared/registry';
import { checkTestCoverage } from './daily-audit/checks/test-coverage';
import type { TestCoverageResult } from './daily-audit/checks/test-coverage';

const FEATURE = 'playwright-check';

function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Fix helpers ─────────────────────────────────────────────────────────────

const PLAYWRIGHT_CONFIG = `import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: 'html',
    use: {
        trace: 'on-first-retry',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
});
`;

function starterTest(projName: string): string {
    return `import { test, expect } from '@playwright/test';

/**
 * ${projName} — starter Playwright test
 * Add real tests here.
 */
test('placeholder test — replace with real tests', async ({ page }) => {
    // TODO: replace with a real URL and assertions for ${projName}
    // await page.goto('http://localhost:3000');
    // await expect(page).toHaveTitle(/My App/);
    expect(true).toBe(true);
});
`;
}

async function fixCreateTestsFolder(projPath: string, projName: string): Promise<string> {
    const testsDir = path.join(projPath, 'tests');
    if (!fs.existsSync(testsDir)) {
        fs.mkdirSync(testsDir, { recursive: true });
        log(FEATURE, `Created tests/ for ${projName}`);
    }
    // Create a starter test file if folder was empty
    const starterPath = path.join(testsDir, `${projName.toLowerCase().replace(/\s+/g, '-')}.spec.ts`);
    if (!fs.existsSync(starterPath)) {
        fs.writeFileSync(starterPath, starterTest(projName), 'utf8');
        log(FEATURE, `Created starter test: ${starterPath}`);
        const doc = await vscode.workspace.openTextDocument(starterPath);
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
    }
    return `Created tests/ folder and starter test for ${projName}`;
}

async function fixPlaywrightScript(projPath: string, projName: string): Promise<string> {
    const pkgPath = path.join(projPath, 'package.json');
    if (!fs.existsSync(pkgPath)) { return 'No package.json — skipped'; }
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (!pkg.scripts) { pkg.scripts = {}; }
    pkg.scripts.test         = 'playwright test';
    pkg.scripts['test:ui']   = 'playwright test --ui';
    pkg.scripts['test:headed'] = 'playwright test --headed';
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf8');
    log(FEATURE, `Fixed test script in ${projName}/package.json`);
    return `Updated package.json test script → playwright test`;
}

async function fixPlaywrightConfig(projPath: string, projName: string): Promise<string> {
    const configPath = path.join(projPath, 'playwright.config.ts');
    if (!fs.existsSync(configPath)) {
        fs.writeFileSync(configPath, PLAYWRIGHT_CONFIG, 'utf8');
        log(FEATURE, `Created playwright.config.ts for ${projName}`);
        const doc = await vscode.workspace.openTextDocument(configPath);
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
    }
    return `Created playwright.config.ts for ${projName}`;
}

async function fixPlaywrightDep(projPath: string, projName: string): Promise<string> {
    const pkgPath = path.join(projPath, 'package.json');
    if (!fs.existsSync(pkgPath)) { return 'No package.json — skipped'; }
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (!pkg.devDependencies) { pkg.devDependencies = {}; }
    // Remove jest deps while we're here
    for (const jestPkg of ['jest', '@jest/globals', 'ts-jest', '@types/jest', 'jest-environment-jsdom']) {
        delete pkg.devDependencies[jestPkg];
        delete (pkg.dependencies ?? {})[jestPkg];
    }
    pkg.devDependencies['@playwright/test'] = '^1.44.0';
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf8');
    log(FEATURE, `Added @playwright/test to ${projName}/package.json`);
    return `Added @playwright/test to devDependencies (run npm install to complete)`;
}

// ─── AI test generation ─────────────────────────────────────────────────────

const SRC_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cs|py)$/;
const SKIP_DIRS      = new Set(['node_modules', '.git', 'dist', 'out', 'bin', 'obj', '.vs', 'coverage']);

/** Collect meaningful source files for the AI prompt (max ~6000 chars of content). */
function collectSourceContext(projPath: string): string {
    const files: Array<{ rel: string; content: string }> = [];
    let totalChars = 0;
    const MAX_CHARS = 6000;

    function walk(dir: string, depth = 0): void {
        if (depth > 3 || totalChars >= MAX_CHARS) { return; }
        let entries: string[] = [];
        try { entries = fs.readdirSync(dir); } catch { return; }
        for (const e of entries) {
            if (SKIP_DIRS.has(e) || e.startsWith('.')) { continue; }
            const full = path.join(dir, e);
            let stat: { isDirectory(): boolean; isFile(): boolean };
            try { stat = fs.statSync(full); } catch { continue; }
            if (stat.isDirectory()) {
                walk(full, depth + 1);
            } else if (stat.isFile() && SRC_EXTENSIONS.test(e)) {
                try {
                    const content = fs.readFileSync(full, 'utf8').slice(0, 1500);
                    const rel = path.relative(projPath, full).replace(/\\/g, '/');
                    files.push({ rel, content });
                    totalChars += content.length;
                    if (totalChars >= MAX_CHARS) { return; }
                } catch { /* skip */ }
            }
        }
    }

    // Prioritise src/ then root
    const srcDir = path.join(projPath, 'src');
    if (fs.existsSync(srcDir)) { walk(srcDir); }
    if (totalChars < MAX_CHARS) { walk(projPath, 1); }

    return files
        .map(f => `// --- ${f.rel} ---\n${f.content}`)
        .join('\n\n');
}

async function generateTestsWithAI(projPath: string, projName: string): Promise<string> {
    const testsDir  = path.join(projPath, 'tests');
    const specName  = `${projName.toLowerCase().replace(/[^a-z0-9]/g, '-')}.spec.ts`;
    const specPath  = path.join(testsDir, specName);

    // Gather context: package.json, CLAUDE.md, source files
    const pkgPath    = path.join(projPath, 'package.json');
    const claudePath = path.join(projPath, 'CLAUDE.md');

    const pkgContent    = fs.existsSync(pkgPath)    ? fs.readFileSync(pkgPath,    'utf8').slice(0, 1000) : '(none)';
    const claudeContent = fs.existsSync(claudePath) ? fs.readFileSync(claudePath, 'utf8').slice(0, 1000) : '(none)';
    const srcContext    = collectSourceContext(projPath);

    const prompt = `You are a senior TypeScript developer writing Playwright unit tests for a CieloVista Software project.

Project name: ${projName}
Project path: ${projPath}

--- package.json ---
${pkgContent}

--- CLAUDE.md ---
${claudeContent}

--- Source files (excerpts) ---
${srcContext || '(no source files found)'}

Your task: Write a complete, runnable Playwright test file (*.spec.ts) that covers the fundamental behaviours of this project.

Rules:
- Use @playwright/test imports only (import { test, expect } from '@playwright/test')
- For pure logic modules (no browser needed): use test() with node-based assertions — no page.goto()
- For UI/web projects: start with smoke tests (page loads, title, key elements visible)
- Write 5–15 meaningful tests — NOT placeholders
- Group related tests with test.describe()
- Every test must have a clear description of what it verifies
- Do NOT include the string 'placeholder test' anywhere
- Do NOT use jest, mocha, or any other test runner
- Output ONLY the TypeScript code — no markdown fences, no explanation`;

    log(FEATURE, `Calling AI to generate tests for ${projName}…`);
    const generated = await callClaude(prompt, 3000);

    // Strip accidental markdown fences if the AI wrapped the output
    const clean = generated
        .replace(/^```typescript\s*/i, '')
        .replace(/^```ts\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();

    if (!fs.existsSync(testsDir)) { fs.mkdirSync(testsDir, { recursive: true }); }
    fs.writeFileSync(specPath, clean, 'utf8');
    log(FEATURE, `Generated tests written to ${specPath}`);

    const doc = await vscode.workspace.openTextDocument(specPath);
    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);

    return `Generated ${projName} tests → ${specName}`;
}

async function runFix(action: string, projPath: string, projName: string): Promise<string> {
    switch (action) {
        case 'generateTests': {
            return generateTestsWithAI(projPath, projName);
        }
        case 'createTests':     return fixCreateTestsFolder(projPath, projName);
        case 'fixScript':       return fixPlaywrightScript(projPath, projName);
        case 'createConfig':    return fixPlaywrightConfig(projPath, projName);
        case 'addDep':          return fixPlaywrightDep(projPath, projName);
        case 'fixAll': {
            const r = checkTestCoverage({ name: projName, path: projPath, type: '' });
            const msgs: string[] = [];
            if (!r.hasTests)      { msgs.push(await fixCreateTestsFolder(projPath, projName)); }
            if (r.hasNpm) {
                if (!r.hasPlaywright) { msgs.push(await fixPlaywrightScript(projPath, projName)); }
                if (!r.hasConfig)     { msgs.push(await fixPlaywrightConfig(projPath, projName)); }
                if (!r.hasDep)        { msgs.push(await fixPlaywrightDep(projPath, projName)); }
            }
            return msgs.length ? msgs.join('\n') : 'Nothing to fix';
        }
        default: return `Unknown action: ${action}`;
    }
}

// ─── HTML ─────────────────────────────────────────────────────────────────────

function statusDot(r: TestCoverageResult): string {
    if (!fs.existsSync(r.projPath)) {
        return '<span style="color:#888">⚪</span>';
    }
    return r.issues.length === 0 ? '🟢' : r.issues.length <= 2 ? '🟡' : '🔴';
}

function buildHtml(results: TestCoverageResult[]): string {
    const total   = results.length;
    const passing = results.filter(r => r.issues.length === 0).length;
    const failing = results.filter(r => r.issues.length >  0).length;

    const rows = results.map(r => {
        const dot      = statusDot(r);
        const notFound = !fs.existsSync(r.projPath);

        if (notFound) {
            return `<tr class="row-warn">
  <td class="status-cell">${dot}</td>
  <td class="name-cell">${esc(r.name)}</td>
  <td class="type-cell">${esc(r.type)}</td>
  <td class="issues-cell"><span class="issue-label">Path not found on disk</span></td>
  <td class="fix-cell"></td>
</tr>`;
        }

        const specBadge = r.specFiles.length > 0
            ? ` <span class="spec-count">${r.realTestCount}/${r.specFiles.length} spec${r.specFiles.length > 1 ? 's' : ''} real</span>`
            : '';

        if (r.issues.length === 0) {
            return `<tr class="row-ok">
  <td class="status-cell">${dot}</td>
  <td class="name-cell">${esc(r.name)}</td>
  <td class="type-cell">${esc(r.type)}</td>
  <td class="issues-cell"><span class="ok-label">All checks passed</span>${specBadge}</td>
  <td class="fix-cell"></td>
</tr>`;
        }

        // Build per-issue fix buttons
        const issueRows = r.issues.map(issue => {
            let action = '';
            let fixLabel = '';
            if (issue.includes('tests/') && issue.includes('No tests'))   { action = 'createTests';   fixLabel = '📁 Create tests/'; }
            else if (issue.includes('placeholder') || issue.includes('empty')) { action = 'generateTests'; fixLabel = '🤖 Generate Tests'; }
            else if (issue.includes('test runner') || issue.includes('test script') || issue.includes('playwright test')) {
                                                      action = 'fixScript';    fixLabel = '🔧 Fix Script'; }
            else if (issue.includes('playwright.config')) { action = 'createConfig'; fixLabel = '🔧 Create Config'; }
            else if (issue.includes('@playwright'))  { action = 'addDep';      fixLabel = '📦 Add Dep'; }

            const fixBtn = action
                ? `<button class="fix-btn issue-fix-btn" data-action="${esc(action)}" data-proj="${esc(r.name)}" data-proj-path="${esc(r.projPath)}" title="Fix: ${esc(issue)}">${fixLabel}</button>`
                : '';

            return `<tr class="issue-row">
  <td></td><td></td><td></td>
  <td class="issue-detail">
    <span class="issue-dot">🔴</span>
    <span class="issue-label">${esc(issue)}</span>
  </td>
  <td class="fix-cell">${fixBtn}</td>
</tr>`;
        }).join('');

        return `<tr class="row-err">
  <td class="status-cell">${dot}</td>
  <td class="name-cell">${esc(r.name)}</td>
  <td class="type-cell">${esc(r.type)}</td>
  <td class="issues-cell"><span class="issue-count">${r.issues.length} issue${r.issues.length > 1 ? 's' : ''}</span></td>
  <td class="fix-cell">
    <button class="fix-btn fix-all-btn" data-action="fixAll" data-proj="${esc(r.name)}" data-proj-path="${esc(r.projPath)}">🔧 Fix All</button>
  </td>
</tr>${issueRows}`;
    }).join('');

    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);font-size:13px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background)}
.toolbar{position:sticky;top:0;background:var(--vscode-editor-background);border-bottom:1px solid var(--vscode-panel-border);padding:10px 16px;display:flex;align-items:center;gap:10px;z-index:10}
.toolbar h2{font-size:1.05em;font-weight:700;flex:1}
.pill{display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600;border:1px solid}
.pill-ok{border-color:var(--vscode-testing-iconPassed);color:var(--vscode-testing-iconPassed)}
.pill-err{border-color:var(--vscode-inputValidation-warningBorder,#cca700);color:var(--vscode-inputValidation-warningBorder,#cca700)}
.rescan-btn{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;padding:4px 12px;border-radius:3px;cursor:pointer;font-size:12px}
.rescan-btn:hover{background:var(--vscode-button-secondaryHoverBackground)}
.fix-all-projects-btn{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;padding:4px 12px;border-radius:3px;cursor:pointer;font-size:12px;font-weight:600}
.fix-all-projects-btn:hover{background:var(--vscode-button-hoverBackground)}
.content{padding:12px 16px 40px}
table{width:100%;border-collapse:collapse;font-size:12px}
th{text-align:left;padding:6px 10px;background:var(--vscode-textCodeBlock-background);border-bottom:2px solid var(--vscode-focusBorder);font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;white-space:nowrap}
td{padding:5px 10px;border-bottom:1px solid var(--vscode-panel-border);vertical-align:middle}
tr.row-ok:hover td,tr.row-err:hover td{background:var(--vscode-list-hoverBackground)}
.status-cell{width:28px;text-align:center;font-size:14px}
.name-cell{font-weight:700;white-space:nowrap}
.type-cell{font-size:10px;color:var(--vscode-descriptionForeground);white-space:nowrap}
.fix-cell{white-space:nowrap;text-align:right}
.ok-label{color:var(--vscode-testing-iconPassed);font-size:11px}
.issue-count{color:var(--vscode-inputValidation-warningForeground,#cca700);font-size:11px;font-weight:600}
.issue-row td{padding:3px 10px;border-bottom:none}
.issue-detail{display:flex;align-items:center;gap:6px;padding-left:20px}
.issue-dot{font-size:10px}
.issue-label{color:var(--vscode-inputValidation-warningForeground,#cca700);font-size:11px}
.fix-btn{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;padding:3px 9px;border-radius:3px;cursor:pointer;font-size:11px;font-weight:600;white-space:nowrap}
.fix-btn:hover{background:var(--vscode-button-hoverBackground)}
.issue-fix-btn{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);font-size:10px;padding:2px 7px}
.issue-fix-btn:hover{background:var(--vscode-button-secondaryHoverBackground)}
.spec-count{font-size:10px;color:var(--vscode-testing-iconPassed);background:var(--vscode-textCodeBlock-background);border:1px solid var(--vscode-panel-border);border-radius:10px;padding:1px 8px;margin-left:6px}
.meta{padding:8px 16px;font-size:11px;color:var(--vscode-descriptionForeground);border-top:1px solid var(--vscode-panel-border);margin-top:12px}
#status-bar{padding:6px 16px;font-size:12px;background:var(--vscode-statusBar-background);color:var(--vscode-statusBar-foreground);border-top:1px solid var(--vscode-panel-border);display:none;position:fixed;bottom:0;left:0;right:0}
#status-bar.visible{display:block}
</style>
</head><body>
<div class="toolbar">
  <h2>🎭 Playwright Test Coverage</h2>
  <span class="pill pill-ok">✅ ${passing} clean</span>
  <span class="pill pill-err">⚠️ ${failing} need attention</span>
  <button class="rescan-btn" data-action="rescan">↺ Rescan</button>
  ${failing > 0 ? `<button class="fix-all-projects-btn" data-action="fixAllProjects">🔧 Fix All Projects</button>` : ''}
</div>
<div class="content">
<table>
  <thead><tr><th></th><th>Project</th><th>Type</th><th>Issues</th><th>Resolve</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="meta">
  ${total} projects checked · Tests folder + Playwright test script + config + devDependency<br>
  After adding @playwright/test run <code>npm install</code> in the project folder, then <code>npx playwright install</code>
</div>
</div>
<div id="status-bar"></div>
<script>
(function(){
'use strict';
const vscode = acquireVsCodeApi();
function showStatus(t){var b=document.getElementById('status-bar');b.textContent=t;b.className='visible';setTimeout(function(){b.className='';},4000);}
document.addEventListener('click',function(e){
  var btn=e.target.closest('[data-action]');
  if(!btn){return;}
  var action=btn.dataset.action;
  if(action==='rescan'){showStatus('Rescanning…');vscode.postMessage({action:'rescan'});return;}
  if(action==='fixAllProjects'){showStatus('Fixing all projects…');vscode.postMessage({action:'fixAllProjects'});return;}
  var proj=btn.dataset.proj||'';
  var projPath=btn.dataset.projPath||'';
  showStatus('Working on '+proj+'…');
  vscode.postMessage({action:action,proj:proj,projPath:projPath});
});
window.addEventListener('message',function(e){
  var m=e.data;
  if(m.type==='done'){showStatus('✅ '+m.text);}
  if(m.type==='error'){showStatus('❌ '+m.text);}
  if(m.type==='html'){document.open();document.write(m.html);document.close();}
});
})();
</script>
</body></html>`;
}

// ─── Command ─────────────────────────────────────────────────────────────────

export async function runPlaywrightCheck(): Promise<void> {
    const registry = loadRegistry();
    if (!registry) { return; }

    const results = registry.projects.map(p =>
        checkTestCoverage({ name: p.name, path: p.path, type: p.type })
    );

    const panel = vscode.window.createWebviewPanel(
        'playwrightCheck', '🎭 Playwright Test Coverage', vscode.ViewColumn.Beside,
        { enableScripts: true, retainContextWhenHidden: true }
    );

    panel.webview.html = buildHtml(results);

    panel.webview.onDidReceiveMessage(async msg => {
        const { action, proj, projPath } = msg as { action: string; proj: string; projPath: string };

        try {
            if (action === 'rescan') {
                const fresh = loadRegistry();
                if (!fresh) { return; }
                const freshResults = fresh.projects.map(p =>
                    checkTestCoverage({ name: p.name, path: p.path, type: p.type })
                );
                panel.webview.html = buildHtml(freshResults);
                return;
            }

            if (action === 'fixAllProjects') {
                const fresh = loadRegistry();
                if (!fresh) { return; }
                let fixed = 0;
                for (const p of fresh.projects) {
                    const r = checkTestCoverage({ name: p.name, path: p.path, type: p.type });
                    if (r.issues.length > 0) {
                        await runFix('fixAll', p.path, p.name);
                        fixed++;
                    }
                }
                // Rescan and refresh
                const updated = fresh.projects.map(p =>
                    checkTestCoverage({ name: p.name, path: p.path, type: p.type })
                );
                panel.webview.html = buildHtml(updated);
                panel.webview.postMessage({ type: 'done', text: `Fixed ${fixed} project${fixed !== 1 ? 's' : ''}` });
                return;
            }

            // Single-project fix action
            // Show VS Code progress notification for AI generation (can take several seconds)
            let text: string;
            if (action === 'generateTests') {
                text = await vscode.window.withProgress(
                    { location: vscode.ProgressLocation.Notification, title: `🤖 Generating tests for ${proj}…`, cancellable: false },
                    () => runFix(action, projPath, proj)
                );
            } else {
                text = await runFix(action, projPath, proj);
            }
            log(FEATURE, `Fix complete: ${action} on ${proj} — ${text}`);

            // Rescan and refresh panel
            const fresh = loadRegistry();
            if (fresh) {
                const updated = fresh.projects.map(p =>
                    checkTestCoverage({ name: p.name, path: p.path, type: p.type })
                );
                panel.webview.html = buildHtml(updated);
            }

            panel.webview.postMessage({ type: 'done', text });

        } catch (err) {
            logError(`Fix failed: ${action} on ${proj}`, err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
            panel.webview.postMessage({ type: 'error', text: String(err) });
        }
    });

    log(FEATURE, `Playwright check opened — ${results.length} projects scanned`);
}
