/**
 * doc-catalog.test.js — Comprehensive test suite for the doc-catalog feature.
 *
 * Covers all split modules:
 *   src/features/doc-catalog/html.ts       — buildCatalogHtml
 *   src/features/doc-catalog/projects.ts   — buildProjectsSectionHtml, loadProjectInfo
 *   src/features/doc-catalog/commands.ts   — attachMessageHandler, run/open/folder/claude
 *   src/features/doc-catalog/scanner.ts    — scanForCards
 *   src/features/doc-catalog/content.ts    — esc, extractDescription
 *   src/features/doc-catalog/types.ts      — interfaces
 *
 * Tests:
 *  ── Doc card HTML (html.ts) ──
 *   1.  Doc card: open-preview button present with data-path
 *   2.  Doc card: open button present with data-path
 *   3.  Doc card: open-folder button present with data-proj-path
 *   4.  Doc card: Dewey decimal badge (.card-dewey) present
 *   5.  Doc card: card-filename element present
 *   6.  Doc card: data-id, data-project, data-category attributes on <article>
 *   7.  No embedded CARDS JSON (was causing </script> injection)
 *   8.  No </script> injection vulnerability
 *  ── Project card HTML (projects.ts) ──
 *   9.  Project card: run buttons have data-action="run" and data-script
 *  10.  Project card: open-folder button present
 *  11.  Project card: open-claude button when CLAUDE.md exists
 *  12.  Project card: create-claude button with btn-create-claude class when no CLAUDE.md
 *  13.  Project card: dotnet build button when hasDotnet && !hasNpm
 *  14.  PROMINENT_SCRIPTS includes build, test, start, rebuild, watch
 *  15.  run data-proj-path attribute set on script buttons
 *  ── JS click handler (html.ts inline script) ──
 *  16.  open-preview sends { command: 'preview' }
 *  17.  open sends { command: 'open' }
 *  18.  run sends { command: 'run', projPath, script }
 *  19.  open-folder sends { command: 'openFolder' }
 *  20.  open-claude sends { command: 'openClaude' }
 *  21.  create-claude sends { command: 'createClaude' }
 *  ── TS message handler (commands.ts) ──
 *  22.  preview case calls markdown.showPreview
 *  23.  open case calls openTextDocument + showTextDocument
 *  24.  run case creates terminal and calls sendText
 *  25.  run handles dotnet:build separately from npm
 *  26.  openFolder case uses forceNewWindow: false (not true)
 *  27.  openClaude case opens CLAUDE.md beside current tab
 *  28.  createClaude case writes file, then opens it
 *  29.  createClaude reads package.json scripts into the template
 *  30.  createClaude clears _cachedCards after creating
 *  ── Filter & search (html.ts script) ──
 *  31.  applyFilters function present
 *  32.  resetFilters function present
 *  33.  Project filter select uses data-project attribute
 *  34.  Category filter select uses data-category attribute
 *  ── Security & quality ──
 *  35.  Script wrapped in IIFE with use strict
 *  36.  No inline viewer overlay (old #viewer element removed)
 *  37.  esc() helper escapes HTML special characters
 *  ── Scanner (scanner.ts) ──
 *  38.  scanForCards returns array
 *  39.  Cards sorted by categoryNum in buildCatalogHtml
 *  ── Content (content.ts) ──
 *  40.  extractDescription strips markdown headings
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..', 'src', 'features', 'doc-catalog');

// ─── Load all split module sources ───────────────────────────────────────────

function load(file) {
    const p = path.join(BASE, file);
    if (!fs.existsSync(p)) {
        console.error(`FATAL: ${file} not found at ${p}`);
        process.exit(1);
    }
    return fs.readFileSync(p, 'utf8');
}

const htmlSrc     = load('html.ts');
const projectsSrc = load('projects.ts');
const commandsSrc = load('commands.ts');
const scannerSrc  = load('scanner.ts');
const contentSrc  = load('content.ts');
const typesSrc    = load('types.ts');

// ─── Helpers ─────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log('  PASS:', name);
        passed++;
    } catch (e) {
        console.error('  FAIL:', name, '-', e.message);
        failed++;
    }
}

function has(src, needle, msg) {
    if (!src.includes(needle)) { throw new Error(msg || `Expected to find: ${JSON.stringify(needle)}`); }
}

function hasNot(src, needle, msg) {
    if (src.includes(needle)) { throw new Error(msg || `Must NOT contain: ${JSON.stringify(needle)}`); }
}

function hasMatch(src, re, msg) {
    if (!re.test(src)) { throw new Error(msg || `Expected match for: ${re}`); }
}

console.log('\nRunning Doc Catalog Tests...\n');

// ═══════════════════════════════════════════════════════════════════════════
// ── DOC CARD HTML  (html.ts)
// ═══════════════════════════════════════════════════════════════════════════

console.log('── Doc card HTML (html.ts) ─────────────────────────────────');

// 1
test('Doc card: open-preview button has data-action and data-path', () => {
    has(htmlSrc, 'data-action="open-preview"', 'View button must use data-action="open-preview"');
    has(htmlSrc, 'data-path="${esc(card.filePath)}"', 'View button must use card.filePath as data-path');
});

// 2
test('Doc card: open button has data-action="open" and data-path', () => {
    has(htmlSrc, 'data-action="open"', 'Open button must have data-action="open"');
    hasMatch(htmlSrc, /data-action="open"[^>]*data-path|data-path[^>]*data-action="open"/,
        'Open button must have both data-action="open" and data-path');
});

// 3
test('Doc card: folder button has data-action="open-folder" and data-proj-path', () => {
    has(htmlSrc, 'data-action="open-folder"', 'Folder button must have data-action="open-folder"');
    has(htmlSrc, 'data-proj-path="${esc(card.projectPath)}"',
        'Folder button must use card.projectPath as data-proj-path');
});

// 4
test('Doc card: .card-dewey badge present and uses categoryNum', () => {
    has(htmlSrc, 'card-dewey', 'Cards must have .card-dewey element');
    has(htmlSrc, 'categoryNum', 'Dewey badge must derive value from card.categoryNum');
    has(htmlSrc, 'padStart(3', 'Dewey number should be zero-padded to 3 digits');
});

// 5
test('Doc card: card-filename element present and shows fileName', () => {
    has(htmlSrc, 'card-filename', '.card-filename element must be present');
    has(htmlSrc, 'card.fileName', 'card-filename must use card.fileName');
});

// 6
test('Doc card: <article> has data-id, data-project, data-category attributes', () => {
    has(htmlSrc, 'data-id="${card.id}"', '<article> must have data-id');
    has(htmlSrc, 'data-project="${esc(card.projectName)}"', '<article> must have data-project');
    has(htmlSrc, 'data-category="${esc(card.category)}"', '<article> must have data-category');
});

// 7
test('No embedded CARDS JSON in page (was causing </script> injection)', () => {
    hasNot(htmlSrc, 'const CARDS = ${cardDataJson}',
        'CARDS JSON must not be embedded in script tag — causes </script> injection');
    hasNot(htmlSrc, 'const cardDataJson = JSON.stringify',
        'cardDataJson pattern must not exist');
});

// 8
test('No </script> injection vulnerability via file content embedding', () => {
    hasNot(htmlSrc, 'mdToHtml(content)',
        'mdToHtml output must not be embedded in a script tag — injection risk');
    // Verify file content is not placed inside a <script> block
    const scriptIdx   = htmlSrc.indexOf('<script>');
    const scriptEnd   = htmlSrc.indexOf('</script>', scriptIdx);
    const scriptBlock = scriptIdx !== -1 ? htmlSrc.slice(scriptIdx, scriptEnd) : '';
    hasNot(scriptBlock, 'card.content',
        'Raw card content must not appear inside the <script> block');
});

// ═══════════════════════════════════════════════════════════════════════════
// ── PROJECT CARD HTML  (projects.ts)
// ═══════════════════════════════════════════════════════════════════════════

console.log('── Project card HTML (projects.ts) ─────────────────────────');

// 9
test('Project card: run buttons have data-action="run" and data-script', () => {
    has(projectsSrc, 'data-action="run"', 'Script buttons must have data-action="run"');
    has(projectsSrc, 'data-script="${esc(s)}"', 'Script buttons must have data-script attribute');
});

// 10
test('Project card: open-folder button present', () => {
    has(projectsSrc, 'data-action="open-folder"', 'Project card must have open-folder button');
    has(projectsSrc, 'Open Folder', 'Open Folder label must be present');
});

// 11
test('Project card: open-claude button when CLAUDE.md exists', () => {
    has(projectsSrc, "data-action=\"open-claude\"",
        'open-claude action required when CLAUDE.md is found');
    has(projectsSrc, "claudeExists",
        'Must check claudeExists to decide which button to show');
    has(projectsSrc, 'CLAUDE.md',
        'CLAUDE.md filename must be referenced in the check');
});

// 12
test('Project card: create-claude button with btn-create-claude class when no CLAUDE.md', () => {
    has(projectsSrc, 'data-action="create-claude"',
        'create-claude action required when CLAUDE.md is missing');
    has(projectsSrc, 'btn-create-claude',
        'Create CLAUDE.md button must have btn-create-claude class for dashed styling');
    has(projectsSrc, 'No CLAUDE.md found',
        'Create button title must explain why it appears');
});

// 13
test('Project card: dotnet build button when hasDotnet && !hasNpm', () => {
    has(projectsSrc, 'hasDotnet && !p.hasNpm',
        'Dotnet build button must only appear when hasDotnet is true and hasNpm is false');
    has(projectsSrc, "data-script=\"dotnet:build\"",
        'Dotnet button must use dotnet:build as the script value');
});

// 14
test('PROMINENT_SCRIPTS includes build, test, start, rebuild, watch', () => {
    const match = projectsSrc.match(/PROMINENT_SCRIPTS\s*=\s*\[([^\]]+)\]/);
    if (!match) { throw new Error('PROMINENT_SCRIPTS array not found'); }
    const arr = match[1];
    for (const s of ['build', 'test', 'start', 'rebuild', 'watch']) {
        if (!arr.includes(`'${s}'`)) {
            throw new Error(`PROMINENT_SCRIPTS must include '${s}'`);
        }
    }
});

// 15
test('Run buttons carry data-proj-path attribute', () => {
    has(projectsSrc, 'data-proj-path="${esc(p.rootPath)}"',
        'Script run buttons must include data-proj-path for the project root');
});

// ═══════════════════════════════════════════════════════════════════════════
// ── JS CLICK HANDLER  (html.ts inline script)
// ═══════════════════════════════════════════════════════════════════════════

console.log('── JS click handler (html.ts) ──────────────────────────────');

// 16
test("open-preview sends { command: 'preview', data: path }", () => {
    has(htmlSrc, "a === 'open-preview'", "Handler must check for 'open-preview' action");
    has(htmlSrc, "command: 'preview'",   "Handler must send command:'preview'");
    has(htmlSrc, 'data: btn.dataset.path', 'Handler must send the path as data');
});

// 17
test("open sends { command: 'open', data: path }", () => {
    has(htmlSrc, "a === 'open'",        "Handler must check for 'open' action");
    has(htmlSrc, "command: 'open'",     "Handler must send command:'open'");
});

// 18
test("run sends { command: 'run', projPath, script }", () => {
    has(htmlSrc, "a === 'run'",         "Handler must check for 'run' action");
    has(htmlSrc, "command: 'run'",      "Handler must send command:'run'");
    has(htmlSrc, 'projPath: btn.dataset.projPath', 'Handler must forward projPath');
    has(htmlSrc, 'script: btn.dataset.script',     'Handler must forward script name');
});

// 19
test("open-folder sends { command: 'openFolder', data: projPath }", () => {
    has(htmlSrc, "a === 'open-folder'",     "Handler must check for 'open-folder' action");
    has(htmlSrc, "command: 'openFolder'",   "Handler must send command:'openFolder'");
    has(htmlSrc, 'data: btn.dataset.projPath', 'Handler must send projPath as data for openFolder');
});

// 20
test("open-claude sends { command: 'openClaude', data: projPath }", () => {
    has(htmlSrc, "a === 'open-claude'",     "Handler must check for 'open-claude' action");
    has(htmlSrc, "command: 'openClaude'",   "Handler must send command:'openClaude'");
});

// 21
test("create-claude sends { command: 'createClaude', data: projPath }", () => {
    has(htmlSrc, "a === 'create-claude'",   "Handler must check for 'create-claude' action");
    has(htmlSrc, "command: 'createClaude'", "Handler must send command:'createClaude'");
});

// ═══════════════════════════════════════════════════════════════════════════
// ── TS MESSAGE HANDLER  (commands.ts)
// ═══════════════════════════════════════════════════════════════════════════

console.log('── TS message handler (commands.ts) ────────────────────────');

// 22
test("preview case calls markdown.showPreview", () => {
    const previewIdx = commandsSrc.indexOf("case 'preview'");
    if (previewIdx === -1) { throw new Error("case 'preview' not found in commands.ts"); }
    const block = commandsSrc.slice(previewIdx, previewIdx + 300);
    has(block, 'markdown.showPreview', "preview case must call vscode markdown.showPreview");
});

// 23
test("open case calls openTextDocument + showTextDocument Beside", () => {
    const openIdx = commandsSrc.indexOf("case 'open':");
    if (openIdx === -1) { throw new Error("case 'open' not found in commands.ts"); }
    const block = commandsSrc.slice(openIdx, openIdx + 300);
    has(block, 'openTextDocument',  "open case must call openTextDocument");
    has(block, 'showTextDocument',  "open case must call showTextDocument");
    has(block, 'ViewColumn.Beside', "open case must open beside current tab");
});

// 24
test("run case creates terminal and calls sendText", () => {
    const runIdx = commandsSrc.indexOf("case 'run':");
    if (runIdx === -1) { throw new Error("case 'run' not found in commands.ts"); }
    const block = commandsSrc.slice(runIdx, runIdx + 400);
    has(block, 'createTerminal', "run case must create a terminal");
    has(block, 'sendText',       "run case must call terminal.sendText");
    has(block, 'terminal.show()', "run case must show the terminal");
});

// 25
test("run case handles dotnet:build separately from npm", () => {
    const runIdx = commandsSrc.indexOf("case 'run':");
    if (runIdx === -1) { throw new Error("case 'run' not found in commands.ts"); }
    // Block may be larger — search the whole run section up to next case or end of switch
    const nextCase = commandsSrc.indexOf('\n            case ', runIdx + 1);
    const block = commandsSrc.slice(runIdx, nextCase === -1 ? runIdx + 600 : nextCase);
    has(block, "dotnet:build",    "run case must check for dotnet:build script");
    has(block, "dotnet build",    "run case must run 'dotnet build' (not npm run dotnet:build)");
    has(block, "npm run",         "run case must run npm scripts normally");
});

// 26
test("openFolder case uses forceNewWindow: false (not true)", () => {
    const folderIdx = commandsSrc.indexOf("case 'openFolder'");
    if (folderIdx === -1) { throw new Error("case 'openFolder' not found in commands.ts"); }
    const block = commandsSrc.slice(folderIdx, folderIdx + 300);
    has(block,    'forceNewWindow: false', "openFolder must use forceNewWindow: false");
    hasNot(block, 'forceNewWindow: true',  "openFolder must NOT use forceNewWindow: true — kills extension host");
});

// 27
test("openClaude case opens CLAUDE.md beside current tab", () => {
    const claudeIdx = commandsSrc.indexOf("case 'openClaude'");
    if (claudeIdx === -1) { throw new Error("case 'openClaude' not found in commands.ts"); }
    const block = commandsSrc.slice(claudeIdx, claudeIdx + 350);
    has(block, 'CLAUDE.md',          "openClaude must reference CLAUDE.md filename");
    has(block, 'openTextDocument',   "openClaude must open the document");
    has(block, 'showTextDocument',   "openClaude must display the document");
    has(block, 'ViewColumn.Beside',  "openClaude must open beside the current tab");
});

// 28
test("createClaude case writes file then opens it", () => {
    const createIdx = commandsSrc.indexOf("case 'createClaude'");
    if (createIdx === -1) { throw new Error("case 'createClaude' not found in commands.ts"); }
    // Use a large window — createClaude is the last case and can be long
    const block = commandsSrc.slice(createIdx);
    has(block, 'writeFileSync',    "createClaude must write the CLAUDE.md file");
    has(block, 'openTextDocument', "createClaude must open the new file");
    has(block, 'showTextDocument', "createClaude must display the new file");
});

// 29
test("createClaude reads package.json scripts into the template", () => {
    const createIdx = commandsSrc.indexOf("case 'createClaude'");
    if (createIdx === -1) { throw new Error("case 'createClaude' not found in commands.ts"); }
    const block = commandsSrc.slice(createIdx);
    has(block, 'package.json',     "createClaude must read package.json");
    has(block, 'pkg.scripts',      "createClaude must read scripts from package.json");
    has(block, 'npm run',          "createClaude template must include npm run script lines");
});

// 30
test("createClaude clears _cachedCards after creating", () => {
    const createIdx = commandsSrc.indexOf("case 'createClaude'");
    if (createIdx === -1) { throw new Error("case 'createClaude' not found in commands.ts"); }
    const block = commandsSrc.slice(createIdx);
    // Variable is named _cachedCards and set to undefined
    has(block, '_cachedCards = undefined', "createClaude must clear cached cards so catalog refreshes");
});

// ═══════════════════════════════════════════════════════════════════════════
// ── FILTER & SEARCH  (html.ts script)
// ═══════════════════════════════════════════════════════════════════════════

console.log('── Filter & search (html.ts) ───────────────────────────────');

// 31
test("applyFilters function defined and exported to window", () => {
    has(htmlSrc, 'function applyFilters()',        "applyFilters() function must be defined");
    has(htmlSrc, 'window.applyFilters = applyFilters', "applyFilters must be exposed on window");
});

// 32
test("resetFilters function defined and exported to window", () => {
    has(htmlSrc, 'function resetFilters()',         "resetFilters() function must be defined");
    has(htmlSrc, 'window.resetFilters = resetFilters', "resetFilters must be exposed on window");
});

// 33
test("Project filter reads card.dataset.project", () => {
    has(htmlSrc, "card.dataset.project === proj",
        "Project filter must compare against card.dataset.project");
});

// 34
test("Category filter reads card.dataset.category", () => {
    has(htmlSrc, "card.dataset.category === cat",
        "Category filter must compare against card.dataset.category");
});

// ═══════════════════════════════════════════════════════════════════════════
// ── SECURITY & QUALITY
// ═══════════════════════════════════════════════════════════════════════════

console.log('── Security & quality ──────────────────────────────────────');

// 35
test("Script wrapped in IIFE with 'use strict'", () => {
    has(htmlSrc, '(function(){',   "Webview script must be wrapped in an IIFE");
    has(htmlSrc, "'use strict';",  "Webview script must use strict mode");
});

// 36
test("No old inline viewer overlay (#viewer removed)", () => {
    hasNot(htmlSrc, 'id="viewer"',         "#viewer overlay must be removed");
    hasNot(htmlSrc, 'id="viewer-content"', "#viewer-content must be removed");
    hasNot(projectsSrc, 'id="viewer"',     "#viewer must not exist in project cards either");
});

// 37
test("esc() function escapes HTML special characters", () => {
    has(contentSrc, "replace(/&/g",  "esc() must escape & characters");
    has(contentSrc, "replace(/</g",  "esc() must escape < characters");
    has(contentSrc, "replace(/>/g",  "esc() must escape > characters");
    has(contentSrc, "replace(/\"/g", 'esc() must escape " characters');
});

// ═══════════════════════════════════════════════════════════════════════════
// ── SCANNER  (scanner.ts)
// ═══════════════════════════════════════════════════════════════════════════

console.log('── Scanner (scanner.ts) ────────────────────────────────────');

// 38
test("scanForCards function exported and returns cards array", () => {
    has(scannerSrc, 'export function scanForCards', "scanForCards must be exported");
    has(scannerSrc, 'CatalogCard[]',               "scanForCards must return CatalogCard[]");
    has(scannerSrc, '.push(',                      "scanForCards must push cards into results");
});

// 39
test("buildCatalogHtml sorts cards by categoryNum before rendering", () => {
    has(htmlSrc, 'categoryNum', "buildCatalogHtml must reference categoryNum");
    has(htmlSrc, '.sort(',      "Cards or categories must be sorted");
    // The sort is on sortedCategories using the first card's categoryNum
    has(htmlSrc, 'categoryNum ?? 0',
        "Sort must compare categoryNum with nullish fallback");
});

// ═══════════════════════════════════════════════════════════════════════════
// ── CONTENT  (content.ts)
// ═══════════════════════════════════════════════════════════════════════════

console.log('── Content (content.ts) ────────────────────────────────────');

// 40
test("extractDescription strips markdown headings and returns plain text", () => {
    has(contentSrc, 'extractDescription',        "extractDescription must be exported");
    // Uses startsWith('#') to detect and skip heading lines
    has(contentSrc, "startsWith('#')",           "extractDescription must skip lines starting with #");
    has(contentSrc, 'No description.',           "extractDescription must return fallback when no content found");
    // Strips inline markdown decorators from extracted text
    has(contentSrc, "replace(/\\*\\*|__|\\*|_|`/g, '')",
        "extractDescription must strip bold/italic/code markers from extracted text");
});

// ═══════════════════════════════════════════════════════════════════════════
// ── SUMMARY
// ═══════════════════════════════════════════════════════════════════════════

console.log('');
console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
console.log('');

if (failed > 0) {
    console.error('TESTS FAILED — fix doc-catalog source files before rebuilding');
    process.exit(1);
} else {
    console.log('ALL TESTS PASSED');
    process.exit(0);
}
