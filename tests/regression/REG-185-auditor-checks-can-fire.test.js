// Copyright (c) CieloVista Software. All rights reserved.
// REG-185: Issue #833 — every Codebase Auditor check can fire
//
// Run: node tests/regression/REG-185-auditor-checks-can-fire.test.js
//
// Three checks in src/features/codebase-auditor.ts (Dead Monolith, Missing
// README, Dead File) picked their files with
//     f.rel.startsWith('features/') && !f.rel.includes('/')
// A path that starts with "features/" always contains "/", so the filter kept
// nothing and the three checks reported "clean" on every tree, from the day
// they were written. The unit test asserted that behaviour as expected.
//
// This test builds one temp src/ tree per (check, path shape) from the table
// below, puts the problem each check looks for at that shape, and runs the
// real check on the files collectTsFiles() finds there, so the rel paths are
// the ones the auditor really produces. It fails when:
//   1. a check fires on no shape at all (its filter excludes every input),
//   2. a check fires on a shape other than the ones its oracle names, or
//      misses one it names,
//   3. a check* function in the module's _test handle has no row here, so a
//      new check cannot skip this test.
// A self-check first runs the rule on a stand-in with the pre-#833 filter and
// requires the rule to report it, so a rule that stops detecting passes nothing.

'use strict';

const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT  = path.join(ROOT, 'out-test', 'features', 'codebase-auditor.js');

let passed = 0, failed = 0;
function check(name, ok, detail) {
    if (ok) { console.log(`  PASS ${name}`); passed++; }
    else    { console.error(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`); failed++; }
}

// ── Load the real module (out-test/, vscode stubbed) ─────────────────────────

let t;
{
    const origLoad = Module._load;
    Module._load = function (req, parent, isMain) {
        if (req === 'vscode') {
            return {
                window: { createOutputChannel: () => ({ appendLine() {}, show() {}, dispose() {} }) },
                workspace: {}, commands: { registerCommand() { return { dispose() {} }; } },
                ViewColumn: { Beside: 2 },
            };
        }
        return origLoad.call(this, req, parent, isMain);
    };
    try { t = require(OUT)._test; }
    catch (err) { console.error(`  FAIL cannot load ${path.relative(ROOT, OUT)}: ${err.message}`); process.exit(1); }
    finally { Module._load = origLoad; }
}

// ── The input shapes ─────────────────────────────────────────────────────────
// Every place a .ts file can sit in src/, by depth and top folder. Each shape
// names one probe file; SIBLING is a second file in the same folder for the
// checks that compare two files.

const SHAPES = [
    'probe.ts',
    'features/probe.ts',
    'features/pack/probe.ts',
    'features/pack/deep/probe.ts',
    'shared/probe.ts',
    'shared/pack/probe.ts',
    'other/probe.ts',
];
const SIBLING = rel => rel.replace(/probe\.ts$/, 'probe-twin.ts');

const TOP_LEVEL_FEATURE = /^features\/[^/]+\.ts$/;
const ANY_SHAPE         = () => true;

const lines = (line, n) => Array(n).fill(line).join('\n');
const BLOCK = [
    'function computeProbeSummary(user, stats) {',
    'const base = user.name + "-" + user.id;',
    'const score = stats.a + stats.b + stats.c + stats.d;',
    'const normalized = String(score).trim().toLowerCase();',
    'const decorated = base + ":" + normalized + ":" + user.team;',
    'return decorated.split(" ").join("-");',
    '}',
].join('\n');

// ── The checks: the problem each looks for, and where it must report it ──────
// make(root, rel) writes the problem at shape rel. fires(rel) is the oracle.

const CHECKS = {
    checkFileSizes: {
        make: (w, rel) => w(rel, lines('const x = 1;', 650)),
        fires: ANY_SHAPE,
    },
    checkFunctionLength: {
        make: (w, rel) => w(rel, `export function probeFn() {\n${lines('  const x = 1;', 65)}\n}\n`),
        fires: ANY_SHAPE,
    },
    checkDuplicateExports: {
        make: (w, rel) => { w(rel, 'export function sameName() { return 1; }\n'); w(SIBLING(rel), 'export function sameName() { return 2; }\n'); },
        fires: ANY_SHAPE,
    },
    checkDeadMonoliths: {
        // probe.ts beside probe/index.ts: the split happened, the monolith stayed.
        make: (w, rel) => { w(rel, 'export function activate() {}\n'); w(path.posix.join(path.posix.dirname(rel), 'probe', 'index.ts'), 'export function activate() {}\n'); },
        fires: rel => TOP_LEVEL_FEATURE.test(rel),
    },
    checkMissingReadmes: {
        make: (w, rel) => w(rel, 'export function activate() {}\n'),
        fires: rel => TOP_LEVEL_FEATURE.test(rel),
    },
    checkOneTimeOnePlace: {
        make: (w, rel) => { w(rel, 'function esc(s: string) { return s; }\n'); w(SIBLING(rel), 'function esc(s: string) { return s; }\n'); },
        fires: ANY_SHAPE,
    },
    checkSharedUtilUsage: {
        make: (w, rel) => w(rel, 'function esc(s: string) { return s; }\n'),
        fires: rel => rel.startsWith('features/'),
    },
    checkDeadFiles: {
        // Over 20 lines, imported by nothing, not named in extension.ts.
        make: (w, rel) => { w(rel, lines('export const probeValue = 1;', 30)); w('extension.ts', 'export function activate(): void {}\n'); },
        fires: rel => TOP_LEVEL_FEATURE.test(rel),
    },
    checkFolderDuplicateCode: {
        make: (w, rel) => { w(rel, `${BLOCK}\nexport function a() { return 1; }\n`); w(SIBLING(rel), `${BLOCK}\nexport function b() { return 2; }\n`); },
        fires: ANY_SHAPE,
    },
};

// ── The rule ─────────────────────────────────────────────────────────────────

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'reg185-'));
let seq = 0;

/** The shapes (from SHAPES) on which checkFn reports the problem that make() writes there. */
function shapesThatFire(checkFn, make) {
    return SHAPES.filter(rel => {
        const root = path.join(TMP, String(++seq));
        const w = (r, content) => {
            const abs = path.join(root, r);
            fs.mkdirSync(path.dirname(abs), { recursive: true });
            fs.writeFileSync(abs, content, 'utf8');
        };
        make(w, rel);
        const files = t.collectTsFiles(root, root);
        return checkFn(files, root).length > 0;
    });
}

try {
    // Self-check: the pre-#833 filter must read as "can never fire".
    const oldFilter = files => files
        .filter(f => f.rel.startsWith('features/') && !f.rel.includes('/'))
        .map(f => ({ file: f.rel }));
    check('self-check: the rule reports a check whose filter excludes every shape',
        shapesThatFire(oldFilter, CHECKS.checkMissingReadmes.make).length === 0);

    // 3. Every check in the module has a row.
    const inModule = Object.keys(t).filter(k => /^check[A-Z]/.test(k) && typeof t[k] === 'function').sort();
    const inTable  = Object.keys(CHECKS).sort();
    check(`every auditor check has a row in the table (${inModule.length} checks)`,
        JSON.stringify(inModule) === JSON.stringify(inTable),
        `module: ${inModule.join(', ')}\n       table:  ${inTable.join(', ')}`);

    for (const name of inTable) {
        if (typeof t[name] !== 'function') { check(`${name} exists in _test`, false); continue; }
        const got  = shapesThatFire(t[name], CHECKS[name].make);
        const want = SHAPES.filter(CHECKS[name].fires);
        // 1. It can fire.
        check(`${name} fires on at least one of ${SHAPES.length} path shapes`, got.length > 0,
            'its file filter excludes every shape: the check can never report anything');
        // 2. It fires where its oracle says, and nowhere else.
        check(`${name} fires on exactly: ${want.join(', ')}`,
            JSON.stringify(got) === JSON.stringify(want), `fired on: ${got.join(', ') || '(none)'}`);
    }
} finally {
    fs.rmSync(TMP, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
