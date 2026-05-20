/**
 * REG-072 — View Archived Docs button routes correctly
 *
 * Verifies that cvs.catalog.viewArchived:
 *   1. Has NO action:'read' in catalog (button should say Run, not Preview)
 *   2. Is listed in OPEN_DIRECT in home-page.ts
 *   3. Is listed in DIRECT_PANEL_COMMANDS in launcher/index.ts
 */

'use strict';
const fs   = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'src');
const CATALOG   = path.join(SRC, 'features', 'cvs-command-launcher', 'catalog.ts');
const HOME      = path.join(SRC, 'features', 'home-page.ts');
const LAUNCHER  = path.join(SRC, 'features', 'cvs-command-launcher', 'index.ts');

const catalogSrc  = fs.readFileSync(CATALOG, 'utf8');
const homeSrc     = fs.readFileSync(HOME, 'utf8');
const launcherSrc = fs.readFileSync(LAUNCHER, 'utf8');

let passed = 0, failed = 0;
function check(label, ok, detail) {
    if (ok) { console.log(`  ✓ ${label}`); passed++; }
    else     { console.log(`  ✗ ${label}\n    ${detail}`); failed++; }
}

console.log('\nREG-072 — View Archived Docs button routes correctly\n');

// 1. Catalog entry must NOT have action:'read'
const archivedLine = catalogSrc.split('\n').find(l => l.includes("'cvs.catalog.viewArchived'"));
check(
    "cvs.catalog.viewArchived has no action:'read' in catalog",
    archivedLine && !archivedLine.includes("action: 'read'"),
    `Line found: ${archivedLine?.trim()}`
);

// 2. home-page OPEN_DIRECT includes cvs.catalog.viewArchived
check(
    'home-page.ts OPEN_DIRECT includes cvs.catalog.viewArchived',
    homeSrc.includes("'cvs.catalog.viewArchived'"),
    "String 'cvs.catalog.viewArchived' not found in home-page.ts"
);

// 3. OPEN_DIRECT block (array literal) contains the entry
const openDirectBlock = homeSrc.match(/const OPEN_DIRECT\s*=\s*\[([\s\S]*?)\]/)?.[1] ?? '';
check(
    'cvs.catalog.viewArchived is inside the OPEN_DIRECT array literal',
    openDirectBlock.includes("'cvs.catalog.viewArchived'"),
    "Not found within OPEN_DIRECT array bounds"
);

// 4. DIRECT_PANEL_COMMANDS in launcher includes cvs.catalog.viewArchived
const dpBlock = launcherSrc.match(/DIRECT_PANEL_COMMANDS\s*=\s*new Set<string>\(\[([\s\S]*?)\]\)/)?.[1] ?? '';
check(
    'launcher DIRECT_PANEL_COMMANDS includes cvs.catalog.viewArchived',
    dpBlock.includes("'cvs.catalog.viewArchived'"),
    "Not found in DIRECT_PANEL_COMMANDS set literal"
);

// 5. previewMode in home-page still has the consolidate.log special case intact
check(
    'previewMode consolidate.log special case still present',
    homeSrc.includes("cvs.consolidate.log"),
    "consolidate.log special case was removed from previewMode"
);

console.log(`\n5 checks: ${passed} passed, ${failed} failed\n`);
if (failed > 0) { process.exitCode = 1; }
