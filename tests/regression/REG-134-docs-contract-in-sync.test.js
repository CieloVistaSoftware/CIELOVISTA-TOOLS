/**
 * REG-134-docs-contract-in-sync.test.js
 *
 * Guards the docs contract from #708.
 *
 * The previous documentation scheme asked for 13 hand-typed frontmatter fields
 * per file. That much metadata at the top buries the prose, so it was moved to
 * the BOTTOM of every file to get it out of the way — reasonable, but no
 * standard parser reads a trailer, so the identifiers became invisible. 82
 * docids were declared and 2 were ever referenced from another document (#707).
 * Nothing checked that a reference resolved, so nothing made an id worth having.
 *
 * The replacement is three fields at the top and a check that actually runs.
 * This test IS that check running in the suite — without it, "updates are simple
 * and done often" degrades into "the catalog is months stale" exactly as before.
 *
 * `docs-sync.js --check` writes nothing, so this test cannot mutate the shared
 * repo tree that ~140 concurrent tests are reading (REG-130 invariant 1).
 *
 * It enforces:
 *   - every document has id, title and description, at the TOP
 *   - no fourth field — the contract cannot creep back toward 13
 *   - ids are unique
 *   - every [[cross-reference]] resolves to a real document
 *   - every document lives in a section folder, and every section has a hub
 *   - the generated door listings and catalog.json are up to date
 *
 * Run: node tests/regression/REG-134-docs-contract-in-sync.test.js
 */
'use strict';

const cp   = require('child_process');
const fs   = require('fs');
const path = require('path');

const ROOT   = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'docs-sync.js');

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

console.log('\nREG-134: docs contract is satisfied and the catalog is in sync (#708)\n');

test('scripts/docs-sync.js exists', () => {
    assert(fs.existsSync(SCRIPT), 'scripts/docs-sync.js is missing — the docs contract has no enforcement');
});

test('docs/ satisfies the contract and the generated files are current', () => {
    const run = cp.spawnSync(process.execPath, [SCRIPT, '--check'], {
        cwd: ROOT, encoding: 'utf8',
    });

    if (run.error) { throw new Error(`could not run docs-sync.js: ${run.error.message}`); }

    const output = `${run.stdout || ''}${run.stderr || ''}`.trim();
    assert(run.status === 0,
        `docs contract violations (run \`npm run docs:sync\`):\n\n${output}\n`);
});

test('--check is read-only: it never dirties the tree', () => {
    // A gate that rewrites files cannot run inside a concurrent suite (REG-130).
    const before = cp.execSync('git status --porcelain -- docs', { cwd: ROOT, encoding: 'utf8' });
    cp.spawnSync(process.execPath, [SCRIPT, '--check'], { cwd: ROOT, encoding: 'utf8' });
    const after = cp.execSync('git status --porcelain -- docs', { cwd: ROOT, encoding: 'utf8' });
    assert(before === after, '`docs-sync.js --check` modified docs/ — it must validate without writing');
});

test('the three-field contract is enforced, not merely documented', () => {
    const src = fs.readFileSync(SCRIPT, 'utf8');
    const match = src.match(/ALLOWED_FIELDS\s*=\s*new Set\(\[([^\]]*)\]\)/);
    assert(match, 'docs-sync.js no longer declares ALLOWED_FIELDS');

    const fields = match[1].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean);
    assert(fields.length === 3,
        `the contract is three hand-written fields; found ${fields.length} (${fields.join(', ')}). `
        + 'Growing this set is how the old 13-field block came back.');
    for (const expected of ['id', 'title', 'description']) {
        assert(fields.includes(expected), `contract no longer includes \`${expected}\``);
    }
});

test('shipped-content READMEs are not treated as orphans', () => {
    // CommandHelp/*.README.md are copied into the VSIX by `copy:commandhelp` and
    // read at runtime, so they have no sibling .ts BY DESIGN. The orphan check
    // called them dead docs, they were deleted, and packaging broke on
    // `out/features/CommandHelp/ has >= 2 files` -- a failure the regression
    // suite does not catch, because test:pick is not part of it.
    const shipped = path.join(ROOT, 'src', 'features', 'CommandHelp');
    const files = fs.existsSync(shipped)
        ? fs.readdirSync(shipped).filter(f => f.endsWith('.README.md'))
        : [];
    assert(files.length >= 2,
        'src/features/CommandHelp/ must keep its shipped .README.md files — '
        + 'packaging requires at least two');

    const src = fs.readFileSync(SCRIPT, 'utf8');
    assert(/NOT_MODULE_DOCS/.test(src) && /CommandHelp/.test(src),
        'docs-sync.js no longer excludes shipped-content directories from the orphan '
        + 'check — it will delete CommandHelp again');

    const run = cp.spawnSync(process.execPath, [SCRIPT, '--check'], { cwd: ROOT, encoding: 'utf8' });
    const output = `${run.stdout || ''}${run.stderr || ''}`;
    assert(!/CommandHelp/.test(output),
        `docs-sync flags CommandHelp as an orphan:
${output}`);
});

console.log('─'.repeat(60));
if (failed === 0) {
    console.log(`✓ All ${passed} REG-134 tests passed\n`);
    process.exit(0);
} else {
    console.error(`\n✗ ${failed} REG-134 test(s) FAILED\n`);
    process.exit(1);
}
