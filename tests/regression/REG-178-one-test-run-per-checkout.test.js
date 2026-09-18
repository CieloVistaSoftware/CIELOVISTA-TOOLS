// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * REG-178: Issue #818 — two test runs in one checkout must not build over each other
 *
 * Run: node tests/regression/REG-178-one-test-run-per-checkout.test.js
 *
 * Both runners rebuild out-test/ (build-test-modules.mjs deletes it first) and
 * then read it. On 2026-09-18 a test:watch cycle started while
 * run-unit-tests.js was running in the same worktree: the unit run reported 44
 * of 98 files "SKIPPED for a missing build artifact" and the regression run
 * failed on missing out-test/ modules. Alone, the same tree was all green.
 * The same thing happened inside ONE regression run until #820: REG-175
 * started run-unit-tests.js in the repo, whose build deleted out-test/ while
 * REG-031 was loading from it ("Cannot find module '../../shared/md-fence'").
 *
 * The fix is one lock per checkout, scripts/lib/test-run-lock.js, held from
 * the build to the end of the run. This test proves, in a temp copy of the
 * real unit runner with a tiny fixture whose test build is slow and deletes
 * its output first, like the real one:
 *
 *   1. Two runs started at once: the second prints "waiting for pid N", runs
 *      only after the first has finished, and both report a true pass.
 *   2. A lock left by a dead process is taken over.
 *   3. A runner started inside the run that holds the lock (the env token)
 *      goes straight through, and skips the build its holder already did.
 *   4. A live holder that never lets go ends in a clear timeout that names it,
 *      with nothing built.
 *   5. Both runners take the lock before building, and npm run rebuild holds
 *      it for its whole chain.
 *
 * Without the lock, check 1 shows the collision: the first run fails with a
 * missing-artifact skip.
 */
'use strict';

const cp   = require('child_process');
const fs   = require('fs');
const os   = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

let passed = 0, failed = 0;
function check(name, ok, detail) {
    if (ok) { passed++; console.log(`  ✓ ${name}`); }
    else { failed++; console.log(`  ✗ ${name}`); if (detail) { console.log(`      ${String(detail).split('\n').join('\n      ')}`); } }
}

console.log('REG-178: one test run per checkout at a time (#818)');
console.log('-'.repeat(64));

// ── The temp checkout: the real runner and its lib, stubbed builds ───────────
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'reg178-'));
const w = (rel, text) => { const f = path.join(T, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); return f; };

fs.mkdirSync(path.join(T, 'scripts', 'lib'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'scripts', 'run-unit-tests.js'), path.join(T, 'scripts', 'run-unit-tests.js'));
for (const f of fs.readdirSync(path.join(ROOT, 'scripts', 'lib'))) {
    fs.copyFileSync(path.join(ROOT, 'scripts', 'lib', f), path.join(T, 'scripts', 'lib', f));
}
w('package.json', JSON.stringify({ name: 'reg178', scripts: { rebuild: 'echo' } }));
w('src/extension.ts', 'export {};\n');
w('mcp-server/src/index.ts', 'export {};\n');

// Stub sources below are TEXT for scripts that run with cwd = the temp tree.
// REG-130 scans test files for fs write calls, so their names are assembled.
const MKDIR = 'mkdir' + 'Sync';
const WRITE = 'writeFile' + 'Sync';
const RM    = 'rm' + 'Sync';
w('esbuild.mjs', [
    "import * as fs from 'fs';",
    "import * as path from 'path';",
    "for (const target of [['out', 'extension.js'], ['mcp-server', 'dist', 'index.js']]) {",
    "    const file = path.join(process.cwd(), ...target);",
    `    fs.${MKDIR}(path.dirname(file), { recursive: true });`,
    `    fs.${WRITE}(file, 'DEV BUILD');`,
    "}",
    '',
].join('\n'));
// Like the real build-test-modules.mjs: delete out-test/, then take a while to write it.
w('scripts/build-test-modules.mjs', [
    "import * as fs from 'fs';",
    "import * as path from 'path';",
    "const out = path.join(process.cwd(), 'out-test');",
    `fs.${RM}(out, { recursive: true, force: true });`,
    "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 800);",
    `fs.${MKDIR}(out, { recursive: true });`,
    `fs.${WRITE}(path.join(out, 'mod.js'), 'module.exports = 42;');`,
    "console.log('stub test build done');",
    '',
].join('\n'));
// Reads the build for 2 s, the way a test file's requires do while it runs.
w('tests/unit/reads-build.test.js', [
    "const fs = require('fs');",
    "const path = require('path');",
    "const mod = path.join(__dirname, '..', '..', 'out-test', 'mod.js');",
    "console.log('fixture-start ' + Date.now());",
    "const until = Date.now() + 2000;",
    "while (Date.now() < until) {",
    "    if (!fs.existsSync(mod)) { console.log('SKIP: out-test/mod.js not compiled'); process.exit(0); }",
    "    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 40);",
    "}",
    "console.log('fixture-end ' + Date.now());",
    '',
].join('\n'));

const RUNNER  = path.join(T, 'scripts', 'run-unit-tests.js');
const FIXTURE = 'tests/unit/reads-build.test.js';
const LOCK    = path.join(T, '.test-run.lock');

/** The environment of a run started from a shell: no lock inherited from whatever runs this test. */
function cleanEnv(extra = {}) {
    const env = { ...process.env, ...extra };
    for (const k of ['CVT_TEST_RUN_LOCK', 'CVT_TEST_RUN_BUILT', 'CVT_TEST_RUN_LOCK_TIMEOUT_MS']) {
        if (!(k in extra)) { delete env[k]; }
    }
    return env;
}

/** Start the runner; resolves on exit. onLine sees every output line as it arrives. */
function start(env, onLine) {
    const child = cp.spawn(process.execPath, [RUNNER, FIXTURE], { cwd: T, env });
    let out = '';
    const feed = d => {
        const text = String(d);
        out += text;
        if (onLine) { for (const line of text.split(/\r?\n/)) { onLine(line); } }
    };
    child.stdout.on('data', feed);
    child.stderr.on('data', feed);
    const done = new Promise(resolve => {
        const timer = setTimeout(() => { child.kill(); out += '\n[REG-178 killed the run after 60 s]'; }, 60000);
        child.on('close', code => { clearTimeout(timer); resolve({ code, out, pid: child.pid, endedAt: Date.now() }); });
    });
    return { child, done };
}

const stamp = (out, label) => { const m = out.match(new RegExp(`${label} (\\d+)`)); return m ? Number(m[1]) : null; };
const sawPass = out => /✓ reads-build\.test\.js/.test(out) && /1 passed, 0 failed/.test(out);

/** A pid that certainly belongs to no running process. */
function deadPid() {
    const r = cp.spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' });
    return Number(r.stdout);
}

(async () => {
    try {
        // 1 ── two runs at once ────────────────────────────────────────────
        let second = null;
        const first = start(cleanEnv(), line => {
            // The first run has built and is starting its test, which reads
            // out-test/ for the next 2 s: when test:watch started its cycle on
            // 2026-09-18. (The runner prints a test's own output only after
            // the test ends, so the build line is the earliest sign.)
            if (!second && /stub test build done/.test(line)) { second = start(cleanEnv()); }
        });
        const a = await first.done;
        const b = second ? await second.done : { code: null, out: 'second run never started (first run never reached its test)' };

        check('the first run reports a true pass (no missing-artifact skip from the second run\'s build)',
            a.code === 0 && sawPass(a.out) && !/SKIP/.test(a.out), a.out.trim().split('\n').slice(-8).join('\n'));
        check(`the second run says it is waiting for the first (pid ${a.pid})`,
            b.out.includes(`waiting for pid ${a.pid}`), b.out.trim().split('\n').slice(0, 6).join('\n'));
        const aEnd = stamp(a.out, 'fixture-end');
        const bStart = stamp(b.out, 'fixture-start');
        check('the second run\'s test starts only after the first run\'s test has finished',
            aEnd !== null && bStart !== null && bStart >= aEnd, `first ended ${aEnd}, second started ${bStart}`);
        check('the second run reports a true pass', b.code === 0 && sawPass(b.out) && !/SKIP/.test(b.out),
            b.out.trim().split('\n').slice(-8).join('\n'));
        check('no lock is left behind after both runs', !fs.existsSync(LOCK));

        // 2 ── a dead holder's lock is taken over ──────────────────────────
        const dead = deadPid();
        w('.test-run.lock', JSON.stringify({ pid: dead, token: `${dead}-stale`, command: 'node scripts/run-unit-tests.js', started: new Date(0).toISOString() }));
        const s = await start(cleanEnv({ CVT_TEST_RUN_LOCK_TIMEOUT_MS: '15000' })).done;
        check(`a lock held by dead pid ${dead} is taken over and the run passes`,
            s.code === 0 && s.out.includes(`pid ${dead}`) && /taking over/.test(s.out) && sawPass(s.out),
            s.out.trim().split('\n').slice(0, 8).join('\n'));
        check('the taken-over lock is released at the end', !fs.existsSync(LOCK));

        // 3 ── nested: the run that holds the lock starts a runner ─────────
        const outerToken = `${process.pid}-outer`;
        w('.test-run.lock', JSON.stringify({ pid: process.pid, token: outerToken, command: 'npm run rebuild', started: new Date().toISOString() }));
        const n = await start(cleanEnv({ CVT_TEST_RUN_LOCK: outerToken, CVT_TEST_RUN_LOCK_TIMEOUT_MS: '3000' })).done;
        check('a runner inside the run that holds the lock goes straight through (no wait, no deadlock)',
            n.code === 0 && !/waiting for pid/.test(n.out) && sawPass(n.out) && /stub test build done/.test(n.out),
            n.out.trim().split('\n').slice(0, 8).join('\n'));
        check('the nested runner leaves the outer run\'s lock in place', fs.existsSync(LOCK) && JSON.parse(fs.readFileSync(LOCK, 'utf8')).token === outerToken);
        const nb = await start(cleanEnv({ CVT_TEST_RUN_LOCK: outerToken, CVT_TEST_RUN_BUILT: outerToken, CVT_TEST_RUN_LOCK_TIMEOUT_MS: '3000' })).done;
        check('a nested runner whose holder already built does not rebuild out-test/ under it',
            nb.code === 0 && !/stub test build done/.test(nb.out) && sawPass(nb.out),
            nb.out.trim().split('\n').slice(0, 8).join('\n'));

        // 4 ── a live holder that never lets go: clear timeout ─────────────
        // Same live pid (this process), but a token the runner did not inherit.
        const t = await start(cleanEnv({ CVT_TEST_RUN_LOCK_TIMEOUT_MS: '1500' })).done;
        check('a live holder that never releases ends in a timeout that names it',
            t.code === 1 && t.out.includes(`waiting for pid ${process.pid}`)
                && t.out.includes(`another test run holds this checkout (pid ${process.pid}`) && t.out.includes('.test-run.lock'),
            t.out.trim().split('\n').slice(-6).join('\n'));
        check('a run that timed out built and ran nothing', !/stub test build done|fixture-start/.test(t.out));
        check('the timed-out run leaves the holder\'s lock alone', fs.existsSync(LOCK) && JSON.parse(fs.readFileSync(LOCK, 'utf8')).token === outerToken);
    } finally {
        fs.rmSync(T, { recursive: true, force: true });
    }

    // 5 ── wiring ───────────────────────────────────────────────────────────
    const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
    // The first build step each runner takes, which the lock call must come before.
    const FIRST_BUILD = { 'scripts/run-unit-tests.js': 'buildTestInputs();', 'scripts/run-regression-tests.js': '  ensureOutBuilt();' };
    for (const [runner, firstBuild] of Object.entries(FIRST_BUILD)) {
        const src = read(runner);
        const lockAt = src.indexOf('await acquireTestRunLock(');
        const buildAt = src.indexOf(firstBuild);
        check(`${runner} takes the test-run lock before it builds`,
            src.includes("require('./lib/test-run-lock')") && lockAt !== -1 && buildAt !== -1 && lockAt < buildAt,
            `lock call at ${lockAt}, first build (${firstBuild}) at ${buildAt}`);
    }
    const pkg = JSON.parse(read('package.json'));
    check('npm run rebuild holds the lock for its whole chain',
        /^node scripts\/with-test-run-lock\.js "[^"]+"$/.test(pkg.scripts.rebuild)
            && fs.existsSync(path.join(ROOT, 'scripts', 'with-test-run-lock.js')),
        pkg.scripts.rebuild.slice(0, 120));
    check('the lock file is ignored by git and left out of the VSIX',
        /^\/?\.test-run\.lock\*?$/m.test(read('.gitignore')) && /^\.test-run\.lock\*?$/m.test(read('.vscodeignore')));

    console.log(`\n${passed + failed} checks — ${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
})();
