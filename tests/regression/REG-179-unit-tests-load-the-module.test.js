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
// Issue #823 found the same shape in five tests outside tests/unit/: a copy
// of home-page.ts's label rule, a hand-written launcher CATALOG and search, a
// stand-in HTTP server for View a Doc, copies of readme-compliance helpers
// (REG-030) and a stand-in for debug() (REG-080).
//
// Issue #838: rule 1 skipped tests named after a feature folder
// (doc-catalog-run-button, mcp-viewer-routes). Ten of them read the
// folder's source text or transpiled it themselves. Running the real pages
// found two dead page scripts the text checks had kept green: the doc
// preview's script did not parse (#841) and the MCP viewer's path pattern
// never matched (#843).
//
// Guards:
//   1. Over tests/unit/: a test whose name is a module in src/ requires that
//      module from a build (out-test/ or out/). "Named after" means the file
//      name, less .test.js and any .qualifier, is src/features/<n>.ts,
//      src/features/<n>/, src/shared/<n>.ts, or src/features/<dir>/<rest>.ts
//      for <dir>-<rest>. A name that is none of those but starts with a
//      feature folder, <dir>-<anything>, names the folder, and the test
//      requires one of its modules (#838). Mentioning the path is not
//      enough; it has to reach a require() call, directly, through a
//      variable, or as require(path.join(<variable>, 'file.js')).
//   2. Over tests/unit/, top-level tests/*.test.js and tests/regression/: no
//      test defines a function, or a top-level array/object/regex constant,
//      with the name of an export of a src module it names (by file name,
//      '<basename>.ts', build path, or feature folder name). Exports include
//      the members of a module's _test handle. That is a copy of the code it
//      claims to test.
// A self-check runs the rules on known-bad and known-good test text first, so
// a rule that stops matching fails here instead of passing everything.
//
// Not caught: a test that requires its module and then never calls it (the
// old cvt-registry shape), or a stand-in with a name of its own (mockDebug,
// groupAndStripCommands, a private http.createServer). Telling a stand-in
// from a helper needs a reader, not a regex.

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
    const base  = fileName.replace(/\.test\.(js|ts)$/, '').replace(/^REG-\d+-/, '');
    const names = [...new Set([base, base.split('.')[0]])];
    const found = [];
    const has = rel => fs.existsSync(path.join(SRC, rel));
    const exact = n => [`features/${n}.ts`, `features/${n}/index.ts`, `shared/${n}.ts`]
        .filter(has).map(f => f.replace(/(\/index)?\.ts$/, ''));
    for (const n of names) {
        found.push(...exact(n));
        const parts = n.split('-');
        for (let i = 1; i < parts.length; i++) {
            const rel = `features/${parts.slice(0, i).join('-')}/${parts.slice(i).join('-')}`;
            if (has(`${rel}.ts`)) { found.push(rel); }
        }
    }
    // #838: a name that is only <feature-folder>-<anything> (doc-catalog-run-button,
    // mcp-viewer-routes) names the folder: it loads one of the folder's modules.
    if (!found.length) {
        const parts = base.split('.')[0].split('-');
        for (let i = parts.length - 1; i >= 1; i--) {
            const dir = `features/${parts.slice(0, i).join('-')}`;
            if (fs.existsSync(path.join(SRC, dir)) && fs.statSync(path.join(SRC, dir)).isDirectory()) { found.push(dir); break; }
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
    // const X = <anything with the path>; ... require(X), or require(path.join(X, 'file.js'))
    // when X is a folder of the module (#838: daily-audit-checks loads four checks/ files).
    const vars = [...t.matchAll(new RegExp(`(?:const|let|var)\\s+(\\w+)\\s*=[^;\\n]*${pat}`, 'g'))].map(m => m[1]);
    return vars.some(v => new RegExp(`(?:require|import)\\s*\\(\\s*(?:path\\.(?:join|resolve)\\s*\\(\\s*)?${v}\\s*[,)]`).test(t));
}

/**
 * Names a test defines: functions (declarations and function/arrow bindings)
 * at any depth, and top-level constants whose value is an array, object or
 * regex literal written in the test (a hand-made CATALOG or LANG_HINTS table).
 * A constant taken from a module (require(), mod._test.x) or holding a path
 * is not a definition.
 */
function definedFunctions(text) {
    const re = /(?:^|\n)[ \t]*(?:async\s+)?function\s+(\w+)\s*\(|(?:^|\n)[ \t]*(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|\w+\s*=>)/g;
    const names = new Set([...text.matchAll(re)].map(m => m[1] || m[2]));
    for (const m of text.matchAll(/(?:^|\n)(?:const|let|var)\s+(\w+)\s*=\s*(\[|\{|\/(?![/*]))/g)) { names.add(m[1]); }
    return names;
}

/**
 * Every src module: rel path (no extension) -> exported function/const/class
 * names, and the members of its _test handle, which are exports too: a test
 * reaches them through it (#823: REG-030 copied five of readme-compliance's).
 */
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
            const handle = text.match(/^export\s+const\s+_test\b[^=]*=\s*\{([\s\S]*?)^\};?/m);
            if (handle) { names.push(...[...handle[1].matchAll(/^\s*(\w+)\s*(?:[,:]|$)/gm)].map(m => m[1])); }
            map.set(rel, [...new Set(names)]);
        }
    })(SRC);
    return map;
}

/**
 * Modules a test names: by name, by '<basename>.ts', by build path, or, for a
 * module inside a feature folder, by the folder's name (cvs-command-launcher).
 */
function modulesMentioned(fileName, text, exportsMap) {
    const t = normalise(text);
    const out = new Set(modulesNamedBy(fileName));
    for (const rel of exportsMap.keys()) {
        const parts = rel.split('/');
        const base  = parts[parts.length - 1];
        if (parts.length === 3 && new RegExp(`(?<![\\w-])${parts[1]}(?![\\w-])`).test(t)) { out.add(rel); }
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

// #838: a test named <feature-folder>-<anything> names the folder, and must
// load one of the folder's modules. Before #838 such names named nothing, so
// ten tests that read or transpiled source text passed this check unseen.
check('self-check: a <feature-folder>-<anything> test name resolves to the folder (doc-catalog-run-button)',
    JSON.stringify(modulesNamedBy('doc-catalog-run-button.test.js')) === JSON.stringify(['features/doc-catalog']),
    JSON.stringify(modulesNamedBy('doc-catalog-run-button.test.js')));
check('self-check: a folder module name still wins over the folder (doc-auditor-analyzer)',
    JSON.stringify(modulesNamedBy('doc-auditor-analyzer.test.js')) === JSON.stringify(['features/doc-auditor/analyzer']));
const readsFolderSource = [
    "const HTML_TS = path.resolve(__dirname, '..', '..', 'src', 'features', 'doc-catalog', 'html.ts');",
    "const htmlSrc = fs.readFileSync(HTML_TS, 'utf8');",
].join('\n');
const transpilesFolderSource = [
    "const SRC = path.join(__dirname, '../../src/features/mcp-viewer/html.ts');",
    "vm.runInNewContext(ts.transpileModule(fs.readFileSync(SRC, 'utf8'), {}).outputText, ctx);",
].join('\n');
const loadsAFolderModule = "const CATALOG_OUT = path.join(__dirname, '..', '..', 'out-test', 'features', 'doc-catalog', 'index.js');\nconst m = require(CATALOG_OUT);";
const loadsFolderFilesByJoin = [
    "const OUT = path.resolve(__dirname, '..', '..', 'out-test', 'features', 'daily-audit', 'checks');",
    "const { runChangelogCheck } = require(path.join(OUT, 'changelog.js'));",
].join('\n');
check('self-check: a folder-named test that reads the folder\'s source text is caught',
    !requiresModule(readsFolderSource, 'features/doc-catalog'));
check('self-check: a folder-named test that transpiles the source itself is caught',
    !requiresModule(transpilesFolderSource, 'features/mcp-viewer'));
check('self-check: requiring any module of the folder from out-test/ counts as loading it',
    requiresModule(loadsAFolderModule, 'features/doc-catalog'));
check('self-check: require(path.join(DIR, file)) with DIR a build folder of the module counts as loading it',
    requiresModule(loadsFolderFilesByJoin, 'features/daily-audit'));

// The shapes #823 found outside tests/unit/, as they were.
const homePageCopy = [
    '// Simulate the grouping and prefix-stripping logic from home-page.ts',
    'const commandLabel = (title) => title.slice(title.indexOf(":") + 1).trim();',
].join('\n');
const oldLauncherCoverage = [
    ' * Tests that the cvs-command-launcher properly includes and searches',
    "const CATALOG = [ { id: 'cvs.audit.testCoverage', tags: ['test'] } ];",
    'function searchCatalog(query) { return CATALOG; }',
].join('\n');
const oldReadmeCompliance = [
    '// Inline copies of helpers from feature.ts',
    "function normalizeHeading(h) { return h.toLowerCase(); }",
    'const LANG_HINTS = [',
    "  [/^def /m, 'python'],",
    '];',
].join('\n');
check('self-check: a top-level test with its own copy of home-page.ts commandLabel is caught',
    copiedExports('home-page-prefix-strip.test.js', homePageCopy, EXPORTS).includes('features/home-page:commandLabel'),
    JSON.stringify(copiedExports('home-page-prefix-strip.test.js', homePageCopy, EXPORTS)));
check('self-check: a regression test name is read past its REG-NNN- prefix',
    modulesNamedBy('REG-999-home-page.test.js').includes('features/home-page'));
check('self-check: a hand-written copy of an exported constant is caught (launcher CATALOG)',
    copiedExports('launcher-test-coverage.test.js', oldLauncherCoverage, EXPORTS).includes('features/cvs-command-launcher/catalog:CATALOG'),
    JSON.stringify(copiedExports('launcher-test-coverage.test.js', oldLauncherCoverage, EXPORTS)));
check('self-check: a copy of a _test handle member is caught (REG-030 normalizeHeading, LANG_HINTS)',
    ['normalizeHeading', 'LANG_HINTS'].every(n => copiedExports('REG-030-readme-compliance-smart-fixer.test.js', oldReadmeCompliance, EXPORTS)
        .includes(`features/readme-compliance/feature:${n}`)),
    JSON.stringify(copiedExports('REG-030-readme-compliance-smart-fixer.test.js', oldReadmeCompliance, EXPORTS)));
check('self-check: a constant taken from require() is not a copy',
    !definedFunctions("const CATALOG = require(CATALOG_JS).CATALOG;").has('CATALOG'));

// ── The tests ────────────────────────────────────────────────────────────────
// Rule 2 (no copy) holds every test directory the runners run: #819 held
// tests/unit/, and #823 found the same shape in five tests outside it.
// Rule 1 (a test named after a module loads it) holds tests/unit/ only: the
// top-level and regression tests named after a module include source-text
// checks (reading a .ts file for a pattern), which are not copies of it.
const DIRS = [
    { label: 'tests/unit/',       dir: UNIT,                                    mustLoad: true  },
    { label: 'tests/*.test.js',   dir: path.join(ROOT, 'tests'),                mustLoad: false },
    { label: 'tests/regression/', dir: path.join(ROOT, 'tests', 'regression'),  mustLoad: false },
];
const SELF = path.basename(__filename);

const notLoading = [];
const copies     = [];
let named = 0;
for (const { label, dir, mustLoad } of DIRS) {
    const files = fs.readdirSync(dir).filter(f => /\.test\.(js|ts)$/.test(f) && f !== SELF).sort();
    check(`${label} has test files to check`, files.length > 0);
    const rel = path.relative(ROOT, dir).split(path.sep).join('/');
    for (const f of files) {
        const text = fs.readFileSync(path.join(dir, f), 'utf8');
        const mods = mustLoad ? modulesNamedBy(f) : [];
        if (mods.length) {
            named++;
            if (!mods.some(m => requiresModule(text, m))) { notLoading.push(`${rel}/${f} (names ${mods.join(', ')})`); }
        }
        for (const hit of copiedExports(f, text, EXPORTS)) { copies.push(`${rel}/${f} defines ${hit}`); }
    }
}

check(`every unit test named after a src module loads it (${named} named)`, notLoading.length === 0,
    'does not require its module from out-test/ or out/:\n       ' + notLoading.join('\n       '));
check('no test in tests/unit/, tests/*.test.js or tests/regression/ defines its own copy of an export of a module it names',
    copies.length === 0, copies.join('\n       '));

console.log('-'.repeat(64));
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
