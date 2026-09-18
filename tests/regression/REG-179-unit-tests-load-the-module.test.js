// Copyright (c) CieloVista Software. All rights reserved.
// REG-179: Issue #819 — a unit test named after a module loads that module
//
// Run: node tests/regression/REG-179-unit-tests-load-the-module.test.js
//
// tests/unit/code-highlight-audit.pairing.test.js tested a copy of the fence
// scanner written inside the test. When #814 rewrote the real scanner onto
// src/shared/md-fence.ts, the test stayed green without ever seeing the change.
// The same shape was in five more unit tests: file-list-sort (a copy of both
// comparators), cvt-registry (every case ran a re-implementation; the module it
// required was never called), css-class-hover (defined the path to the module
// and never required it; tested copies of two regexes), mcp-viewer (read the
// source text of html.ts and never ran it) and command-renames (a copy of
// home-page.ts's buildGroupedCommands).
//
// Guards, over every file in tests/unit/:
//   1. A test whose name is a module in src/ requires that module from a build
//      (out-test/ or out/). "Named after" means the file name, less .test.js
//      and any .qualifier, is src/features/<n>.ts, src/features/<n>/,
//      src/shared/<n>.ts, or src/features/<dir>/<rest>.ts for <dir>-<rest>.
//      Mentioning the path is not enough; it has to reach a require() call.
//   2. No unit test defines a function with the name of an export of a src
//      module it names (by file name or build path). That is a copy of the
//      code it claims to test.
// A self-check runs the rules on known-bad and known-good test text first, so
// a rule that stops matching fails here instead of passing everything.
//
// Not caught: a test that requires its module and then never calls it (the
// old cvt-registry shape), when its stand-in helpers have names of their own.
// Telling a used binding from an unused one needs a parser, not a regex.

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC  = path.join(ROOT, 'src');
const UNIT = path.join(ROOT, 'tests', 'unit');

let passed = 0, failed = 0;
function check(name, ok, detail) {
    if (ok) { console.log(`  PASS ${name}`); passed++; }
    else    { console.error(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`); failed++; }
}

// ── The rules ────────────────────────────────────────────────────────────────

/** src-relative module paths (no extension, '/' separators) a test file name refers to. */
function modulesNamedBy(fileName) {
    const base  = fileName.replace(/\.test\.(js|ts)$/, '');
    const names = [...new Set([base, base.split('.')[0]])];
    const found = [];
    const has = rel => fs.existsSync(path.join(SRC, rel));
    for (const n of names) {
        if (has(`features/${n}.ts`))       { found.push(`features/${n}`); }
        if (has(`features/${n}/index.ts`)) { found.push(`features/${n}`); }
        if (has(`shared/${n}.ts`))         { found.push(`shared/${n}`); }
        const parts = n.split('-');
        for (let i = 1; i < parts.length; i++) {
            const rel = `features/${parts.slice(0, i).join('-')}/${parts.slice(i).join('-')}`;
            if (has(`${rel}.ts`)) { found.push(rel); }
        }
    }
    return [...new Set(found)];
}

/** Test text with path.join('a', 'b') style segments folded to a/b, and backslashes to /. */
function normalise(text) {
    return text.replace(/\\\\/g, '/').replace(/(['"`])\s*,\s*(['"`])/g, '/');
}

/** A regex source matching the build path of `mod`: out/ or out-test/, then the module, .js or /index.js optional. */
function buildPathRe(mod) {
    const esc = mod.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return `out(?:-test)?/${esc}(?:\\.js|/index(?:\\.js)?|/[\\w.-]+\\.js)?(?![\\w-])`;
}

/** True when `text` requires the build of `mod`, directly or through a variable holding its path. */
function requiresModule(text, mod) {
    const t   = normalise(text);
    const pat = buildPathRe(mod);
    // require('.../out-test/features/x.js') or require(path.join(..., 'out-test', ...))
    if (new RegExp(`(?:require|import)\\s*\\([^;\\n]*${pat}`).test(t)) { return true; }
    // const X = <anything with the path>; ... require(X)
    const vars = [...t.matchAll(new RegExp(`(?:const|let|var)\\s+(\\w+)\\s*=[^;\\n]*${pat}`, 'g'))].map(m => m[1]);
    return vars.some(v => new RegExp(`(?:require|import)\\s*\\(\\s*${v}\\s*\\)`).test(t));
}

/** Names of functions (declarations and function/arrow bindings) a test defines at any depth. */
function definedFunctions(text) {
    const re = /(?:^|\n)[ \t]*(?:async\s+)?function\s+(\w+)\s*\(|(?:^|\n)[ \t]*(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|\w+\s*=>)/g;
    return new Set([...text.matchAll(re)].map(m => m[1] || m[2]));
}

/** Every src module: rel path (no extension) -> exported function/const/class names. */
function srcExports() {
    const map = new Map();
    (function walk(dir) {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) { walk(full); continue; }
            if (!e.name.endsWith('.ts') || e.name.endsWith('.d.ts')) { continue; }
            const rel  = path.relative(SRC, full).split(path.sep).join('/').replace(/\.ts$/, '');
            const text = fs.readFileSync(full, 'utf8');
            const names = [...text.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+(\w+)/gm)].map(m => m[1]);
            map.set(rel, names);
        }
    })(SRC);
    return map;
}

/** Modules a test names: by name, by '<basename>.ts', or by build path. */
function modulesMentioned(fileName, text, exportsMap) {
    const t = normalise(text);
    const out = new Set(modulesNamedBy(fileName));
    for (const rel of exportsMap.keys()) {
        const base = rel.split('/').pop();
        if (base === 'index' || base === 'types') { continue; }
        if (t.includes(`${base}.ts`) || new RegExp(buildPathRe(rel)).test(t)) { out.add(rel); }
    }
    return [...out];
}

/** "module:name" for every function the test defines that is an export of a module it names. */
function copiedExports(fileName, text, exportsMap) {
    const defined = definedFunctions(text);
    const hits = [];
    for (const mod of modulesMentioned(fileName, text, exportsMap)) {
        const names = exportsMap.get(mod) || exportsMap.get(`${mod}/index`) || [];
        for (const n of names) {
            if (n === 'activate' || n === 'deactivate' || n === '_test') { continue; }
            if (defined.has(n)) { hits.push(`${mod}:${n}`); }
        }
    }
    return hits;
}

const EXPORTS = srcExports();

// ── Self-check: the rules catch the shapes #819 found ───────────────────────
console.log('REG-179: a unit test named after a module loads it (#819)');
console.log('-'.repeat(64));

const inlineCopy = [
    "const fs = require('fs');",
    'function scanFile(filePath, project) { return []; }',
    "it('x', () => scanFile('a.md', 'p'));",
].join('\n');
const pathButNoRequire = [
    "const OUT = path.resolve(__dirname, '../../out-test/features/code-highlight-audit.js');",
    "test('x', () => ok(fs.existsSync(OUT)));",
].join('\n');
const loadsIt = [
    "const OUT = path.join(__dirname, '../../out-test/features/code-highlight-audit.js');",
    'const { scanFile } = require(OUT);',
].join('\n');
const loadsItBySegments = "const mod = require(path.join(ROOT, 'out-test', 'features', 'code-highlight-audit.js'));";
const NAME = 'code-highlight-audit.pairing.test.js';

check('self-check: the pairing test name resolves to src/features/code-highlight-audit.ts',
    modulesNamedBy(NAME).includes('features/code-highlight-audit'), JSON.stringify(modulesNamedBy(NAME)));
check('self-check: a folder-module test name resolves (doc-auditor-analyzer)',
    modulesNamedBy('doc-auditor-analyzer.test.js').includes('features/doc-auditor/analyzer'));
check('self-check: an inline copy with no require is caught',
    !requiresModule(inlineCopy, 'features/code-highlight-audit'));
check('self-check: an inline copy of an export is caught as a copy',
    copiedExports(NAME, inlineCopy, EXPORTS).includes('features/code-highlight-audit:scanFile'));
check('self-check: naming the build path without requiring it is caught',
    !requiresModule(pathButNoRequire, 'features/code-highlight-audit'));
check('self-check: require(OUT) of the build path counts as loading it',
    requiresModule(loadsIt, 'features/code-highlight-audit'));
check('self-check: require(path.join(..., segments)) counts as loading it',
    requiresModule(loadsItBySegments, 'features/code-highlight-audit'));
check('self-check: a real require is not reported as a copy',
    copiedExports(NAME, loadsIt, EXPORTS).length === 0);

// ── The unit tests ───────────────────────────────────────────────────────────
const files = fs.readdirSync(UNIT).filter(f => /\.test\.(js|ts)$/.test(f)).sort();
check('tests/unit/ has test files to check', files.length > 0);

const notLoading = [];
const copies     = [];
let named = 0;
for (const f of files) {
    const text = fs.readFileSync(path.join(UNIT, f), 'utf8');
    const mods = modulesNamedBy(f);
    if (mods.length) {
        named++;
        if (!mods.some(m => requiresModule(text, m))) { notLoading.push(`${f} (names ${mods.join(', ')})`); }
    }
    for (const hit of copiedExports(f, text, EXPORTS)) { copies.push(`${f} defines ${hit}`); }
}

check(`every unit test named after a src module loads it (${named} named)`, notLoading.length === 0,
    'does not require its module from out-test/ or out/:\n       ' + notLoading.join('\n       '));
check('no unit test defines its own copy of an export of a module it names', copies.length === 0,
    copies.join('\n       '));

console.log('-'.repeat(64));
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
