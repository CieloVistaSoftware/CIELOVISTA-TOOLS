// Copyright (c) CieloVista Software. All rights reserved.
// REG-155: Issue #748 — a rebuild step that runs a test cannot skip green
//
// Run: node tests/regression/REG-155-rebuild-test-steps-cannot-skip-green.test.js
//
// npm run rebuild ran 18 tests as their own steps with a bare
// "node tests/unit/x.test.js". Nothing had built out-test/ at that point, so on
// a clean checkout test:mcp-status printed "SKIP: ... not found", exited 0, and
// the step passed without testing anything. The unit runner, which builds
// out-test/ and fails a missing-artifact skip (#734), deliberately leaves those
// files to their steps, so nothing caught it.
//
// Guards, all derived from package.json (no list here to keep in sync):
//   1. Every command in the rebuild chain that names a test file runs it
//      through the unit runner: node scripts/run-unit-tests.js tests/.../x.test.js
//   2. Every script a rebuild step runs that spawns test files applies the
//      shared missing-artifact rule (scripts/lib/missing-artifact.js).
//   3. Every test a rebuild step names is named by exactly one step, and the
//      full unit run leaves it to that step: it runs exactly once.
//   4. Behaviour, in a temp copy of the repo with no out-test/:
//      a. the test:mcp-status step builds its input and really runs;
//      b. with the test build made a no-op, the same step FAILS, not skips.

'use strict';

const cp   = require('child_process');
const fs   = require('fs');
const os   = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const { skippedForMissingArtifact } = require(path.join(ROOT, 'scripts', 'lib', 'missing-artifact.js'));

let passed = 0;
let failed = 0;
function check(name, ok, detail) {
    if (ok) { console.log(`  PASS ${name}`); passed += 1; }
    else    { console.error(`  FAIL ${name}\n       ${detail}`); failed += 1; }
}

console.log('REG-155: rebuild steps that run a test cannot skip green (#748)');
console.log('-'.repeat(64));

const scripts = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts || {};

/** Every command (split on &&) reachable from the rebuild script, with the script that holds it. */
const commands = [];
(function visit(name, seen = new Set()) {
    if (seen.has(name) || !scripts[name]) { return; }
    seen.add(name);
    for (const segment of scripts[name].split('&&').map(s => s.trim())) {
        commands.push({ step: name, cmd: segment });
        const m = segment.match(/^npm run ([\w:.-]+)$/);
        if (m) { visit(m[1], seen); }
    }
})('rebuild');

const TEST_REF = /tests\/[\w./-]+\.test\.(?:js|ts)/g;
const GUARDED  = /^node scripts\/run-unit-tests\.js (tests\/[\w./-]+\.test\.(?:js|ts))$/;

// 1 ── every test a rebuild step names goes through the runner
const testCommands = commands.filter(c => c.cmd.match(TEST_REF));
check('the rebuild chain has test steps to check',
    testCommands.length > 0, 'found no rebuild step that names a test file');
const bare = testCommands.filter(c => !GUARDED.test(c.cmd));
check(`all ${testCommands.length} rebuild commands that name a test run it through scripts/run-unit-tests.js`,
    bare.length === 0,
    bare.map(c => `npm run ${c.step}: "${c.cmd}"`).join('\n       '));
const missingFiles = testCommands.map(c => (c.cmd.match(GUARDED) || [])[1])
    .filter(f => f && !fs.existsSync(path.join(ROOT, f)));
check('every test file a rebuild step names exists',
    missingFiles.length === 0, missingFiles.join(', '));

// 2 ── every script a rebuild step runs that spawns tests applies the shared rule
const unguardedScripts = [];
for (const c of commands) {
    const m = c.cmd.match(/^node (scripts\/[\w./-]+\.m?js)\b/);
    if (!m) { continue; }
    const src = fs.readFileSync(path.join(ROOT, m[1]), 'utf8');
    const spawnsTests = /\bspawn(Sync)?\(/.test(src) && /\.test\.(js|ts)\b|tests[\\/]/.test(src);
    const guarded = src.includes("require('./lib/missing-artifact')") && src.includes('skippedForMissingArtifact(');
    if (spawnsTests && !guarded) { unguardedScripts.push(`npm run ${c.step}: ${m[1]}`); }
}
check('every script a rebuild step runs that spawns tests fails a missing-artifact skip',
    unguardedScripts.length === 0, unguardedScripts.join('\n       '));

// 3 ── each named test runs exactly once
const counts = new Map();
for (const c of testCommands) {
    for (const f of c.cmd.match(TEST_REF)) { counts.set(f, (counts.get(f) || 0) + 1); }
}
const twice = [...counts].filter(([, n]) => n !== 1).map(([f, n]) => `${f} x${n}`);
check('every test a rebuild step names is named by exactly one step',
    twice.length === 0, twice.join(', '));
const stepOwnedUnit = [...counts.keys()].filter(f => f.startsWith('tests/unit/'));

// 4 ── behaviour, in a temp copy with no out-test/
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cvt-reg-155-'));
try {
    for (const dir of ['src', 'scripts', path.join('mcp-server', 'src')]) {
        if (fs.existsSync(path.join(ROOT, dir))) {
            fs.cpSync(path.join(ROOT, dir), path.join(tmp, dir), { recursive: true });
        }
    }
    fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(tmp, 'package.json'));
    // Only the step-owned unit tests: a full unit run here must run none of them.
    fs.mkdirSync(path.join(tmp, 'tests', 'unit'), { recursive: true });
    for (const f of stepOwnedUnit) { fs.copyFileSync(path.join(ROOT, f), path.join(tmp, f)); }
    fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'),
        process.platform === 'win32' ? 'junction' : 'dir');
    fs.rmSync(path.join(tmp, 'out-test'), { recursive: true, force: true });

    const run = cmd => {
        const r = cp.spawnSync(cmd, { cwd: tmp, shell: true, encoding: 'utf8', timeout: 180000 });
        return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
    };
    const tail = out => out.trim().split(/\r?\n/).slice(-6).join('\n       ');

    // 3b ── the full unit run leaves every step-owned test to its step
    const full = run('node scripts/run-unit-tests.js');
    const notDeferred = stepOwnedUnit.filter(f => !full.out.includes(`- ${path.basename(f)} — runs at its own rebuild step`));
    check(`the full unit run leaves all ${stepOwnedUnit.length} step-owned tests to their steps`,
        full.code === 0 && notDeferred.length === 0 && /\b0 unit test file\(s\)/.test(full.out),
        notDeferred.length ? `run by the unit suite too: ${notDeferred.join(', ')}` : tail(full.out));

    const step = scripts['test:mcp-status'];
    check('test:mcp-status exists', typeof step === 'string', 'no test:mcp-status script');
    if (typeof step === 'string') {
        // 4a ── clean checkout: the step builds out-test/ and really runs
        fs.rmSync(path.join(tmp, 'out-test'), { recursive: true, force: true });
        const a = run(step);
        check('on a checkout with no out-test/, test:mcp-status builds its input and runs (no skip)',
            a.code === 0 && !skippedForMissingArtifact(a.out) && /PASS: [1-9]\d* passed, 0 failed/.test(a.out)
                && fs.existsSync(path.join(tmp, 'out-test', 'features', 'mcp-server-status.js')),
            `exit ${a.code}: ${tail(a.out)}`);

        // 4b ── the input cannot be built: the step fails instead of skipping green
        fs.rmSync(path.join(tmp, 'out-test'), { recursive: true, force: true });
        fs.writeFileSync(path.join(tmp, 'scripts', 'build-test-modules.mjs'), '// no-op: build nothing\n');
        const b = run(step);
        check('when out-test/ cannot be built, test:mcp-status FAILS rather than skipping green',
            b.code !== 0,
            `exit ${b.code} (a skip passed as green): ${tail(b.out)}`);
    }
} finally {
    // Remove the node_modules link itself first, so the recursive delete of the
    // temp copy can never walk into the real node_modules.
    const link = path.join(tmp, 'node_modules');
    try { fs.unlinkSync(link); } catch { try { fs.rmdirSync(link); } catch { /* not created */ } }
    if (!fs.existsSync(link)) { fs.rmSync(tmp, { recursive: true, force: true }); }
}

console.log('-'.repeat(64));
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
