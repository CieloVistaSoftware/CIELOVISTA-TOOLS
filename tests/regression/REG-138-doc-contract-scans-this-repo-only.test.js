/**
 * REG-138-doc-contract-scans-this-repo-only.test.js
 *
 * Regression test for #725 — `npm run rebuild` could not finish.
 *
 * Two independent defects in tests/unit/doc-contract.test.ts, both of which
 * made the check lie about what it had inspected:
 *
 * 1. It walked every project in the developer's personal project-registry.json
 *    and held all of them to THIS repo's Dewey contract. wb-starter's
 *    docs/_today/CURRENT-STATUS.md is categorised "100.1 — Today", correct for
 *    wb-starter and wrong for this taxonomy, so the test failed, so
 *    `npm run rebuild` aborted before `node install.js`. No fix to this
 *    extension could be deployed until an unrelated repository was edited.
 *
 * 2. Its exclude list was matched with `fullPath.includes(name)`, and one of
 *    the names was 'worktrees'. Inside a git worktree every path below the root
 *    contains `.claude/worktrees/<name>/`, so every directory was skipped. The
 *    scan found 3 files instead of 81 and reported itself green. Every Claude
 *    session runs from a worktree, so the disabled scan was the normal case.
 *
 * Together those meant the check was red for a foreign repo's reasons in one
 * place and vacuously green in another, and never actually guarding this repo.
 *
 * This test is behavioural, not a source grep: it runs the real check and
 * asserts on what it reports. A source regex would not have caught defect 2,
 * because the source looked perfectly reasonable.
 *
 * Checks:
 *   1. doc-contract exits 0 — the rebuild chain can get past it
 *   2. it reports a realistic number of assertions — the scan is not empty
 *   3. it names no path outside this repository
 *
 * Run: node tests/regression/REG-138-doc-contract-scans-this-repo-only.test.js
 */
'use strict';

const cp   = require('child_process');
const fs   = require('fs');
const os   = require('os');
const path = require('path');

const ROOT     = path.resolve(__dirname, '..', '..');
const TARGET   = path.join(ROOT, 'tests', 'unit', 'doc-contract.test.ts');
const REGISTRY = path.join(os.homedir(), 'Downloads', 'CieloVistaStandards', 'project-registry.json');

let passed = 0;
let failed = 0;
const fail = (msg) => { console.error('  FAIL: ' + msg); failed++; };
const ok   = (msg) => { console.log('  PASS: ' + msg); passed++; };

/**
 * How many .md files in this repo end in a frontmatter block — the corpus
 * doc-contract is supposed to cover. Written independently of the check under
 * test: directory names are skipped as whole path segments, the definition
 * #725 settled on, so this count cannot be emptied by the substring bug.
 */
function countTrailerDocs(root) {
    const SKIP = new Set(['node_modules', '.git', 'worktrees', 'bin', '.vscode-test', 'out']);
    let n = 0;
    (function walk(dir) {
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) { if (!SKIP.has(e.name)) { walk(full); } continue; }
            if (!e.isFile() || !e.name.endsWith('.md')) { continue; }
            let text;
            try { text = fs.readFileSync(full, 'utf8').trimEnd(); } catch { continue; }
            if (!text.endsWith('---')) { continue; }
            const close = text.lastIndexOf('\n---');
            const open  = close > 0 ? text.lastIndexOf('\n---', close - 1) : -1;
            if (open === -1) { continue; }
            if (/^\w+:\s*\S/m.test(text.slice(open + 4, close))) { n++; }
        }
    })(root);
    return n;
}

console.log('\nREG-138: the doc contract check scans this repository, and all of it (#725)\n');

if (!fs.existsSync(TARGET)) {
    console.error('FATAL: doc-contract.test.ts not found at ' + TARGET);
    process.exit(1);
}

// The check needs the developer's personal registry to resolve this project's
// own Dewey hundreds, and skips itself without one. Where it skips there is no
// behaviour to assert, so assert the source property instead and say so.
const haveRegistry = fs.existsSync(REGISTRY) && !process.env.CI;

// ─── Run the real check ──────────────────────────────────────────────────────

const env = { ...process.env };
delete env.CI;

const run = cp.spawnSync(process.execPath, [TARGET], {
    cwd: ROOT,
    env: haveRegistry ? env : process.env,
    encoding: 'utf8',
});

const output = `${run.stdout || ''}${run.stderr || ''}`;

// ─── 1: it exits clean, so the rebuild chain survives it ─────────────────────

if (run.status !== 0) {
    fail(`doc-contract exited ${run.status} — npm run rebuild aborts here and never installs (#725)\n` +
         output.split('\n').filter(l => /FAIL|->/.test(l)).slice(0, 6).map(l => '        ' + l).join('\n'));
} else {
    ok('doc-contract exits 0 — the rebuild chain gets past it');
}

// ─── 2: the scan is not silently empty ───────────────────────────────────────

const summary = output.match(/(\d+) tests:/);

if (!haveRegistry) {
    ok('scan size not asserted — no personal project-registry.json here, the check skips itself');
} else if (!summary) {
    fail('doc-contract printed no "N tests:" summary — cannot tell whether it scanned anything');
} else {
    const count = parseInt(summary[1], 10);
    // Each document carrying the bottom frontmatter block gets 5 assertions,
    // plus one corpus-size test. The worktree bug scanned 3 documents where 81
    // existed. A fixed floor ("at least 100") went stale the moment #707 moved
    // src/ off the trailer, so count the documents independently and require
    // the check to have seen every one of them.
    const expectedDocs = countTrailerDocs(ROOT);
    const expected     = expectedDocs * 5 + 1;
    if (count !== expected) {
        fail(`doc-contract ran ${count} assertions; ${expectedDocs} document(s) carry the bottom ` +
             `block, which is ${expected} — the scan is not reaching every document, as when ` +
             'every path containing "worktrees" was excluded (#725)');
    } else {
        ok(`doc-contract ran ${count} assertions — all ${expectedDocs} documents with the bottom block`);
    }
}

// ─── 3: nothing outside this repository is named ─────────────────────────────

// The failure mode is a path from another CieloVista project appearing in the
// output. Match drive-absolute paths and keep the ones not under ROOT.
const foreign = [...output.matchAll(/[A-Za-z]:[\\/][^\s"'`)]+/g)]
    .map(m => m[0])
    .filter(p => !p.toLowerCase().startsWith(ROOT.toLowerCase()))
    .filter(p => !p.toLowerCase().startsWith(process.execPath.toLowerCase()));

if (foreign.length > 0) {
    fail('doc-contract reported on files outside this repository — a build here must not ' +
         'depend on another repo\'s markdown (#725):\n' +
         [...new Set(foreign)].slice(0, 5).map(p => '        ' + p).join('\n'));
} else {
    ok('doc-contract names no path outside this repository');
}

// ─── Result ──────────────────────────────────────────────────────────────────

console.log('');
if (failed === 0) {
    console.log(`✓ All ${passed} REG-138 tests passed\n`);
    process.exit(0);
} else {
    console.error(`\n✗ ${failed} REG-138 test(s) FAILED\n`);
    process.exit(1);
}
