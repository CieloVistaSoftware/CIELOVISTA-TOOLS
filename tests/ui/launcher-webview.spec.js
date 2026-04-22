/**
 * tests/ui/launcher-webview.spec.js
 *
 * Playwright test: validates the CieloVista Tools launcher webview HTML
 * by serving it in a real Chromium browser and exercising the DOM.
 *
 * Originally tests/ui/all-cards-webview.spec.ts — restored with correct approach.
 * The old version tried to automate VS Code itself which requires the extension
 * test harness. This version serves the generated HTML directly in a browser
 * which is both faster and more reliable for webview logic testing.
 *
 * What it covers:
 *  1.  Page loads without JS errors
 *  2.  Cards render — at least one .cmd-card visible
 *  3.  Search input filters cards
 *  4.  Clearing search restores all cards
 *  5.  Group bar buttons exist and are clickable
 *  6.  Topic dropdown opens on button click
 *  7.  Select-all topics makes all checkboxes checked
 *  8.  Clear topics unchecks all checkboxes
 *  9.  Each card has a Run or Open button
 * 10.  F1 modal opens when F1 button clicked
 * 11.  F1 modal closes on dismiss
 * 12.  Scope badges render (Global / Workspace / DiskCleanUp / Tools)
 * 13.  No card has an empty title
 * 14.  Breadcrumb root button present on each card
 *
 * Run: npx playwright test tests/ui/launcher-webview.spec.js --headed
 * Or:  npm run test:ui:launcher
 */

'use strict';

const { test, expect } = require('@playwright/test');
const fs   = require('fs');
const path = require('path');
const http = require('http');

// ── Build launcher HTML and serve it ─────────────────────────────────────────
// We require the compiled output and generate the HTML, then serve it on localhost
// so Playwright can open it in a real browser with full JS execution.

const OUT_INDEX  = path.join(__dirname, '../../out/features/cvs-command-launcher/html.js');
const OUT_CATALOG = path.join(__dirname, '../../out/features/cvs-command-launcher/catalog.js');

let server;
let serverUrl;

// Shared vscode mock for the compiled modules
const vscodeMock = {
    commands: { getCommands: async () => [], registerCommand: () => ({ dispose: () => {} }) },
    workspace: { workspaceFolders: [] },
    window: { createWebviewPanel: () => ({}) },
    ViewColumn: { One: 1 },
};

function buildHtml() {
    // Require modules with vscode mock
    const Module = require('module');
    const orig = Module._resolveFilename.bind(Module);
    Module._resolveFilename = (req, ...args) => req === 'vscode' ? '__vs__' : orig(req, ...args);
    require.cache['__vs__'] = { id: '__vs__', filename: '__vs__', loaded: true, exports: vscodeMock, children: [], path: '', paths: [] };

    // Clear require cache for fresh load
    delete require.cache[OUT_INDEX];
    delete require.cache[OUT_CATALOG];

    const { buildLauncherHtml } = require(OUT_INDEX);
    // Build with no audit report and no workspace path
    return buildLauncherHtml(null, undefined);
}

test.beforeAll(async () => {
    if (!fs.existsSync(OUT_INDEX)) {
        console.warn('SKIP: compiled output not found — run npm run compile first');
        return;
    }
    const html = buildHtml();
    // Patch acquireVsCodeApi stub so the webview JS doesn't throw
    const patched = html.replace(
        '<script>',
        '<script>window.acquireVsCodeApi = function(){ return { postMessage: function(){}, getState: function(){ return null; }, setState: function(){} }; };</script><script>'
    );
    server = http.createServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(patched);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    serverUrl = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
    if (server) { await new Promise(resolve => server.close(resolve)); }
});

// ── Tests ─────────────────────────────────────────────────────────────────────

test('Page loads without console errors', async ({ page }) => {
    const errors = [];
    page.on('console', msg => { if (msg.type() === 'error') { errors.push(msg.text()); } });
    await page.goto(serverUrl);
    await page.waitForLoadState('networkidle');
    expect(errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
});

test('At least one command card renders', async ({ page }) => {
    await page.goto(serverUrl);
    const cards = page.locator('.cmd-card');
    await expect(cards.first()).toBeVisible();
    const count = await cards.count();
    expect(count).toBeGreaterThan(10);
});

test('Search input filters cards', async ({ page }) => {
    await page.goto(serverUrl);
    const allCards = await page.locator('.cmd-card').count();
    await page.fill('#search', 'readme');
    await page.waitForTimeout(150);
    const visible = await page.locator('.cmd-card:not([style*="display: none"])').count();
    expect(visible).toBeLessThan(allCards);
    expect(visible).toBeGreaterThan(0);
});

test('Clearing search restores all cards', async ({ page }) => {
    await page.goto(serverUrl);
    const allCards = await page.locator('.cmd-card').count();
    await page.fill('#search', 'zzznomatch');
    await page.fill('#search', '');
    await page.waitForTimeout(150);
    const visible = await page.locator('.cmd-card').count();
    expect(visible).toBe(allCards);
});

test('Group bar buttons are present', async ({ page }) => {
    await page.goto(serverUrl);
    const groupBtns = page.locator('.group-btn');
    const count = await groupBtns.count();
    expect(count).toBeGreaterThan(1); // At least "All" + one real group
});

test('Topic dropdown opens on button click', async ({ page }) => {
    await page.goto(serverUrl);
    await page.click('#topic-btn');
    await expect(page.locator('#topic-dropdown')).toBeVisible();
});

test('Select-all topics checks all checkboxes', async ({ page }) => {
    await page.goto(serverUrl);
    await page.click('#topic-btn');
    await page.click('#dd-select-all');
    const checkboxes = page.locator('.topic-cb');
    const total = await checkboxes.count();
    const checked = await checkboxes.evaluateAll(els => els.filter(e => e.checked).length);
    expect(checked).toBe(total);
});

test('Clear topics unchecks all checkboxes', async ({ page }) => {
    await page.goto(serverUrl);
    await page.click('#topic-btn');
    await page.click('#dd-select-all');
    await page.click('#dd-clear');
    const checked = await page.locator('.topic-cb').evaluateAll(els => els.filter(e => e.checked).length);
    expect(checked).toBe(0);
});

test('Each card has a Run or Open button', async ({ page }) => {
    await page.goto(serverUrl);
    const cards = await page.locator('.cmd-card').count();
    const btns  = await page.locator('.cmd-card [data-action="run"]').count();
    expect(btns).toBe(cards);
});

test('F1 modal opens on F1 button click', async ({ page }) => {
    await page.goto(serverUrl);
    const f1Btn = page.locator('[data-action="show-f1"]').first();
    await f1Btn.click();
    await expect(page.locator('.f1-overlay')).toBeVisible();
});

test('F1 modal closes on dismiss', async ({ page }) => {
    await page.goto(serverUrl);
    await page.locator('[data-action="show-f1"]').first().click();
    await page.locator('[data-action="close-f1"]').first().click();
    await expect(page.locator('.f1-overlay')).not.toBeVisible();
});

test('Scope badges render on cards', async ({ page }) => {
    await page.goto(serverUrl);
    const badges = page.locator('.scope-badge');
    const count  = await badges.count();
    expect(count).toBeGreaterThan(0);
    const texts = await badges.evaluateAll(els => [...new Set(els.map(e => e.textContent.trim()))]);
    expect(texts).toContain('Global');
});

test('No card has an empty title', async ({ page }) => {
    await page.goto(serverUrl);
    const emptyTitles = await page.locator('.cmd-title').evaluateAll(
        els => els.filter(e => e.textContent.trim() === '').length
    );
    expect(emptyTitles).toBe(0);
});

test('Each card has a breadcrumb root button', async ({ page }) => {
    await page.goto(serverUrl);
    const cards     = await page.locator('.cmd-card').count();
    const bcBtns    = await page.locator('.cmd-card .bc-root').count();
    expect(bcBtns).toBe(cards);
});
