// Copyright (c) CieloVista Software. All rights reserved.
// REG-041: Issue #350 — launcher title casing consistency
//
// Run: node tests/regression/REG-041-launcher-title-casing.test.js

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..', '..');
const CATALOG_SRC = fs.readFileSync(path.join(ROOT, 'src', 'features', 'cvs-command-launcher', 'catalog.ts'), 'utf8');
const LAUNCHER_SRC = fs.readFileSync(path.join(ROOT, 'src', 'features', 'cvs-command-launcher', 'index.ts'), 'utf8');
const HOME_SRC = fs.readFileSync(path.join(ROOT, 'src', 'features', 'home-page.ts'), 'utf8');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  PASS ${name}`);
        passed += 1;
    } catch (err) {
        console.error(`  FAIL ${name}\n       ${err.message}`);
        failed += 1;
    }
}

console.log('REG-041: Launcher/Home title casing consistency (#350)');
console.log('-'.repeat(64));

test('launcher catalog uses proper case for File List title', () => {
    assert(CATALOG_SRC.includes("title: 'Tools: File List'"), 'expected title "Tools: File List" not found');
    assert(!CATALOG_SRC.includes("title: 'Tools: FileList'"), 'legacy mixed-case title "Tools: FileList" still present');
});

test('launcher normalizes workspace name before setting panel title', () => {
    assert(LAUNCHER_SRC.includes('function normalizeWorkspaceDisplayName(name: string)'), 'workspace display-name normalizer missing in launcher');
    assert(LAUNCHER_SRC.includes("if (lower === 'cielovista-tools') { return 'CieloVista Tools'; }"), 'launcher missing special-case mapping for cielovista-tools');
    assert(LAUNCHER_SRC.includes('const wsName  = normalizeWorkspaceDisplayName('), 'launcher panel title path does not use display-name normalizer');
});

test('home page normalizes workspace display name to proper case', () => {
    assert(HOME_SRC.includes('function normalizeWorkspaceDisplayName(name: string)'), 'workspace display-name normalizer missing in home page');
    assert(HOME_SRC.includes("if (lower === 'cielovista-tools') { return 'CieloVista Tools'; }"), 'home page missing special-case mapping for cielovista-tools');
    assert(HOME_SRC.includes('const wsName   = normalizeWorkspaceDisplayName('), 'home page does not use normalized workspace display name');
});

console.log('-'.repeat(64));
if (failed === 0) {
    console.log(`✓ REG-041 passed (${passed} checks).\n`);
    process.exit(0);
}

console.error(`✗ REG-041 FAILED (${failed} of ${passed + failed} checks failed).\n`);
process.exit(1);
