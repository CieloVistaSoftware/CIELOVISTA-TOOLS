/**
 * REG-130-suite-shared-source-tree-isolation.test.js
 *
 * Regression test for issue #697 — "REG-001 fails under npm run rebuild but
 * passes standalone".
 *
 * Root cause: run-regression-tests.js launches every test concurrently against
 * ONE working tree. REG-015 wrote src/features/__reg015_test_feature.ts into
 * that shared tree, held it ~250ms, then unlinked it. Any sibling test that had
 * already listed src/ but had not yet read that path died with
 *   ENOENT ... src\features\__reg015_test_feature.ts
 * and the failure was reported against the innocent sibling (REG-001), aborting
 * the build at random.
 *
 * Two invariants keep that class of bug from coming back:
 *
 *   1. No test in the suite mutates the shared src/ tree. Fixtures belong in a
 *      temp sandbox, never in the tree 140 concurrent processes are scanning.
 *      (This assertion FAILS on the pre-fix REG-015.)
 *
 *   2. Source scans tolerate a file vanishing between the directory listing and
 *      the read. A readdir snapshot of a live working tree goes stale — editor
 *      saves, git checkouts, sibling processes — and that is not an assertion
 *      failure. Enforced against scripts/source-tree-walk.js, both directly and
 *      under a real concurrent create/delete storm in a temp directory.
 *
 * Run: node tests/regression/REG-130-suite-shared-source-tree-isolation.test.js
 */
'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const cp   = require('child_process');

const ROOT    = path.resolve(__dirname, '..', '..');
const SRC     = path.join(ROOT, 'src');
const REG_DIR = __dirname;

const walk = require(path.join(ROOT, 'scripts', 'source-tree-walk.js'));

let passed = 0, failed = 0;

function test(name, fn) {
    try { fn(); console.log(`  \u2713 ${name}`); passed++; }
    catch (err) {
        console.error(`  \u2717 ${name}`);
        console.error(`    \u2192 ${err.message.split('\n')[0]}`);
        err.message.split('\n').slice(1, 10).forEach(l => console.error(`      ${l}`));
        failed++;
    }
}

function assert(cond, msg) { if (!cond) { throw new Error(msg); } }

/** Blocking sleep — this test is synchronous by design (see the storm test). */
function sleepSync(ms) {
    const until = Date.now() + ms;
    while (Date.now() < until) { /* spin */ }
}

/**
 * Remove a temp tree, retrying while a just-killed child process still holds a
 * handle on it. On Windows an rmSync racing a dying writer returns EPERM.
 */
function rmTreeSync(dir) {
    for (let attempt = 0; attempt < 40; attempt++) {
        try { fs.rmSync(dir, { recursive: true, force: true }); return; }
        catch { sleepSync(100); }
    }
}

console.log('\nREG-130: Regression suite shared-source-tree isolation\n' + '\u2500'.repeat(60));

// ── 1. No suite test writes into the shared src/ tree ────────────────────────

test('No regression test writes, deletes or creates a path under src/', () => {
    // Any fs mutation whose target expression mentions src/ or a src-rooted
    // identifier. Deliberately broad: writing into the tree that every other
    // concurrent test is scanning is the defect, whatever the call.
    const MUTATORS = /(writeFileSync|writeFile|appendFileSync|unlinkSync|rmSync|rmdirSync|mkdirSync|renameSync|copyFileSync|createWriteStream)\s*\(\s*([^,)]*)/g;
    // Identifiers/paths that resolve inside the repo's own src/ tree.
    const SRC_TARGET = /\bSRC\b|SRC_DIR|SRC_ROOT|FEAT_DIR|TEST_FEAT|['"`][^'"`]*\bsrc[\\/]/;
    // A sandbox path is fine — those never touch the shared tree.
    const SANDBOX    = /tmpdir|mkdtemp|TMP\b|SANDBOX|sandbox|os\.tmpdir/;

    const offenders = [];
    for (const file of fs.readdirSync(REG_DIR)) {
        if (!/^REG-\d+.*\.test\.js$/.test(file)) { continue; }
        const full = path.join(REG_DIR, file);
        const src  = walk.readIfPresent(full);
        if (src === null) { continue; }
        let m;
        MUTATORS.lastIndex = 0;
        while ((m = MUTATORS.exec(src)) !== null) {
            const target = m[2];
            if (!SRC_TARGET.test(target) || SANDBOX.test(target)) { continue; }
            const line = src.slice(0, m.index).split('\n').length;
            offenders.push(`  ${file}:${line}  ${m[0].trim()}`);
        }
    }

    assert(offenders.length === 0,
        `Regression test(s) mutate the shared src/ tree while the suite runs concurrently:\n` +
        `${offenders.join('\n')}\n` +
        `This is issue #697: a sibling test lists src/, the fixture is unlinked, and the\n` +
        `sibling fails with ENOENT against a file it never owned.\n` +
        `FIX: create fixtures under fs.mkdtempSync(os.tmpdir()), never under src/.`);
});

// ── 2. The shared walker survives a vanished path ────────────────────────────

test('readIfPresent() returns null for a path that vanished, instead of throwing', () => {
    const gone = path.join(SRC, 'features', '__reg130_never_existed.ts');
    assert(!fs.existsSync(gone), 'test precondition: fixture path must not exist');
    const result = walk.readIfPresent(gone);
    assert(result === null, `expected null for a vanished path, got ${typeof result}`);
});

test('readSources() drops vanished paths and keeps the survivors', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reg130-'));
    try {
        const real = path.join(dir, 'real.ts');
        fs.writeFileSync(real, 'export const a = 1;\n', 'utf8');
        const stale = path.join(dir, 'stale.ts'); // never created — a stale snapshot entry

        const got = walk.readSources([real, stale], dir);
        assert(got.length === 1, `expected 1 surviving file, got ${got.length}`);
        assert(got[0].file === 'real.ts', `expected 'real.ts', got '${got[0].file}'`);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

// ── 3. The walker survives a real concurrent create/delete storm ─────────────

test('walkAndReadSources() never throws while files are created and deleted under it', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reg130-storm-'));
    try {
        // Enough files that the gap between the readdir snapshot and the reads
        // is wide enough for the transient file to disappear inside it.
        const nested = path.join(dir, 'features');
        fs.mkdirSync(nested, { recursive: true });
        for (let i = 0; i < 300; i++) {
            fs.writeFileSync(path.join(nested, `f${String(i).padStart(3, '0')}.ts`),
                '// filler\n'.repeat(120), 'utf8');
        }

        const transient = path.join(nested, '__transient_fixture.ts');

        // The churner MUST be a separate process. The walk is synchronous, so an
        // in-process timer would never fire while it runs — which is precisely
        // why the real bug needs two processes (REG-015 and REG-001) to appear.
        const churnScript = path.join(dir, 'churn.js');
        fs.writeFileSync(churnScript,
            "const fs = require('fs');\n" +
            "const target = process.argv[2];\n" +
            "const until  = Date.now() + Number(process.argv[3]);\n" +
            "let churns = 0;\n" +
            "while (Date.now() < until) {\n" +
            "  try {\n" +
            "    fs.writeFileSync(target, 'export const t = 1;\\n', 'utf8');\n" +
            "    fs.unlinkSync(target);\n" +
            "    churns++;\n" +
            "  } catch { /* raced with a reader */ }\n" +
            "}\n" +
            "process.stdout.write(String(churns));\n",
            'utf8');

        // The churner stops first so it has released every handle before the
        // temp tree is removed — on Windows an rmSync racing a live writer
        // fails with EPERM.
        const DURATION_MS = 3000;
        const churner = cp.spawn(process.execPath, [churnScript, transient, String(DURATION_MS - 500)],
            { cwd: dir, stdio: 'ignore' });

        try {
            const deadline = Date.now() + DURATION_MS;
            let scans = 0;
            while (Date.now() < deadline) {
                // A naive walker raises ENOENT here the moment the churner
                // unlinks between the listing and the read; the race-safe one
                // must simply not see the transient file.
                const got = walk.walkAndReadSources(nested, { extensions: ['.ts'], root: dir });
                assert(got.length >= 300, `walk lost real files: got ${got.length}, expected >= 300`);
                scans++;
            }
            assert(scans > 0, 'no scans completed — test is not exercising the walker');
            console.log(`    (${scans} concurrent scans against a churning tree, zero ENOENT)`);
        } finally {
            try { churner.kill(); } catch { /* already gone */ }
        }
    } finally {
        rmTreeSync(dir);
    }
});

// ── 4. The runner reports the failing assertion, not the suite banner ────────

test('Regression runner reports a child test\'s failing assertion, not its banner', () => {
    const runner = walk.readIfPresent(path.join(ROOT, 'scripts', 'run-regression-tests.js'));
    assert(runner !== null, 'scripts/run-regression-tests.js not found');
    assert(runner.includes('extractFailureDetail'),
        'run-regression-tests.js no longer extracts failure detail from child output — a red\n' +
        'build would report only the suite name (#697), which is unusable for diagnosis.');
    assert(/child\.on\('error'/.test(runner),
        'run-regression-tests.js does not handle child spawn errors — a spawn failure would\n' +
        'either crash the runner or be reported with no output at all.');
    // The old summary printed message.split('\n')[0] — the child's banner line.
    assert(!/f\.message\.split\('\\n'\)\[0\]/.test(runner),
        'final failure summary still prints only the first line of child output (the banner).');
});

console.log('\u2500'.repeat(60));
if (failed === 0) {
    console.log(`\u2713 All ${passed} REG-130 tests passed\n`);
    process.exit(0);
} else {
    console.error(`\n\u2717 ${failed} REG-130 test(s) FAILED\n`);
    process.exit(1);
}
