// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * codebase-auditor.ts
 *
 * Scans the cielovista-tools src/ folder and produces a full health report:
 *
 *   1. FILE SIZE         — files over 300 lines flagged, over 600 flagged red
 *   2. FUNCTION LENGTH   — functions over 40 lines flagged
 *   3. DUPLICATE NAMES   — same exported function name in 2+ files
 *   4. SPLIT CANDIDATES  — large files still not split (dead monoliths)
 *   5. MISSING README    — feature .ts with no matching .README.md
 *   6. ONE-TIME-ONE-PLACE — patterns copied verbatim across files
 *      (loadRegistry, esc(), REGISTRY_PATH constants, etc.)
 *   7. SHARED UTILS USAGE — code that should use shared/ helpers but doesn't
 *   8. DEAD FILES        — .ts files that are never imported anywhere
 *
 * Command: cvs.audit.codebase
 */

import * as vscode from 'vscode';
import * as fs     from 'fs';
import * as path   from 'path';
import { log, logError } from '../shared/output-channel';

const FEATURE  = 'codebase-auditor';
const SRC_ROOT = path.join(__dirname, '..', '..');  // resolves to src/
// Fallback to hardcoded path when __dirname is in out/
const FEATURES_DIR = fs.existsSync(path.join(__dirname, '..', 'features'))
    ? path.join(__dirname, '..', 'features')
    : 'C:\\Users\\jwpmi\\Downloads\\VSCode\\projects\\cielovista-tools\\src\\features';
const SHARED_DIR = FEATURES_DIR.replace('features', 'shared');
const SRC_DIR    = FEATURES_DIR.replace(/[/\\]features$/, '');

// ─── Types ────────────────────────────────────────────────────────────────────

type Severity = 'red' | 'yellow' | 'info';

interface Finding {
    id:       string;
    category: string;
    severity: Severity;
    file:     string;       // relative to src/
    title:    string;
    detail:   string;
    line?:    number;
    action?:  'open' | 'split' | 'extract' | 'delete';
}

interface FileInfo {
    abs:      string;
    rel:      string;
    lines:    number;
    kb:       number;
    content:  string;
    lineArr:  string[];
}

// ─── File discovery ───────────────────────────────────────────────────────────

const SKIP_DIRS = new Set(['.git', 'node_modules', 'out', 'dist', '.vscode']);

function collectTsFiles(dir: string): FileInfo[] {
    const results: FileInfo[] = [];
    function walk(d: string): void {
        let entries: string[] = [];
        try { entries = fs.readdirSync(d); } catch { return; }
        for (const e of entries) {
            if (SKIP_DIRS.has(e)) { continue; }
            const full = path.join(d, e);
            let stat: fs.Stats;
            try { stat = fs.statSync(full); } catch { continue; }
            if (stat.isDirectory()) { walk(full); continue; }
            if (!e.endsWith('.ts') || e.endsWith('.d.ts')) { continue; }
            try {
                const content = fs.readFileSync(full, 'utf8');
                const lineArr = content.split('\n');
                results.push({
                    abs:     full,
                    rel:     path.relative(SRC_DIR, full).replace(/\\/g, '/'),
                    lines:   lineArr.length,
                    kb:      Math.round(stat.size / 1024 * 10) / 10,
                    content,
                    lineArr,
                });
            } catch { /* skip */ }
        }
    }
    walk(dir);
    return results;
}

// ─── Checks ───────────────────────────────────────────────────────────────────

let _seq = 0;
function id(cat: string): string { return `${cat}-${++_seq}`; }

/** 1. File size */
function checkFileSizes(files: FileInfo[]): Finding[] {
    const findings: Finding[] = [];
    for (const f of files) {
        if (f.lines >= 600) {
            findings.push({ id: id('SIZE'), category: 'File Size', severity: 'red',
                file: f.rel, action: 'split',
                title: `Monolith: ${f.lines} lines`,
                detail: `${f.rel} is ${f.lines} lines (${f.kb} KB). Files over 600 lines must be split into modules. Check if a split folder already exists.` });
        } else if (f.lines >= 300) {
            findings.push({ id: id('SIZE'), category: 'File Size', severity: 'yellow',
                file: f.rel, action: 'split',
                title: `Large file: ${f.lines} lines`,
                detail: `${f.rel} is ${f.lines} lines (${f.kb} KB). Consider splitting if it handles more than one responsibility.` });
        }
    }
    return findings;
}

/** 2. Function length — finds functions over 40 lines */
function checkFunctionLength(files: FileInfo[]): Finding[] {
    const findings: Finding[] = [];
    const FN_START = /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)|^\s*(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(/;

    for (const f of files) {
        let fnName   = '';
        let fnStart  = 0;
        let depth    = 0;
        let inFn     = false;

        for (let i = 0; i < f.lineArr.length; i++) {
            const line = f.lineArr[i];
            const match = line.match(FN_START);
            if (match && !inFn) {
                fnName  = match[1] ?? match[2] ?? 'anonymous';
                fnStart = i + 1;
                inFn    = true;
                depth   = 0;
            }
            if (inFn) {
                depth += (line.match(/{/g) ?? []).length;
                depth -= (line.match(/}/g) ?? []).length;
                if (depth <= 0 && i > fnStart) {
                    const len = i - fnStart + 1;
                    if (len >= 60) {
                        findings.push({ id: id('FN'), category: 'Function Length', severity: 'red',
                            file: f.rel, line: fnStart, action: 'extract',
                            title: `Very long function: ${fnName}() — ${len} lines`,
                            detail: `${fnName}() at line ${fnStart} in ${f.rel} is ${len} lines. Functions over 60 lines should be broken into smaller helpers.` });
                    } else if (len >= 40) {
                        findings.push({ id: id('FN'), category: 'Function Length', severity: 'yellow',
                            file: f.rel, line: fnStart,
                            title: `Long function: ${fnName}() — ${len} lines`,
                            detail: `${fnName}() at line ${fnStart} in ${f.rel} is ${len} lines. Consider extracting sub-steps into named helpers.` });
                    }
                    inFn = false;
                }
            }
        }
    }
    return findings;
}

/** 3. Duplicate exported function names across files */
function checkDuplicateExports(files: FileInfo[]): Finding[] {
    const findings: Finding[] = [];
    const exportMap = new Map<string, string[]>(); // name -> [file, file, ...]
    const EXPORT_RE = /^export\s+(?:async\s+)?function\s+(\w+)|^export\s+const\s+(\w+)\s*=/gm;

    for (const f of files) {
        const matches = [...f.content.matchAll(EXPORT_RE)];
        for (const m of matches) {
            const name = m[1] ?? m[2];
            if (!name) { continue; }
            if (!exportMap.has(name)) { exportMap.set(name, []); }
            exportMap.get(name)!.push(f.rel);
        }
    }

    for (const [name, fileList] of exportMap) {
        if (fileList.length < 2) { continue; }
        // Ignore if it's clearly an interface pattern (activate/deactivate expected)
        if (['activate', 'deactivate'].includes(name)) { continue; }
        findings.push({ id: id('DUP'), category: 'Duplicate Exports', severity: 'yellow',
            file: fileList[0],
            title: `Duplicate export: ${name}()`,
            detail: `"${name}" is exported from ${fileList.length} files: ${fileList.join(', ')}. If these do the same thing, extract to shared/. If intentionally different, rename one.` });
    }
    return findings;
}

/** 4. Dead monolith files — .ts file exists alongside a split folder */
function checkDeadMonoliths(files: FileInfo[]): Finding[] {
    const findings: Finding[] = [];
    const featureFiles = files.filter(f => f.rel.startsWith('features/') && !f.rel.includes('/'));

    for (const f of featureFiles) {
        const baseName   = path.basename(f.abs, '.ts');
        const splitDir   = path.join(FEATURES_DIR, baseName);
        const indexFile  = path.join(splitDir, 'index.ts');
        if (fs.existsSync(splitDir) && fs.existsSync(indexFile)) {
            findings.push({ id: id('DEAD'), category: 'Dead Monolith', severity: 'red',
                file: f.rel, action: 'delete',
                title: `Dead monolith: ${f.rel}`,
                detail: `${f.rel} still exists but ${baseName}/index.ts also exists. The monolith should have been deleted after splitting. Delete ${f.rel} to avoid dual sources of truth.` });
        }
    }
    return findings;
}

/** 5. Missing README for feature files */
function checkMissingReadmes(files: FileInfo[]): Finding[] {
    const findings: Finding[] = [];
    const featureFiles = files.filter(f =>
        f.rel.startsWith('features/') &&
        !f.rel.includes('/') &&
        !f.rel.endsWith('.README.ts') &&
        !['feature-toggle', 'doc-header', 'open-folder-as-root',
          'mcp-server-scaffolder', 'project-launcher', 'readme-generator',
          'license-sync', 'playwright-check'].some(n => f.rel.includes(n))
    );

    for (const f of featureFiles) {
        const readmePath = f.abs.replace(/\.ts$/, '.README.md');
        if (!fs.existsSync(readmePath)) {
            findings.push({ id: id('README'), category: 'Missing README', severity: 'yellow',
                file: f.rel, action: 'open',
                title: `No README: ${f.rel}`,
                detail: `${f.rel} has no matching .README.md file. Every feature should document its commands, architecture, and manual test steps.` });
        }
    }
    return findings;
}

/** 6. One-Time-One-Place violations — copy-pasted patterns */
function checkOneTimeOnePlace(files: FileInfo[]): Finding[] {
    const findings: Finding[] = [];

    // Patterns that should exist in ONE place only
    const PATTERNS: Array<{ label: string; re: RegExp; goodFile: string; severity: Severity }> = [
        {
            label:    'Inline loadRegistry()',
            re:       /function\s+loadRegistry\s*\(/,
            goodFile: 'features/docs-manager.ts or shared/',
            severity: 'red',
        },
        {
            label:    'Inline esc() HTML escape',
            re:       /function\s+esc\s*\(\s*s\s*:/,
            goodFile: 'shared/webview-utils.ts',
            severity: 'yellow',
        },
        {
            label:    'Hardcoded REGISTRY_PATH constant',
            re:       /const\s+REGISTRY_PATH\s*=\s*['"`]/,
            goodFile: 'shared/ or a single registry module',
            severity: 'yellow',
        },
        {
            label:    'Inline buildHtml() webview builder',
            re:       /function\s+build\w*Html\s*\(/,
            goodFile: 'a dedicated html.ts module inside the feature folder',
            severity: 'info',
        },
        {
            label:    'Duplicate FEATURE constant pattern',
            re:       /const\s+FEATURE\s*=\s*['"`]/,
            goodFile: '(expected per-file, only flag if >1 has same value)',
            severity: 'info',
        },
    ];

    for (const pattern of PATTERNS) {
        const matches = files.filter(f => pattern.re.test(f.content));
        if (matches.length > 1 && pattern.severity !== 'info') {
            for (const f of matches) {
                findings.push({ id: id('OTP'), category: 'One-Time-One-Place', severity: pattern.severity,
                    file: f.rel, action: 'extract',
                    title: `Duplicated pattern: ${pattern.label}`,
                    detail: `"${pattern.label}" found in ${matches.length} files: ${matches.map(m => m.rel).join(', ')}. Should live in ${pattern.goodFile} only.` });
            }
        } else if (matches.length > 3 && pattern.severity === 'info') {
            findings.push({ id: id('OTP'), category: 'One-Time-One-Place', severity: 'info',
                file: matches[0].rel,
                title: `Common pattern repeated: ${pattern.label}`,
                detail: `"${pattern.label}" appears in ${matches.length} files. This may be intentional but worth reviewing for extraction to a shared utility.` });
        }
    }

    // Also check: identical REGISTRY_PATH string values
    const regPathRe = /const\s+REGISTRY_PATH\s*=\s*['"`]([^'"`]+)['"`]/;
    const regFiles  = files.filter(f => regPathRe.test(f.content));
    if (regFiles.length > 2) {
        findings.push({ id: id('OTP'), category: 'One-Time-One-Place', severity: 'red',
            file: regFiles[0].rel, action: 'extract',
            title: `REGISTRY_PATH hardcoded in ${regFiles.length} files`,
            detail: `REGISTRY_PATH is defined in: ${regFiles.map(f => f.rel).join(', ')}. Extract to shared/registry.ts and import from there.` });
    }

    return findings;
}

/** 7. Shared utils not used — files doing their own HTML escaping etc. */
function checkSharedUtilUsage(files: FileInfo[]): Finding[] {
    const findings: Finding[] = [];
    const featureFiles = files.filter(f => f.rel.startsWith('features/'));

    for (const f of featureFiles) {
        // Has inline esc() but doesn't import from shared/webview-utils
        if (/function\s+esc\s*\(/.test(f.content) &&
            !f.content.includes("from '../../shared/webview-utils'") &&
            !f.content.includes("from '../shared/webview-utils'")) {
            findings.push({ id: id('SHARED'), category: 'Shared Utils', severity: 'yellow',
                file: f.rel, action: 'extract',
                title: `Inline esc() — use shared/webview-utils instead`,
                detail: `${f.rel} defines its own esc() HTML-escape function. Import { esc } from shared/webview-utils.ts instead.` });
        }

        // Has inline loadRegistry but doesn't import from a shared location
        if (/function\s+loadRegistry\s*\(/.test(f.content) &&
            !f.content.includes("from './registry'") &&
            !f.content.includes("from '../registry'")) {
            findings.push({ id: id('SHARED'), category: 'Shared Utils', severity: 'red',
                file: f.rel, action: 'extract',
                title: `Inline loadRegistry() — violates One-Time-One-Place`,
                detail: `${f.rel} has its own loadRegistry() copy. Use the shared version or import from the doc-catalog registry module.` });
        }
    }
    return findings;
}

/** 8. Dead files — exported but never imported */
function checkDeadFiles(files: FileInfo[]): Finding[] {
    const findings: Finding[] = [];

    // Build a map of all imports across all files
    const allImports = new Set<string>();
    const IMPORT_RE  = /from\s+['"`]([^'"`]+)['"`]/g;

    for (const f of files) {
        const matches = [...f.content.matchAll(IMPORT_RE)];
        for (const m of matches) {
            // Normalise: './foo' -> foo, '../features/foo' -> features/foo
            const raw = m[1].replace(/^\.\.\//, '').replace(/^\.\//, '');
            allImports.add(raw);
            allImports.add(raw + '.ts');
            // Also add just the filename without extension
            allImports.add(path.basename(raw));
            allImports.add(path.basename(raw, '.ts'));
        }
    }

    // Check feature files that have no importers
    const featureTopLevel = files.filter(f =>
        f.rel.startsWith('features/') &&
        !f.rel.includes('/') &&
        f.lines > 20
    );

    for (const f of featureTopLevel) {
        const baseName = path.basename(f.abs, '.ts');
        const relPath  = f.rel.replace(/\\/g, '/');
        const imported = allImports.has(baseName) ||
                         allImports.has(relPath)  ||
                         allImports.has(`features/${baseName}`);
        if (!imported) {
            // Check extension.ts specifically
            const extPath = path.join(SRC_DIR, 'extension.ts');
            if (fs.existsSync(extPath)) {
                const extContent = fs.readFileSync(extPath, 'utf8');
                if (!extContent.includes(baseName)) {
                    findings.push({ id: id('DEAD'), category: 'Dead File', severity: 'yellow',
                        file: f.rel, action: 'delete',
                        title: `Possibly unused: ${f.rel}`,
                        detail: `${f.rel} is not imported in extension.ts or any other file. If it was replaced by a split module, delete it.` });
                }
            }
        }
    }
    return findings;
}

// ─── HTML ─────────────────────────────────────────────────────────────────────

function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildAuditHtml(findings: Finding[], scannedFiles: number, totalLines: number): string {
    const red    = findings.filter(f => f.severity === 'red').length;
    const yellow = findings.filter(f => f.severity === 'yellow').length;
    const info   = findings.filter(f => f.severity === 'info').length;

    const categories = [...new Set(findings.map(f => f.category))].sort();

    const catSections = categories.map(cat => {
        const catFindings = findings.filter(f => f.category === cat);
        const cards = catFindings.map(f => {
            const dot   = f.severity === 'red' ? '🔴' : f.severity === 'yellow' ? '🟡' : 'ℹ️';
            const actionBtn = f.action === 'open' || f.action === 'split' || f.action === 'extract'
                ? `<button class="action-btn" data-action="open" data-file="${esc(f.file)}" data-line="${f.line ?? 1}"
                     title="Open ${esc(f.file)}">↗ Open</button>`
                : f.action === 'delete'
                ? `<button class="action-btn danger-btn" data-action="open" data-file="${esc(f.file)}"
                     title="Open to review before deleting">↗ Review</button>`
                : '';

            return `<div class="finding-card sev-${esc(f.severity)}">
  <div class="finding-header">
    <span class="finding-dot">${dot}</span>
    <span class="finding-title">${esc(f.title)}</span>
    <span class="finding-file">${esc(f.file)}${f.line ? `:${f.line}` : ''}</span>
    ${actionBtn}
  </div>
  <div class="finding-detail">${esc(f.detail)}</div>
</div>`;
        }).join('');

        const catRed    = catFindings.filter(f => f.severity === 'red').length;
        const catYellow = catFindings.filter(f => f.severity === 'yellow').length;
        const catDot    = catRed > 0 ? '🔴' : catYellow > 0 ? '🟡' : 'ℹ️';

        return `<section class="cat-section">
  <h2 class="cat-heading">${catDot} ${esc(cat)} <span class="cat-count">${catFindings.length}</span></h2>
  <div class="finding-list">${cards}</div>
</section>`;
    }).join('');

    const scanDate = new Date().toLocaleString();

    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);font-size:13px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background)}

.toolbar{position:sticky;top:0;z-index:10;background:var(--vscode-editor-background);border-bottom:1px solid var(--vscode-panel-border);padding:10px 16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.toolbar h2{font-size:1.05em;font-weight:700;flex:1}
.pill{display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600;border:1px solid;white-space:nowrap}
.pill-red   {border-color:#f48771;color:#f48771}
.pill-yellow{border-color:#cca700;color:#cca700}
.pill-info  {border-color:var(--vscode-descriptionForeground);color:var(--vscode-descriptionForeground)}
.pill-ok    {border-color:var(--vscode-testing-iconPassed);color:var(--vscode-testing-iconPassed)}
.rescan-btn{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;padding:4px 12px;border-radius:3px;cursor:pointer;font-size:12px}
.rescan-btn:hover{background:var(--vscode-button-secondaryHoverBackground)}
.meta{font-size:10px;color:var(--vscode-descriptionForeground);white-space:nowrap}

.filter-bar{padding:6px 16px;display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid var(--vscode-panel-border);background:var(--vscode-editor-background)}
.filter-btn{background:transparent;color:var(--vscode-descriptionForeground);border:1px solid var(--vscode-panel-border);padding:3px 10px;border-radius:12px;cursor:pointer;font-size:11px}
.filter-btn:hover{border-color:var(--vscode-focusBorder);color:var(--vscode-editor-foreground)}
.filter-btn.active{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border-color:var(--vscode-button-background)}

.content{padding:14px 16px 60px}

.cat-section{margin-bottom:24px}
.cat-heading{font-size:0.95em;font-weight:700;border-bottom:2px solid var(--vscode-focusBorder);padding-bottom:5px;margin-bottom:10px;display:flex;align-items:center;gap:8px}
.cat-count{background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);border-radius:10px;padding:1px 7px;font-size:0.8em;font-weight:400}
.cat-section.hidden{display:none}

.finding-list{display:flex;flex-direction:column;gap:6px}
.finding-card{border-radius:4px;padding:10px 12px;border-left:3px solid transparent;background:var(--vscode-textCodeBlock-background);border:1px solid var(--vscode-panel-border)}
.finding-card.hidden{display:none}
.finding-card.sev-red{border-left:3px solid #f48771}
.finding-card.sev-yellow{border-left:3px solid #cca700}
.finding-card.sev-info{border-left:3px solid var(--vscode-descriptionForeground)}

.finding-header{display:flex;align-items:center;gap:8px;margin-bottom:5px;flex-wrap:wrap}
.finding-dot{font-size:12px;flex-shrink:0}
.finding-title{font-weight:700;font-size:0.9em;flex:1}
.finding-file{font-family:var(--vscode-editor-font-family);font-size:10px;color:var(--vscode-descriptionForeground);background:var(--vscode-editor-background);padding:1px 6px;border-radius:3px;white-space:nowrap}
.finding-detail{font-size:11px;line-height:1.55;color:var(--vscode-descriptionForeground);margin-top:4px}

.action-btn{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;padding:2px 8px;border-radius:3px;cursor:pointer;font-size:10px;font-weight:600;white-space:nowrap;flex-shrink:0}
.action-btn:hover{background:var(--vscode-button-hoverBackground)}
.danger-btn{background:transparent;color:#f48771;border:1px solid #f48771}
.danger-btn:hover{background:rgba(244,135,113,0.1)}

#status-bar{position:fixed;bottom:0;left:0;right:0;padding:6px 16px;font-size:12px;background:var(--vscode-statusBar-background);color:var(--vscode-statusBar-foreground);border-top:1px solid var(--vscode-panel-border);display:none}
#status-bar.visible{display:block}
</style>
</head><body>

<div class="toolbar">
  <h2>🔬 Codebase Audit</h2>
  ${red    > 0 ? `<span class="pill pill-red">🔴 ${red} critical</span>` : ''}
  ${yellow > 0 ? `<span class="pill pill-yellow">🟡 ${yellow} warnings</span>` : ''}
  ${info   > 0 ? `<span class="pill pill-info">ℹ️ ${info} info</span>` : ''}
  ${findings.length === 0 ? `<span class="pill pill-ok">✅ All clear</span>` : ''}
  <button class="rescan-btn" id="btn-rescan">↺ Rescan</button>
  <span class="meta">${scannedFiles} files · ${totalLines.toLocaleString()} lines · ${esc(scanDate)}</span>
</div>

<div class="filter-bar">
  <button class="filter-btn active" data-filter="all">All (${findings.length})</button>
  <button class="filter-btn" data-filter="red">🔴 Critical (${red})</button>
  <button class="filter-btn" data-filter="yellow">🟡 Warnings (${yellow})</button>
  ${categories.map(c =>
    `<button class="filter-btn" data-filter="cat:${esc(c)}">${esc(c)}</button>`
  ).join('')}
</div>

<div class="content" id="content">
  ${findings.length === 0
    ? `<div style="padding:60px 20px;text-align:center;color:var(--vscode-testing-iconPassed)">
         ✅ No issues found. The codebase is clean.
       </div>`
    : catSections}
</div>

<div id="status-bar"></div>

<script>
(function(){
'use strict';
const vscode = acquireVsCodeApi();

function showStatus(t){
  var b=document.getElementById('status-bar');
  b.textContent=t;b.className='visible';
  clearTimeout(b._t);b._t=setTimeout(function(){b.className='';},4000);
}

// Filter
var _filter = 'all';
document.querySelector('.filter-bar').addEventListener('click',function(e){
  var btn=e.target.closest('.filter-btn');
  if(!btn){return;}
  _filter=btn.dataset.filter;
  document.querySelectorAll('.filter-btn').forEach(function(b){
    b.classList.toggle('active',b.dataset.filter===_filter);
  });
  applyFilter();
});

function applyFilter(){
  document.querySelectorAll('.finding-card').forEach(function(card){
    var sev=card.classList.contains('sev-red')?'red':card.classList.contains('sev-yellow')?'yellow':'info';
    var sec=card.closest('.cat-section');
    var cat=sec?sec.querySelector('.cat-heading').textContent.trim():'';
    var show=_filter==='all'||_filter===sev||_filter==='cat:'+cat.replace(/^[🔴🟡ℹ️]\s*/,'');
    card.classList.toggle('hidden',!show);
  });
  document.querySelectorAll('.cat-section').forEach(function(sec){
    sec.classList.toggle('hidden',!sec.querySelector('.finding-card:not(.hidden)'));
  });
}

// Open file
document.getElementById('content').addEventListener('click',function(e){
  var btn=e.target.closest('[data-action="open"]');
  if(!btn){return;}
  vscode.postMessage({action:'open',file:btn.dataset.file,line:parseInt(btn.dataset.line||'1')});
});

// Rescan
document.getElementById('btn-rescan').addEventListener('click',function(){
  showStatus('Scanning…');
  vscode.postMessage({action:'rescan'});
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

// ─── Main scan ────────────────────────────────────────────────────────────────

function runScan(): { findings: Finding[]; files: FileInfo[] } {
    _seq = 0;
    const files = collectTsFiles(SRC_DIR);
    const findings: Finding[] = [
        ...checkFileSizes(files),
        ...checkFunctionLength(files),
        ...checkDuplicateExports(files),
        ...checkDeadMonoliths(files),
        ...checkMissingReadmes(files),
        ...checkOneTimeOnePlace(files),
        ...checkSharedUtilUsage(files),
        ...checkDeadFiles(files),
    ];
    // Sort: red first, then yellow, then info; within severity by category
    findings.sort((a, b) => {
        const sevOrder = { red: 0, yellow: 1, info: 2 };
        const s = sevOrder[a.severity] - sevOrder[b.severity];
        if (s !== 0) { return s; }
        return a.category.localeCompare(b.category);
    });
    return { findings, files };
}

// ─── Command ─────────────────────────────────────────────────────────────────

export async function runCodebaseAudit(): Promise<void> {
    let { findings, files } = runScan();
    const totalLines = files.reduce((n, f) => n + f.lines, 0);

    const panel = vscode.window.createWebviewPanel(
        'codebaseAudit', '🔬 Codebase Audit', vscode.ViewColumn.Beside,
        { enableScripts: true, retainContextWhenHidden: true }
    );

    panel.webview.html = buildAuditHtml(findings, files.length, totalLines);
    log(FEATURE, `Codebase audit: ${files.length} files, ${findings.length} findings`);

    panel.webview.onDidReceiveMessage(async msg => {
        try {
            if (msg.action === 'rescan') {
                const result = runScan();
                findings     = result.findings;
                const lines  = result.files.reduce((n, f) => n + f.lines, 0);
                panel.webview.html = buildAuditHtml(result.findings, result.files.length, lines);
                panel.webview.postMessage({ type: 'done', text: `${result.findings.length} finding(s)` });
                return;
            }
            if (msg.action === 'open') {
                const filePath = path.isAbsolute(msg.file)
                    ? msg.file
                    : path.join(SRC_DIR, msg.file);
                if (!fs.existsSync(filePath)) {
                    panel.webview.postMessage({ type: 'error', text: `File not found: ${msg.file}` });
                    return;
                }
                const doc = await vscode.workspace.openTextDocument(filePath);
                const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
                const line = Math.max(0, (msg.line ?? 1) - 1);
                const range = new vscode.Range(line, 0, line, 0);
                editor.selection = new vscode.Selection(range.start, range.end);
                editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
            }
        } catch (err) {
            logError(FEATURE, 'Codebase audit action failed', err);
            panel.webview.postMessage({ type: 'error', text: String(err) });
        }
    });
}
