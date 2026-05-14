// Copyright (c) CieloVista Software. All rights reserved.
// REG-047: Frontmatter Viewer — rescan must not discard previously filed issue numbers
//
// When the user presses Rescan, buildViewerHtml() is called again.
// Any row that was previously fixed (issue filed) must render as "Filed #N"
// rather than a plain "Fix" button — even after an extension host restart.
//
// Source-level checks:
//   1. FILED_ISSUES_KEY constant exists (globalState key)
//   2. FILED_ISSUES_REPAIR_PATH constant exists (disk repair snapshot key)
//   3. _context stored at module level (needed to call globalState)
//   4. activate() assigns _context and calls loadFiledIssues(root)
//   5. saveFiledIssues() writes to globalState — called after every successful fix
//   6. buildViewerHtml receives filedIssues parameter and checks it per row
//   7. Filed rows render with data-action="open-issue" (not data-action="fix")
//   8. loadRepairSnapshot() exists and is merged by loadFiledIssues()
//
// Run: node tests/regression/REG-047-frontmatter-viewer-rescan-preserves-filed-issues.test.js

'use strict';

const fs   = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'features', 'frontmatter-viewer.ts'),
    'utf8'
);

let passed = 0, failed = 0;
function pass(msg) { console.log(`  PASS ${msg}`); passed++; }
function fail(msg) { console.error(`  FAIL ${msg}`); failed++; }

console.log('REG-047: Frontmatter Viewer — rescan preserves filed issue numbers');
console.log('─'.repeat(68));

// 1. FILED_ISSUES_KEY constant declares the globalState key
(function() {
    if (SRC.includes("FILED_ISSUES_KEY = 'frontmatter-viewer.filedIssues'") ||
        SRC.includes('FILED_ISSUES_KEY = "frontmatter-viewer.filedIssues"')) {
        pass('FILED_ISSUES_KEY constant exists');
    } else {
        fail('FILED_ISSUES_KEY constant missing — globalState key not defined');
    }
})();

// 2. FILED_ISSUES_REPAIR_PATH constant declares disk snapshot location
(function() {
    const hasRepairPath = SRC.includes("FILED_ISSUES_REPAIR_PATH = path.join('data', 'frontmatter-filed-issues.repair.json')") ||
        SRC.includes('FILED_ISSUES_REPAIR_PATH = path.join("data", "frontmatter-filed-issues.repair.json")');
    if (hasRepairPath) {
        pass('FILED_ISSUES_REPAIR_PATH constant exists');
    } else {
        fail('FILED_ISSUES_REPAIR_PATH constant missing — repair snapshot path not defined');
    }
})();

// 3. Module-level _context variable exists to hold ExtensionContext
(function() {
    if (SRC.includes('let _context: vscode.ExtensionContext | undefined')) {
        pass('_context module-level variable declared');
    } else {
        fail('_context module-level variable missing — cannot call globalState outside activate()');
    }
})();

// 4. activate() assigns _context and calls loadFiledIssues(root)
(function() {
    const hasAssign  = SRC.includes('_context = context;');
    const hasRoot    = SRC.includes("const root = path.resolve(__dirname, '../..');");
    const hasLoad    = SRC.includes('loadFiledIssues(root)');
    if (hasAssign && hasRoot && hasLoad) {
        pass('activate() stores _context and calls loadFiledIssues(root)');
    } else {
        fail(`activate() wiring incomplete: _context=${hasAssign} root=${hasRoot} loadFiledIssues(root)=${hasLoad}`);
    }
})();

// 5. saveFiledIssues() writes to globalState and is called on successful fix
(function() {
    const hasSaveFn  = SRC.includes('function saveFiledIssues()') || SRC.includes('function saveFiledIssues ():');
    const hasGsWrite = SRC.includes('globalState.update(FILED_ISSUES_KEY');
    const hasCalled  = (SRC.match(/saveFiledIssues\(\)/g) || []).length >= 2; // fix + fix-all paths
    if (hasSaveFn && hasGsWrite && hasCalled) {
        pass('saveFiledIssues() defined, writes globalState, called in ≥2 code paths');
    } else {
        fail(`saveFiledIssues incomplete: fn=${hasSaveFn} gsWrite=${hasGsWrite} calledTwice=${hasCalled}`);
    }
})();

// 6. buildViewerHtml accepts the filedIssues map and checks it per row
(function() {
    const hasSig   = SRC.includes('buildViewerHtml(report: Report, filedIssues: Map<');
    const hasCheck = SRC.includes('filedIssues.get(normalizeRelPath(f.path))');
    if (hasSig && hasCheck) {
        pass('buildViewerHtml accepts filedIssues map and checks each row');
    } else {
        fail(`buildViewerHtml persistence check: signature=${hasSig} rowCheck=${hasCheck}`);
    }
})();

// 7. Filed rows emit data-action="open-issue" so the button opens the issue
(function() {
    if (SRC.includes('data-action="open-issue"') && SRC.includes('Filed #')) {
        pass('Filed rows render with data-action="open-issue" and Filed # label');
    } else {
        fail('Filed row HTML missing data-action="open-issue" or "Filed #" text');
    }
})();

// 8. Repair snapshot loader is present and merged into _filedIssues
(function() {
    const hasLoader = SRC.includes('function loadRepairSnapshot(root: string): Map<string, { number: number; url: string }>');
    const hasCall   = SRC.includes('const repaired = loadRepairSnapshot(root);');
    const hasMerge  = SRC.includes('if (!_filedIssues.has(rel))');
    if (hasLoader && hasCall && hasMerge) {
        pass('loadRepairSnapshot() exists and merges missing entries into _filedIssues');
    } else {
        fail(`repair snapshot wiring incomplete: loader=${hasLoader} call=${hasCall} merge=${hasMerge}`);
    }
})();

console.log('─'.repeat(68));
console.log(`${passed + failed} checks: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
