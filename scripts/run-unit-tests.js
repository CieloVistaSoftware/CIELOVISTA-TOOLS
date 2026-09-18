// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * run-unit-tests.js — build out-test/, then run EVERY unit test (#734).
 *
 *   node scripts/run-unit-tests.js            all of tests/unit/
 *   node scripts/run-unit-tests.js doc-header only files whose name contains "doc-header"
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
 * Every file in tests/unit/ runs. There is no list to keep in sync; a list is
 * how most of these tests fell out of every gate in the first place.
 */
'use strict';

const cp   = require('child_process');
const fs   = require('fs');
const os   = require('os');
const path = require('path');

const ROOT     = path.resolve(__dirname, '..');
const UNIT_DIR = path.join(ROOT, 'tests', 'unit');
const FILTER   = process.argv[2] || '';
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

const build = cp.spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build-test-modules.mjs')],
    { cwd: ROOT, encoding: 'utf8' });
if (build.status !== 0) {
    process.stderr.write(build.stdout + build.stderr);
    console.error('✗ build-test-modules failed — no unit test can run');
    process.exit(1);
}
process.stdout.write(build.stdout);

/**
 * Unit tests that `npm run rebuild` already runs as their own step, mapped to
 * that step. Some of them check what a LATER step produces — the packaged
 * .vsix (test:mcp-vsix), the installed copy (test:post-install) — so running
 * them here, before packaging, tests a stale artifact or none. They were green
 * locally only because a .vsix from an earlier rebuild was lying around; on a
 * clean CI runner they failed. Their own step is where they belong, and it
 * already gates the build. Derived from package.json, so there is no list here
 * to keep in sync.
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
        for (const m of body.matchAll(/tests\/unit\/([\w.-]+\.test\.(?:js|ts))/g)) {
            if (!owned.has(m[1])) { owned.set(m[1], name); }
        }
        for (const m of body.matchAll(/npm run ([\w:.-]+)/g)) { visit(m[1]); }
    })('rebuild');
    return owned;
}

const OWNED = testsOwnedByRebuildSteps();

const files = EXPLICIT ? [] : fs.readdirSync(UNIT_DIR)
    .filter(n => /\.test\.(js|ts)$/.test(n) && n.includes(FILTER))
    .sort();
for (const name of files.filter(n => OWNED.has(n))) {
    console.log(`  - ${name} — runs at its own rebuild step (npm run ${OWNED.get(name)})`);
}
/** Absolute paths of the test files to run. */
const toRun = EXPLICIT ? [EXPLICIT] : files.filter(n => !OWNED.has(n)).map(n => path.join(UNIT_DIR, n));

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
    console.log(`\n${results.length} unit test file(s): ${results.length - failed.length} passed, ${failed.length} failed`);

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
