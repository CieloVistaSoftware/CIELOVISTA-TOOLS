// Copyright (c) CieloVista Software. All rights reserved.
// REG-040: Issue #350 — UI-visible titles must use proper case, not repo slug
//
// Product name in user-visible strings must be "CieloVista Tools",
// not the lowercase repo slug "cielovista-tools".
//
// Run: node tests/regression/REG-040-proper-case-panel-titles.test.js

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

let passed = 0, failed = 0;

function test(name, fn) {
    try { fn(); console.log(`  PASS ${name}`); passed++; }
    catch (e) { console.error(`  FAIL ${name}\n       ${e.message}`); failed++; }
}

console.log('REG-040: UI-visible titles use proper case (no lowercase repo slug) (#350)');
console.log('─'.repeat(70));

// ── github-issues-view.ts ────────────────────────────────────────────────────

const issuesSrc = fs.readFileSync(
    path.join(ROOT, 'src', 'shared', 'github-issues-view.ts'), 'utf8');

test('Issues viewer panel creation title uses "CieloVista Tools"', () => {
    // The createWebviewPanel call must use the proper name, not the slug
    if (issuesSrc.includes("'cielovista-tools — Open Issues'") ||
        issuesSrc.includes('"cielovista-tools — Open Issues"') ||
        issuesSrc.includes("'cielovista-tools — Open Issues'") ||
        issuesSrc.includes('"cielovista-tools — Open Issues"')) {
        throw new Error('createWebviewPanel title must use "CieloVista Tools", not "cielovista-tools"');
    }
    if (!issuesSrc.includes('CieloVista Tools')) {
        throw new Error('Panel title must contain "CieloVista Tools" (proper case)');
    }
});

test('panelTitleFor() uses "CieloVista Tools" not "cielovista-tools"', () => {
    const fnIdx = issuesSrc.indexOf('panelTitleFor');
    if (fnIdx === -1) { throw new Error('panelTitleFor function not found'); }
    const fnBlock = issuesSrc.slice(fnIdx, fnIdx + 200);
    if (fnBlock.includes('`cielovista-tools')) {
        throw new Error('panelTitleFor must use "CieloVista Tools", not the lowercase slug');
    }
});

// ── home-page.ts ─────────────────────────────────────────────────────────────

const homeSrc = fs.readFileSync(
    path.join(ROOT, 'src', 'features', 'home-page.ts'), 'utf8');

test('Home page Issue Viewer desc uses "CieloVista Tools"', () => {
    if (homeSrc.includes("for cielovista-tools'") || homeSrc.includes('for cielovista-tools"')) {
        throw new Error('Home page Issue Viewer desc must say "CieloVista Tools", not "cielovista-tools"');
    }
});

// ── cvs-command-launcher/html.ts ─────────────────────────────────────────────

const htmlSrc = fs.readFileSync(
    path.join(ROOT, 'src', 'features', 'cvs-command-launcher', 'html.ts'), 'utf8');

test('Scope tooltip for "tools" uses "CieloVista Tools" not "cielovista-tools"', () => {
    if (htmlSrc.includes("'cielovista-tools project only") ||
        htmlSrc.includes('"cielovista-tools project only')) {
        throw new Error('Scope tooltip for "tools" must say "CieloVista Tools project only"');
    }
});

// ── REPO_NAME / User-Agent constants are excluded ────────────────────────────
// Those are network-level identifiers that must stay lowercase (GitHub API).

console.log('─'.repeat(70));
if (failed === 0) { console.log(`✓ REG-040 passed (${passed} checks).\n`); process.exit(0); }
else { console.error(`✗ REG-040 FAILED (${failed} of ${passed + failed} checks failed).\n`); process.exit(1); }
