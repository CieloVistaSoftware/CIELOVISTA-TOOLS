// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * run-unit-tests.js — build out/ and out-test/, then run EVERY unit test (#734)
 * and every top-level tests/*.test.js file (#736).
 *
 *   node scripts/run-unit-tests.js            all of tests/unit/ and tests/*.test.js
 *   node scripts/run-unit-tests.js doc-header only files whose name contains "doc-header"
 *   node scripts/run-unit-tests.js --list     print the files a full run would run, then
 *                                             exit without building (REG-146 reads this)
 *   node scripts/run-unit-tests.js tests/unit/x.test.js
 *                                             exactly that file, even one a rebuild
 *                                             step owns — this is how those steps
 *                                             run their test (#748)
 *
 * Two rules this runner exists to enforce:
 *
 * 1. Tests own their environment. The per-module build the tests require is
 *    produced here, every run, before any test starts. "Not compiled" is never
 *    a state a test can find itself in.
 *
 * 2. A skip for a missing build artifact is a FAILURE. For four months 54 test
 *    files printed "SKIP: not compiled" and exited 0, and every runner counted
 *    that as a pass. This runner reads the output: exit 0 plus a
 *    missing-artifact skip line fails the file.
 *
 * 3. One run per checkout at a time (#818). A second run's build deletes
 *    out-test/ while this run's tests load it, and they report false "not
 *    compiled" failures. The run takes scripts/lib/test-run-lock.js before it
 *    builds; a second run waits ("waiting for pid N"). A runner started
 *    inside the run that holds the lock (npm run rebuild, or a test that runs
 *    this runner) goes straight through, and skips a build its holder did.
 *
 * Every file in tests/unit/ and every *.test.js directly under tests/ runs.
 * There is no list to keep in sync; a list is how most of these tests fell out
 * of every gate in the first place. The top-level files were in no gate at
 * all until #736, and 11 of 31 had rotted unseen.
 */
'use strict';

const cp   = require('child_process');
const fs   = require('fs');
const os   = require('os');
const path = require('path');

const ROOT      = path.resolve(__dirname, '..');
const TESTS_DIR = path.join(ROOT, 'tests');
const UNIT_DIR  = path.join(TESTS_DIR, 'unit');
/** The directories a full run covers: tests/unit/ and the top level of tests/ (#736). */
const TEST_DIRS = [UNIT_DIR, TESTS_DIR];
const LIST_ONLY = process.argv.includes('--list');
const FILTER    = process.argv.slice(2).find(a => !a.startsWith('--')) || '';
/**
 * A test file path (tests/.../x.test.js) instead of a name filter: run exactly
 * that file. Every `npm run rebuild` step that runs a test goes through here
 * (#748). Those steps used to run `node tests/unit/x.test.js` directly, before
 * anything had built out-test/, so on a clean checkout the test printed
 * "SKIP: ... not found", exited 0, and the step passed without testing
 * anything. Through the runner the step builds its input first and a
 * missing-artifact skip fails it. REG-155 holds every rebuild step to this.
 */
const EXPLICIT = /^tests[\\/].+\.test\.(js|ts)$/.test(FILTER) ? path.resolve(ROOT, FILTER) : null;
if (EXPLICIT && !fs.existsSync(EXPLICIT)) {
    console.error(`✗ ${FILTER} does not exist — a step that names no test must not pass`);
    process.exit(1);
}
const TIMEOUT  = 180000;
const WORKERS  = Math.max(2, Math.min(8, os.cpus().length - 1));

const { skippedForMissingArtifact } = require('./lib/missing-artifact');
const { acquireTestRunLock, TestRunLockTimeout } = require('./lib/test-run-lock');

/**
 * Unit tests that `npm run rebuild` already runs as their own step, mapped to
 * that step. Some of them check what a LATER step produces — the packaged
 * .vsix (test:mcp-vsix), the installed copy (test:post-install) — so running
 * them here, before packaging, tests a stale artifact or none. They were green
 * locally only because a .vsix from an earlier rebuild was lying around; on a
 * clean CI runner they failed. Their own step is where they belong, and it
 * already gates the build. Derived from package.json, so there is no list here
 * to keep in sync. Keys are paths relative to tests/ ("unit/x.test.js" or
 * "install-verify.test.js").
 *
 * That step runs its file through this runner (`node scripts/run-unit-tests.js
 * tests/unit/x.test.js`, the EXPLICIT mode above), so the path still appears in
 * the step and is still found here: the full run skips it, its step runs it,
 * and every unit test runs exactly once in a rebuild (#748).
 */
function testsOwnedByRebuildSteps() {
    const scripts = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts || {};
    const owned = new Map();
    const seen = new Set();
    (function visit(name) {
        if (seen.has(name) || !scripts[name]) { return; }
        seen.add(name);
        const body = scripts[name];
        for (const m of body.matchAll(/tests\/((?:unit\/)?[\w.-]+\.test\.(?:js|ts))/g)) {
            if (!owned.has(m[1])) { owned.set(m[1], name); }
        }
        for (const m of body.matchAll(/npm run ([\w:.-]+)/g)) { visit(m[1]); }
    })('rebuild');
    return owned;
}

const OWNED = testsOwnedByRebuildSteps();

/** Every test file a full run covers, as paths relative to tests/ (forward slashes). */
function discoverTests() {
    const out = [];
    for (const dir of TEST_DIRS) {
        const rel = path.relative(TESTS_DIR, dir).split(path.sep).join('/');
        for (const n of fs.readdirSync(dir)) {
            if (!/\.test\.(js|ts)$/.test(n) || !fs.statSync(path.join(dir, n)).isFile()) { continue; }
            out.push(rel ? `${rel}/${n}` : n);
        }
    }
    return out;
}

const files = EXPLICIT ? [] : discoverTests()
    .filter(n => path.basename(n).includes(FILTER))
    .sort();
for (const name of files.filter(n => OWNED.has(n))) {
    console.log(`  - ${name} — runs at its own rebuild step (npm run ${OWNED.get(name)})`);
}
/** Absolute paths of the test files to run. */
const toRun = EXPLICIT ? [EXPLICIT] : files.filter(n => !OWNED.has(n)).map(n => path.join(TESTS_DIR, ...n.split('/')));

if (LIST_ONLY) {
    for (const file of toRun) { console.log(path.relative(ROOT, file).split(path.sep).join('/')); }
    process.exit(0);
}

/**
 * The shipped build (esbuild.mjs -> out/ and mcp-server/dist/). Several
 * top-level tests read it: the per-file bundles under out/features/, the MCP
 * helpers under mcp-server/dist/. A missing or stale copy is rebuilt, so a
 * test never reads an old build (#736, #753).
 *
 * A CURRENT copy is left alone (#781). npm run rebuild packages the extension
 * (vscode:prepublish = esbuild --production) and then runs more test steps
 * through this runner. Rebuilding unconditionally replaced the production
 * bundle it had just packaged with a dev build, and install.js then compared
 * the installed bundle against that dev build and reported a false STALE
 * INSTALL on every deploy.
 */
const SHIPPED_OUTPUTS = [path.join(ROOT, 'out', 'extension.js'), path.join(ROOT, 'mcp-server', 'dist', 'index.js')];
const SHIPPED_INPUTS  = [path.join(ROOT, 'src'), path.join(ROOT, 'mcp-server', 'src'), path.join(ROOT, 'esbuild.mjs')];

function newestMtime(target) {
    let st;
    try { st = fs.statSync(target); } catch { return 0; }
    if (!st.isDirectory()) { return st.mtimeMs; }
    let newest = st.mtimeMs;
    for (const e of fs.readdirSync(target, { withFileTypes: true })) {
        newest = Math.max(newest, newestMtime(path.join(target, e.name)));
    }
    return newest;
}

function shippedBuildIsCurrent() {
    const oldestOutput = Math.min(...SHIPPED_OUTPUTS.map(f => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } }));
    if (!oldestOutput) { return false; }
    return SHIPPED_INPUTS.every(input => newestMtime(input) <= oldestOutput);
}

/** Build out/ (when stale) and out-test/ (always). Exits the process on a build failure. */
function buildTestInputs() {
    if (shippedBuildIsCurrent()) {
        console.log('  out/ and mcp-server/dist/ are newer than their sources: left as built');
    } else {
        const shipped = cp.spawnSync(process.execPath, [path.join(ROOT, 'esbuild.mjs')],
            { cwd: ROOT, encoding: 'utf8' });
        if (shipped.status !== 0) {
            process.stderr.write(shipped.stdout + shipped.stderr);
            console.error('✗ esbuild.mjs failed — no test that reads out/ can run');
            process.exit(1);
        }
        console.log('  built out/ and mcp-server/dist/ (esbuild.mjs)');
    }

    const build = cp.spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build-test-modules.mjs')],
        { cwd: ROOT, encoding: 'utf8' });
    if (build.status !== 0) {
        process.stderr.write(build.stdout + build.stderr);
        console.error('✗ build-test-modules failed — no unit test can run');
        process.exit(1);
    }
    process.stdout.write(build.stdout);
}


function runOne(file) {
    const name = path.relative(ROOT, file).split(path.sep).join('/').replace(/^tests\/unit\//, '');
    return new Promise(resolve => {
        const started = Date.now();
        const child = cp.spawn(process.execPath, [file], { cwd: ROOT });
        let out = '';
        child.stdout.on('data', d => { out += d; });
        child.stderr.on('data', d => { out += d; });
        const timer = setTimeout(() => { child.kill(); out += `\n[killed after ${TIMEOUT / 1000}s]`; }, TIMEOUT);
        child.on('close', code => {
            clearTimeout(timer);
            const skipped = skippedForMissingArtifact(out);
            const ok = code === 0 && !skipped;
            resolve({ name, ok, code, skipped, out, ms: Date.now() - started });
        });
    });
}

/**
 * Tracked files whose working-tree content differs from HEAD, with a hash of
 * each. Two tests had been rewriting tracked files as a side effect — one
 * deleted committed fixtures, one overwrote package.json with corrupted JSON
 * and restored it afterwards — so the suite checks it leaves the tree as it
 * found it. Null when git is unavailable (no check rather than a false alarm).
 */
function trackedChanges() {
    const r = cp.spawnSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: ROOT, encoding: 'utf8' });
    if (r.status !== 0) { return null; }
    const out = new Map();
    for (const line of r.stdout.split(/\r?\n/).filter(Boolean)) {
        const file = line.slice(3).trim();
        let digest = 'deleted';
        try { digest = require('crypto').createHash('sha1').update(fs.readFileSync(path.join(ROOT, file))).digest('hex'); }
        catch { /* deleted */ }
        out.set(file, digest);
    }
    return out;
}

(async () => {
    // One run per checkout, from the build to the last result (#818): a second
    // run's build deletes out-test/ while this one's tests are loading it.
    let lock;
    try { lock = await acquireTestRunLock(ROOT); }
    catch (e) {
        if (!(e instanceof TestRunLockTimeout)) { throw e; }
        console.error(`✗ ${e.message}`);
        process.exit(1);
    }
    if (lock.nested && lock.built) {
        console.log(`  out/ and out-test/ were built by the run that holds this checkout (pid ${lock.holder.pid}): left as built`);
    } else {
        buildTestInputs();
        lock.markBuilt();
    }

    const before = trackedChanges();
    const results = [];
    const queue = [...toRun];
    await Promise.all(Array.from({ length: WORKERS }, async () => {
        while (queue.length) { results.push(await runOne(queue.shift())); }
    }));
    results.sort((a, b) => a.name.localeCompare(b.name));

    for (const r of results) {
        // A rebuild step runs one file; its log shows that test's own output.
        if (EXPLICIT) { process.stdout.write(r.out.endsWith('\n') ? r.out : `${r.out}\n`); }
        if (r.ok) { console.log(`  ✓ ${r.name}`); continue; }
        const why = r.skipped ? 'SKIPPED for a missing build artifact — counts as a failure (#734)'
                              : `exit ${r.code}`;
        console.log(`  ✗ ${r.name} — ${why}`);
        const tail = r.out.trim().split(/\r?\n/).filter(l => /fail|✗|error|assert|skip/i.test(l)).slice(0, 8);
        for (const line of tail) { console.log(`      ${line.slice(0, 200)}`); }
    }
    const failed = results.filter(r => !r.ok);
    console.log(`\n${results.length} test file(s) (tests/unit/ and tests/*.test.js): ${results.length - failed.length} passed, ${failed.length} failed`);

    const after = trackedChanges();
    const touched = before && after
        ? [...new Set([...before.keys(), ...after.keys()])].filter(f => before.get(f) !== after.get(f))
        : [];
    if (touched.length) {
        console.log(`\n✗ the unit suite changed ${touched.length} tracked file(s) — a test must not write into the repo:`);
        for (const f of touched) { console.log(`    ${f}`); }
    }
    process.exit(failed.length || touched.length ? 1 : 0);
})();
