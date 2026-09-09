/**
 * REG-131-extension-package-json-depth-independent.test.js
 *
 * Regression test for issue #677 — "[JSON_PARSE_ERROR] Failed to load
 * package.json for command ID validation".
 *
 * Root cause: modules resolved the extension's own package.json by joining a
 * FIXED number of '..' segments onto __dirname. esbuild emits the same source at
 * two different depths:
 *
 *   out/extension.js            → __dirname = <ext>/out
 *   out/features/home-page.js   → __dirname = <ext>/out/features
 *
 * so no fixed depth can be correct in both builds.
 *
 *   • link-integrity-checker.ts used '../../package.json'. Bundled into
 *     out/extension.js that resolved to <ext>/../package.json — i.e.
 *     .vscode-insiders/extensions/package.json — and threw the reported
 *     ENOENT, leaving commandIds empty so every command: link silently
 *     skipped validation.
 *   • home-page.ts used '../package.json'. Correct inside out/extension.js,
 *     but the standalone out/features/home-page.js resolved <ext>/out/package.json,
 *     which does not exist — buildGroupedCommands returned {} and the Home page
 *     listed no commands at all. tests/home-page-visible-commands.test.js fails
 *     on the pre-fix build; it is not part of this suite, so nothing caught it.
 *
 * Fix: shared/extension-package.ts walks UP from __dirname until it finds a
 * package.json whose name is "cielovista-tools" — correct from any depth, in a
 * source checkout and in an installed extension alike.
 *
 * Invariants:
 *   1. The helper resolves the extension root from the bundled depth (out/).
 *   2. The helper resolves it from the standalone depth (out/features/), with a
 *      DIFFERENT package.json sitting one level above the extension — the shape
 *      of a real ~/.vscode-insiders/extensions install that produced #677.
 *   3. It returns nothing rather than a wrong answer when no owning package.json
 *      exists above the caller.
 *   4. No source file reaches the extension package.json by fixed-depth
 *      __dirname arithmetic.
 *
 * Fixtures are built in os.tmpdir() — the shared repo tree is never written to
 * (REG-130 invariant 1).
 *
 * Run: node tests/regression/REG-131-extension-package-json-depth-independent.test.js
 */
'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC  = path.join(ROOT, 'src');

let passed = 0, failed = 0;

function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  ✓ ${name}`);
    } catch (err) {
        failed++;
        console.error(`  ✗ ${name}\n      ${err && err.message}`);
    }
}

function assert(cond, message) {
    if (!cond) { throw new Error(message); }
}

// ─── Sandbox ──────────────────────────────────────────────────────────────────
// Mirrors an installed extension:
//   <sandbox>/extensions/                                   ← NO package.json here
//   <sandbox>/extensions/cielovistasoftware.cielovista-tools-1.0.3/package.json
//   <sandbox>/extensions/.../out/            and  .../out/features/

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'reg131-'));
const extsDir = path.join(sandbox, 'extensions');
const extDir  = path.join(extsDir, 'cielovistasoftware.cielovista-tools-1.0.3');
const outDir  = path.join(extDir, 'out');
const featDir = path.join(outDir, 'features');

fs.mkdirSync(featDir, { recursive: true });

const FIXTURE_COMMANDS = [
    { command: 'cvs.fixture.alpha', title: 'Fixture: Alpha' },
    { command: 'cvs.fixture.beta',  title: 'Fixture: Beta'  },
];

fs.writeFileSync(path.join(extDir, 'package.json'), JSON.stringify({
    name: 'cielovista-tools',
    contributes: { commands: FIXTURE_COMMANDS },
}, null, 2));

// A DIFFERENT, non-owning package.json one level above the extension. The
// pre-fix '../../' walk landed exactly here; if the helper ever reads this one
// it must be treated as "not ours" and the walk must continue past it.
fs.writeFileSync(path.join(extsDir, 'package.json'), JSON.stringify({
    name: 'some-other-package',
    contributes: { commands: [{ command: 'not.ours', title: 'Wrong' }] },
}, null, 2));

// Compile the helper to plain CJS by stripping TypeScript-only syntax. The file
// is deliberately dependency-free (no vscode import), which keeps this viable.
const helperSrc = fs.readFileSync(path.join(SRC, 'shared', 'extension-package.ts'), 'utf8');

const helperCjs = helperSrc
    .replace(/^import \* as (\w+)\s+from '([^']+)';$/gm, "const $1 = require('$2');")
    .replace(/^export function /gm, 'function ')
    .replace(/: Record<string, any> \| undefined/g, '')
    .replace(/: Array<Record<string, any>>/g, '')
    .replace(/: string \| undefined/g, '')
    .replace(/: Set<string>/g, '')
    .replace(/startDir: string = __dirname/g, 'startDir = __dirname')
    .replace(/new Set<string>\(\)/g, 'new Set()')
    + '\nmodule.exports = { resolveExtensionRoot, readExtensionPackageJson,'
    + ' getContributedCommands, getContributedCommandIds };\n';

// If the helper ever grows a dependency or syntax this crude transform cannot
// handle, fail loudly rather than silently testing a broken stub. Comments are
// stripped first: prose like "<ext>/out" is not leftover TypeScript.
const helperCode = helperCjs
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

assert(!/\bexport\b|:\s*[A-Za-z_]+\s*</.test(helperCode),
    'REG-131 could not transpile shared/extension-package.ts — update the transform');

function loadHelperAt(dirname) {
    // Evaluate the helper with __dirname bound to the requested depth.
    const module = { exports: {} };
    const fn = new Function('module', 'exports', 'require', '__dirname', helperCjs);
    fn(module, module.exports, require, dirname);
    return module.exports;
}

console.log('\nREG-131: extension package.json resolves from any bundle depth (#677)\n');

// ─── Invariant 1 — bundled depth (out/) ───────────────────────────────────────

test('resolves the extension root from out/ (the out/extension.js bundle depth)', () => {
    const helper = loadHelperAt(outDir);
    assert(helper.resolveExtensionRoot(outDir) === extDir,
        `expected ${extDir}, got ${helper.resolveExtensionRoot(outDir)}`);
});

test('reads contributed command IDs from out/ — the exact #677 failure path', () => {
    const helper = loadHelperAt(outDir);
    const ids = helper.getContributedCommandIds(outDir);
    assert(ids.size === 2, `expected 2 command IDs, got ${ids.size}`);
    assert(ids.has('cvs.fixture.alpha') && ids.has('cvs.fixture.beta'),
        'did not read the extension\'s own contributed commands');
    assert(!ids.has('not.ours'),
        'read the WRONG package.json — walked into the extensions-root package.json (#677)');
});

// ─── Invariant 2 — standalone depth (out/features/) ───────────────────────────

test('resolves the extension root from out/features/ (standalone bundle depth)', () => {
    const helper = loadHelperAt(featDir);
    assert(helper.resolveExtensionRoot(featDir) === extDir,
        `expected ${extDir}, got ${helper.resolveExtensionRoot(featDir)}`);
});

test('same command IDs from both depths — the depth cannot change the answer', () => {
    const fromOut  = loadHelperAt(outDir).getContributedCommandIds(outDir);
    const fromFeat = loadHelperAt(featDir).getContributedCommandIds(featDir);
    assert(fromOut.size === fromFeat.size,
        `bundled depth saw ${fromOut.size} commands, standalone depth saw ${fromFeat.size}`);
    for (const id of fromOut) {
        assert(fromFeat.has(id), `command ${id} visible at one depth but not the other`);
    }
});

// ─── Invariant 3 — no owning package.json above the caller ────────────────────

test('returns undefined rather than a wrong root when no owning package.json exists', () => {
    const orphan = fs.mkdtempSync(path.join(os.tmpdir(), 'reg131-orphan-'));
    const deep   = path.join(orphan, 'a', 'b');
    fs.mkdirSync(deep, { recursive: true });
    const helper = loadHelperAt(deep);
    assert(helper.resolveExtensionRoot(deep) === undefined,
        'resolved a root even though no cielovista-tools package.json sits above the caller');
    assert(helper.getContributedCommandIds(deep).size === 0,
        'returned command IDs with no extension package.json in scope');
    fs.rmSync(orphan, { recursive: true, force: true });
});

// ─── Invariant 4 — no fixed-depth __dirname arithmetic in source ──────────────

test('no source file reaches package.json by fixed-depth __dirname arithmetic', () => {
    const offenders = [];

    (function walk(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) { walk(full); continue; }
            if (!entry.name.endsWith('.ts')) { continue; }

            let text;
            try {
                text = fs.readFileSync(full, 'utf8');
            } catch (err) {
                // A file may vanish between listing and read (REG-130 invariant 2).
                if (err && err.code === 'ENOENT') { continue; }
                throw err;
            }

            text.split('\n').forEach((line, i) => {
                // path.join/resolve(__dirname, ...'package.json') — any depth.
                if (/path\.(join|resolve)\(\s*__dirname\s*,[^)]*package\.json/.test(line)) {
                    offenders.push(`${path.relative(ROOT, full)}:${i + 1}`);
                }
            });
        }
    })(SRC);

    assert(offenders.length === 0,
        'these resolve the extension package.json at a fixed depth and break in one of the two ' +
        'esbuild outputs — use shared/extension-package instead:\n      ' + offenders.join('\n      '));
});

fs.rmSync(sandbox, { recursive: true, force: true });

console.log('─'.repeat(60));
if (failed === 0) {
    console.log(`✓ All ${passed} REG-131 tests passed\n`);
    process.exit(0);
} else {
    console.error(`\n✗ ${failed} REG-131 test(s) FAILED\n`);
    process.exit(1);
}
