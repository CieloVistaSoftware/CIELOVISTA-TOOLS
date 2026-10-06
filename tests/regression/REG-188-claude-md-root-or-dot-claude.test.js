// Copyright (c) CieloVista Software. All rights reserved.
// REG-188: Issue #862 — a project whose CLAUDE.md lives in .claude/ is not
// reported as missing one
//
// Run: node tests/regression/REG-188-claude-md-root-or-dot-claude.test.js
//
// The background health runner logged "1 project(s) missing CLAUDE.md:
// wb-starter", but wb-starter keeps it at .claude/CLAUDE.md, which Claude Code
// reads just like a root CLAUDE.md. Four checks each looked only at the root.
// Fix: src/shared/claude-md.ts holds findClaudeMd(), which checks both
// locations, and all four checks call it.
//
// Guards:
//   1. Source: each of the four checks imports findClaudeMd and no longer
//      tests for existsSync(path.join(<project>, 'CLAUDE.md')). A self-check
//      runs the rule over the old shape.
//   2. Live (out-test build): findClaudeMd finds the root file, the .claude/
//      file, prefers the root when both exist, and returns undefined when
//      neither does; the daily-audit coverage check is green for a project
//      with only .claude/CLAUDE.md and red for one with none.

'use strict';

const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT  = path.join(ROOT, 'out-test');

let passed = 0, failed = 0;
function check(name, ok, detail) {
    if (ok) { console.log(`  PASS ${name}`); passed++; }
    else    { console.error(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`); failed++; }
}

console.log('\nREG-188: CLAUDE.md at the root or in .claude/ (#862)\n' + '-'.repeat(60));

// ── 1. Source ────────────────────────────────────────────────────────────────

const CHECKS = [
    'src/features/background-health-runner.ts',
    'src/features/daily-audit/checks/claude-coverage.ts',
    'src/features/docs-manager.ts',
    'src/features/doc-intelligence/analyzer.ts',
];

// A root-only presence test: existsSync on a join that ends in 'CLAUDE.md',
// directly or through a has('CLAUDE.md') helper.
const ROOT_ONLY = /existsSync\(\s*path\.join\([^)]*'CLAUDE\.md'\s*\)\s*\)|\bhas\(\s*'CLAUDE\.md'\s*\)/;

check('self-check: the rule flags the old root-only test',
    ROOT_ONLY.test("fs.existsSync(path.join(p.path, 'CLAUDE.md'))") && ROOT_ONLY.test("if (!has('CLAUDE.md')) {"));

for (const rel of CHECKS) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    check(`${rel} imports findClaudeMd`, /import\s*\{[^}]*\bfindClaudeMd\b[^}]*\}\s*from\s*'(?:\.\.\/)+shared\/claude-md'/.test(src));
    const hit = src.split('\n').findIndex(line => ROOT_ONLY.test(line));
    check(`${rel} has no root-only CLAUDE.md test`, hit < 0, hit >= 0 ? `line ${hit + 1}` : '');
}

// ── 2. Live ──────────────────────────────────────────────────────────────────

function load(rel) {
    const origLoad = Module._load;
    Module._load = function (req, parent, isMain) {
        if (req === 'vscode') { return { window: {}, workspace: {}, commands: {} }; }
        return origLoad.call(this, req, parent, isMain);
    };
    try { return require(path.join(OUT, rel)); }
    finally { Module._load = origLoad; }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reg188-'));
function project(name, files) {
    const dir = path.join(tmp, name);
    for (const f of files) {
        fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
        fs.writeFileSync(path.join(dir, f), '# CLAUDE.md\n');
    }
    fs.mkdirSync(dir, { recursive: true });
    return { name, path: dir };
}

try {
    const { findClaudeMd } = load('shared/claude-md.js');
    const rootOnly = project('root-only', ['CLAUDE.md']);
    const dotOnly  = project('dot-only',  ['.claude/CLAUDE.md']);
    const both     = project('both',      ['CLAUDE.md', '.claude/CLAUDE.md']);
    const none     = project('none',      []);

    check('findClaudeMd finds a root CLAUDE.md', findClaudeMd(rootOnly.path) === path.join(rootOnly.path, 'CLAUDE.md'));
    check('findClaudeMd finds .claude/CLAUDE.md', findClaudeMd(dotOnly.path) === path.join(dotOnly.path, '.claude', 'CLAUDE.md'));
    check('findClaudeMd prefers the root file when both exist', findClaudeMd(both.path) === path.join(both.path, 'CLAUDE.md'));
    check('findClaudeMd returns undefined when there is none', findClaudeMd(none.path) === undefined);

    const { runClaudeCoverageCheck } = load('features/daily-audit/checks/claude-coverage.js');
    const green = runClaudeCoverageCheck([rootOnly, dotOnly]);
    check('coverage check is green for root and .claude/ projects', green.status === 'green', `${green.status}: ${green.summary}`);
    const red = runClaudeCoverageCheck([dotOnly, none]);
    check('coverage check names only the project with none', red.status === 'red'
        && red.affectedProjects.length === 1 && red.affectedProjects[0] === 'none', JSON.stringify(red.affectedProjects));
} catch (err) {
    check('live checks ran', false, err.message);
} finally {
    fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
