// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

import * as fs from 'fs';
import * as path from 'path';
import { esc } from './content';
import { extractDescription } from './content';
import type { ProjectEntry, ProjectInfo } from './types';

const PROMINENT_SCRIPTS = ['start', 'build', 'rebuild', 'test', 'watch', 'tray', 'tray:rebuild', 'service'];
const TYPE_ICON: Record<string, string> = {
    'vscode-extension': '🧩',
    'component-library': '🧱',
    'dotnet-service': '⚙️',
    'app': '🖥️',
};

export function loadProjectInfo(entry: ProjectEntry): ProjectInfo {
    let description = entry.description;
    const readmePath = path.join(entry.path, 'README.md');
    if (fs.existsSync(readmePath)) {
        try {
            const content = fs.readFileSync(readmePath, 'utf8');
            const fromReadme = extractDescription(content);
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
            const pkg  = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            info.hasNpm = true;
            const all: Record<string, string> = pkg.scripts ?? {};
            const prominent = PROMINENT_SCRIPTS.filter(s => all[s]);
            const others    = Object.keys(all).filter(s => !PROMINENT_SCRIPTS.includes(s)).slice(0, 3);
            [...prominent, ...others].forEach(s => { info.scripts[s] = all[s]; });
        } catch { /* ignore */ }
    }

    try {
        if (fs.readdirSync(entry.path).some(e => /\.sln[x]?$/i.test(e))) { info.hasDotnet = true; }
    } catch { /* ignore */ }

    return info;
}

/** Detects if a project has real (non-placeholder) tests. */
function detectTestStatus(rootPath: string, hasNpm: boolean): { hasTests: boolean; hasReal: boolean; specCount: number } {
    const testsDir = path.join(rootPath, 'tests');
    if (!fs.existsSync(testsDir)) { return { hasTests: false, hasReal: false, specCount: 0 }; }
    let specCount = 0;
    let realCount = 0;
    try {
        const specFiles = fs.readdirSync(testsDir).filter(f => /\.spec\.(ts|js)$/.test(f));
        specCount = specFiles.length;
        for (const f of specFiles) {
            try {
                const content = fs.readFileSync(path.join(testsDir, f), 'utf8');
                const isPlaceholder = content.includes('placeholder test') && !content.match(/\btest\s*\(/);
                if (!isPlaceholder && content.match(/\btest\s*\(/)) { realCount++; }
            } catch { /* skip */ }
        }
    } catch { /* ignore */ }
    return { hasTests: specCount > 0, hasReal: realCount > 0, specCount };
}

export function buildProjectsSectionHtml(projects: ProjectInfo[]): string {
    const cards = projects.map(p => {
        const icon       = TYPE_ICON[p.type] ?? '📂';
        const scriptKeys = Object.keys(p.scripts);

        // Test status — detect before building buttons
        const testStatus = detectTestStatus(p.rootPath, p.hasNpm);

        const scriptBtns = scriptKeys.map(s => {
            const isPrimary = s === 'start' || s === 'rebuild';
            // test button gets special treatment
            if (s === 'test') {
                if (!testStatus.hasTests || !testStatus.hasReal) {
                    // No real tests — show create button instead
                    return `<button class="btn-open btn-no-tests" data-action="create-tests" data-proj-path="${esc(p.rootPath)}" data-proj-name="${esc(p.name)}" title="No real tests found — click to generate tests using unit test rules">🧪 Create Tests</button>`;
                }
                // Real tests exist — show normal test button with count badge
                const badge = testStatus.specCount > 0 ? ` (${testStatus.specCount})` : '';
                return `<button class="btn-open" data-action="run" data-proj-path="${esc(p.rootPath)}" data-script="test">🧪 test${badge}</button>`;
            }
            return `<button class="${isPrimary ? 'btn-view' : 'btn-open'}" data-action="run" data-proj-path="${esc(p.rootPath)}" data-script="${esc(s)}">${esc(s)}</button>`;
        }).join('');

        // If no test script in package.json, show create tests button anyway
        const hasTestScript = scriptKeys.includes('test');
        const noTestsBtn = !hasTestScript && p.hasNpm
            ? `<button class="btn-open btn-no-tests" data-action="create-tests" data-proj-path="${esc(p.rootPath)}" data-proj-name="${esc(p.name)}" title="No test script found — click to generate tests">🧪 Create Tests</button>`
            : '';

        const dotnetBtn = p.hasDotnet && !p.hasNpm
            ? `<button class="btn-view" data-action="run" data-proj-path="${esc(p.rootPath)}" data-script="dotnet:build">build</button>` : '';

        const claudePath   = path.join(p.rootPath, 'CLAUDE.md');
        const claudeExists = fs.existsSync(claudePath);
        const claudeBtn    = claudeExists
            ? `<button class="btn-open" data-action="open-claude" data-proj-path="${esc(p.rootPath)}">📄 CLAUDE.md</button>`
            : `<button class="btn-open btn-create-claude" data-action="create-claude" data-proj-path="${esc(p.rootPath)}" title="No CLAUDE.md found — click to create one">➕ Create CLAUDE.md</button>`;

        return `<article class="card proj-card" data-project="${esc(p.name)}" data-category="🗂️ Projects" data-tags="${esc(p.type)}">
  <div class="card-title" style="font-size:1.05em;font-weight:800;margin-bottom:2px">${esc(p.name)}</div>
  <div class="card-header"><span class="card-project">${icon} ${esc(p.type.toUpperCase())}</span></div>
  <div class="card-desc">${esc(p.description)}</div>
  <div class="card-path" title="${esc(p.rootPath)}">${esc(p.rootPath)}</div>
  <div style="display:flex;flex-direction:column;gap:6px;margin-top:8px">
    <div class="card-btns" style="flex-wrap:wrap;gap:4px">${scriptBtns}${noTestsBtn}${dotnetBtn}</div>
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
