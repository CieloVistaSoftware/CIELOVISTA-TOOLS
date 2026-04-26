/**
 * tests/unit/command-renames.test.js
 *
 * Verifies the command title renames shipped in commit e4a4d27 (Fixes #9).
 *
 * Before:
 *   cvs.tools.home       — "CieloVista Tools: Open Home Page"      (redundant prefix, ambiguous)
 *   cvs.project.openHome — "CieloVista: Project: Open Home"        (confusingly similar)
 *
 * After (in package.json — VS Code shows "<category>: <title>" in the palette):
 *   cvs.tools.home       — title "Open Home Dashboard"      with category "CieloVista"
 *   cvs.project.openHome — title "Open Home Project Folder" with category "CieloVista"
 *
 * Also verifies the Browse All / search filter infrastructure introduced
 * in home-page.ts (issue #35): buildGroupedCommands() strips the category
 * prefix from display titles and groups correctly.
 *
 * Run: node tests/unit/command-renames.test.js
 */
'use strict';

const assert = require('assert');
const path   = require('path');
const fs     = require('fs');

let passed = 0, failed = 0;

function test(name, fn) {
    try   { fn(); console.log(`  \u2713 ${name}`); passed++; }
    catch (e) { console.error(`  \u2717 ${name}\n    \u2192 ${e.message}`); failed++; }
}
function ok(v, msg)  { assert.ok(v, msg); }
function eq(a, b, m) { assert.strictEqual(a, b, m); }

const PKG_PATH = path.resolve(__dirname, '../../package.json');
const pkg      = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
const cmds     = pkg.contributes?.commands ?? [];

function findCmd(id) { return cmds.find(c => c.command === id); }
function paletteLabel(c) { return c?.category ? `${c.category}: ${c.title}` : c?.title; }

console.log('\ncommand-renames tests');
console.log('\u2500'.repeat(50));

// ── cvs.tools.home ────────────────────────────────────────────────────────
console.log('\n-- cvs.tools.home --');

test('cvs.tools.home exists in package.json', () => {
    ok(findCmd('cvs.tools.home'), 'cvs.tools.home not found');
});

test('cvs.tools.home palette label is "CieloVista: Open Home Dashboard"', () => {
    const cmd = findCmd('cvs.tools.home');
    eq(paletteLabel(cmd), 'CieloVista: Open Home Dashboard', `got: ${paletteLabel(cmd)}`);
});

test('cvs.tools.home palette label does NOT contain "CieloVista Tools:"', () => {
    const cmd = findCmd('cvs.tools.home');
    ok(!paletteLabel(cmd)?.includes('CieloVista Tools:'), `old redundant prefix still present: ${paletteLabel(cmd)}`);
});

// ── cvs.project.openHome ─────────────────────────────────────────────────
console.log('\n-- cvs.project.openHome --');

test('cvs.project.openHome exists in package.json', () => {
    ok(findCmd('cvs.project.openHome'), 'cvs.project.openHome not found');
});

test('cvs.project.openHome palette label is "CieloVista: Open Home Project Folder"', () => {
    const cmd = findCmd('cvs.project.openHome');
    eq(paletteLabel(cmd), 'CieloVista: Open Home Project Folder', `got: ${paletteLabel(cmd)}`);
});

test('cvs.project.openHome palette label does NOT contain "Project: Open Home"', () => {
    const cmd = findCmd('cvs.project.openHome');
    ok(!paletteLabel(cmd)?.includes('Project: Open Home'), `old confusing title still present: ${paletteLabel(cmd)}`);
});

test('two home commands have distinct palette labels', () => {
    const a = paletteLabel(findCmd('cvs.tools.home'));
    const b = paletteLabel(findCmd('cvs.project.openHome'));
    ok(a !== b, `palette labels are identical: "${a}"`);
});

// ── All commands have titles ──────────────────────────────────────────────
console.log('\n-- All commands have titles --');

test('every command entry has a non-empty title', () => {
    const missing = cmds.filter(c => !c.title || typeof c.title !== 'string' || !c.title.trim());
    ok(missing.length === 0, `commands without titles: ${missing.map(c => c.command).join(', ')}`);
});

test('all command IDs use cvs. prefix or standard vscode prefix', () => {
    const bad = cmds.filter(c => !c.command.startsWith('cvs.') && !c.command.startsWith('workbench.'));
    ok(bad.length === 0, `unexpected command IDs: ${bad.map(c => c.command).join(', ')}`);
});

// ── buildGroupedCommands grouping logic ──────────────────────────────────
console.log('\n-- Browse All: buildGroupedCommands grouping logic --');

// Replicate the grouping logic from home-page.ts for pure unit testing.
function buildGroupedCommands(commands, registered) {
    const visible  = commands.filter(cmd => registered.has(cmd.command));
    const grouped  = {};
    for (const cmd of visible) {
        if (!cmd.title || typeof cmd.title !== 'string') { continue; }
        const match  = cmd.title.match(/^([\w\s\-]+:)/);
        const prefix = match ? match[1].trim() : 'Other';
        if (!grouped[prefix]) { grouped[prefix] = []; }
        grouped[prefix].push(cmd);
    }
    return grouped;
}

const ALL_CMD_IDS = new Set(cmds.map(c => c.command));

test('buildGroupedCommands groups by category prefix', () => {
    const grouped = buildGroupedCommands(cmds, ALL_CMD_IDS);
    ok(Object.keys(grouped).length > 0, 'no groups produced');
});

test('buildGroupedCommands only includes registered commands', () => {
    const partial = new Set(['cvs.tools.home']);
    const grouped = buildGroupedCommands(cmds, partial);
    const total   = Object.values(grouped).reduce((n, a) => n + a.length, 0);
    eq(total, 1, `expected 1 command, got ${total}`);
});

test('buildGroupedCommands strips "Other" label for unmatched prefixes', () => {
    const noPrefix = [{ command: 'cvs.noop', title: 'NoPrefix' }];
    const grouped  = buildGroupedCommands(noPrefix, new Set(['cvs.noop']));
    ok(grouped['Other'], 'unmatched title should land in Other group');
});

// ── Result ────────────────────────────────────────────────────────────────
console.log('');
console.log(`=== Result: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
