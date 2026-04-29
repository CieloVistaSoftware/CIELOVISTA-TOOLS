/**
 * REG-019-filelist-feature.test.js
 *
 * Regression test for issue #69 — FileList sortable file browser.
 *
 * The feature is implemented across three source files and one unit
 * test. This regression locks the structural pieces in place so a
 * future refactor (or a careless monolith collapse) can't silently
 * remove the feature without the rebuild noticing.
 *
 * Things this verifies:
 *   1. src/features/file-list-viewer.ts exists and registers
 *      cvs.tools.fileList in its activate() function.
 *   2. src/shared/file-list-sort.ts exists and exports the pure
 *      comparator API: makeComparator, sortEntries, DEFAULT_EXCLUDES.
 *      Living in shared/ means the unit test can import it without
 *      pulling in the vscode module.
 *   3. tests/unit/file-list-sort.test.js exists — the unit test
 *      that exercises folders-first, all four columns, tie-break,
 *      stability, and the excludes set.
 *   4. The home page Quick Launch grid wires cvs.tools.fileList so
 *      the user has a one-click entry point. This is the contract
 *      with the user from the issue's UX section.
 *   5. The launcher catalog entry exists at dewey 700.020 inside
 *      cvs-command-launcher/catalog.ts so the command is visible
 *      in the guided launcher and discoverable by tag search.
 *
 * Spawned from REG-019 inside scripts/run-regression-tests.js.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

const VIEWER_TS  = path.join(ROOT, 'src', 'features', 'file-list-viewer.ts');
const SORT_TS    = path.join(ROOT, 'src', 'shared',   'file-list-sort.ts');
const UNIT_TEST  = path.join(ROOT, 'tests', 'unit', 'file-list-sort.test.js');
const HOME_TS    = path.join(ROOT, 'src', 'features', 'home-page.ts');
const CATALOG_TS = path.join(ROOT, 'src', 'features', 'cvs-command-launcher', 'catalog.ts');

let failed = 0;
const fail = (msg) => { console.error('FAIL: ' + msg); failed++; };
const ok   = (msg) => { console.log('PASS: ' + msg); };

for (const p of [VIEWER_TS, SORT_TS, UNIT_TEST, HOME_TS, CATALOG_TS]) {
    if (!fs.existsSync(p)) {
        console.error('FATAL: required source file missing: ' + p);
        process.exit(1);
    }
}

const viewerSrc  = fs.readFileSync(VIEWER_TS,  'utf8');
const sortSrc    = fs.readFileSync(SORT_TS,    'utf8');
const unitSrc    = fs.readFileSync(UNIT_TEST,  'utf8');
const homeSrc    = fs.readFileSync(HOME_TS,    'utf8');
const catalogSrc = fs.readFileSync(CATALOG_TS, 'utf8');

// ─── 1. Viewer registers the command ────────────────────────────────────

(function checkCommandRegistration() {
    if (!/registerCommand\s*\(\s*['"]cvs\.tools\.fileList['"]/.test(viewerSrc)) {
        fail('file-list-viewer.ts must call registerCommand(\'cvs.tools.fileList\', ...) inside activate() — without it the home-page button and catalog entry both produce command-not-found');
        return;
    }
    ok('file-list-viewer.ts registers cvs.tools.fileList');
})();

(function checkOpenPanelExport() {
    if (!/export\s+function\s+openFileListPanel\s*\(/.test(viewerSrc)) {
        fail('file-list-viewer.ts must export openFileListPanel — the activate() handler delegates to it');
        return;
    }
    ok('file-list-viewer.ts exports openFileListPanel');
})();

// ─── 2. Sort lib exposes the comparator API ─────────────────────────────

(function checkSortExports() {
    const required = ['makeComparator', 'sortEntries', 'DEFAULT_EXCLUDES'];
    const missing = required.filter(name => !new RegExp(`export\\s+(?:function|const)\\s+${name}\\b`).test(sortSrc));
    if (missing.length > 0) {
        fail(`file-list-sort.ts is missing exports: ${missing.join(', ')} — the unit test imports these by name`);
        return;
    }
    ok('file-list-sort.ts exports makeComparator, sortEntries, DEFAULT_EXCLUDES');
})();

(function checkFoldersFirstInvariant() {
    // The folders-first invariant is the single most important rule of
    // this feature — without it, sort by size desc would put a 12 MB
    // file above an empty folder, which destroys the Explorer-like
    // intuition the issue asked for.
    if (!/a\.isDir\s*&&\s*!b\.isDir/.test(sortSrc) || !/!a\.isDir\s*&&\s*b\.isDir/.test(sortSrc)) {
        fail('file-list-sort.ts must enforce the folders-first invariant — folders sort before files in every column/direction combination');
        return;
    }
    ok('file-list-sort.ts enforces the folders-first invariant');
})();

(function checkDefaultExcludes() {
    // Hard-coded list per the issue UX. node_modules and .git are the
    // most important — they cause the worst directory-listing perf
    // cliffs if accidentally included.
    const expected = ['node_modules', '.git', 'out', 'dist'];
    const missing = expected.filter(name => !new RegExp(`['"]${name.replace('.', '\\.')}['"]`).test(sortSrc));
    if (missing.length > 0) {
        fail(`file-list-sort.ts DEFAULT_EXCLUDES is missing entries: ${missing.join(', ')}`);
        return;
    }
    ok('file-list-sort.ts DEFAULT_EXCLUDES contains the expected core entries');
})();

// ─── 3. Unit test still exists with real coverage ───────────────────────

(function checkUnitTestExists() {
    // We don't run the unit test from inside this regression — the
    // unit-test runner already does that. We just verify the file
    // hasn't been deleted and still has a reasonable amount of cases.
    const testCount = (unitSrc.match(/\btest\s*\(\s*['"]/g) || []).length;
    if (testCount < 8) {
        fail(`tests/unit/file-list-sort.test.js has only ${testCount} test cases — expected at least 8 for adequate coverage`);
        return;
    }
    ok(`tests/unit/file-list-sort.test.js has ${testCount} test cases`);
})();

(function checkUnitTestImportsCompiled() {
    // The unit test must import from the compiled out/shared/ output,
    // not from src/ — otherwise it's not actually exercising the
    // shipped TypeScript output and could pass while production fails.
    if (!/out\/shared\/file-list-sort/.test(unitSrc) && !/out\\shared\\file-list-sort/.test(unitSrc) && !/out[\/\\]shared[\/\\]file-list-sort/.test(unitSrc)) {
        fail('tests/unit/file-list-sort.test.js must import the compiled module from out/shared/file-list-sort.js, not from src/');
        return;
    }
    ok('tests/unit/file-list-sort.test.js imports the compiled out/shared/file-list-sort.js');
})();

// ─── 4. Home page Quick Launch wires the command ────────────────────────

(function checkHomePageQuickLaunch() {
    // The Quick Launch grid in home-page.ts is the user's primary
    // entry point. The feature is technically usable via Ctrl+Shift+P
    // → cvs.tools.fileList without this, but the issue explicitly
    // asked for a one-click button.
    if (!/cmd:\s*['"]cvs\.tools\.fileList['"]/.test(homeSrc)) {
        fail('home-page.ts Quick Launch must include a button with cmd: \'cvs.tools.fileList\' — that\'s the one-click entry point the issue specified');
        return;
    }
    ok('home-page.ts Quick Launch includes the FileList button');
})();

(function checkHomePageOpenDirect() {
    // FileList must be in the OPEN_DIRECT list inside home-page.ts so
    // clicking the button calls the command directly instead of
    // routing through the launcher's runWithOutput shell. Without
    // this, the click would create an output panel for a webview
    // command, which is wrong.
    if (!/OPEN_DIRECT[\s\S]{0,800}cvs\.tools\.fileList/.test(homeSrc)) {
        fail('home-page.ts OPEN_DIRECT array must include cvs.tools.fileList — without it the Quick Launch click routes through the wrong handler');
        return;
    }
    ok('home-page.ts routes the FileList button through OPEN_DIRECT');
})();

// ─── 5. Catalog entry exists at the agreed dewey ────────────────────────

(function checkCatalogEntry() {
    // The launcher catalog must include cvs.tools.fileList so users
    // can find it via the guided launcher search. Dewey 700.020 was
    // assigned during implementation; if a future refactor reassigns
    // it, that's fine, but the entry itself must exist.
    if (!/['"]cvs\.tools\.fileList['"]/.test(catalogSrc)) {
        fail('cvs-command-launcher/catalog.ts must contain a cvs.tools.fileList entry so the command shows up in the guided launcher');
        return;
    }
    ok('cvs-command-launcher/catalog.ts has a cvs.tools.fileList entry');
})();

// ─── Result ──────────────────────────────────────────────────────────────

console.log('');
if (failed === 0) {
    console.log('REG-019 PASSED — FileList feature (issue #69) is fully wired in source');
    process.exit(0);
} else {
    console.error('REG-019 FAILED — ' + failed + ' check' + (failed > 1 ? 's' : '') + ' failed');
    process.exit(1);
}
