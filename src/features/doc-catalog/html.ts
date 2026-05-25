// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

// component: cat

/**
 * html.ts
 *
 * Builds the Doc Catalog webview HTML.
 *
 * The UI (CSS + JS) lives in catalog.html — a real HTML file editable directly.
 * This file only generates the catalog card HTML (pure data, no logic) and
 * injects it into the shell via a postMessage 'init' command after the panel loads.
 *
 * To edit buttons, handlers, or styles: edit catalog.html directly.
 * No TypeScript compile needed for UI-only changes — just reload the window.
 */

import * as fs   from 'fs';
import * as path from 'path';
import { esc } from './content';
import type { CatalogCard, ProjectInfo } from './types';
import { CATALOG } from '../cvs-command-launcher/catalog';

// ─── Load the static HTML shell ───────────────────────────────────────────────

export function getCatalogShellHtml(): string {
    const htmlPath = path.join(__dirname, 'catalog.html');
    if (fs.existsSync(htmlPath)) {
        return fs.readFileSync(htmlPath, 'utf8');
    }
    // Fallback if file missing — bare minimum to show error
    return `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2em;color:#f85149">
        <h2>&#9888; catalog.html missing</h2>
        <p>Expected: <code>${htmlPath}</code></p>
        <p>Run <code>npm run compile</code> and reload.</p>
    </body></html>`;
}

// ─── Build catalog card HTML (data only, no JS) ───────────────────────────────

export function buildCatalogInitPayload(
    cards: CatalogCard[],
    projectInfos: ProjectInfo[] = [],
    builtAt = '',
    registryEntries: Array<{ name: string; path: string; type: string; description: string }> = []
): { html: string; totalCards: number; totalCats: number; totalProjects: number; builtAt: string } {

    const byCategory = new Map<string, CatalogCard[]>();
    for (const card of cards) {
        if (!byCategory.has(card.category)) { byCategory.set(card.category, []); }
        byCategory.get(card.category)!.push(card);
    }

    const sortedCategories = [...byCategory.entries()]
        .sort((a, b) => (a[1][0]?.categoryNum ?? 0) - (b[1][0]?.categoryNum ?? 0));

    const categorySections = sortedCategories.map(([catLabel, catCards]) => {
        const seqWithinCat = new Map<string, number>();
        const cardHtml = catCards.map(card => {
            const relPath  = path.relative(card.projectPath, card.filePath).replace(/\\/g, '/');
            const relDir   = path.relative(card.projectPath, path.dirname(card.filePath));
            const firstSeg = relDir.split(/[/\\]/)[0];
            const section  = (!firstSeg || firstSeg === '.') ? 'root' : firstSeg;
            const tagsHtml = card.tags.slice(0, 6).map(t =>
                `<span class="tag" data-action="filter-tag" data-tag="${esc(t)}">${esc(t)}</span>`
            ).join('');
            const seq      = (seqWithinCat.get(catLabel) ?? 0) + 1;
            seqWithinCat.set(catLabel, seq);
            const deweyNum = `${card.categoryNum.toString().padStart(3,'0')}.${seq.toString().padStart(3,'0')}`;

            // Build tooltip: Where, When, Why, How + Dewey
            const tooltipText = [
                `Where: ${card.projectName} — ${relPath}`,
                `When: Reference while working on ${card.projectName}`,
                `Why: ${card.description}`,
                `How: Click title or Preview to preview  |  Edit to open in editor`,
                ``,
                `Dewey: ${deweyNum}  |  ${card.fileName}`,
            ].join('\n');

            const isWbCore = card.projectPath.toLowerCase().includes('wb-core');
            const demoBtn = isWbCore
                ? `<button class="btn-demo" data-action="wb-demo" data-path="${esc(card.filePath)}" data-name="${esc(card.title)}" title="Open live component demo in browser">&#9654; Demo</button>`
                : '';

            const catEntry = CATALOG.find(e => e.location && card.filePath.replace(/\\/g, '/').endsWith(e.location.replace(/\\/g, '/')));
            const commandId = catEntry?.id ?? '';
            const runBtn = commandId
                ? `<button class="btn-run" data-action="run-command" data-command-id="${esc(commandId)}" title="Run: ${esc(catEntry!.title)}">&#9654; Run</button>`
                : '';
            const finishBtn = `<button class="btn-finish" data-action="finish-doc" data-path="${esc(card.filePath)}" data-title="${esc(card.title)}" data-project="${esc(card.projectName)}" title="Mark as finished — moves to Finished Work queue">&#9989; Done</button>`;

            return `<article class="card"
  data-id="${esc(card.id)}"
  data-project="${esc(card.projectName)}"
  data-category="${esc(card.category)}"
  data-section="${esc(section)}"
  data-tags="${esc(card.tags.join(' '))}"
  data-modified="${esc(card.lastModified)}">
  <div class="card-header">
    <span class="card-project card-project-link"
      data-action="open-project-folder"
      data-proj-path="${esc(card.projectPath)}"
      title="Open project folder"
      style="cursor:pointer;text-decoration:underline">${esc(card.projectName)}</span>
    <button class="btn-vscode-proj" data-action="open-project-vscode" data-proj-path="${esc(card.projectPath)}" title="Open project in VS Code">&#128203;</button>
    <span class="card-date">${esc(card.lastModified)}</span>
  </div>
  <div class="card-dewey-row">
    <span class="card-dewey" data-action="jump-to-cat" data-cat-label="${esc(catLabel)}" style="cursor:pointer" title="Jump to category">${deweyNum}</span>
    <span class="card-filename">${esc(card.fileName)}</span>
  </div>
  <div class="card-title" data-action="open-preview" data-path="${esc(card.filePath)}" title="${esc(tooltipText)}">${esc(card.title)}</div>
  <button class="card-proj-path-link" data-action="open-project-folder" data-proj-path="${esc(card.projectPath)}" title="Open project folder: ${esc(card.projectPath)}">${esc(card.projectPath)}</button>
  <div class="card-desc">${esc(card.description)}</div>
  <div class="card-path" title="${esc(card.filePath)}">${esc(relPath)}</div>
  <div class="card-tags">${tagsHtml}</div>
  <div class="card-footer">
    <span class="card-size">${(card.sizeBytes / 1024).toFixed(1)} KB</span>
    <div class="card-btns">
            <button class="btn-view" data-action="open-preview" data-path="${esc(card.filePath)}">&#128196; Preview</button>
      <button class="btn-open" data-action="open"         data-path="${esc(card.filePath)}">&#9998; Edit</button>
      <button class="btn-open" data-action="open-folder"  data-path="${esc(card.projectPath)}">&#128194; Folder</button>
      ${demoBtn}
      ${runBtn}
      ${finishBtn}
    </div>
  </div>
</article>`;
        }).join('');

        const baseLabel = (catCards[0]?.categoryNum ?? 0).toString().padStart(3,'0');
        return `<section class="cat-section" data-category="${esc(catLabel)}">
  <h2 class="cat-heading">
    <span class="cat-dewey" data-action="show-cat-list" data-dewey-prefix="${esc(baseLabel)}" style="cursor:pointer" title="Show all categories">${esc(baseLabel)}</span>
    ${esc(catLabel)}
    <span class="cat-count">${catCards.length}</span>
  </h2>
  <div class="card-grid">${cardHtml}</div>
</section>`;
    }).join('');

    return {
        html:          categorySections,
        totalCards:    cards.length,
        totalCats:     sortedCategories.length,
        totalProjects: projectInfos.length,
        builtAt,
    };
}

// ─── Legacy shim — kept so callers don't break during transition ──────────────
// TODO: remove once commands.ts is updated to use buildCatalogInitPayload

export function buildCatalogHtml(
    cards: CatalogCard[],
    projectInfos: ProjectInfo[] = [],
    builtAt = '',
    registryEntries: Array<{ name: string; path: string; type: string; description: string }> = []
): string {
    // Return the shell — the panel will postMessage 'init' with the card data
    // This is called by commands.ts; it should follow up with postMessage immediately.
    return getCatalogShellHtml();
}
