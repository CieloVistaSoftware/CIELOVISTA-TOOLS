/**
 * tests/ui/all-cards-webview.spec.ts
 *
 * Playwright test for the Doc Catalog webview.
 * Serves catalog.html directly in a real Chromium browser (same approach
 * as launcher-webview.spec.js) and injects sample card HTML via a simulated
 * 'init' postMessage so all UI logic can be exercised without VS Code.
 *
 * What it covers:
 *  1.  Shell loads without JS errors
 *  2.  Toolbar buttons are present (Reset, Newest, Rebuild)
 *  3.  After init message, cards render
 *  4.  Each card has action buttons (Preview/Edit/Folder)
 *  5.  Sort by Newest button toggles sorted view
 *  6.  Project filter dropdown populates from cards
 *  7.  Stat bar shows card count
 *
 * Run: npx playwright test tests/ui/all-cards-webview.spec.ts --headed
 * Or:  npm run test:ui:cards
 */
'use strict';

import { test, expect } from '@playwright/test';
import * as fs   from 'fs';
import * as path from 'path';
import * as http from 'http';

const CATALOG_HTML = path.join(__dirname, '../../src/features/doc-catalog/catalog.html');

function makeTestCards(): string {
    const cards = [
        { id: 'c1', project: 'ProjectA', cat: '100 — Core',  modified: '2026-05-20', title: 'Alpha Doc', desc: 'First doc' },
        { id: 'c2', project: 'ProjectA', cat: '100 — Core',  modified: '2026-04-10', title: 'Beta Doc',  desc: 'Second doc' },
        { id: 'c3', project: 'ProjectB', cat: '200 — Utils', modified: '2026-05-19', title: 'Gamma Doc', desc: 'Third doc' },
    ];
    const sections = new Map<string, typeof cards>();
    for (const c of cards) {
        if (!sections.has(c.cat)) { sections.set(c.cat, []); }
        sections.get(c.cat)!.push(c);
    }
    let html = '';
    for (const [cat, items] of sections) {
        const cardHtml = items.map(c => `
<article class="card"
  data-id="${c.id}" data-project="${c.project}" data-category="${cat}"
  data-section="root" data-tags="" data-modified="${c.modified}">
  <div class="card-header">
    <span class="card-project card-project-link" data-action="open-project-folder"
      data-proj-path="/fake/${c.project}">${c.project}</span>
    <button class="btn-vscode-proj" data-action="open-project-vscode"
      data-proj-path="/fake/${c.project}">📋</button>
    <span class="card-date">${c.modified}</span>
  </div>
  <div class="card-title" data-action="open-preview" data-path="/fake/${c.id}.md">${c.title}</div>
  <div class="card-desc">${c.desc}</div>
  <div class="card-path">${c.id}.md</div>
  <div class="card-tags"></div>
  <div class="card-footer">
    <span class="card-size">1.0 KB</span>
    <div class="card-btns">
      <button class="btn-view" data-action="open-preview" data-path="/fake/${c.id}.md">📄 Preview</button>
      <button class="btn-open" data-action="open"         data-path="/fake/${c.id}.md">✏ Edit</button>
      <button class="btn-open" data-action="open-folder"  data-path="/fake/${c.project}">📂 Folder</button>
    </div>
  </div>
</article>`).join('');
        html += `<section class="cat-section" data-category="${cat}">
  <h2 class="cat-heading"><span class="cat-dewey">100</span> ${cat}
    <span class="cat-count">${items.length}</span></h2>
  <div class="card-grid">${cardHtml}</div>
</section>`;
    }
    return html;
}

let server: http.Server;
let serverUrl: string;

test.beforeAll(async () => {
    if (!fs.existsSync(CATALOG_HTML)) {
        console.warn('SKIP: catalog.html not found');
        return;
    }
    let html = fs.readFileSync(CATALOG_HTML, 'utf8');
    const cardHtml = makeTestCards();
    const stub = `<script>
window.acquireVsCodeApi = function(){
  return { postMessage: function(){}, getState: function(){ return null; }, setState: function(){} };
};
window.addEventListener('load', function() {
  window.dispatchEvent(new MessageEvent('message', { data: {
    command: 'init',
    html: ${JSON.stringify(cardHtml)},
    totalCards: 3,
    totalCats: 2,
    totalProjects: 2,
    currentProject: '',
    builtAt: '2026-05-20T00:00:00Z'
  }}));
});
</script>`;
    html = html.replace('<script>', stub + '<script>');
    server = http.createServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    serverUrl = `http://127.0.0.1:${(server.address() as any).port}`;
});

test.afterAll(async () => {
    if (server) { await new Promise<void>(resolve => server.close(resolve)); }
});

test('Shell loads without JS errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') { errors.push(msg.text()); } });
    await page.goto(serverUrl);
    await page.waitForLoadState('networkidle');
    expect(errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
});

test('Toolbar buttons are present', async ({ page }) => {
    await page.goto(serverUrl);
    await expect(page.locator('#btn-reset')).toBeVisible();
    await expect(page.locator('#btn-sort-newest')).toBeVisible();
    await expect(page.locator('#btn-rebuild-catalog')).toBeVisible();
});

test('Cards render after init message', async ({ page }) => {
    await page.goto(serverUrl);
    await page.waitForSelector('.card', { timeout: 3000 });
    const count = await page.locator('.card').count();
    expect(count).toBe(3);
});

test('Each card has Preview, Edit, and Folder buttons', async ({ page }) => {
    await page.goto(serverUrl);
    await page.waitForSelector('.card');
    expect(await page.locator('.btn-view').count()).toBe(3);
    expect(await page.locator('.btn-open[data-action="open"]').count()).toBe(3);
    expect(await page.locator('.btn-open[data-action="open-folder"]').count()).toBe(3);
});

test('Sort by Newest button shows sorted view', async ({ page }) => {
    await page.goto(serverUrl);
    await page.waitForSelector('.card');
    await page.click('#btn-sort-newest');
    await expect(page.locator('#sorted-view')).toBeVisible();
    await page.click('#btn-sort-newest');
    await expect(page.locator('#sorted-view')).toHaveCount(0);
});

test('Project filter dropdown populates from card data', async ({ page }) => {
    await page.goto(serverUrl);
    await page.waitForSelector('.card');
    const opts = await page.locator('#proj-filter option').count();
    expect(opts).toBeGreaterThan(1);
});

test('Stat bar shows card count', async ({ page }) => {
    await page.goto(serverUrl);
    await page.waitForSelector('.card');
    const statText = await page.locator('#stat-bar').textContent();
    expect(statText).toContain('3');
});
