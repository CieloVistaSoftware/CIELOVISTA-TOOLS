// Copyright (c) CieloVista Software. All rights reserved.
// REG-171: Issues #801, #803, #808 — every npm script and workflow step that
// names a repo file names a file that exists
//
// Run: node tests/regression/REG-171-scripts-and-workflows-name-real-files.test.js
//
// Three pieces of tooling had quietly stopped doing their job:
//   - #808: npm run test:all ran tests/unit/self-heal.test.js, a file that
//     never existed on main, so test:all died at that step every time.
//   - #801: the Sync Priority Field workflow ran on every label change and
//     only printed "Sync logic goes here." Its pointer, docs/priority-sync.md,
//     named a file that does not exist.
//   - #803: scripts/verify-symbol-index.mjs imported a dist file esbuild no
//     longer emits, and nothing ran it, so nobody saw.
//
// The general class: a script or workflow names a file, the file moves or is
// deleted, and the reference rots without failing anything. This test reads
// every script in package.json and mcp-server/package.json and every
// non-comment line of every workflow in .github/workflows/, pulls out each
// token that names a repo file, and fails if that file does not exist.
//
// Build output (out/, out-test/, dist/, *.vsix) is exempt: those files are
// produced by the build, not committed. So are globs and tokens with shell or
// Actions variables in them, which do not name one file.
//
// It also keeps the three specific fixes in place.

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
let passed = 0, failed = 0;
function check(name, ok, detail) {
    if (ok) { console.log(`  PASS ${name}`); passed++; }
    else    { console.error(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`); failed++; }
}

const EXT = '(?:js|mjs|cjs|ts|json|ps1|sh|py|bat|cmd|md|yml|yaml|html|css|txt)';
// A path with at least one slash: tests/unit/x.test.js, ./scripts/a.js, docs/x.md
const PATH_TOKEN = new RegExp(`(?:^|[\\s'"=(\`])((?:\\.{1,2}/)?[A-Za-z0-9_@.-]+(?:/[A-Za-z0-9_@.-]+)+\\.${EXT})(?=$|[\\s'"),;\`&|<>])`, 'g');
// A bare file handed to an interpreter: node install.js, bash x.sh
const RUN_TOKEN = new RegExp(`(?:^|[\\s&|;(])(?:node|tsx|bash|sh|pwsh|powershell|python|py)(?:\\s+-[\\w-]+)*\\s+([A-Za-z0-9_.-]+\\.${EXT})(?=$|[\\s'"),;&|])`, 'g');
const GENERATED = /^(?:\.\/)?(?:node_modules|out|out-test|dist|mcp-server\/dist|\.vscode-test)\//;

/** Every file token in one command line. */
function fileTokens(text) {
    const found = new Set();
    for (const re of [PATH_TOKEN, RUN_TOKEN]) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(text))) { found.add(m[1]); }
    }
    return [...found].filter(t => !GENERATED.test(t) && !/[*$%{}]/.test(t) && !t.endsWith('.vsix'));
}

/** A token resolves if it exists relative to any of the bases it could run from. */
function exists(token, bases) {
    return bases.some(b => fs.existsSync(path.resolve(b, token)));
}

/** Every file reference in the given sources that does not resolve. */
function danglingRefs(sources) {
    const dangling = [];
    for (const { where, text, bases } of sources) {
        for (const tok of fileTokens(text)) {
            if (!exists(tok, bases)) { dangling.push(`${where}: ${tok}`); }
        }
    }
    return dangling;
}

console.log('REG-171: npm scripts and workflow steps name files that exist (#801, #803, #808)');
console.log('-'.repeat(72));

// ── Collect every script and workflow line ────────────────────────────────────
const sources = [];
for (const pkgRel of ['package.json', 'mcp-server/package.json']) {
    const pkgPath = path.join(ROOT, pkgRel);
    if (!fs.existsSync(pkgPath)) { continue; }
    const pkgDir = path.dirname(pkgPath);
    const scripts = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).scripts || {};
    for (const [name, cmd] of Object.entries(scripts)) {
        sources.push({ where: `${pkgRel} scripts.${name}`, text: cmd, bases: [pkgDir, ROOT] });
    }
}
const WF_DIR = path.join(ROOT, '.github', 'workflows');
const workflows = fs.existsSync(WF_DIR) ? fs.readdirSync(WF_DIR).filter(f => /\.ya?ml$/.test(f)) : [];
for (const wf of workflows) {
    const lines = fs.readFileSync(path.join(WF_DIR, wf), 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
        if (/^\s*#/.test(line)) { return; }
        sources.push({ where: `.github/workflows/${wf}:${i + 1}`, text: line, bases: [ROOT] });
    });
}

check('found npm scripts and workflows to scan', sources.length > 50 && workflows.length > 0,
    `${sources.length} sources, ${workflows.length} workflows`);

// ── Self-check: the scan catches a dead reference and passes a live one ──────
const probe = danglingRefs([
    { where: 'probe', text: 'node tests/unit/self-heal.test.js && node install.js', bases: [ROOT] },
    { where: 'probe', text: 'node scripts/no-such-script.js', bases: [ROOT] },
    { where: 'probe', text: 'vsce package --out out/x.vsix && node out/extension.js', bases: [ROOT] },
]);
check('the scan flags a missing file and passes an existing one and build output',
    probe.length === 2 && probe.some(p => p.includes('self-heal')) && probe.some(p => p.includes('no-such-script')),
    JSON.stringify(probe));

// ── The class ─────────────────────────────────────────────────────────────────
const dangling = danglingRefs(sources);
check('every repo file named by an npm script or workflow step exists', dangling.length === 0,
    dangling.join('\n       '));

// ── The three specific fixes ─────────────────────────────────────────────────
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
check('#808: no hand-kept test:all list (scripts/run-unit-tests.js runs every test file)',
    !('test:all' in pkg.scripts), pkg.scripts['test:all']);
check('#801: the placeholder Sync Priority Field workflow is gone',
    !fs.existsSync(path.join(WF_DIR, 'sync-priority.yml')));
check('#801: no workflow is a placeholder that only logs',
    !workflows.some(wf => /Sync logic goes here|This is a placeholder/.test(fs.readFileSync(path.join(WF_DIR, wf), 'utf8'))));
check('#801: the doc describing the non-existent sync is gone',
    !fs.existsSync(path.join(ROOT, 'docs', 'working', 'priority-sync.md')));
check('#803: the unrunnable scripts/verify-symbol-index.mjs is gone',
    !fs.existsSync(path.join(ROOT, 'scripts', 'verify-symbol-index.mjs')));
check('#803: its checks live in a test the unit runner runs',
    fs.existsSync(path.join(ROOT, 'tests', 'unit', 'symbol-index.test.js')));

console.log('-'.repeat(72));
console.log(`REG-171: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
