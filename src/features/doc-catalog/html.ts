// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
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

    // Extract shared prefix (text before first :, -, or . separator)
    function docPrefix(title: string): string {
        const m = title.match(/^([A-Za-z0-9_]+)[:\-\.]/);
        return m ? m[1].toLowerCase() : '';
    }

    const categorySections = sortedCategories.map(([catLabel, catCards]) => {
        const seqWithinCat = new Map<string, number>();

        function buildCardHtml(card: CatalogCard): string {
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

            const tooltipText = [
                `Where: ${card.projectName} — ${relPath}`,
                `When: Reference while working on ${card.projectName}`,
                `Why: ${card.description}`,
                `How: Click title or View to preview  |  Edit to open in editor`,
                ``,
                `Dewey: ${deweyNum}  |  ${card.fileName}`,
            ].join('\n');

            const isWbCore = card.projectPath.toLowerCase().includes('wb-core');
            const demoBtn = isWbCore
                ? `<button class="btn-demo" data-action="wb-demo" data-path="${esc(card.filePath)}" data-name="${esc(card.title)}" title="Open live component demo in browser">&#9654; Demo</button>`
                : '';

            return `<article class="card"
  data-id="${esc(card.id)}"
  data-project="${esc(card.projectName)}"
  data-category="${esc(card.category)}"
  data-section="${esc(section)}"
  data-tags="${esc(card.tags.join(' '))}">
  <div class="card-header">
    <span class="card-project card-project-link"
      data-action="open-project-folder"
      data-proj-path="${esc(card.projectPath)}"
      title="Open project folder"
      style="cursor:pointer;text-decoration:underline">${esc(card.projectName)}</span>
    <span class="card-date">${esc(card.lastModified)}</span>
  </div>
  <div class="card-dewey-row">
    <span class="card-dewey">${deweyNum}</span>
    <span class="card-filename">${esc(card.fileName)}</span>
  </div>
  <div class="card-title" data-action="open-preview" data-path="${esc(card.filePath)}" title="${esc(tooltipText)}">${esc(card.title)}</div>
  <div style="font-family:monospace;font-size:10px;color:var(--vscode-descriptionForeground)">${esc(card.projectPath)}</div>
  <div class="card-desc">${esc(card.description)}</div>
  <div class="card-path" title="${esc(card.filePath)}">${esc(relPath)}</div>
  <div class="card-tags">${tagsHtml}</div>
  <div class="card-footer">
    <span class="card-size">${(card.sizeBytes / 1024).toFixed(1)} KB</span>
    <div class="card-btns">
      <button class="btn-view" data-action="open-preview" data-path="${esc(card.filePath)}">&#128196; View</button>
      <button class="btn-open" data-action="open"         data-path="${esc(card.filePath)}">&#9998; Edit</button>
      <button class="btn-open" data-action="open-folder"  data-path="${esc(card.projectPath)}">&#128194; Folder</button>
      ${demoBtn}
    </div>
  </div>
</article>`;
        }

        // Group cards by project, then sub-group by shared title prefix within each project
        const byProject = new Map<string, CatalogCard[]>();
        for (const card of catCards) {
            if (!byProject.has(card.projectName)) { byProject.set(card.projectName, []); }
            byProject.get(card.projectName)!.push(card);
        }

        let cardHtml = '';
        for (const [, projCards] of byProject) {
            // Count how many cards share each prefix within this project
            const prefixCounts = new Map<string, number>();
            for (const card of projCards) {
                const p = docPrefix(card.title);
                if (p) prefixCounts.set(p, (prefixCounts.get(p) ?? 0) + 1);
            }
            const sharedPrefixes = new Set([...prefixCounts.entries()]
                .filter(([, n]) => n >= 2)
                .map(([p]) => p));

            if (sharedPrefixes.size === 0) {
                // No grouping — render flat
                cardHtml += projCards.map(buildCardHtml).join('');
            } else {
                // Emit grouped sections first, then ungrouped cards
                const grouped   = new Map<string, CatalogCard[]>();
                const ungrouped: CatalogCard[] = [];
                for (const card of projCards) {
                    const p = docPrefix(card.title);
                    if (p && sharedPrefixes.has(p)) {
                        if (!grouped.has(p)) { grouped.set(p, []); }
                        grouped.get(p)!.push(card);
                    } else {
                        ungrouped.push(card);
                    }
                }
                for (const [prefix, grpCards] of grouped) {
                    cardHtml += `<h3 class="doc-group-hd">${esc(prefix)}</h3>`;
                    cardHtml += grpCards.map(buildCardHtml).join('');
                }
                cardHtml += ungrouped.map(buildCardHtml).join('');
            }
        }

        const baseLabel = (catCards[0]?.categoryNum ?? 0).toString().padStart(3,'0');
        return `<section class="cat-section" data-category="${esc(catLabel)}">
  <h2 class="cat-heading">
    <span class="cat-dewey">${esc(baseLabel)}</span>
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
