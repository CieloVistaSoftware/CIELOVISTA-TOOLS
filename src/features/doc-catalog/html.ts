// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

import * as path from 'path';
import { esc } from './content';
import { buildProjectsSectionHtml } from './projects';
import type { CatalogCard, ProjectInfo } from './types';

export function buildCatalogHtml(
    cards: CatalogCard[],
    projectInfos: ProjectInfo[] = [],
    builtAt = ''
): string {
    const byCategory = new Map<string, CatalogCard[]>();
    for (const card of cards) {
        if (!byCategory.has(card.category)) { byCategory.set(card.category, []); }
        byCategory.get(card.category)!.push(card);
    }

    const sortedCategories = [...byCategory.entries()]
        .sort((a, b) => (a[1][0]?.categoryNum ?? 0) - (b[1][0]?.categoryNum ?? 0));

    const categoryLabels = sortedCategories.map(([label]) => label);

    const categorySections = sortedCategories.map(([catLabel, catCards]) => {
        // Track sequence per category for unique Dewey numbers within each section
        const seqWithinCat = new Map<string, number>();
        const cardHtml = catCards.map(card => {
            const relPath  = path.relative(card.projectPath, card.filePath).replace(/\\/g, '/');
            const tagsHtml = card.tags.slice(0, 6).map(t => `<span class="tag">${esc(t)}</span>`).join('');
            const seq      = (seqWithinCat.get(catLabel) ?? 0) + 1;
            seqWithinCat.set(catLabel, seq);
            const deweyNum = `${card.categoryNum.toString().padStart(3, '0')}.${seq.toString().padStart(3, '0')}`;

            return `<article class="card" data-id="${card.id}" data-project="${esc(card.projectName)}" data-category="${esc(card.category)}" data-tags="${esc(card.tags.join(' '))}">
  <div class="card-header">
    <span class="card-project">${esc(card.projectName)}</span>
    <span class="card-date">${card.lastModified}</span>
  </div>
  <div class="card-dewey-row">
    <span class="card-dewey">${deweyNum}</span>
    <span class="card-filename">${esc(card.fileName)}</span>
  </div>
  <div class="card-title" style="cursor:pointer" data-action="open-preview" data-path="${esc(card.filePath)}">${esc(card.title)}</div>
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

        const baseNum  = catCards[0]?.categoryNum ?? 0;
        const baseLabel = baseNum.toString().padStart(3, '0');
        return `<section class="cat-section" data-category="${esc(catLabel)}">
  <h2 class="cat-heading"><span class="cat-dewey">${esc(baseLabel)}</span> ${esc(catLabel)} <span class="cat-count">${catCards.length}</span></h2>
  <div class="card-grid">${cardHtml}</div>
</section>`;
    }).join('');

    const docProjects  = new Set(cards.map(c => c.projectName));
    const projProjects = new Set(projectInfos.map(p => p.name));
    const allProjects  = [...new Set([...projProjects, ...docProjects])].sort();
    const projectOptions  = allProjects.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
    const categoryOptions = ['🗂️ Projects', ...categoryLabels].map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    const projectsSectionHtml = buildProjectsSectionHtml(projectInfos);

    const totalCards     = cards.length;
    const totalCats      = sortedCategories.length;
    const totalProjects  = allProjects.length;

    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);font-size:13px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background)}
#toolbar{position:sticky;top:0;z-index:100;background:var(--vscode-editor-background);border-bottom:1px solid var(--vscode-panel-border);padding:8px 16px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
#toolbar h1{font-size:1.1em;font-weight:700;white-space:nowrap;margin-right:4px}
#search{flex:1;min-width:160px;padding:4px 8px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);border-radius:2px;font-size:12px}
select{padding:4px 8px;background:var(--vscode-dropdown-background);color:var(--vscode-dropdown-foreground);border:1px solid var(--vscode-dropdown-border);border-radius:2px;font-size:12px;cursor:pointer}
#stat-bar{font-size:11px;color:var(--vscode-descriptionForeground);white-space:nowrap}
#btn-reset{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;padding:4px 10px;border-radius:2px;cursor:pointer;font-size:12px}
#btn-reset:hover{background:var(--vscode-button-secondaryHoverBackground)}
#catalog{padding:12px 16px}
.cat-section{margin-bottom:28px}
.cat-heading{font-size:0.95em;font-weight:700;border-bottom:2px solid var(--vscode-focusBorder);padding-bottom:5px;margin-bottom:10px;display:flex;align-items:center;gap:8px}
.cat-dewey{font-family:var(--vscode-editor-font-family,monospace);font-size:11px;font-weight:700;background:var(--vscode-focusBorder);color:var(--vscode-editor-background);border-radius:3px;padding:1px 7px;letter-spacing:0.05em;flex-shrink:0}
.cat-count{background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);border-radius:10px;padding:1px 7px;font-size:0.8em;font-weight:400}
.card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}
.card{background:var(--vscode-textCodeBlock-background);border:1px solid var(--vscode-panel-border);border-radius:5px;padding:10px 12px;display:flex;flex-direction:column;gap:4px;transition:border-color 0.15s}
.card:hover{border-color:var(--vscode-focusBorder)}
.card.hidden{display:none}
.card-header{display:flex;justify-content:space-between;align-items:center}
.card-project{font-size:10px;font-weight:700;color:var(--vscode-textLink-foreground);text-transform:uppercase;letter-spacing:0.05em}
.card-date{font-size:10px;color:var(--vscode-descriptionForeground)}
.card-dewey-row{display:flex;align-items:center;gap:6px;margin-bottom:2px}
.card-dewey{font-family:var(--vscode-editor-font-family);font-size:10px;font-weight:700;background:var(--vscode-editor-background);color:var(--vscode-textLink-foreground);border:1px solid var(--vscode-panel-border);border-radius:3px;padding:1px 6px;letter-spacing:0.05em;flex-shrink:0}
.card-filename{font-family:var(--vscode-editor-font-family);font-size:10px;color:var(--vscode-descriptionForeground)}
.card-title{font-weight:700;font-size:0.92em;line-height:1.3;transition:color 0.1s}
.card-title[data-action]:hover{color:var(--vscode-textLink-foreground)}
.card-desc{font-size:11px;line-height:1.45;opacity:0.85;flex:1}
.card-path{font-family:var(--vscode-editor-font-family);font-size:9px;color:var(--vscode-descriptionForeground);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.card-tags{display:flex;flex-wrap:wrap;gap:3px;margin-top:2px}
.tag{font-size:9px;padding:1px 5px;border-radius:3px;background:var(--vscode-editor-background);border:1px solid var(--vscode-panel-border);color:var(--vscode-descriptionForeground)}
.card-footer{display:flex;justify-content:space-between;align-items:center;margin-top:4px;flex-wrap:wrap;gap:4px}
.card-size{font-size:10px;color:var(--vscode-descriptionForeground)}
.card-btns{display:flex;gap:4px;flex-wrap:wrap}
.btn-view,.btn-open{border:none;padding:4px 10px;border-radius:3px;cursor:pointer;font-size:11px;font-weight:500;transition:opacity 0.1s}
.btn-view{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}
.btn-view:hover{background:var(--vscode-button-hoverBackground)}
.btn-view:active{opacity:0.8}
.btn-open{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}
.btn-open:hover{background:var(--vscode-button-secondaryHoverBackground)}
.btn-open:active{opacity:0.8}
.proj-card .btn-view,.proj-card .btn-open{padding:5px 12px;font-size:12px;font-weight:600;min-width:52px;text-align:center;box-shadow:0 1px 2px rgba(0,0,0,0.25)}
.proj-card .btn-view:hover,.proj-card .btn-open:hover{box-shadow:0 1px 4px rgba(0,0,0,0.4);transform:translateY(-1px)}
.proj-card .btn-view:active,.proj-card .btn-open:active{transform:translateY(0);box-shadow:none}
.cat-section.hidden{display:none}
.btn-create-claude{border:1px dashed var(--vscode-focusBorder) !important;opacity:0.8}
.btn-create-claude:hover{opacity:1}
.btn-no-tests{border:1px dashed #cca700 !important;color:#cca700 !important;background:rgba(204,167,0,0.1) !important}
.btn-no-tests:hover{background:rgba(204,167,0,0.2) !important;opacity:1}
</style>
</head><body>
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
  <span id="stat-bar">${totalCards} docs · ${totalCats} categories · ${totalProjects} projects</span>
  ${builtAt ? `<span style="font-size:10px;color:var(--vscode-descriptionForeground);white-space:nowrap">⏱ Built ${esc(builtAt)}</span>` : ''}
</div>
<div id="catalog">${projectsSectionHtml}${categorySections}</div>
<script>

(function(){
'use strict';
const vscode = acquireVsCodeApi();
const TOTAL_STAT = '${totalCards} docs \xb7 ${totalCats} categories \xb7 ${totalProjects} projects';

function applyFilters() {
  var q = document.getElementById('search').value.toLowerCase().trim();
  var proj = document.getElementById('proj-filter').value;
  var cat  = document.getElementById('cat-filter').value;
  var visible = 0;
  document.querySelectorAll('.card').forEach(function(card) {
    var matchProj = !proj || card.dataset.project === proj;
    var matchCat  = !cat  || card.dataset.category === cat;
    var t = function(sel) { var el = card.querySelector(sel); return el ? el.textContent : ''; };
    var searchStr = (card.dataset.project + ' ' + card.dataset.tags + ' ' + t('.card-title') + ' ' + t('.card-desc') + ' ' + t('.card-filename') + ' ' + t('.card-path')).toLowerCase();
    var show = matchProj && matchCat && (!q || searchStr.includes(q));
    card.classList.toggle('hidden', !show);
    if (show) { visible++; }
  });
  document.querySelectorAll('.cat-section').forEach(function(sec) {
    sec.classList.toggle('hidden', !sec.querySelector('.card:not(.hidden)'));
  });
  document.getElementById('stat-bar').textContent = visible + ' visible \xb7 ' + document.querySelectorAll('.cat-section:not(.hidden)').length + ' section(s) shown';
}

function resetFilters() {
  document.getElementById('search').value = '';
  document.getElementById('proj-filter').value = '';
  document.getElementById('cat-filter').value = '';
  document.querySelectorAll('.card').forEach(function(c) { c.classList.remove('hidden'); });
  document.querySelectorAll('.cat-section').forEach(function(s) { s.classList.remove('hidden'); });
  document.getElementById('stat-bar').textContent = TOTAL_STAT;
}

// Highlight the card for the given file path
function highlightCard(filePath) {
  document.querySelectorAll('.card').forEach(function(card) {
    if (card.dataset && card.dataset.path === filePath) {
      card.classList.add('active-link');
    } else {
      card.classList.remove('active-link');
    }
  });
}

window.addEventListener('message', function(event) {
  const msg = event.data;
  if (msg && msg.type === 'highlight' && msg.filePath) {
    highlightCard(msg.filePath);
  }
});

document.addEventListener('click', function(e) {
  var btn = e.target.closest('[data-action]');
  if (!btn) { return; }
  var a = btn.dataset.action;
  if (a === 'open-preview') { if (btn.dataset.path) { vscode.postMessage({ command: 'preview', data: btn.dataset.path }); } return; }
  if (a === 'open')         { if (btn.dataset.path) { vscode.postMessage({ command: 'open', data: btn.dataset.path }); } return; }
  if (a === 'run')          { vscode.postMessage({ command: 'run', projPath: btn.dataset.projPath, script: btn.dataset.script }); return; }
  if (a === 'open-folder')  { vscode.postMessage({ command: 'openFolder', data: btn.dataset.projPath }); return; }
  if (a === 'open-claude')  { vscode.postMessage({ command: 'openClaude', data: btn.dataset.projPath }); return; }
  if (a === 'create-claude'){ vscode.postMessage({ command: 'createClaude', data: btn.dataset.projPath }); return; }
  if (a === 'create-tests') { vscode.postMessage({ command: 'create-tests', data: btn.dataset.projPath, projName: btn.dataset.projName }); return; }
});

window.applyFilters = applyFilters;
window.resetFilters = resetFilters;
})();
</script>
</body></html>`;
}
