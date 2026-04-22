// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * projects.ts
 *
 * Builds the Projects section for the Doc Catalog.
 * Project cards are owned by the NPM Scripts panel (cvs.npm.showAndRunScripts).
 * This section just provides a launch point and the Configure tab.
 */

import * as fs   from 'fs';
import * as path from 'path';
import type { ProjectEntry, ProjectInfo } from './types';

export const PROJECT_TYPES = [
    'vscode-extension', 'component-library', 'dotnet-service',
    'app', 'library', 'tool', 'other',
];

// ─── Project info loader ──────────────────────────────────────────────────────

export function loadProjectInfo(entry: ProjectEntry): ProjectInfo {
    let description = entry.description;
    const readmePath = path.join(entry.path, 'README.md');
    if (fs.existsSync(readmePath)) {
        try {
            const content    = fs.readFileSync(readmePath, 'utf8');
            const fromReadme = content.split('\n').filter(l => l.trim() && !l.startsWith('#'))[0]?.trim();
            if (fromReadme && fromReadme !== 'No description.') { description = fromReadme; }
        } catch { /* keep registry description */ }
    }

    const info: ProjectInfo = {
        name: entry.name, rootPath: entry.path, type: entry.type,
        description, scripts: {}, hasNpm: false, hasDotnet: false,
    };

    const pkgPath = path.join(entry.path, 'package.json');
    if (fs.existsSync(pkgPath)) {
        try {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            info.hasNpm = true;
            const all: Record<string, string> = pkg.scripts ?? {};
            Object.keys(all).slice(0, 8).forEach(s => { info.scripts[s] = all[s]; });
        } catch { /* ignore */ }
    }

    try {
        if (fs.readdirSync(entry.path).some(e => /\.sln[x]?$/i.test(e))) { info.hasDotnet = true; }
    } catch { /* ignore */ }

    return info;
}

// ─── Projects section HTML ────────────────────────────────────────────────────

export function buildProjectsSectionHtml(
    projects: ProjectInfo[],
    _registryEntries: Array<{ name: string; path: string; type: string; description: string }> = []
): string {
    // Project cards live in the NPM Scripts panel (cvs.npm.showAndRunScripts).
    // One place, one interface — no duplicate card rendering here.
    return `<section class="cat-section" data-category="\u{1F680} Projects">
  <h2 class="cat-heading">
    <span class="cat-dewey">PRJ</span>
    Projects
    <span class="cat-count">${projects.length}</span>
  </h2>
  <div style="padding:16px 0">
  <div style="display:flex;align-items:center;gap:12px;padding:14px 16px;background:var(--vscode-textCodeBlock-background);border:1px solid var(--vscode-panel-border);border-radius:5px;max-width:520px">
    <span style="font-size:1.8em">\u{1F4E6}</span>
    <div style="flex:1">
      <div style="font-weight:700;margin-bottom:3px">NPM Scripts \u2014 ${projects.length} projects</div>
      <div style="font-size:11px;color:var(--vscode-descriptionForeground)">Project cards, script tooltips, and Configure all live in the NPM Scripts panel.</div>
    </div>
    <button class="btn-view" data-action="open-npm-scripts" style="white-space:nowrap;flex-shrink:0">\u{1F4E6} Open NPM Scripts</button>
  </div>
</div>
</section>`;
}
