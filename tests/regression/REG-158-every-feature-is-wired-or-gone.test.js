// Copyright (c) CieloVista Software. All rights reserved.
// REG-158: Issue #768 — every feature is wired or gone
//
// Run: node tests/regression/REG-158-every-feature-is-wired-or-gone.test.js
//
// #768: three modules under src/features/ were imported by nothing, so they
// never activated. config-editor.ts registered cvs.config.edit, which
// package.json still contributed, so it sat in the Command Palette and failed
// with "command not found". git log shows none of the three was imported by
// src/extension.ts in any commit since the first one (73f6199), so nothing
// ever noticed: every check compared package.json with registerCommand() calls
// anywhere in src/, and a registerCommand() in a file nobody imports looks
// exactly like a working one.
//
// Resolution:
//   - config-editor.ts: deleted. Its command body was a stub ("Config Editor UI
//     coming soon!") and the config.json it described is read by nothing.
//   - script-runner.ts: deleted. It ran the extension's own scripts/*.js from
//     the install folder: build and release tooling, not user commands.
//   - playwright-check.ts: wired, as cvs.audit.playwrightSetup. Its header
//     claimed cvs.audit.testCoverage, which test-coverage-auditor.ts owns, so
//     the daily audit's "Fix Now" for the Playwright Test Setup check opened
//     the wrong panel.
//
// This test derives everything from the code, so a module that loses its last
// importer fails here whether or not anyone thinks to list it:
//
//   0. Parser guards: the import walk starts at src/extension.ts, every
//      ./features/ import there resolves to a file, and every
//      registerCommand() argument in reachable code resolves to an id.
//   1. Every src/features/*.ts file and every src/features/*/ folder that
//      holds TypeScript is reachable from src/extension.ts through static
//      imports, or is named in HELPER_MODULES with the reason it is not a
//      feature.
//   2. Every .ts file under src/ is reachable, or is named in
//      DEAD_FILES_ALLOWED under the issue that owns it.
//   3. Every command contributed in package.json is registered by reachable
//      code.
//   4. Every command registered by reachable code is contributed, or is one
//      of REG-156's documented exceptions (INTERNAL_COMMANDS,
//      UNCONTRIBUTED_ALLOWED). Those lists are read from REG-156's source so
//      there is one list, not two.
//   5. Every command the daily audit hands to a "Fix Now" button, and every
//      command in the launcher's FIX_ACTIONS map, is registered by reachable
//      code.
//   6. The #768 specifics: the two deleted modules stay deleted,
//      cvs.config.edit is not contributed, and playwright-check.ts is wired
//      and registers cvs.audit.playwrightSetup.
//   7. Every .ts file under mcp-server/src/ is reachable from the MCP
//      server's entry points (the dist/*.js files its package.json names).
//      #775 found mcp-server/src/types/index.ts imported by nothing.
//
// Every allow-list entry that no longer applies (the file became reachable or
// was deleted) fails the test, so the lists only shrink.

'use strict';

const fs   = require('fs');
const path = require('path');
const { walkFiles } = require('../../scripts/source-tree-walk');

const ROOT      = path.resolve(__dirname, '..', '..');
const SRC       = path.join(ROOT, 'src');
const FEATURES  = path.join(SRC, 'features');
const EXTENSION = path.join(SRC, 'extension.ts');

let passed = 0, failed = 0;
function check(name, ok, detail) {
    if (ok) { console.log(`  PASS ${name}`); passed++; }
    else    { console.error(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`); failed++; }
}
const rel  = file => path.relative(ROOT, file).replace(/\\/g, '/');
const list = items => items.join(', ');

console.log('REG-158: every feature is wired or gone (#768)');
console.log('-'.repeat(64));

// ── Allow-lists ──────────────────────────────────────────────────────────────

// Rule 1. Top-level modules under src/features/ that are not features, read
// and confirmed one by one. Each must be unreachable from extension.ts; if it
// becomes reachable or is deleted, remove it here. #839 emptied it: its one
// entry, a readme-compliance.ts re-export kept only for tests, was deleted and
// the tests load readme-compliance/feature.js instead. Keep it empty.
const HELPER_MODULES = new Map([
]);

// Rule 2. Files under src/ that nothing reachable imports, each under the
// issue that will wire or delete it. #775 emptied it: all 16 files it listed
// were dead copies, TODO stubs or never-imported helpers, and were deleted.
// Keep it empty. A new entry needs an open issue number beside it.
const DEAD_FILES_ALLOWED = new Set([
]);

// ── Import graph ─────────────────────────────────────────────────────────────

// Relative specifiers of static imports and re-exports at the start of a line
// (so a commented-out import does not count), plus import('./x') and
// require('./x') with a literal path.
const IMPORT_PATTERNS = [
    /^[ \t]*(?:import|export)\b[^;]*?\bfrom\s*['"](\.{1,2}\/[^'"]+)['"]/gm,
    /^[ \t]*import\s*['"](\.{1,2}\/[^'"]+)['"]/gm,
    /\b(?:import|require)\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g,
];

function resolveImport(fromFile, spec) {
    const base = path.resolve(path.dirname(fromFile), spec.replace(/\.js$/, ''));
    for (const candidate of [base + '.ts', path.join(base, 'index.ts'), base]) {
        try { if (fs.statSync(candidate).isFile() && candidate.endsWith('.ts')) { return candidate; } } catch { /* next */ }
    }
    return null;
}

function importsOf(file) {
    const src = fs.readFileSync(file, 'utf8');
    const specs = [];
    for (const re of IMPORT_PATTERNS) {
        for (const m of src.matchAll(re)) { specs.push(m[1]); }
    }
    return specs;
}

/** Every .ts file under root that the entry files reach through relative imports. */
function reachableFrom(entries, root) {
    const seen = new Set();
    const queue = [...entries];
    while (queue.length) {
        const file = queue.pop();
        if (seen.has(file)) { continue; }
        seen.add(file);
        for (const spec of importsOf(file)) {
            const target = resolveImport(file, spec);
            // Specifiers that resolve to nothing are text inside generated-code
            // templates (mcp-server-scaffolder, codebase-auditor); tsc owns real
            // broken imports (REG-003).
            if (target && target.startsWith(root + path.sep)) { queue.push(target); }
        }
    }
    return seen;
}

const reachable = reachableFrom([EXTENSION], SRC);

const allSrc = walkFiles(SRC, { extensions: ['.ts'] }).filter(f => !f.endsWith('.d.ts'));
const isReachable = file => reachable.has(path.resolve(file));

// ── 0. Parser guards ─────────────────────────────────────────────────────────

const extFeatureSpecs = [...fs.readFileSync(EXTENSION, 'utf8').matchAll(/from\s+'(\.\/features\/[^']+)'/g)].map(m => m[1]);
const extUnresolved = extFeatureSpecs.filter(s => !resolveImport(EXTENSION, s));
check(`import walk: all ${extFeatureSpecs.length} ./features/ imports in extension.ts resolve (${reachable.size} of ${allSrc.length} src files reachable)`,
    extFeatureSpecs.length > 20 && extUnresolved.length === 0 && reachable.size > extFeatureSpecs.length,
    extUnresolved.length ? `unresolved: ${list(extUnresolved)}` : 'the walk found too little; the import patterns no longer match');

// ── 1. Every top-level feature is reachable ──────────────────────────────────

const topFiles   = fs.readdirSync(FEATURES).filter(n => n.endsWith('.ts')).map(n => path.join(FEATURES, n));
const topFolders = fs.readdirSync(FEATURES, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => path.join(FEATURES, d.name))
    // A folder with no TypeScript (CommandHelp/, image-reader-assets/) holds
    // docs or webview assets, not a module.
    .filter(dir => walkFiles(dir, { extensions: ['.ts'] }).length > 0);

const unwiredFiles = topFiles.filter(f => !isReachable(f) && !HELPER_MODULES.has(rel(f))).map(rel);
const unwiredFolders = topFolders
    .filter(dir => !walkFiles(dir, { extensions: ['.ts'] }).some(isReachable))
    .map(dir => rel(dir) + '/');
check(`rule 1: all ${topFiles.length} src/features/*.ts files and ${topFolders.length} feature folders are wired into extension.ts (${HELPER_MODULES.size} helper allow-listed)`,
    unwiredFiles.length === 0 && unwiredFolders.length === 0,
    `imported by nothing extension.ts reaches: ${list([...unwiredFiles, ...unwiredFolders])}; wire it (import + activateIfEnabled + deactivate in extension.ts) or delete it`);

const staleHelpers = [...HELPER_MODULES.keys()].filter(r => !fs.existsSync(path.join(ROOT, r)) || isReachable(path.join(ROOT, r)));
check('rule 1 allow-list is current (every helper exists and is still unreachable)',
    staleHelpers.length === 0, `remove from HELPER_MODULES: ${list(staleHelpers)}`);

// ── 2. Every .ts file under src/ is reachable ────────────────────────────────

const deadFiles = allSrc.filter(f => !isReachable(f)).map(rel)
    .filter(r => !DEAD_FILES_ALLOWED.has(r) && !HELPER_MODULES.has(r));
check(`rule 2: every src/ file is reachable from extension.ts (${DEAD_FILES_ALLOWED.size} allow-listed)`,
    deadFiles.length === 0, `imported by nothing extension.ts reaches: ${list(deadFiles)}`);
const staleDead = [...DEAD_FILES_ALLOWED].filter(r => !fs.existsSync(path.join(ROOT, r)) || isReachable(path.join(ROOT, r)));
check('rule 2 allow-list is current (every entry exists and is still unreachable)',
    staleDead.length === 0, `remove from DEAD_FILES_ALLOWED: ${list(staleDead)}`);

// ── Commands registered by reachable code ────────────────────────────────────

// Literal or same-file const arguments to registerCommand(), as in REG-156.
const registered = new Map();      // id -> file, reachable code only
const registeredDead = new Map();  // id -> file, unreachable code only
const unresolvedArgs = [];
for (const file of allSrc) {
    const src = fs.readFileSync(file, 'utf8');
    const consts = {};
    for (const c of src.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*(?::\s*string\s*)?=\s*['"`](cvs\.[^'"`$]+)['"`]/g)) {
        consts[c[1]] = c[2];
    }
    for (const r of src.matchAll(/\bcommands\.registerCommand\(\s*([^,)]+)/g)) {
        const arg = r[1].trim();
        const lit = arg.match(/^['"`]([^'"`$]+)['"`]$/);
        const id  = lit ? lit[1] : consts[arg];
        if (!id) { if (isReachable(file)) { unresolvedArgs.push(`${rel(file)}: ${arg}`); } continue; }
        (isReachable(file) ? registered : registeredDead).set(id, rel(file));
    }
}
check(`every registerCommand() id in reachable code resolves (${registered.size} registered)`,
    registered.size > 100 && unresolvedArgs.length === 0,
    unresolvedArgs.length ? `cannot tell which command these register: ${list(unresolvedArgs)}` : 'found too few registrations; the parser no longer matches');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const contributed = new Set((pkg.contributes?.commands ?? []).map(c => c.command));

// ── 3. contributed ⊆ registered by reachable code ────────────────────────────

const deadContributed = [...contributed].filter(id => !registered.has(id))
    .map(id => registeredDead.has(id) ? `${id} (registered only in ${registeredDead.get(id)}, which nothing imports)` : `${id} (registered nowhere)`);
check(`rule 3: all ${contributed.size} contributed commands are registered by code extension.ts reaches`,
    deadContributed.length === 0,
    `in the Command Palette but "command not found" when run: ${list(deadContributed)}`);

// ── 4. registered by reachable code ⊆ contributed ∪ REG-156 exceptions ───────

const REG156 = fs.readFileSync(path.join(__dirname, 'REG-156-command-titles-agree.test.js'), 'utf8');
function reg156Set(name) {
    const block = REG156.match(new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\);`));
    return new Set(block ? [...block[1].matchAll(/^\s*'([^']+)'/gm)].map(m => m[1]) : []);
}
const INTERNAL_COMMANDS     = reg156Set('INTERNAL_COMMANDS');
const UNCONTRIBUTED_ALLOWED = reg156Set('UNCONTRIBUTED_ALLOWED');
check(`REG-156 exception lists read (${INTERNAL_COMMANDS.size} internal, ${UNCONTRIBUTED_ALLOWED.size} pending)`,
    INTERNAL_COMMANDS.size > 0, 'INTERNAL_COMMANDS was not found in REG-156; update reg156Set()');

const uncontributed = [...registered.keys()].filter(id =>
    !contributed.has(id) && !INTERNAL_COMMANDS.has(id) && !UNCONTRIBUTED_ALLOWED.has(id));
check('rule 4: every command registered by reachable code is contributed (or is a REG-156 exception)',
    uncontributed.length === 0, `registered but in no palette: ${list(uncontributed)}`);
const exceptionsInDeadCode = [...INTERNAL_COMMANDS, ...UNCONTRIBUTED_ALLOWED].filter(id => !registered.has(id) && registeredDead.has(id));
check('REG-156 exceptions are registered by reachable code, not only by a file nobody imports',
    exceptionsInDeadCode.length === 0, list(exceptionsInDeadCode));

// ── 5. "Fix" buttons point at registered commands ────────────────────────────

const auditActions = [];
for (const file of walkFiles(path.join(FEATURES, 'daily-audit', 'checks'), { extensions: ['.ts'] })) {
    for (const m of fs.readFileSync(file, 'utf8').matchAll(/\baction:\s*'(cvs\.[^']+)'/g)) { auditActions.push([rel(file), m[1]]); }
}
const launcherHtml = fs.readFileSync(path.join(FEATURES, 'cvs-command-launcher', 'html.ts'), 'utf8');
const fixMap = (launcherHtml.match(/var FIX_ACTIONS = \{([\s\S]*?)\n\};/) || [, ''])[1];
const fixActions = [...fixMap.matchAll(/id:\s*'(cvs\.[^']+)'/g)].map(m => ['cvs-command-launcher/html.ts FIX_ACTIONS', m[1]]);
const deadButtons = [...auditActions, ...fixActions].filter(([, id]) => !registered.has(id)).map(([where, id]) => `${where}: ${id}`);
check(`rule 5: all ${auditActions.length} daily-audit actions and ${fixActions.length} launcher fix buttons run a registered command`,
    auditActions.length > 0 && fixActions.length > 0 && deadButtons.length === 0,
    deadButtons.length ? list(deadButtons) : 'found no actions; the patterns no longer match');

// ── 6. The #768 modules ──────────────────────────────────────────────────────

const gone = ['config-editor', 'script-runner'].flatMap(id => [
    `src/features/${id}.ts`, `src/features/${id}.README.md`, `tests/unit/${id}.test.js`,
]).filter(r => fs.existsSync(path.join(ROOT, r)));
check('#768: config-editor and script-runner stay deleted (module, README, unit test)',
    gone.length === 0, `back again: ${list(gone)}; wire it into extension.ts instead`);
check('#768: cvs.config.edit is not contributed', !contributed.has('cvs.config.edit'));
check('#768: playwright-check.ts is reachable and registers cvs.audit.playwrightSetup',
    isReachable(path.join(FEATURES, 'playwright-check.ts')) &&
    registered.get('cvs.audit.playwrightSetup') === 'src/features/playwright-check.ts',
    `registered by ${registered.get('cvs.audit.playwrightSetup') ?? 'nothing reachable'}`);
check('#768: the Playwright Test Setup audit check sends "Fix Now" to cvs.audit.playwrightSetup',
    auditActions.some(([file, id]) => file.endsWith('checks/test-coverage.ts') && id === 'cvs.audit.playwrightSetup'),
    list(auditActions.filter(([file]) => file.endsWith('checks/test-coverage.ts')).map(([, id]) => id)));

// ── 7. Every .ts file under mcp-server/src/ is reachable (#775) ──────────────

// The MCP server's entry points are the dist/*.js files its package.json names
// (main, bin, and the start scripts). Each maps to the src/*.ts it compiles from.
const MCP_ROOT = path.join(ROOT, 'mcp-server');
const MCP_SRC  = path.join(MCP_ROOT, 'src');
const mcpPkgText = fs.readFileSync(path.join(MCP_ROOT, 'package.json'), 'utf8');
const mcpEntries = [...new Set([...mcpPkgText.matchAll(/dist[/]([A-Za-z0-9_./-]+)[.]js/g)].map(m => m[1]))]
    .map(name => path.join(MCP_SRC, name + '.ts'))
    .filter(f => fs.existsSync(f));
const mcpReachable = reachableFrom(mcpEntries, MCP_SRC);
const mcpAll  = walkFiles(MCP_SRC, { extensions: ['.ts'] }).filter(f => !f.endsWith('.d.ts'));
const mcpDead = mcpAll.filter(f => !mcpReachable.has(path.resolve(f))).map(rel);
check(`rule 7: every mcp-server/src file is reachable from its entry points (${mcpEntries.map(rel).join(', ')}; ${mcpReachable.size} of ${mcpAll.length})`,
    mcpEntries.length >= 2 && mcpReachable.size > mcpEntries.length && mcpDead.length === 0,
    mcpDead.length ? `imported by nothing the MCP server reaches: ${list(mcpDead)}` : 'found too few entry points or reachable files; the patterns no longer match');

console.log('-'.repeat(64));
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
