// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * readme-compliance.ts
 *
 * Scans every README.md and *.README.md across all registered projects,
 * scores them against the CieloVista README Standard, and provides
 * auto-fix capabilities for non-compliant files.
 *
 * Fix flow uses diff2html (CDN) + jsdiff (npm devDependency) to show a
 * real before/after diff in a webview. User must click Approve or Ignore
 * per fix — nothing is ever written without explicit approval.
 *
 * Standard: C:\Users\jwpmi\Downloads\CieloVistaStandards\README-STANDARD.md
 *
 * Three README types are recognized:
 *   PROJECT  — README.md at project root
 *   FEATURE  — *.README.md inside a project (feature/component docs)
 *   STANDARD — READMEs in CieloVistaStandards/ or docs/ folders
 *
 * Compliance score 0–100:
 *   < 60  = Non-compliant  (auto-fix offered)
 *   60–79 = Partial        (issues reported)
 *   80+   = Compliant
 *
 * Commands registered:
 *   cvs.readme.scan        — scan all READMEs and show compliance report
 *   cvs.readme.fix         — pick a non-compliant README, show diff, approve/ignore
 *   cvs.readme.fixAll      — auto-fix all non-compliant READMEs (with confirmation)
 *   cvs.readme.viewStandard — open the README standard doc
 *   cvs.readme.new         — create a new compliant README from template
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as jsdiff from 'diff';
import { log, logError } from '../../shared/output-channel';
import { callClaude } from '../../shared/anthropic-client';
import { loadRegistry } from '../../shared/registry';


const FEATURE     = 'readme-compliance';
const GLOBAL_DOCS = 'C:\\Users\\jwpmi\\Downloads\\CieloVistaStandards';
const STANDARD_PATH = path.join(GLOBAL_DOCS, 'README-STANDARD.md');

// ─── Types ────────────────────────────────────────────────────────────────────

type ReadmeType = 'PROJECT' | 'FEATURE' | 'STANDARD';

interface ComplianceIssue {
    severity: 'error' | 'warning' | 'info';
    message:  string;
    fixable:  boolean;
    fixKey:   string;
}

interface ReadmeReport {
    filePath:               string;
    fileName:               string;
    projectName:            string;
    readmeType:             ReadmeType;
    score:                  number;
    issues:                 ComplianceIssue[];
    lineCount:              number;
    missingRequiredSections: string[];
    outOfOrderSections:     string[];
}

// ─── Required sections by type ────────────────────────────────────────────────

const REQUIRED_SECTIONS: Record<ReadmeType, string[]> = {
    PROJECT:  ['what it does', 'quick start', 'architecture', 'project structure', 'common commands', 'prerequisites', 'license'],
    FEATURE:  ['what it does', 'internal architecture', 'manual test'],
    STANDARD: ['purpose', 'rules', 'changelog'],
};

const SECTION_ORDER: Record<ReadmeType, string[]> = {
    PROJECT:  ['what it does', 'quick start', 'architecture', 'project structure', 'common commands', 'prerequisites', 'license'],
    FEATURE:  ['what it does', 'commands', 'settings', 'internal architecture', 'manual test'],
    STANDARD: ['purpose', 'rules', 'examples', 'related documents', 'changelog'],
};

const LINE_LIMITS: Record<ReadmeType, number> = {
    PROJECT:  300,
    FEATURE:  150,
    STANDARD: 400,
};

// ─── Section stubs ────────────────────────────────────────────────────────────

const STUBS: Record<ReadmeType, Record<string, string>> = {
    PROJECT: {
        'what it does':      `## What it does\n\n_TODO: 2–5 sentences describing what problem this project solves and who uses it._\n`,
        'quick start':       `## Quick Start\n\n\`\`\`powershell\n# TODO: minimum commands to get running\n\`\`\`\n`,
        'architecture':      `## Architecture\n\n_TODO: high-level tech stack and key design decisions (max 10 lines)._\n`,
        'project structure': `## Project Structure\n\n\`\`\`\n# TODO: directory tree with annotations\n\`\`\`\n`,
        'common commands':   `## Common Commands\n\n\`\`\`powershell\n# TODO: the 5–10 commands developers run most often\n\`\`\`\n`,
        'prerequisites':     `## Prerequisites\n\n- TODO: list required tools and versions\n`,
        'license':           `## License\n\nCopyright (c) ${new Date().getFullYear()} CieloVista Software\n`,
    },
    FEATURE: {
        'what it does':         `## What it does\n\n_TODO: one paragraph describing the single responsibility of this file._\n`,
        'commands':             `## Commands\n\n| Command ID | Title | Keybinding |\n|---|---|---|\n| \`cvs.TODO\` | TODO | — |\n`,
        'settings':             `## Settings\n\n| Key | Type | Default | Description |\n|---|---|---|---|\n| \`TODO\` | boolean | \`false\` | TODO |\n`,
        'internal architecture':`## Internal architecture\n\n\`\`\`\nactivate()\n  └── TODO: describe call flow\n\`\`\`\n`,
        'manual test':          `## Manual test\n\n1. TODO: step one\n2. TODO: step two\n3. TODO: expected result\n`,
    },
    STANDARD: {
        'purpose':           `## Purpose\n\n_TODO: why does this standard exist? What problem does it prevent?_\n`,
        'rules':             `## Rules\n\n1. TODO: first rule — one clear sentence.\n2. TODO: second rule.\n`,
        'examples':          `## Examples\n\n\`\`\`typescript\n// ✅ Good\n// TODO\n\n// ❌ Bad\n// TODO\n\`\`\`\n`,
        'related documents': `## Related Documents\n\n- [README Standard](${STANDARD_PATH})\n`,
        'changelog':         `## Changelog\n\n- v1.0.0 (${new Date().toISOString().slice(0, 10)}): Initial version\n`,
    },
};

// ─── README detection ─────────────────────────────────────────────────────────

function isReadme(fileName: string): boolean {
    return /^readme\.md$/i.test(fileName) || /\.readme\.md$/i.test(fileName);
}

function detectType(filePath: string, projectRootPath: string, projectName: string): ReadmeType {
    const fileName = path.basename(filePath).toLowerCase();
    const dir      = path.dirname(filePath);
    if (/\.readme\.md$/i.test(fileName))  { return 'FEATURE'; }
    if (projectName === 'global')          { return 'STANDARD'; }
    if (/[\\/]docs[\\/]/i.test(dir))       { return 'STANDARD'; }
    const rel = path.relative(projectRootPath, dir);
    if (rel === '' || rel === '.')         { return 'PROJECT'; }
    return 'FEATURE';
}

// ─── Scanner ──────────────────────────────────────────────────────────────────

const SKIP = new Set(['node_modules', '.git', 'out', 'dist', 'reports']);

function collectReadmes(rootPath: string, projectName: string, projectRoot: string, maxDepth = 4): Array<{ filePath: string; projectName: string; projectRoot: string }> {
    const results: Array<{ filePath: string; projectName: string; projectRoot: string }> = [];
    function walk(dir: string, depth: number): void {
        if (depth > maxDepth || !fs.existsSync(dir)) { return; }
        let entries: fs.Dirent[];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const entry of entries) {
            if (SKIP.has(entry.name)) { continue; }
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) { walk(full, depth + 1); }
            else if (entry.isFile() && isReadme(entry.name)) { results.push({ filePath: full, projectName, projectRoot }); }
        }
    }
    walk(rootPath, 0);
    return results;
}

// ─── Compliance checker ───────────────────────────────────────────────────────

function normalizeHeading(h: string): string { return h.toLowerCase().replace(/^#+\s*/, '').trim(); }

function extractHeadings(content: string): string[] {
    return content.split('\n').filter(l => /^#{1,4}\s/.test(l)).map(normalizeHeading);
}

function checkCompliance(filePath: string, projectName: string, projectRoot: string): ReadmeReport {
    const fileName   = path.basename(filePath);
    const readmeType = detectType(filePath, projectRoot, projectName);
    const issues: ComplianceIssue[] = [];
    let content = '', lineCount = 0;
    try { content = fs.readFileSync(filePath, 'utf8'); lineCount = content.split('\n').length; }
    catch { return { filePath, fileName, projectName, readmeType, score: 0, issues: [{ severity: 'error', message: 'Could not read file', fixable: false, fixKey: '' }], lineCount: 0, missingRequiredSections: [], outOfOrderSections: [] }; }

    const headings = extractHeadings(content);
    const lines    = content.split('\n');
    const required = REQUIRED_SECTIONS[readmeType];
    const limit    = LINE_LIMITS[readmeType];

    const firstNonBlank = lines.find(l => l.trim());
    if (!firstNonBlank || !/^#\s/.test(firstNonBlank)) { issues.push({ severity: 'error', message: 'First non-blank line is not a # heading', fixable: true, fixKey: 'first-heading' }); }

    const missing = required.filter(sec => !headings.some(h => h.includes(sec)));
    missing.forEach(sec => issues.push({ severity: 'error', message: `Missing required section: "${sec}"`, fixable: true, fixKey: `missing-section:${sec}` }));

    const expectedOrder = SECTION_ORDER[readmeType];
    const foundInOrder  = expectedOrder.filter(sec => headings.some(h => h.includes(sec)));
    const actualOrder   = headings.filter(h => expectedOrder.some(s => h.includes(s)));
    const outOfOrder: string[] = [];
    let lastIdx = -1;
    for (const h of actualOrder) {
        const sec = expectedOrder.find(s => h.includes(s));
        if (!sec) { continue; }
        const idx = foundInOrder.indexOf(sec);
        if (idx < lastIdx) { outOfOrder.push(sec); } else { lastIdx = idx; }
    }
    if (outOfOrder.length) { issues.push({ severity: 'warning', message: `Sections out of order: ${outOfOrder.join(', ')}`, fixable: false, fixKey: 'order' }); }

    if (lineCount > limit) { issues.push({ severity: 'warning', message: `File is ${lineCount} lines (limit: ${limit}). Extract details into docs/.`, fixable: false, fixKey: 'line-limit' }); }

    const seen = new Set<string>(), dupes: string[] = [];
    for (const h of headings) { if (seen.has(h)) { dupes.push(h); } else { seen.add(h); } }
    if (dupes.length) { issues.push({ severity: 'warning', message: `Duplicate headings: ${dupes.join(', ')}`, fixable: false, fixKey: 'dupe-headings' }); }

    const bareCodeBlocks = (content.match(/^```\s*$/gm) ?? []).length;
    if (bareCodeBlocks > 0) { issues.push({ severity: 'warning', message: `${bareCodeBlocks} code block(s) missing language tag`, fixable: true, fixKey: 'code-block-lang' }); }

    let prevLevel = 0;
    for (const line of lines) {
        const m = line.match(/^(#{1,6})\s/);
        if (m) { const level = m[1].length; if (level > prevLevel + 1 && prevLevel > 0) { issues.push({ severity: 'warning', message: `Skipped heading level (h${prevLevel} → h${level})`, fixable: false, fixKey: 'heading-level' }); break; } prevLevel = level; }
    }

    if (readmeType === 'FEATURE') {
        const h1 = headings[0] ?? '';
        if (!h1.includes('feature:') && !h1.includes('component:') && !h1.includes('module:')) { issues.push({ severity: 'info', message: 'Feature READMEs should start with "# feature:", "# component:", or "# module:"', fixable: true, fixKey: 'feature-prefix' }); }
    }
    if (readmeType === 'STANDARD') {
        const titleLineIdx  = lines.findIndex(l => /^#\s/.test(l));
        const hasBlockquote = lines.slice(titleLineIdx + 1, titleLineIdx + 5).some(l => l.startsWith('>'));
        if (!hasBlockquote) { issues.push({ severity: 'info', message: 'Standard docs should have a blockquote summary after the title', fixable: true, fixKey: 'standard-blockquote' }); }
    }

    let score = 100;
    if (issues.some(i => i.fixKey === 'first-heading'))  { score -= 10; }
    if (required.length > 0) { score -= Math.round((missing.length / required.length) * 40); }
    if (outOfOrder.length)   { score -= 10; }
    if (lineCount > limit)   { score -= 10; }
    if (dupes.length)        { score -= 5; }
    if (bareCodeBlocks > 0)  { score -= 10; }
    if (issues.some(i => i.fixKey === 'heading-level')) { score -= 10; }

    return { filePath, fileName, projectName, readmeType, score: Math.max(0, Math.min(100, score)), issues, lineCount, missingRequiredSections: missing, outOfOrderSections: outOfOrder };
}

// ─── Auto-fixer ───────────────────────────────────────────────────────────────

// ─── Smart fix helpers ────────────────────────────────────────────────────────

function frontmatterEnd(lines: string[]): number {
    if (!lines[0] || lines[0].trim() !== '---') { return 0; }
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === '---') { return i + 1; }
    }
    return 0;
}

const LANG_HINTS: Array<[RegExp, string]> = [
    [/^\s*(import|export|interface|type\s+\w+\s*=|const\s+\w+:\s|async\s+function)/m, 'typescript'],
    [/^\s*(function|const|let|var|require\(|module\.exports)/m,                        'javascript'],
    [/^\s*(def |class |import |from .+ import|if __name__)/m,                          'python'],
    [/^\s*(<\?php|\$\w+\s*=)/m,                                                        'php'],
    [/^\s*(<html|<div|<span|<p>|<!DOCTYPE)/im,                                         'html'],
    [/^\s*(\{|\}|"[^"]+"\s*:)/m,                                                       'json'],
    [/^\s*(#\s*\w|[A-Z_]+\s*=|export\s+[A-Z_])/m,                                     'bash'],
    [/^\s*(\$\w+|Get-|Set-|New-|Remove-|Invoke-|Write-Host)/m,                         'powershell'],
    [/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\b/im,                         'sql'],
    [/^\s*(FROM |RUN |CMD |ENTRYPOINT |COPY )/m,                                        'dockerfile'],
    [/^\s*([a-z_]+\s*:\s*$|\s+-\s+\w)/m,                                               'yaml'],
];

function guessLanguage(blockLines: string[]): string {
    const sample = blockLines.join('\n');
    for (const [pattern, lang] of LANG_HINTS) {
        if (pattern.test(sample)) { return lang; }
    }
    return 'text';
}

function applyFix(report: ReadmeReport): string {
    let content = fs.readFileSync(report.filePath, 'utf8');
    const stubs = STUBS[report.readmeType];
    for (const issue of report.issues) {
        if (!issue.fixable) { continue; }
        if (issue.fixKey === 'first-heading') {
            const lines = content.split('\n');
            const fmEnd = frontmatterEnd(lines);
            const bodyLines = lines.slice(fmEnd);
            if (bodyLines.findIndex(l => /^#\s/.test(l)) !== 0) {
                const name = path.basename(report.filePath, '.md').replace(/\.README$/i, '');
                content = [...lines.slice(0, fmEnd), `# ${name}`, '', ...lines.slice(fmEnd)].join('\n');
            }
        }
        if (issue.fixKey.startsWith('missing-section:')) {
            const sec = issue.fixKey.replace('missing-section:', '');
            const stub = stubs[sec];
            if (stub && !content.toLowerCase().includes(`## ${sec}`)) { content = content.trimEnd() + '\n\n---\n\n' + stub; }
        }
        if (issue.fixKey === 'code-block-lang') {
            const lines = content.split('\n');
            const result: string[] = [];
            let inBlock = false;
            for (let i = 0; i < lines.length; i++) {
                const isFence = /^```\s*$/.test(lines[i]);
                if (isFence && !inBlock) {
                    inBlock = true;
                    const blockLines: string[] = [];
                    let j = i + 1;
                    while (j < lines.length && !/^```/.test(lines[j])) { blockLines.push(lines[j]); j++; }
                    result.push(`\`\`\`${guessLanguage(blockLines)}`);
                } else {
                    if (isFence) { inBlock = false; }
                    result.push(lines[i]);
                }
            }
            content = result.join('\n');
        }
        if (issue.fixKey === 'feature-prefix')      { content = content.replace(/^(#\s+)(.+)$/m, (_, hash, title) => title.toLowerCase().startsWith('feature:') ? `${hash}${title}` : `${hash}feature: ${title}`); }
        if (issue.fixKey === 'standard-blockquote') { content = content.replace(/^(#\s+.+)$/m, (_, heading) => `${heading}\n\n> _TODO: one-line summary of what this standard covers._`); }
    }
    return content;
}

// ─── Diff webview (diff2html from CDN) ────────────────────────────────────────

let _diffPanel:  vscode.WebviewPanel | undefined;
let _batchPanel: vscode.WebviewPanel | undefined;

function buildDiffHtml(
    fileName:    string,
    filePath:    string,
    before:      string,
    after:       string,
    unifiedDiff: string,
    issues:      ComplianceIssue[]
): string {
    const fixableList = issues.filter(i => i.fixable).map(i =>
        `<li>${i.severity === 'error' ? '🔴' : '🟡'} ${i.message}</li>`
    ).join('');

    // Escape for embedding in JS string
    const diffJson = JSON.stringify(unifiedDiff);

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/diff2html@3.4.56/bundles/css/diff2html.min.css">
<script src="https://cdn.jsdelivr.net/npm/diff2html@3.4.56/bundles/js/diff2html-ui.min.js"><\/script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);font-size:13px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);display:flex;flex-direction:column;height:100vh;overflow:hidden}
#toolbar{display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--vscode-panel-border);flex-shrink:0;background:var(--vscode-editor-background)}
#toolbar h1{font-size:0.95em;font-weight:700;flex:1}
.btn-approve{background:#3fb950;color:#000;border:none;padding:6px 20px;border-radius:3px;cursor:pointer;font-size:13px;font-weight:700}
.btn-approve:hover{background:#50cc60}
.btn-ignore{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;padding:6px 16px;border-radius:3px;cursor:pointer;font-size:13px;font-weight:600}
.btn-ignore:hover{background:var(--vscode-button-secondaryHoverBackground)}
#issues{padding:8px 16px;font-size:11px;border-bottom:1px solid var(--vscode-panel-border);background:var(--vscode-textCodeBlock-background)}
#issues ul{padding-left:16px;display:flex;flex-wrap:wrap;gap:4px 20px}
#issues li{list-style:none}
#diff-wrap{flex:1;overflow-y:auto;padding:12px 16px}
/* Override diff2html to respect VS Code theme */
.d2h-wrapper{font-family:var(--vscode-editor-font-family,monospace)!important;font-size:12px!important}
.d2h-file-header{background:var(--vscode-textCodeBlock-background)!important;border-color:var(--vscode-panel-border)!important;color:var(--vscode-editor-foreground)!important}
.d2h-code-linenumber{background:var(--vscode-textCodeBlock-background)!important;border-color:var(--vscode-panel-border)!important;color:var(--vscode-descriptionForeground)!important}
/* High-contrast dark-mode diff row colors */
.d2h-del,.d2h-del td{background:#3c1f1e!important}
.d2h-del .d2h-code-line-ctn{color:#ffa0a0!important}
.d2h-ins,.d2h-ins td{background:#1b3a24!important}
.d2h-ins .d2h-code-line-ctn{color:#85e89d!important}
</style>
</head>
<body>
<div id="toolbar">
  <h1>📝 Proposed fix — ${fileName}</h1>
  <button class="btn-approve" id="btn-approve">✅ Approve &amp; Write</button>
  <button class="btn-ignore"  id="btn-ignore" >✕ Ignore</button>
</div>
<div id="issues">
  <strong>Fixes applied:</strong>
  <ul>${fixableList}</ul>
</div>
<div id="diff-wrap">
  <div id="diff-target"></div>
</div>
<script>
(function(){
  const vscode = acquireVsCodeApi();

  document.getElementById('btn-approve').addEventListener('click', function() {
    vscode.postMessage({ command: 'approve', filePath: ${JSON.stringify(filePath)} });
  });
  document.getElementById('btn-ignore').addEventListener('click', function() {
    vscode.postMessage({ command: 'ignore' });
  });

  document.addEventListener('DOMContentLoaded', function() {
    var diffStr = ${diffJson};
    var target  = document.getElementById('diff-target');
    var ui = new Diff2HtmlUI(target, diffStr, {
      drawFileList:       false,
      matching:           'lines',
      outputFormat:       'line-by-line',
      highlight:          true,
      renderNothingWhenEmpty: false,
    });
    ui.draw();
    ui.highlightCode();
  });
})();
<\/script>
</body>
</html>`;
}

async function showFixDiff(report: ReadmeReport): Promise<void> {
    const before = fs.readFileSync(report.filePath, 'utf8');
    const after  = applyFix(report);

    if (before === after) {
        vscode.window.showInformationMessage(`No changes needed for ${report.fileName}.`);
        return;
    }

    // Use jsdiff (npm devDependency) to build the unified diff string
    const unifiedDiff = jsdiff.createPatch(
        report.fileName,
        before,
        after,
        'before',
        'after',
        { context: 4 }
    );

    const html = buildDiffHtml(
        report.fileName,
        report.filePath,
        before,
        after,
        unifiedDiff,
        report.issues
    );

    if (_diffPanel) {
        _diffPanel.title        = `📝 Fix — ${report.fileName}`;
        _diffPanel.webview.html = html;
        _diffPanel.reveal(vscode.ViewColumn.Beside);
    } else {
        _diffPanel = vscode.window.createWebviewPanel(
            'readmeDiff',
            `📝 Fix — ${report.fileName}`,
            vscode.ViewColumn.Beside,
            { enableScripts: true, retainContextWhenHidden: false }
        );
        _diffPanel.webview.html = html;
        _diffPanel.onDidDispose(() => { _diffPanel = undefined; });
    }

    // Handle approve / ignore
    const startMs = Date.now();
    _diffPanel.webview.onDidReceiveMessage(async msg => {
        if (msg.command === 'approve') {
            try {
                fs.writeFileSync(report.filePath, after, 'utf8');
                log(FEATURE, `Approved fix: ${report.filePath}`);
                _diffPanel?.dispose();
                vscode.window.showInformationMessage(`Fix written — ${report.fileName} rescanning…`);
                await runScan();
            } catch (err) {
                logError(`Failed to write fix for ${report.filePath}`, err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
                vscode.window.showErrorMessage(`Failed to write fix for ${report.fileName}.`);
            }
        }
        if (msg.command === 'ignore') {
            log(FEATURE, `Fix ignored: ${report.filePath}`);
            _diffPanel?.dispose();
            // TODO: Show per-job output in a new webview (fix ignored)
        }
    });
}

// ─── HTML report builder ──────────────────────────────────────────────────────

function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function scoreColor(score: number): string {
    if (score >= 80) { return 'var(--vscode-testing-iconPassed)'; }
    if (score >= 60) { return 'var(--vscode-inputValidation-warningForeground)'; }
    return 'var(--vscode-inputValidation-errorForeground)';
}

function scoreLabel(score: number): string {
    if (score >= 80) { return 'Compliant'; }
    if (score >= 60) { return 'Partial'; }
    return 'Non-compliant';
}

function buildReportHtml(reports: ReadmeReport[]): string {
    const compliant    = reports.filter(r => r.score >= 80).length;
    const partial      = reports.filter(r => r.score >= 60 && r.score < 80).length;
    const nonCompliant = reports.filter(r => r.score < 60).length;

    const byProject = new Map<string, ReadmeReport[]>();
    for (const r of reports) {
        if (!byProject.has(r.projectName)) { byProject.set(r.projectName, []); }
        byProject.get(r.projectName)!.push(r);
    }

    const projectSections = [...byProject.entries()].map(([projName, projReports]) => {
        const projScore = Math.round(projReports.reduce((s, r) => s + r.score, 0) / projReports.length);
        const rows = projReports.map(r => {
            const fixableCount = r.issues.filter(i => i.fixable).length;
            const issueHtml    = r.issues.length === 0
                ? '<span style="color:var(--vscode-testing-iconPassed)">✅ No issues</span>'
                : r.issues.map(i => `<div class="issue">${i.severity === 'error' ? '🔴' : i.severity === 'warning' ? '🟡' : 'ℹ️'} ${esc(i.message)}</div>`).join('');
            const copyText = `File: ${r.fileName}\nPath: ${r.filePath}\n\nIssues:\n${r.issues.map(i => `- [${i.severity}] ${i.message}`).join('\n')}`;
            const escapedCopy = esc(copyText).replace(/\n/g, '&#10;');
            const actionBtns = r.score >= 80
                ? '<span style="color:var(--vscode-testing-iconPassed);font-size:11px">✅ Compliant</span>'
                : [
                    fixableCount > 0 ? `<button class="btn-fix-row" data-action="fix" data-path="${esc(r.filePath)}">🔧 Review Fix (${fixableCount})</button>` : '',
                    `<button class="btn-open-row" data-action="open" data-path="${esc(r.filePath)}">↗ Open</button>`,
                    `<button class="btn-copy-row" data-action="copy-row" data-path="${esc(r.filePath)}" data-copy="${escapedCopy}">📋 Copy</button>`,
                  ].filter(Boolean).join('');
            const rowStatus = r.score >= 80 ? 'compliant' : r.score >= 60 ? 'partial' : 'non-compliant';
            return `<tr data-status="${rowStatus}">
  <td class="file-col">
    <button class="open-btn" data-action="open" data-path="${esc(r.filePath)}" title="${esc(r.filePath)}">${esc(r.fileName)}</button>
    <div class="file-path">${esc(r.filePath.replace(/\\/g, '/'))}</div>
  </td>
  <td><span class="score-badge" style="color:${scoreColor(r.score)}">${r.score}</span><br><span style="font-size:10px;color:var(--vscode-descriptionForeground)">${esc(scoreLabel(r.score))}</span></td>
  <td><span class="type-badge type-${r.readmeType.toLowerCase()}">${r.readmeType}</span></td>
  <td style="white-space:nowrap">${r.lineCount}${r.lineCount > LINE_LIMITS[r.readmeType] ? ' ⚠️' : ''}</td>
  <td class="issues-col">${issueHtml}</td>
  <td class="action-col">${actionBtns}</td>
</tr>`;
        }).join('');
        return `<section class="proj-section">
  <h2 class="proj-heading">${esc(projName)}<span class="proj-score" style="color:${scoreColor(projScore)}">${projScore} avg</span><span class="proj-count">${projReports.length} READMEs</span><button class="btn-fix-proj" data-action="fix-project" data-proj="${esc(projName)}">🔧 Fix All in Project</button></h2>
  <table><thead><tr><th>File</th><th>Score</th><th>Type</th><th>Lines</th><th>Issues</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table>
</section>`;
    }).join('');

    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);font-size:13px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background)}
#toolbar{position:sticky;top:0;background:var(--vscode-editor-background);border-bottom:1px solid var(--vscode-panel-border);padding:8px 16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;z-index:10}
#toolbar h1{font-size:1.1em;font-weight:700}
.summary-pills{display:flex;gap:8px;flex-wrap:wrap}
.pill{padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;border:1px solid;background:transparent;cursor:pointer}
.pill-ok{color:var(--vscode-testing-iconPassed);border-color:var(--vscode-testing-iconPassed)}
.pill-ok.active{background:var(--vscode-testing-iconPassed);color:#000}
.pill-warn{color:var(--vscode-inputValidation-warningForeground);border-color:var(--vscode-inputValidation-warningForeground)}
.pill-warn.active{background:var(--vscode-inputValidation-warningForeground);color:#000}
.pill-err{color:var(--vscode-inputValidation-errorForeground);border-color:var(--vscode-inputValidation-errorForeground)}
.pill-err.active{background:var(--vscode-inputValidation-errorForeground);color:#fff}
#search{padding:4px 8px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);border-radius:2px;font-size:12px;flex:1;min-width:140px}
.btn-fix-all{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;padding:4px 12px;border-radius:2px;cursor:pointer;font-size:12px}
.btn-fix-all:hover{background:var(--vscode-button-hoverBackground)}
#content{padding:12px 16px}
.proj-section{margin-bottom:24px}
.proj-heading{font-size:0.95em;font-weight:700;border-bottom:2px solid var(--vscode-focusBorder);padding-bottom:5px;margin-bottom:8px;display:flex;align-items:center;gap:10px}
.proj-score{font-size:0.85em;font-weight:700}
.proj-count{font-size:0.78em;color:var(--vscode-descriptionForeground);font-weight:400}
table{width:100%;border-collapse:collapse;font-size:12px}
th{text-align:left;padding:5px 8px;background:var(--vscode-textCodeBlock-background);border-bottom:1px solid var(--vscode-panel-border);font-weight:600;white-space:nowrap}
td{padding:5px 8px;border-bottom:1px solid var(--vscode-panel-border);vertical-align:top}
tr:hover td{background:var(--vscode-list-hoverBackground)}
.type-badge{font-size:10px;padding:1px 6px;border-radius:3px;font-weight:600}
.type-project{background:rgba(88,166,255,0.15);color:#58a6ff}
.type-feature{background:rgba(100,180,100,0.15);color:#6db66d}
.type-standard{background:rgba(180,100,180,0.15);color:#cc88cc}
.issues-col{max-width:340px}
.issue{font-size:11px;line-height:1.5}
.open-btn{background:none;border:none;color:var(--vscode-textLink-foreground);cursor:pointer;font-size:12px;font-weight:700;text-decoration:underline;padding:0}
.action-col{display:flex;flex-direction:column;gap:4px;min-width:120px}
.btn-fix-row{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;padding:4px 10px;border-radius:3px;cursor:pointer;font-size:11px;font-weight:600;width:100%}
.btn-fix-row:hover{background:var(--vscode-button-hoverBackground)}
.btn-open-row{background:transparent;color:var(--vscode-textLink-foreground);border:1px solid var(--vscode-panel-border);padding:3px 10px;border-radius:3px;cursor:pointer;font-size:11px;width:100%}
.btn-open-row:hover{border-color:var(--vscode-focusBorder)}
.btn-copy-row{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;padding:4px 10px;border-radius:3px;cursor:pointer;font-size:11px;font-weight:600;width:100%}
.btn-copy-row:hover{background:var(--vscode-button-secondaryHoverBackground)}
.btn-fix-proj{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;padding:3px 10px;border-radius:3px;cursor:pointer;font-size:11px;margin-left:auto}
.file-col{min-width:120px}
.file-path{font-family:var(--vscode-editor-font-family);font-size:9px;color:var(--vscode-descriptionForeground);margin-top:2px}
.score-badge{font-weight:700;font-size:1.1em}
.hidden{display:none}
</style>
</head><body>
<div id="toolbar">
  <h1>📋 README Compliance</h1>
  <div class="summary-pills">
    <button class="pill pill-ok" data-action="filter-status" data-status="compliant">✅ ${compliant} compliant</button>
    <button class="pill pill-warn" data-action="filter-status" data-status="partial">⚠️ ${partial} partial</button>
    <button class="pill pill-err" data-action="filter-status" data-status="non-compliant">🔴 ${nonCompliant} non-compliant</button>
  </div>
  <input id="search" type="text" placeholder="Filter by filename or project…">
  <button class="btn-fix-all" data-action="fix-all">🔧 Fix All Non-Compliant</button>
  <button class="btn-fix-all" data-action="rerun" style="background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)">🔄 Rerun Scan</button>
</div>
<div id="content">${projectSections}</div>
<script>
const vscode = acquireVsCodeApi();
document.getElementById('search').addEventListener('input', applyFilter);
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) { return; }
  const action = btn.dataset.action;
  if (action === 'open')        { vscode.postMessage({ command: 'open',       data: btn.dataset.path }); }
  if (action === 'fix')         { btn.textContent = '⏳ Loading diff…'; btn.disabled = true; vscode.postMessage({ command: 'fix', data: btn.dataset.path }); }
  if (action === 'copy-row')    { var rpath = btn.dataset.path || ''; btn.textContent = '⏳…'; btn.disabled = true; vscode.postMessage({ command: 'copy', text: btn.dataset.copy || '', path: rpath }); }
  if (action === 'fix-project') { vscode.postMessage({ command: 'fixProject', project: btn.dataset.proj }); }
  if (action === 'fix-all')     { vscode.postMessage({ command: 'fixAll' }); }
  if (action === 'rerun')       { vscode.postMessage({ command: 'rerun' }); }
  if (action === 'filter-status') {
    var wasActive = btn.classList.contains('active');
    document.querySelectorAll('[data-action="filter-status"]').forEach(function(b) { b.classList.remove('active'); });
    if (!wasActive) { btn.classList.add('active'); }
    applyFilter();
  }
});
function applyFilter() {
  const q = document.getElementById('search').value.toLowerCase().trim();
  var activePill = document.querySelector('[data-action="filter-status"].active');
  var pillStatus = activePill ? activePill.dataset.status : null;
  document.querySelectorAll('tbody tr').forEach(row => {
    var matchSearch = !q || row.textContent.toLowerCase().includes(q);
    var matchPill   = !pillStatus || row.dataset.status === pillStatus;
    row.classList.toggle('hidden', !matchSearch || !matchPill);
  });
}
window.addEventListener('message', e => {
  const msg = e.data;
  if (msg.type === 'done')     { showStatus('✅ ' + msg.text); }
  if (msg.type === 'error')    { showStatus('❌ ' + msg.text); }
  if (msg.type === 'progress') { showStatus('⏳ ' + msg.text); }
  if (msg.type === 'copied') {
    var copyBtn = Array.from(document.querySelectorAll('.btn-copy-row')).find(function(b) { return b.dataset.path === msg.path; });
    if (copyBtn) { copyBtn.textContent = '✅ Copied'; copyBtn.disabled = false; setTimeout(function() { copyBtn.textContent = '📋 Copy'; }, 1500); }
  }
  // Restore disabled buttons after fix completes
  if (msg.type === 'done' || msg.type === 'error') {
    document.querySelectorAll('.btn-fix-row').forEach(b => { b.textContent = '🔧 Review Fix'; b.disabled = false; });
  }
});
function showStatus(text) {
  let el = document.getElementById('status-bar');
  if (!el) { el = document.createElement('div'); el.id = 'status-bar'; el.style.cssText = 'position:fixed;bottom:0;left:0;right:0;padding:6px 16px;font-size:12px;background:var(--vscode-statusBar-background);color:var(--vscode-statusBar-foreground);border-top:1px solid var(--vscode-panel-border);z-index:100'; document.body.appendChild(el); }
  el.textContent = text; clearTimeout(el._timer); el._timer = setTimeout(() => { el.textContent = ''; }, 4000);
}
</script>
</body></html>`;
}

// ─── Commands ─────────────────────────────────────────────────────────────────

let _panel:      vscode.WebviewPanel | undefined;
let _lastReports: ReadmeReport[] = [];

async function scanAllReadmes(): Promise<ReadmeReport[]> {
    const registry = loadRegistry();
    if (!registry) { return []; }
    return vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Scanning READMEs…', cancellable: false },
        async (progress) => {
            const reports: ReadmeReport[] = [];
            const globalFiles = collectReadmes(registry.globalDocsPath, 'global', registry.globalDocsPath);
            for (const f of globalFiles) { reports.push(checkCompliance(f.filePath, f.projectName, f.projectRoot)); }
            for (const project of registry.projects) {
                progress.report({ message: `Scanning ${project.name}…` });
                if (!fs.existsSync(project.path)) { continue; }
                const files = collectReadmes(project.path, project.name, project.path);
                for (const f of files) { reports.push(checkCompliance(f.filePath, f.projectName, f.projectRoot)); }
            }
            reports.sort((a, b) => a.score - b.score);
            log(FEATURE, `Scanned ${reports.length} READMEs`);
            return reports;
        }
    ) as unknown as ReadmeReport[];
}

async function runScan(): Promise<void> {
    const reports = await scanAllReadmes();
    if (!reports.length) { vscode.window.showInformationMessage('No READMEs found.'); return; }
    _lastReports = reports;
    const html = buildReportHtml(reports);
    if (_panel) { _panel.webview.html = html; _panel.reveal(vscode.ViewColumn.Beside, true); }
    else {
        _panel = vscode.window.createWebviewPanel('readmeCompliance', '📋 README Compliance', vscode.ViewColumn.Beside, { enableScripts: true, retainContextWhenHidden: true });
        _panel.webview.html = html;
        _panel.onDidDispose(() => { _panel = undefined; });
        attachMessageHandler(_panel);
    }
    const nonCompliant = reports.filter(r => r.score < 60).length;
    const partial      = reports.filter(r => r.score >= 60 && r.score < 80).length;
    vscode.window.showInformationMessage(`Scanned ${reports.length} READMEs — ${nonCompliant} non-compliant, ${partial} partial.`);
}

function attachMessageHandler(panel: vscode.WebviewPanel): void {
    panel.webview.onDidReceiveMessage(async msg => {
        switch (msg.command) {
            case 'open':
                if (msg.data && fs.existsSync(msg.data)) {
                    const doc = await vscode.workspace.openTextDocument(msg.data);
                    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
                }
                break;
            case 'fix': {
                const report = _lastReports.find(r => r.filePath === msg.data)
                    ?? checkCompliance(msg.data, path.basename(path.dirname(msg.data)), path.dirname(msg.data));
                await showFixDiff(report);
                panel.webview.postMessage({ type: 'done', text: `Diff loaded for ${path.basename(msg.data)} — approve or ignore` });
                break;
            }
            case 'aiFix':
                await aiFixReadme(msg.data, msg.readmeType as ReadmeType);
                break;
            case 'fixProject':
                await fixProjectReadmes(msg.project);
                await runScan();
                break;
            case 'copy':
                await vscode.env.clipboard.writeText(msg.text || '');
                panel.webview.postMessage({ type: 'copied', path: msg.path });
                break;
            case 'rerun':
                await runScan();
                break;
            case 'fixAll':
                await fixAllNonCompliant(_lastReports);
                break;
        }
    });
}

/** cvs.readme.fix — quick pick → diff webview → approve/ignore */
async function pickAndFixReadme(): Promise<void> {
    const reports      = _lastReports.length ? _lastReports : await scanAllReadmes();
    const nonCompliant = reports.filter(r => r.score < 80 && r.issues.some(i => i.fixable));

    if (!nonCompliant.length) {
        vscode.window.showInformationMessage('All READMEs are compliant — nothing to fix. ✅');
        return;
    }

    const picked = await vscode.window.showQuickPick(
        nonCompliant.map(r => ({
            label:       `$(warning) ${r.fileName}`,
            description: `${r.projectName}  ·  score: ${r.score}/100  ·  ${r.readmeType}`,
            detail:      r.issues.filter(i => i.fixable).map(i => i.message).join('  |  '),
            report:      r,
        })),
        { placeHolder: `${nonCompliant.length} READMEs with fixable issues — pick one to review`, matchOnDescription: true }
    );
    if (!picked) { return; }
    await showFixDiff(picked.report);
}

interface BatchItem {
    fileName:    string;
    filePath:    string;
    score:       number;
    issues:      ComplianceIssue[];
    aiContent:   string;
    unifiedDiff: string;
}

function buildBatchReviewHtml(items: BatchItem[]): string {
    const itemsData = items.map((item, i) => ({
        i,
        fileName:    item.fileName,
        filePath:    item.filePath,
        score:       item.score,
        aiContent:   item.aiContent,
        unifiedDiff: item.unifiedDiff,
    }));

    const cardsHtml = items.map((item, i) => {
        const fixable    = item.issues.filter(iss => iss.fixable);
        const issueLines = fixable.map(iss =>
            `<li>${iss.severity === 'error' ? '🔴' : '🟡'} ${esc(iss.message)}</li>`
        ).join('');
        return `<div class="batch-card" id="card-${i}" data-index="${i}">
  <div class="batch-hd">
    <span class="batch-fname">${esc(item.fileName)}</span>
    <span class="batch-score">Score: ${item.score}/100</span>
    <div style="flex:1"></div>
    <button class="btn-approve-one" data-index="${i}">☑ Approve</button>
    <button class="btn-skip-one"   data-index="${i}">✕ Skip</button>
  </div>
  <div class="batch-path">${esc(item.filePath)}</div>
  ${issueLines ? `<div class="batch-issues"><ul>${issueLines}</ul></div>` : ''}
  <div class="batch-diff-wrap"><div id="diff-${i}"></div></div>
</div>`;
    }).join('');

    const itemsJson = JSON.stringify(itemsData);

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/diff2html@3.4.56/bundles/css/diff2html.min.css">
<script src="https://cdn.jsdelivr.net/npm/diff2html@3.4.56/bundles/js/diff2html-ui.min.js"><\/script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);font-size:13px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background)}
#toolbar{position:sticky;top:0;z-index:50;display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--vscode-panel-border);background:var(--vscode-editor-background)}
#toolbar h1{font-size:0.95em;font-weight:700;flex:1}
.btn-primary{background:#3fb950;color:#000;border:none;padding:6px 16px;border-radius:3px;cursor:pointer;font-size:12px;font-weight:700}
.btn-primary:hover{opacity:.85}.btn-primary:disabled{opacity:.4;cursor:not-allowed}
.btn-sec{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;padding:6px 12px;border-radius:3px;cursor:pointer;font-size:12px}
.btn-sec:hover{background:var(--vscode-button-secondaryHoverBackground)}
#cards{padding:14px 16px 60px}
.batch-card{border:1px solid var(--vscode-panel-border);border-radius:5px;margin-bottom:16px;overflow:hidden;transition:border-color 0.12s}
.batch-card.approved{border-color:#3fb950}
.batch-card.skipped{opacity:.4}
.batch-hd{display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--vscode-textCodeBlock-background)}
.batch-fname{font-weight:700;font-size:0.92em}.batch-score{font-size:11px;color:var(--vscode-descriptionForeground);white-space:nowrap}
.batch-path{font-size:10px;color:var(--vscode-descriptionForeground);padding:4px 14px;background:var(--vscode-textCodeBlock-background);border-bottom:1px solid var(--vscode-panel-border);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--vscode-editor-font-family)}
.batch-issues{padding:6px 14px;font-size:11px;background:var(--vscode-textCodeBlock-background);border-bottom:1px solid var(--vscode-panel-border)}
.batch-issues ul{padding-left:16px;display:flex;flex-wrap:wrap;gap:3px 16px}
.batch-issues li{list-style:none}
.batch-diff-wrap{padding:8px 14px}
.btn-approve-one{background:transparent;color:#3fb950;border:1px solid #3fb950;padding:3px 12px;border-radius:3px;cursor:pointer;font-size:11px;font-weight:700;white-space:nowrap}
.btn-approve-one.active{background:#3fb950;color:#000}
.btn-approve-one:hover{background:rgba(63,185,80,.15)}
.btn-skip-one{background:transparent;color:var(--vscode-descriptionForeground);border:1px solid var(--vscode-panel-border);padding:3px 10px;border-radius:3px;cursor:pointer;font-size:11px}
.btn-skip-one:hover{border-color:var(--vscode-focusBorder)}
.d2h-wrapper{font-family:var(--vscode-editor-font-family,monospace)!important;font-size:12px!important}
.d2h-file-header{background:var(--vscode-textCodeBlock-background)!important;border-color:var(--vscode-panel-border)!important;color:var(--vscode-editor-foreground)!important}
.d2h-code-linenumber{background:var(--vscode-textCodeBlock-background)!important;border-color:var(--vscode-panel-border)!important;color:var(--vscode-descriptionForeground)!important}
</style>
</head>
<body>
<div id="toolbar">
  <h1>📝 AI Batch Fix Review — ${items.length} file${items.length !== 1 ? 's' : ''}</h1>
  <button class="btn-primary" id="btn-apply" disabled>✅ Apply Approved (0)</button>
  <button class="btn-sec" id="btn-approve-all">✓ Approve All</button>
  <button class="btn-sec" id="btn-skip-all">✕ Skip All</button>
</div>
<div id="cards">
${cardsHtml}
</div>
<script>
(function(){
'use strict';
const vscode = acquireVsCodeApi();
const ITEMS = ${itemsJson};
var approved = {};

function updateCta() {
  var count = Object.keys(approved).filter(function(k) { return approved[k]; }).length;
  var btn = document.getElementById('btn-apply');
  btn.textContent = '\\u2705 Apply Approved (' + count + ')';
  btn.disabled = count === 0;
}

function setApprove(idx, val) {
  var card = document.getElementById('card-' + idx);
  if (!card) { return; }
  var appBtn = card.querySelector('.btn-approve-one');
  if (val) {
    approved[idx] = true;
    card.classList.add('approved');
    card.classList.remove('skipped');
    appBtn.textContent = '\\u2705 Approved';
    appBtn.classList.add('active');
  } else {
    delete approved[idx];
    card.classList.remove('approved', 'skipped');
    appBtn.textContent = '\\u2611 Approve';
    appBtn.classList.remove('active');
  }
  updateCta();
}

document.querySelectorAll('.btn-approve-one').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var idx = parseInt(btn.dataset.index, 10);
    setApprove(idx, !approved[idx]);
  });
});

document.querySelectorAll('.btn-skip-one').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var idx = parseInt(btn.dataset.index, 10);
    delete approved[idx];
    var card = document.getElementById('card-' + idx);
    card.classList.remove('approved');
    card.classList.add('skipped');
    card.querySelector('.btn-approve-one').textContent = '\\u2611 Approve';
    card.querySelector('.btn-approve-one').classList.remove('active');
    updateCta();
  });
});

document.getElementById('btn-approve-all').addEventListener('click', function() {
  ITEMS.forEach(function(item) { setApprove(item.i, true); });
});

document.getElementById('btn-skip-all').addEventListener('click', function() {
  ITEMS.forEach(function(item) {
    delete approved[item.i];
    var card = document.getElementById('card-' + item.i);
    card.classList.remove('approved');
    card.classList.add('skipped');
    var appBtn = card.querySelector('.btn-approve-one');
    appBtn.textContent = '\\u2611 Approve';
    appBtn.classList.remove('active');
  });
  updateCta();
});

document.getElementById('btn-apply').addEventListener('click', function() {
  var toWrite = ITEMS
    .filter(function(item) { return !!approved[item.i]; })
    .map(function(item) { return { filePath: item.filePath, content: item.aiContent }; });
  if (!toWrite.length) { return; }
  vscode.postMessage({ command: 'applyBatch', approved: toWrite });
});

document.addEventListener('DOMContentLoaded', function() {
  ITEMS.forEach(function(item) {
    var target = document.getElementById('diff-' + item.i);
    if (!target || !item.unifiedDiff) { return; }
    var ui = new Diff2HtmlUI(target, item.unifiedDiff, {
      drawFileList: false, matching: 'lines', outputFormat: 'line-by-line',
      highlight: true, renderNothingWhenEmpty: false,
    });
    ui.draw();
    ui.highlightCode();
  });
});

updateCta();
})();
<\/script>
</body>
</html>`;
}

async function fixAllNonCompliant(reports: ReadmeReport[]): Promise<void> {
    const targets = reports.filter(r => r.score < 80 && r.issues.some(i => i.fixable));
    if (!targets.length) { vscode.window.showInformationMessage('No fixable issues found.'); return; }

    const go = await vscode.window.showWarningMessage(
        `Run AI fix on ${targets.length} README${targets.length !== 1 ? 's' : ''}? You'll review each diff before anything is written.`,
        { modal: true }, 'Run AI Fix'
    );
    if (go !== 'Run AI Fix') { return; }

    const items: BatchItem[] = [];
    for (const report of targets) {
        _panel?.webview.postMessage({ type: 'progress', text: `AI fixing ${path.basename(report.filePath)} (${items.length + 1}/${targets.length})…` });
        let content = '';
        try { content = fs.readFileSync(report.filePath, 'utf8'); } catch { continue; }

        const issueList = report.issues.map(i => `- ${i.message}`).join('\n');
        const prompt = `You are fixing a ${report.readmeType} README.md file for a CieloVista Software project.
The file has these compliance issues:\n${issueList}
Required sections for a ${report.readmeType} README: ${REQUIRED_SECTIONS[report.readmeType].join(', ')}
Here is the current file content:\n---\n${content.slice(0, 6000)}\n---
Rules:
- Keep all existing content that is valid — only add/fix what is needed
- Keep the file under ${LINE_LIMITS[report.readmeType]} lines
- First line must be a # heading — all code blocks must have a language tag
- Output ONLY the fixed markdown content, no preamble`;

        try {
            const aiContent = await callClaude(prompt, 3000);
            if (!aiContent) { continue; }
            const unifiedDiff = jsdiff.createPatch(report.fileName, content, aiContent, 'before (original)', 'after (AI)', { context: 4 });
            items.push({ fileName: report.fileName, filePath: report.filePath, score: report.score, issues: report.issues, aiContent, unifiedDiff });
        } catch (err) {
            logError(`AI fix failed for ${report.filePath}`, err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
        }
    }

    if (!items.length) {
        _panel?.webview.postMessage({ type: 'error', text: 'AI fix returned no results — check the output channel.' });
        return;
    }

    const batchHtml = buildBatchReviewHtml(items);
    if (_batchPanel) {
        _batchPanel.title        = '📝 AI Batch Fix Review';
        _batchPanel.webview.html = batchHtml;
        _batchPanel.reveal(vscode.ViewColumn.Beside);
    } else {
        _batchPanel = vscode.window.createWebviewPanel(
            'readmeBatchFix',
            '📝 AI Batch Fix Review',
            vscode.ViewColumn.Beside,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        _batchPanel.webview.html = batchHtml;
        _batchPanel.onDidDispose(() => { _batchPanel = undefined; });
    }

    _batchPanel.webview.onDidReceiveMessage(async (msg) => {
        if (msg.command !== 'applyBatch') { return; }
        const approved: Array<{ filePath: string; content: string }> = msg.approved;
        let written = 0;
        for (const item of approved) {
            try { fs.writeFileSync(item.filePath, item.content, 'utf8'); written++; }
            catch (err) { logError(`Failed to write ${item.filePath}`, err instanceof Error ? err.stack || String(err) : String(err), FEATURE); }
        }
        _batchPanel?.dispose();
        _panel?.webview.postMessage({ type: 'done', text: `Applied ${written} AI fix${written !== 1 ? 'es' : ''}. Rescanning…` });
        await runScan();
    });

    _panel?.webview.postMessage({ type: 'done', text: `Review ${items.length} AI fix${items.length !== 1 ? 'es' : ''} in the side panel` });
}

async function aiFixReadme(filePath: string, readmeType: ReadmeType): Promise<void> {
    const report = _lastReports.find(r => r.filePath === filePath)
        ?? checkCompliance(filePath, path.basename(path.dirname(filePath)), path.dirname(filePath));
    let content = '';
    try { content = fs.readFileSync(filePath, 'utf8'); } catch { return; }

    const issueList = report.issues.map(i => `- ${i.message}`).join('\n');
    const prompt = `You are fixing a ${readmeType} README.md file for a CieloVista Software project.
The file has these compliance issues:\n${issueList}
Required sections for a ${readmeType} README: ${REQUIRED_SECTIONS[readmeType].join(', ')}
Here is the current file content:\n---\n${content.slice(0, 6000)}\n---
Rules:
- Keep all existing content that is valid — only add/fix what is needed
- Keep the file under ${LINE_LIMITS[readmeType]} lines
- First line must be a # heading — all code blocks must have a language tag
- Output ONLY the fixed markdown content, no preamble`;

    try {
        _panel?.webview.postMessage({ type: 'progress', text: `AI fixing ${path.basename(filePath)}… 10–30 seconds` });
        const fixed = await callClaude(prompt, 3000);
        if (!fixed) { throw new Error('Empty AI response'); }

        // Show as a diff so user can still approve/ignore
        const tempReport: ReadmeReport = { ...report };
        const unifiedDiff = jsdiff.createPatch(report.fileName, content, fixed, 'before (original)', 'after (AI)', { context: 4 });
        const html = buildDiffHtml(report.fileName, filePath, content, fixed, unifiedDiff, report.issues);

        if (_diffPanel) { _diffPanel.title = `📝 AI Fix — ${report.fileName}`; _diffPanel.webview.html = html; _diffPanel.reveal(vscode.ViewColumn.Beside); }
        else {
            _diffPanel = vscode.window.createWebviewPanel('readmeDiff', `📝 AI Fix — ${report.fileName}`, vscode.ViewColumn.Beside, { enableScripts: true, retainContextWhenHidden: false });
            _diffPanel.webview.html = html;
            _diffPanel.onDidDispose(() => { _diffPanel = undefined; });
        }

        _diffPanel.webview.onDidReceiveMessage(async msg2 => {
            if (msg2.command === 'approve') {
                fs.writeFileSync(filePath, fixed, 'utf8');
                _diffPanel?.dispose();
                // TODO: Show per-job output in a new webview (AI fix approved)
                await runScan();
            }
            if (msg2.command === 'ignore') {
                _diffPanel?.dispose();
                // TODO: Show per-job output in a new webview (AI fix ignored)
            }
        });

        _panel?.webview.postMessage({ type: 'done', text: `AI diff ready for ${path.basename(filePath)} — approve or ignore` });
    } catch (err) {
        logError(`AI fix failed for ${filePath}`, err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
        _panel?.webview.postMessage({ type: 'error', text: `AI fix failed: ${err}` });
    }
}

async function fixProjectReadmes(projectName: string): Promise<void> {
    const targets = _lastReports.filter(r => r.projectName === projectName && r.score < 80 && r.issues.some(i => i.fixable));
    if (!targets.length) { _panel?.webview.postMessage({ type: 'done', text: `No fixable issues in ${projectName}` }); return; }
    let fixed = 0;
    for (const report of targets) {
        try { const content = applyFix(report); fs.writeFileSync(report.filePath, content, 'utf8'); fixed++; }
        catch (err) { logError(`Failed to fix ${report.filePath}`, err instanceof Error ? err.stack || String(err) : String(err), FEATURE); }
    }
    _panel?.webview.postMessage({ type: 'done', text: `Fixed ${fixed} READMEs in ${projectName}. Rescanning…` });
    await runScan();
}

async function createNewReadme(): Promise<void> {
    const typePick = await vscode.window.showQuickPick([
        { label: '$(file) Project README',    description: 'README.md at project root',               type: 'PROJECT'  as ReadmeType },
        { label: '$(symbol-method) Feature README', description: 'myfeature.README.md inside a project', type: 'FEATURE'  as ReadmeType },
        { label: '$(book) Standard/Guide',    description: 'In CieloVistaStandards/ or docs/',         type: 'STANDARD' as ReadmeType },
    ], { placeHolder: 'Which type of README?' });
    if (!typePick) { return; }

    const templates: Record<ReadmeType, string> = {
        PROJECT: `# Project Name\n\nOne-line tagline.\n\n## What it does\n\n_2–5 sentences._\n\n## Quick Start\n\n\`\`\`powershell\n# TODO\n\`\`\`\n\n## Architecture\n\n_High-level tech stack._\n\n## Project Structure\n\n\`\`\`\nproject-root/\n  src/\n  docs/\n  tests/\n\`\`\`\n\n## Common Commands\n\n\`\`\`powershell\n# TODO\n\`\`\`\n\n## Prerequisites\n\n- Node.js LTS\n\n## License\n\nCopyright (c) ${new Date().getFullYear()} CieloVista Software\n`,
        FEATURE: `# feature: filename.ts\n\n## What it does\n\n_One paragraph._\n\n## Commands\n\n| Command ID | Title | Keybinding |\n|---|---|---|\n| \`cvs.TODO\` | TODO | — |\n\n## Settings\n\n| Key | Type | Default | Description |\n|---|---|---|---|\n| \`cielovistaTools.TODO\` | boolean | \`false\` | TODO |\n\n## Internal architecture\n\n\`\`\`\nactivate()\n  └── TODO\n\`\`\`\n\n## Manual test\n\n1. TODO\n2. TODO\n`,
        STANDARD: `# Standard Title\n\n> _One-line summary._\n\n## Purpose\n\n_Why this standard exists._\n\n## Rules\n\n1. Rule one.\n2. Rule two.\n\n## Examples\n\n\`\`\`typescript\n// ✅ Good\n// TODO\n\`\`\`\n\n## Related Documents\n\n- [README Standard](${STANDARD_PATH})\n\n## Changelog\n\n- v1.0.0 (${new Date().toISOString().slice(0, 10)}): Initial version\n`,
    };

    const destPick = await vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false, openLabel: 'Save README here' });
    if (!destPick?.[0]) { return; }
    const defaultName = typePick.type === 'FEATURE' ? 'myfeature.README.md' : 'README.md';
    const fileName    = await vscode.window.showInputBox({ prompt: 'Filename', value: defaultName });
    if (!fileName?.trim()) { return; }
    const filePath = path.join(destPick[0].fsPath, fileName.trim());
    fs.writeFileSync(filePath, templates[typePick.type], 'utf8');
    const doc = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(doc);
    log(FEATURE, `Created new README: ${filePath}`);
}

// ─── Activate / Deactivate ────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
    log(FEATURE, 'Activating');

    vscode.window.registerWebviewPanelSerializer('readmeCompliance', {
        async deserializeWebviewPanel(panel: vscode.WebviewPanel) {
            _panel = panel;
            _panel.webview.options = { enableScripts: true };
            const reports = await scanAllReadmes();
            _lastReports = reports;
            _panel.webview.html = buildReportHtml(reports);
            _panel.onDidDispose(() => { _panel = undefined; });
            attachMessageHandler(_panel);
            log(FEATURE, 'README Compliance panel restored after reload');
        }
    });

    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.readme.scan',          runScan),
        vscode.commands.registerCommand('cvs.readme.fix',           pickAndFixReadme),
        vscode.commands.registerCommand('cvs.readme.fixAll',        async () => {
            const reports = _lastReports.length ? _lastReports : await scanAllReadmes();
            await fixAllNonCompliant(reports);
        }),
        vscode.commands.registerCommand('cvs.readme.viewStandard',  async () => {
            if (fs.existsSync(STANDARD_PATH)) { const doc = await vscode.workspace.openTextDocument(STANDARD_PATH); await vscode.window.showTextDocument(doc); }
            else { vscode.window.showErrorMessage(`Standard not found: ${STANDARD_PATH}`); }
        }),
        vscode.commands.registerCommand('cvs.readme.new',           createNewReadme),
        vscode.commands.registerCommand('cvs.readme.fillTodos',     () => { vscode.window.showInformationMessage('Fill README TODO Stubs: not yet implemented.'); }),
    );
}

export function deactivate(): void {
    _batchPanel?.dispose();
    _batchPanel = undefined;
    _diffPanel?.dispose();
    _diffPanel = undefined;
    _panel?.dispose();
    _panel = undefined;
    _lastReports = [];
}

/** @internal — exported for unit testing only */
export const _test = {
    isReadme,
    detectType,
    normalizeHeading,
    extractHeadings,
    checkCompliance,
    applyFix,
    esc,
    frontmatterEnd,
    guessLanguage,
    LANG_HINTS,
    REQUIRED_SECTIONS,
    SECTION_ORDER,
    LINE_LIMITS,
    STUBS,
};
