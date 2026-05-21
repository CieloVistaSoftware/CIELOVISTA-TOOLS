// Copyright (c) CieloVista Software. All rights reserved.
// REG-037: Issue #344 — Error Log Viewer must not open a duplicate completion pane
//
// cvs.tools.errorLog opens its own first-class panel. The CVS launcher must
// execute it directly (skip the secondary "Completed in ..." result pane) by
// listing it in DIRECT_PANEL_COMMANDS.
//
// Run: node tests/regression/REG-037-error-log-no-duplicate-pane.test.js

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT       = path.resolve(__dirname, '..', '..');
const LAUNCHER   = path.join(ROOT, 'src', 'features', 'cvs-command-launcher', 'index.ts');

let passed = 0, failed = 0;

function test(name, fn) {
    try { fn(); console.log(`  PASS ${name}`); passed++; }
    catch (e) { console.error(`  FAIL ${name}\n       ${e.message}`); failed++; }
}

console.log('REG-037: Error Log Viewer must not open a duplicate completion pane (#344)');
console.log('─'.repeat(70));

const src = fs.readFileSync(LAUNCHER, 'utf8');

test('DIRECT_PANEL_COMMANDS set is defined in launcher', () => {
    if (!src.includes('DIRECT_PANEL_COMMANDS')) {
        throw new Error('DIRECT_PANEL_COMMANDS set must be defined in cvs-command-launcher/index.ts');
    }
});

test('cvs.tools.errorLog is in DIRECT_PANEL_COMMANDS', () => {
    const setBlock = src.match(/const DIRECT_PANEL_COMMANDS\s*=\s*new Set<[^>]*>\(\[([\s\S]*?)\]\)/);
    if (!setBlock) { throw new Error('Could not find DIRECT_PANEL_COMMANDS set literal'); }
    if (!setBlock[1].includes("'cvs.tools.errorLog'") && !setBlock[1].includes('"cvs.tools.errorLog"')) {
        throw new Error("cvs.tools.errorLog must be listed in DIRECT_PANEL_COMMANDS to skip the result pane");
    }
});

test('DIRECT_PANEL_COMMANDS.has() is used in the execute path to branch away from result panel', () => {
    if (!src.includes('DIRECT_PANEL_COMMANDS.has(commandId)')) {
        throw new Error('DIRECT_PANEL_COMMANDS.has(commandId) must gate the direct-execute branch');
    }
});

test('direct-execute branch calls executeCommand without creating cvsJobResult panel', () => {
    // The direct path must call executeCommand before any createWebviewPanel('cvsJobResult')
    const directBranch = src.indexOf('DIRECT_PANEL_COMMANDS.has(commandId)');
    const createJobPanel = src.indexOf("'cvsJobResult'");
    if (directBranch === -1) { throw new Error('DIRECT_PANEL_COMMANDS.has branch not found'); }
    if (createJobPanel === -1) { throw new Error("cvsJobResult panel creation not found"); }
    // The direct branch must return before reaching cvsJobResult creation
    // Verify the direct path has a return statement between it and cvsJobResult
    const between = src.slice(directBranch, createJobPanel);
    if (!between.includes('return;') && !between.includes('return ')) {
        throw new Error('Direct-execute branch must return before cvsJobResult panel is created');
    }
});

test('cvs.tools.errorLog command opens its own panel (openErrorLogViewer is registered)', () => {
    const extSrc = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    if (!extSrc.includes("'cvs.tools.errorLog'") && !extSrc.includes('"cvs.tools.errorLog"')) {
        throw new Error('cvs.tools.errorLog must be registered in extension.ts');
    }
    if (!extSrc.includes('openErrorLogViewer')) {
        throw new Error('openErrorLogViewer must be the handler for cvs.tools.errorLog');
    }
});

console.log('─'.repeat(70));
if (failed === 0) { console.log(`✓ REG-037 passed (${passed} checks).\n`); process.exit(0); }
else { console.error(`✗ REG-037 FAILED (${failed} of ${passed + failed} checks failed).\n`); process.exit(1); }
