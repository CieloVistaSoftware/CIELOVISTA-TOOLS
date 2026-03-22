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
 * doc-catalog.ts
 *
 * Card catalog for every .md document across all registered CieloVista projects.
 *
 * Inspired by the library card catalog / Dewey Decimal system:
 *   - Every doc gets one card
 *   - The card shows just enough to know what it is and where it lives
 *   - Each card has a View button that opens a Markdown-rendered viewer
 *   - Cards are grouped by category (like Dewey sections)
 *   - Full-text search across all card titles, descriptions, and paths
 *   - Filter by project or category
 *
 * CATALOG CATEGORIES (auto-assigned from filename/content patterns):
 *   000 — Meta / Session / Status        (CLAUDE.md, CURRENT-STATUS.md, SESSION*)
 *   100 — Architecture & Standards       (TIER1*, ARCHITECTURE*, STANDARDS*, LAWS*)
 *   200 — Component & UI Docs            (web-component*, ui-*, wbcore*, component*)
 *   300 — Dev Workflow & Process         (git*, workflow*, process*, build*, deploy*)
 *   400 — Testing & Quality              (test*, spec*, quality*, compliance*)
 *   500 — API & Integration              (api*, integration*, trace*, signalr*)
 *   600 — Tools & Extensions             (vscode*, extension*, mcp*, copilot*, tool*)
 *   700 — Project-Specific Docs          (everything else project-local)
 *   800 — Global Standards               (anything in CieloVistaStandards)
 *   900 — Audit & Reports                (audit-*, consolidation-log*)
 *
 * Commands registered:
 *   cvs.catalog.open     — open the full card catalog
 *   cvs.catalog.rebuild  — force rescan and rebuild catalog
 *   cvs.catalog.view     — open a specific .md file in the markdown viewer
 */
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const output_channel_1 = require("../shared/output-channel");
const FEATURE = 'doc-catalog';
const REGISTRY_PATH = 'C:\\Users\\jwpmi\\Downloads\\CieloVistaStandards\\project-registry.json';
const GLOBAL_DOCS = 'C:\\Users\\jwpmi\\Downloads\\CieloVistaStandards';
// ─── Registry ─────────────────────────────────────────────────────────────────
function loadRegistry() {
    try {
        if (!fs.existsSync(REGISTRY_PATH)) {
            vscode.window.showErrorMessage(`Project registry not found: ${REGISTRY_PATH}`);
            return undefined;
        }
        return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
    }
    catch (err) {
        (0, output_channel_1.logError)(FEATURE, 'Failed to load registry', err);
        return undefined;
    }
}
// ─── Project info loader ────────────────────────────────────────────────────────
/** npm scripts worth surfacing as buttons on a project card. */
const PROMINENT_SCRIPTS = ['start', 'build', 'rebuild', 'test', 'watch', 'tray', 'tray:rebuild', 'service'];
function loadProjectInfo(entry) {
    // Use README.md as description source — fall back to registry description
    let description = entry.description;
    const readmePath = path.join(entry.path, 'README.md');
    if (fs.existsSync(readmePath)) {
        try {
            const content = fs.readFileSync(readmePath, 'utf8');
            const fromReadme = extractDescription(content);
            if (fromReadme && fromReadme !== 'No description.') {
                description = fromReadme;
            }
        }
        catch { /* keep registry description */ }
    }
    const info = { name: entry.name, rootPath: entry.path, type: entry.type, description, scripts: {}, hasNpm: false, hasDotnet: false };
    const pkgPath = path.join(entry.path, 'package.json');
    if (fs.existsSync(pkgPath)) {
        try {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            info.hasNpm = true;
            const all = pkg.scripts ?? {};
            const prominent = PROMINENT_SCRIPTS.filter(s => all[s]);
            const others = Object.keys(all).filter(s => !PROMINENT_SCRIPTS.includes(s)).slice(0, 3);
            [...prominent, ...others].forEach(s => { info.scripts[s] = all[s]; });
        }
        catch { /* ignore */ }
    }
    try {
        if (fs.readdirSync(entry.path).some(e => /\.sln[x]?$/i.test(e))) {
            info.hasDotnet = true;
        }
    }
    catch { /* ignore */ }
    return info;
}
// ─── Project section builder ──────────────────────────────────────────────────
const TYPE_ICON = { 'vscode-extension': '🧩', 'component-library': '🧱', 'dotnet-service': '⚙️', 'app': '🖥️' };
function buildProjectsSectionHtml(projects) {
    const cards = projects.map(p => {
        const icon = TYPE_ICON[p.type] ?? '📂';
        const scriptKeys = Object.keys(p.scripts);
        const scriptBtns = scriptKeys.map(s => {
            const isPrimary = s === 'start' || s === 'rebuild';
            return `<button class="${isPrimary ? 'btn-view' : 'btn-open'}" data-action="run" data-proj-path="${esc(p.rootPath)}" data-script="${esc(s)}">${esc(s)}</button>`;
        }).join('');
        const dotnetBtn = p.hasDotnet && !p.hasNpm
            ? `<button class="btn-view" data-action="run" data-proj-path="${esc(p.rootPath)}" data-script="dotnet:build">build</button>` : '';
        // Only show CLAUDE.md button if the file actually exists
        const claudePath = path.join(p.rootPath, 'CLAUDE.md');
        const claudeExists = fs.existsSync(claudePath);
        const claudeBtn = claudeExists
            ? `<button class="btn-open" data-action="open-claude"   data-proj-path="${esc(p.rootPath)}">📄 CLAUDE.md</button>`
            : `<button class="btn-open btn-create-claude" data-action="create-claude" data-proj-path="${esc(p.rootPath)}" title="No CLAUDE.md found — click to create one">➕ Create CLAUDE.md</button>`;
        return `<article class="card proj-card" data-project="${esc(p.name)}" data-category="🗂️ Projects" data-tags="${esc(p.type)}">
  <div class="card-header"><span class="card-project">${icon} ${esc(p.type)}</span></div>
  <div class="card-title">${esc(p.name)}</div>
  <div class="card-desc">${esc(p.description)}</div>
  <div class="card-path" title="${esc(p.rootPath)}">${esc(p.rootPath)}</div>
  <div style="display:flex;flex-direction:column;gap:6px;margin-top:8px">
    <div class="card-btns" style="flex-wrap:wrap;gap:4px">${scriptBtns}${dotnetBtn}</div>
    <div class="card-btns">
      <button class="btn-open" data-action="open-folder" data-proj-path="${esc(p.rootPath)}">📂 Open Folder</button>
      ${claudeBtn}
    </div>
  </div>
</article>`;
    }).join('');
    return `<section class="cat-section" data-category="🗂️ Projects">
  <h2 class="cat-heading">🗂️ Projects <span class="cat-count">${projects.length}</span></h2>
  <div class="card-grid">${cards}</div>
</section>`;
}
const CATEGORIES = [
    { num: 900, label: '900 — Audit & Reports', patterns: [/^audit-/i, /consolidation-log/i, /^report/i] },
    { num: 0, label: '000 — Meta / Session / Status', patterns: [/^claude\.md$/i, /current.?status/i, /^session/i, /startup/i, /parking.?lot/i, /prompt.?history/i, /^status/i, /context.?protocol/i] },
    { num: 100, label: '100 — Architecture & Standards', patterns: [/tier1/i, /tier2/i, /architectur/i, /standard/i, /laws?\.md$/i, /coding.?guide/i, /principles/i, /onboarding/i] },
    { num: 200, label: '200 — Component & UI Docs', patterns: [/web.?component/i, /component/i, /ui.?arch/i, /wb.?core/i, /behavior/i, /layout/i, /schema/i] },
    { num: 300, label: '300 — Dev Workflow & Process', patterns: [/git.?workflow/i, /workflow/i, /process/i, /deploy/i, /build/i, /release/i, /migration/i, /changes/i, /changelog/i] },
    { num: 400, label: '400 — Testing & Quality', patterns: [/test/i, /spec/i, /quality/i, /compliance/i, /debug/i, /fix/i] },
    { num: 500, label: '500 — API & Integration', patterns: [/api/i, /integration/i, /trace/i, /signalr/i, /websocket/i, /protocol/i, /mcp.?server/i] },
    { num: 600, label: '600 — Tools & Extensions', patterns: [/vscode/i, /extension/i, /copilot/i, /tool/i, /plugin/i, /shortcut/i, /snippet/i, /javascript.?standard/i] },
    { num: 700, label: '700 — Project Docs', patterns: [/readme/i, /how.?to/i, /guide/i, /todo/i, /notes/i, /ideas/i] },
];
function assignCategory(fileName, projectName) {
    // Global standards folder gets 800
    if (projectName === 'global') {
        // But audit reports still get 900
        if (/^audit-/i.test(fileName) || /consolidation-log/i.test(fileName)) {
            return { num: 900, label: '900 — Audit & Reports' };
        }
        return { num: 800, label: '800 — Global Standards' };
    }
    for (const cat of CATEGORIES) {
        for (const pattern of cat.patterns) {
            if (pattern.test(fileName)) {
                return { num: cat.num, label: cat.label };
            }
        }
    }
    return { num: 700, label: '700 — Project Docs' };
}
// ─── Content extraction ───────────────────────────────────────────────────────
function extractTitle(content, fileName) {
    // First # heading
    const h1 = content.match(/^#\s+(.+)$/m);
    if (h1) {
        return h1[1].trim();
    }
    // Filename without extension, prettified
    return fileName.replace(/\.md$/i, '').replace(/[-_]/g, ' ');
}
function extractDescription(content) {
    // Skip headings and blank lines, grab first paragraph text
    const lines = content.split('\n');
    const textLines = [];
    let pastFirstHeading = false;
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
            continue;
        }
        if (trimmed.startsWith('#')) {
            if (pastFirstHeading && textLines.length) {
                break;
            }
            pastFirstHeading = true;
            continue;
        }
        if (trimmed.startsWith('>') || trimmed.startsWith('<!--') ||
            trimmed.startsWith('---') || trimmed.startsWith('|') ||
            trimmed.startsWith('```')) {
            continue;
        }
        textLines.push(trimmed.replace(/\*\*|__|\*|_|`/g, ''));
        if (textLines.join(' ').length > 160) {
            break;
        }
    }
    const desc = textLines.join(' ').trim();
    return desc.length > 160 ? desc.slice(0, 157) + '…' : desc || 'No description.';
}
function extractTags(content, fileName) {
    const tags = new Set();
    // From filename words
    fileName.replace(/\.md$/i, '').split(/[-_. ]+/).forEach(w => {
        if (w.length > 2) {
            tags.add(w.toLowerCase());
        }
    });
    // From headings
    const headings = content.match(/^#{1,3}\s+(.+)$/gm) ?? [];
    for (const h of headings.slice(0, 5)) {
        h.replace(/^#+\s+/, '').split(/\s+/).forEach(w => {
            const clean = w.replace(/[^a-z0-9]/gi, '').toLowerCase();
            if (clean.length > 3) {
                tags.add(clean);
            }
        });
    }
    return [...tags].slice(0, 12);
}
// ─── Scanner ──────────────────────────────────────────────────────────────────
const SKIP_DIRS = new Set(['node_modules', '.git', 'out', 'dist', '.vscode', 'reports']);
const SKIP_FILES = new Set(['.gitignore', '.gitattributes']);
let _cardIdCounter = 0;
function scanForCards(rootPath, projectName, projectRootPath, maxDepth = 3) {
    const cards = [];
    function walk(dir, depth) {
        if (depth > maxDepth || !fs.existsSync(dir)) {
            return;
        }
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const entry of entries) {
            if (SKIP_DIRS.has(entry.name) || SKIP_FILES.has(entry.name)) {
                continue;
            }
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath, depth + 1);
            }
            else if (entry.isFile() && /\.md$/i.test(entry.name)) {
                try {
                    const content = fs.readFileSync(fullPath, 'utf8');
                    const stat = fs.statSync(fullPath);
                    const cat = assignCategory(entry.name, projectName);
                    cards.push({
                        id: `card-${++_cardIdCounter}`,
                        fileName: entry.name,
                        title: extractTitle(content, entry.name),
                        description: extractDescription(content),
                        filePath: fullPath,
                        projectName,
                        projectPath: projectRootPath,
                        category: cat.label,
                        categoryNum: cat.num,
                        sizeBytes: Buffer.byteLength(content, 'utf8'),
                        lastModified: stat.mtime.toISOString().slice(0, 10),
                        tags: extractTags(content, entry.name),
                    });
                }
                catch { /* skip unreadable */ }
            }
        }
    }
    walk(rootPath, 0);
    return cards;
}
// ─── Markdown → HTML renderer ─────────────────────────────────────────────────
function mdToHtml(md) {
    return md
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        // Fenced code blocks
        .replace(/```(\w*)\n([\s\S]*?)```/gm, '<pre><code class="lang-$1">$2</code></pre>')
        .replace(/```([\s\S]*?)```/gm, '<pre><code>$1</code></pre>')
        // Headings
        .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
        // HR
        .replace(/^---+$/gm, '<hr>')
        // Blockquote
        .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
        // Lists
        .replace(/^\* (.+)$/gm, '<li>$1</li>')
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
        // Inline
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
        // Tables (basic)
        .replace(/^\|(.+)\|$/gm, (row) => {
        const cells = row.split('|').slice(1, -1).map(c => `<td>${c.trim()}</td>`).join('');
        return `<tr>${cells}</tr>`;
    })
        // Paragraphs
        .replace(/\n\n/g, '</p><p>')
        .replace(/^(?!<[hlbptcr])(.+)$/gm, '$1<br>');
}
// ─── Catalog HTML builder ─────────────────────────────────────────────────────
function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function buildCatalogHtml(cards, projectInfos = [], builtAt = '') {
    // Group by category
    const byCategory = new Map();
    for (const card of cards) {
        if (!byCategory.has(card.category)) {
            byCategory.set(card.category, []);
        }
        byCategory.get(card.category).push(card);
    }
    // Sort categories by number
    const sortedCategories = [...byCategory.entries()]
        .sort((a, b) => (a[1][0]?.categoryNum ?? 0) - (b[1][0]?.categoryNum ?? 0));
    // Build project filter options
    const projects = [...new Set(cards.map(c => c.projectName))].sort();
    // Build category filter options
    const categoryLabels = sortedCategories.map(([label]) => label);
    // Build the card HTML — each card is a <article>
    const categorySections = sortedCategories.map(([catLabel, catCards]) => {
        const cardHtml = catCards.map(card => {
            const relPath = path.relative(card.projectPath, card.filePath).replace(/\\/g, '/');
            const tagsHtml = card.tags.slice(0, 6).map(t => `<span class="tag">${esc(t)}</span>`).join('');
            const deweyNum = card.categoryNum.toString().padStart(3, '0');
            return `<article class="card" data-id="${card.id}" data-project="${esc(card.projectName)}" data-category="${esc(card.category)}" data-tags="${esc(card.tags.join(' '))}">
  <div class="card-header">
    <span class="card-project">${esc(card.projectName)}</span>
    <span class="card-date">${card.lastModified}</span>
  </div>
  <div class="card-dewey-row">
    <span class="card-dewey">${deweyNum}</span>
    <span class="card-filename">${esc(card.fileName)}</span>
  </div>
  <div class="card-title">${esc(card.title)}</div>
  <div class="card-desc">${esc(card.description)}</div>
  <div class="card-path" title="${esc(card.filePath)}">${esc(relPath)}</div>
  <div class="card-tags">${tagsHtml}</div>
  <div class="card-footer">
    <span class="card-size">${(card.sizeBytes / 1024).toFixed(1)} KB</span>
    <div class="card-btns">
      <button class="btn-view" data-action="open-preview" data-path="${esc(card.filePath)}">📄 View</button>
      <button class="btn-open" data-action="open" data-path="${esc(card.filePath)}">↗ Open</button>
      <button class="btn-open" data-action="open-folder" data-proj-path="${esc(card.projectPath)}">📂 Folder</button>
    </div>
  </div>
</article>`;
        }).join('');
        return `<section class="cat-section" data-category="${esc(catLabel)}">
  <h2 class="cat-heading">${esc(catLabel)} <span class="cat-count">${catCards.length}</span></h2>
  <div class="card-grid">${cardHtml}</div>
</section>`;
    }).join('');
    // Build project list from both doc cards AND the registered project names so
    // every project appears in the dropdown even if it has no doc cards.
    const docProjects = new Set(cards.map(c => c.projectName));
    const projProjects = new Set(projectInfos.map(p => p.name));
    const allProjects = [...new Set([...projProjects, ...docProjects])].sort();
    const projectOptions = allProjects.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
    const categoryOptions = ['🗂️ Projects', ...categoryLabels].map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    const projectsSectionHtml = buildProjectsSectionHtml(projectInfos);
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);font-size:13px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background)}

/* ── Toolbar ── */
#toolbar{position:sticky;top:0;z-index:100;background:var(--vscode-editor-background);border-bottom:1px solid var(--vscode-panel-border);padding:8px 16px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
#toolbar h1{font-size:1.1em;font-weight:700;white-space:nowrap;margin-right:4px}
#search{flex:1;min-width:160px;padding:4px 8px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);border-radius:2px;font-size:12px}
select{padding:4px 8px;background:var(--vscode-dropdown-background);color:var(--vscode-dropdown-foreground);border:1px solid var(--vscode-dropdown-border);border-radius:2px;font-size:12px;cursor:pointer}
#stat-bar{font-size:11px;color:var(--vscode-descriptionForeground);white-space:nowrap}
#btn-reset{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;padding:4px 10px;border-radius:2px;cursor:pointer;font-size:12px}
#btn-reset:hover{background:var(--vscode-button-secondaryHoverBackground)}

/* ── Catalog ── */
#catalog{padding:12px 16px}
.cat-section{margin-bottom:28px}
.cat-heading{font-size:0.95em;font-weight:700;color:var(--vscode-editor-foreground);border-bottom:2px solid var(--vscode-focusBorder);padding-bottom:5px;margin-bottom:10px;display:flex;align-items:center;gap:8px}
.cat-count{background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);border-radius:10px;padding:1px 7px;font-size:0.8em;font-weight:400}

/* ── Cards ── */
.card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}
.card{background:var(--vscode-textCodeBlock-background);border:1px solid var(--vscode-panel-border);border-radius:5px;padding:10px 12px;display:flex;flex-direction:column;gap:4px;transition:border-color 0.15s}
.card:hover{border-color:var(--vscode-focusBorder)}
.card.hidden{display:none}
.card-header{display:flex;justify-content:space-between;align-items:center}
.card-project{font-size:10px;font-weight:700;color:var(--vscode-textLink-foreground);text-transform:uppercase;letter-spacing:0.05em}
.card-date{font-size:10px;color:var(--vscode-descriptionForeground)}
.card-title{font-weight:700;font-size:0.92em;line-height:1.3;color:var(--vscode-editor-foreground)}
.card-filename{font-family:var(--vscode-editor-font-family);font-size:10px;color:var(--vscode-descriptionForeground)}
.card-desc{font-size:11px;line-height:1.45;color:var(--vscode-editor-foreground);opacity:0.85;flex:1}
.card-path{font-family:var(--vscode-editor-font-family);font-size:9px;color:var(--vscode-descriptionForeground);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.card-tags{display:flex;flex-wrap:wrap;gap:3px;margin-top:2px}
.tag{font-size:9px;padding:1px 5px;border-radius:3px;background:var(--vscode-editor-background);border:1px solid var(--vscode-panel-border);color:var(--vscode-descriptionForeground)}
.card-footer{display:flex;justify-content:space-between;align-items:center;margin-top:4px}
.card-size{font-size:10px;color:var(--vscode-descriptionForeground)}
.card-btns{display:flex;gap:4px}
.btn-view,.btn-open{border:none;padding:4px 10px;border-radius:3px;cursor:pointer;font-size:11px;font-weight:500;letter-spacing:0.02em;transition:opacity 0.1s}
.btn-view{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}
.btn-view:hover{background:var(--vscode-button-hoverBackground)}
.btn-view:active{opacity:0.8}
.btn-open{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}
.btn-open:hover{background:var(--vscode-button-secondaryHoverBackground)}
.btn-open:active{opacity:0.8}
/* Project card script buttons — larger and clearly clickable */
.proj-card .btn-view,.proj-card .btn-open{
  padding:5px 12px;
  font-size:12px;
  font-weight:600;
  border-radius:3px;
  min-width:52px;
  text-align:center;
  box-shadow:0 1px 2px rgba(0,0,0,0.25);
}
.proj-card .btn-view:hover,.proj-card .btn-open:hover{
  box-shadow:0 1px 4px rgba(0,0,0,0.4);
  transform:translateY(-1px);
}
.proj-card .btn-view:active,.proj-card .btn-open:active{
  transform:translateY(0);
  box-shadow:none;
}
.cat-section.hidden{display:none}
.btn-create-claude{border:1px dashed var(--vscode-focusBorder) !important;opacity:0.8}
.btn-create-claude:hover{opacity:1}
/* ── Dewey badge ── */
.card-dewey-row{display:flex;align-items:center;gap:6px;margin-bottom:2px}
.card-dewey{font-family:var(--vscode-editor-font-family);font-size:10px;font-weight:700;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);border-radius:3px;padding:1px 5px;letter-spacing:0.05em;flex-shrink:0}
</style>
</head><body>

<!-- Toolbar -->
<div id="toolbar">
  <h1>📚 Doc Catalog</h1>
  <input id="search" type="text" placeholder="Search titles, descriptions, tags…" oninput="applyFilters()" autocomplete="off">
  <select id="proj-filter" onchange="applyFilters()">
    <option value="">All projects</option>
    ${projectOptions}
  </select>
  <select id="cat-filter" onchange="applyFilters()">
    <option value="">All categories</option>
    ${categoryOptions}
  </select>
  <button id="btn-reset" onclick="resetFilters()">✕ Clear</button>
  <span id="stat-bar">${cards.length} docs · ${sortedCategories.length} categories · ${allProjects.length} projects</span>
  ${builtAt ? `<span style="font-size:10px;color:var(--vscode-descriptionForeground);white-space:nowrap">⏱ Built ${esc(builtAt)}</span>` : ''}
</div>

<!-- Catalog -->
<div id="catalog">${projectsSectionHtml}${categorySections}</div>

<script>
(function(){
'use strict';
const vscode = acquireVsCodeApi();

// ── Filtering ──────────────────────────────────────────────────────────────
function applyFilters() {
  var q    = document.getElementById('search').value.toLowerCase().trim();
  var proj = document.getElementById('proj-filter').value;
  var cat  = document.getElementById('cat-filter').value;
  var visible = 0;

  document.querySelectorAll('.card').forEach(function(card) {
    var matchProj = !proj || card.dataset.project === proj;
    var matchCat  = !cat  || card.dataset.category === cat;
    var searchStr = (card.dataset.project + ' ' + card.dataset.tags + ' ' +
                    (card.querySelector('.card-title') ? card.querySelector('.card-title').textContent : '') + ' ' +
                    (card.querySelector('.card-desc')  ? card.querySelector('.card-desc').textContent  : '') + ' ' +
                    (card.querySelector('.card-filename') ? card.querySelector('.card-filename').textContent : '') + ' ' +
                    (card.querySelector('.card-path')  ? card.querySelector('.card-path').textContent  : '')).toLowerCase();
    var matchQ = !q || searchStr.includes(q);
    var show   = matchProj && matchCat && matchQ;
    card.classList.toggle('hidden', !show);
    if (show) { visible++; }
  });

  document.querySelectorAll('.cat-section').forEach(function(sec) {
    sec.classList.toggle('hidden', !sec.querySelector('.card:not(.hidden)'));
  });

  var sections = document.querySelectorAll('.cat-section:not(.hidden)').length;
  document.getElementById('stat-bar').textContent =
    visible + ' visible · ' + sections + ' section(s) shown';
}

function resetFilters() {
  document.getElementById('search').value      = '';
  document.getElementById('proj-filter').value = '';
  document.getElementById('cat-filter').value  = '';
  document.querySelectorAll('.card').forEach(function(c) { c.classList.remove('hidden'); });
  document.querySelectorAll('.cat-section').forEach(function(s) { s.classList.remove('hidden'); });
  document.getElementById('stat-bar').textContent =
    '${cards.length} docs · ${sortedCategories.length} categories · ${allProjects.length} projects';
}

// ── Delegated click handler ────────────────────────────────────────────────
document.addEventListener('click', function(e) {
  var btn = e.target.closest('[data-action]');
  if (!btn) { return; }
  var action = btn.dataset.action;

  if (action === 'open-preview') {
    var p = btn.dataset.path;
    if (p) { vscode.postMessage({ command: 'preview', data: p }); }
    return;
  }

  if (action === 'open') {
    var p = btn.dataset.path;
    if (p) { vscode.postMessage({ command: 'open', data: p }); }
    return;
  }

  if (action === 'run') {
    vscode.postMessage({ command: 'run', projPath: btn.dataset.projPath, script: btn.dataset.script });
    return;
  }

  if (action === 'open-folder') {
    vscode.postMessage({ command: 'openFolder', data: btn.dataset.projPath });
    return;
  }

  if (action === 'open-claude') {
    vscode.postMessage({ command: 'openClaude', data: btn.dataset.projPath });
    return;
  }

  if (action === 'create-claude') {
    vscode.postMessage({ command: 'createClaude', data: btn.dataset.projPath });
    return;
  }
});

// expose for inline onXxx calls from toolbar
window.applyFilters = applyFilters;
window.resetFilters = resetFilters;
})();
</script>
</body></html>`;
}
// ─── Commands ─────────────────────────────────────────────────────────────────
let _catalogPanel;
let _cachedCards;
async function buildCatalog(forceRebuild = false) {
    if (_cachedCards && !forceRebuild) {
        return _cachedCards;
    }
    const registry = loadRegistry();
    if (!registry) {
        return undefined;
    }
    _cardIdCounter = 0;
    return vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Building doc catalog…', cancellable: false }, async (progress) => {
        const cards = scanForCards(registry.globalDocsPath, 'global', registry.globalDocsPath);
        for (const project of registry.projects) {
            progress.report({ message: `Scanning ${project.name}…` });
            if (fs.existsSync(project.path)) {
                cards.push(...scanForCards(project.path, project.name, project.path));
            }
        }
        cards.sort((a, b) => {
            if (a.categoryNum !== b.categoryNum) {
                return a.categoryNum - b.categoryNum;
            }
            if (a.projectName !== b.projectName) {
                return a.projectName.localeCompare(b.projectName);
            }
            return a.fileName.localeCompare(b.fileName);
        });
        _cachedCards = cards;
        (0, output_channel_1.log)(FEATURE, `Catalog built: ${cards.length} cards across ${registry.projects.length + 1} locations`);
        return cards;
    });
}
async function openCatalog(forceRebuild = false) {
    const registry = loadRegistry();
    const projectInfos = registry
        ? registry.projects.filter(p => fs.existsSync(p.path)).map(loadProjectInfo)
        : [];
    const cards = await buildCatalog(forceRebuild);
    if (!cards?.length) {
        vscode.window.showWarningMessage('No docs found to catalog.');
        return;
    }
    const builtAt = new Date().toLocaleString();
    const html = buildCatalogHtml(cards, projectInfos, builtAt);
    if (_catalogPanel) {
        _catalogPanel.webview.html = html;
        _catalogPanel.reveal();
    }
    else {
        // Open beside the current panel so the launcher isn't replaced
        const col = vscode.window.activeTextEditor
            ? vscode.ViewColumn.Beside
            : vscode.ViewColumn.One;
        _catalogPanel = vscode.window.createWebviewPanel('docCatalog', '📚 Doc Catalog', col, { enableScripts: true, retainContextWhenHidden: true });
        _catalogPanel.webview.html = html;
        _catalogPanel.onDidDispose(() => { _catalogPanel = undefined; });
    }
    _catalogPanel.webview.onDidReceiveMessage(async (msg) => {
        switch (msg.command) {
            case 'preview':
                if (msg.data && fs.existsSync(msg.data)) {
                    await vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(msg.data));
                }
                break;
            case 'open':
                if (msg.data && fs.existsSync(msg.data)) {
                    const doc = await vscode.workspace.openTextDocument(msg.data);
                    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
                }
                break;
            case 'run': {
                const projPath = msg.projPath;
                const script = msg.script;
                if (!projPath || !script) {
                    break;
                }
                const terminal = vscode.window.createTerminal({
                    name: `${path.basename(projPath)} — ${script}`,
                    cwd: projPath,
                });
                terminal.show();
                if (script === 'dotnet:build') {
                    terminal.sendText('dotnet build');
                }
                else {
                    terminal.sendText(`npm run ${script}`);
                }
                (0, output_channel_1.log)(FEATURE, `Running: npm run ${script} in ${projPath}`);
                break;
            }
            case 'openFolder':
                if (msg.data) {
                    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(msg.data), { forceNewWindow: false });
                }
                break;
            case 'openClaude': {
                const claudePath = path.join(msg.data, 'CLAUDE.md');
                if (fs.existsSync(claudePath)) {
                    const doc = await vscode.workspace.openTextDocument(claudePath);
                    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
                }
                else {
                    vscode.window.showWarningMessage(`No CLAUDE.md found in ${msg.data}`);
                }
                break;
            }
            case 'createClaude': {
                const projPath = msg.data;
                const claudeDest = path.join(projPath, 'CLAUDE.md');
                const projName = path.basename(projPath);
                // Build a minimal but useful CLAUDE.md from project context
                const pkgPath = path.join(projPath, 'package.json');
                let scripts = '';
                let projType = 'project';
                try {
                    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
                    projType = pkg.description ?? projType;
                    const keys = Object.keys(pkg.scripts ?? {}).slice(0, 6);
                    if (keys.length) {
                        scripts = '\n## Build & Run\n\n' + keys.map(k => `- \`npm run ${k}\``).join('\n') + '\n';
                    }
                }
                catch { /* no package.json */ }
                const today = new Date().toISOString().slice(0, 10);
                const template = `# CLAUDE.md — ${projName}

> Session instructions and project context for Claude.
> Created: ${today}

## Project Overview

**Name:** ${projName}  
**Path:** ${projPath}  
**Type:** ${projType}

## Key Rules for This Project

- Always read this file at the start of each session
- Follow CieloVista coding standards
- All rights reserved — proprietary software
${scripts}
## Architecture Notes

<!-- Add key architecture decisions, patterns, and constraints here -->

## Session Start Checklist

- [ ] Read CLAUDE.md (this file)
- [ ] Check docs/_today/CURRENT-STATUS.md if it exists
- [ ] Review last session via recent_chats
`;
                fs.writeFileSync(claudeDest, template, 'utf8');
                (0, output_channel_1.log)(FEATURE, `Created CLAUDE.md for ${projName}`);
                // Open it for editing
                const doc = await vscode.workspace.openTextDocument(claudeDest);
                await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
                // Rebuild catalog so the button flips to "📄 CLAUDE.md"
                _cachedCards = undefined;
                vscode.window.showInformationMessage(`Created CLAUDE.md for ${projName} — catalog will refresh on next open.`);
                break;
            }
        }
    });
    (0, output_channel_1.log)(FEATURE, `Catalog opened: ${cards.length} cards`);
}
async function viewSpecificDoc() {
    const registry = loadRegistry();
    if (!registry) {
        return;
    }
    const cards = await buildCatalog();
    if (!cards?.length) {
        return;
    }
    const items = cards.map(c => ({
        label: `$(markdown) ${c.title}`,
        description: c.projectName,
        detail: c.filePath,
        card: c,
    }));
    const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Pick a doc to view',
        matchOnDescription: true,
        matchOnDetail: true,
    });
    if (!picked) {
        return;
    }
    const doc = await vscode.workspace.openTextDocument(picked.card.filePath);
    await vscode.window.showTextDocument(doc);
}
// ─── Activate / Deactivate ────────────────────────────────────────────────────
function activate(context) {
    (0, output_channel_1.log)(FEATURE, 'Activating');
    // Restore catalog panel after VS Code reload
    vscode.window.registerWebviewPanelSerializer('docCatalog', {
        async deserializeWebviewPanel(panel) {
            _catalogPanel = panel;
            _catalogPanel.webview.options = { enableScripts: true };
            // Rebuild fresh on restore so data is current
            const registry = loadRegistry();
            const projectInfos = registry
                ? registry.projects.filter(p => fs.existsSync(p.path)).map(loadProjectInfo)
                : [];
            const cards = await buildCatalog(true);
            if (cards?.length) {
                _catalogPanel.webview.html = buildCatalogHtml(cards, projectInfos, new Date().toLocaleString());
            }
            _catalogPanel.onDidDispose(() => { _catalogPanel = undefined; });
            (0, output_channel_1.log)(FEATURE, 'Doc Catalog panel restored after reload');
        }
    });
    context.subscriptions.push(vscode.commands.registerCommand('cvs.catalog.open', () => openCatalog(false)), vscode.commands.registerCommand('cvs.catalog.rebuild', () => {
        _cachedCards = undefined;
        openCatalog(true);
    }), vscode.commands.registerCommand('cvs.catalog.view', viewSpecificDoc));
}
function deactivate() {
    _catalogPanel?.dispose();
    _catalogPanel = undefined;
    _cachedCards = undefined;
}
//# sourceMappingURL=doc-catalog.js.map