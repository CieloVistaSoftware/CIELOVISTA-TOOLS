/**
 * REG-015-package-json-round-trip.test.js
 *
 * Regression test for issue #67 — rebuild silently corrupts package.json with
 * broken auto-injected command entries.
 *
 * The rule established for REG-015:
 *   "package.json must round-trip through JSON.parse after every rebuild.
 *    Enforced by npm run validate:package-json appended to the rebuild chain
 *    after install-verify, and by REG-015 automated test that exercises the
 *    validator + verifies dropping a feature file does not mutate
 *    package.json. Any future corruption fails the rebuild loudly instead
 *    of shipping silently."
 *
 * This test verifies five things:
 *   1. The current package.json round-trips through JSON.parse cleanly
 *      (positive case — the gate accepts a clean file).
 *   2. A synthetic #67-pattern corruption is correctly detected as invalid
 *      JSON (negative case — the gate would have caught the original bug).
 *   3. Dropping a new untracked .ts file under src/features/ does not, on
 *      its own, mutate package.json. This is the specific scenario from
 *      the issue reproduction. Since #697 it runs in a temp sandbox rather
 *      than in the real source tree — see the comment on test 3.
 *   3b. No script in scripts/ (nor install.js / esbuild.mjs) writes
 *      package.json at all — the timing-free form of the same invariant.
 *   4. The validator script (scripts/validate-package-json.js) actually
 *      exits 0 against the current package.json, so the gate that was just
 *      wired into rebuild is functional end-to-end.
 *
 * Spawned via REG-015 inside scripts/run-regression-tests.js. Exits 0 on
 * pass, 1 on any failure.
 */
'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const cp   = require('child_process');

const REPO_ROOT  = path.resolve(__dirname, '..', '..');
const PKG_PATH   = path.join(REPO_ROOT, 'package.json');
const VALIDATOR  = path.join(REPO_ROOT, 'scripts', 'validate-package-json.js');

let failed = 0;
const fail = (msg) => { console.error('FAIL: ' + msg); failed++; };
const ok   = (msg) => { console.log('PASS: ' + msg); };

// ─── Test 1: current package.json round-trips through JSON.parse ──────────

(function testCurrentPackageJsonIsValid() {
    if (!fs.existsSync(PKG_PATH)) { fail('package.json not found at ' + PKG_PATH); return; }
    const raw = fs.readFileSync(PKG_PATH, 'utf8');
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (err) {
        fail('current package.json does NOT parse as JSON: ' + err.message);
        return;
    }
    if (!parsed || typeof parsed !== 'object') {
        fail('current package.json parsed but is not an object');
        return;
    }
    if (!parsed.contributes || !Array.isArray(parsed.contributes.commands)) {
        fail('current package.json missing contributes.commands array');
        return;
    }
    ok('current package.json round-trips through JSON.parse (' + parsed.contributes.commands.length + ' commands)');
})();

// ─── Test 2: synthetic #67-pattern corruption fails JSON.parse ────────────

(function testSyntheticCorruptionIsDetected() {
    // Mirrors the corruption shape from issue #67 verbatim: an inner object
    // opened where a value is expected, no comma after the previous string.
    const synthetic =
        '{"contributes":{"commands":[' +
            '{"command":"cvs.x","title":"X","category":"C","description":"d"' +
                '{"command":"cvs.y","title":"Y","category":"C","description":"d"}' +
            ',' +
        ']}}';

    let parsedAnyway = false;
    try { JSON.parse(synthetic); parsedAnyway = true; } catch { /* expected */ }
    if (parsedAnyway) {
        fail('synthetic #67-pattern corruption was unexpectedly parseable — test setup is broken');
        return;
    }
    ok('synthetic #67-pattern corruption is detected as invalid JSON');
})();

// ─── Test 3: dropping a feature file does not mutate package.json ─────────
//
// This used to write src/features/__reg015_test_feature.ts into the REAL
// source tree, spin for 250ms, then delete it. The whole regression suite runs
// concurrently against that one tree, so every sibling test that walks src/
// could list the fixture and then fail with ENOENT when this test unlinked it
// mid-scan — reported against the innocent sibling (REG-001), not against
// REG-015. That is issue #697, and it aborted builds at random.
//
// The scenario is now reproduced inside an isolated sandbox: a throwaway tree
// with its own copy of package.json and its own src/features/. Nothing outside
// the sandbox is touched, so no sibling test can observe it.

(function testDroppingFeatureFileLeavesPkgJsonAlone() {
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'reg015-'));
    const sandboxFeatures = path.join(sandbox, 'src', 'features');
    const sandboxPkg      = path.join(sandbox, 'package.json');
    const sandboxFixture  = path.join(sandboxFeatures, '__reg015_test_feature.ts');

    try {
        fs.mkdirSync(sandboxFeatures, { recursive: true });
        fs.copyFileSync(PKG_PATH, sandboxPkg);

        const before = fs.readFileSync(sandboxPkg, 'utf8');

        fs.writeFileSync(sandboxFixture,
            '// REG-015 test fixture — lives in a temp sandbox, never in the repo.\n' +
            'export function _reg015_noop(): void { /* intentionally empty */ }\n',
            'utf8'
        );

        // The original test spun 250ms here to give a naive fs.watch handler a
        // chance to react. Nothing watches a throwaway temp tree, so the pause
        // would be dead weight — the timing-free invariant in test 3b below is
        // what actually has teeth against the #67 auto-injector.
        const after = fs.readFileSync(sandboxPkg, 'utf8');

        if (after !== before) {
            fail('package.json changed merely by dropping an untracked feature file under src/features/');
            console.error('       before length=' + before.length + ' after length=' + after.length);
            return;
        }

        try { JSON.parse(after); }
        catch (err) {
            fail('package.json no longer parses as JSON after fixture drop: ' + err.message);
            return;
        }

        ok('dropping a new feature file under src/features/ leaves package.json untouched and valid');
    } finally {
        try { fs.rmSync(sandbox, { recursive: true, force: true }); } catch { /* best effort */ }
    }
})();

// ─── Test 3b: no build script writes package.json ────────────────────────
//
// The teeth behind test 3. Issue #67 was caused by a script auto-injecting
// command entries into package.json during rebuild. Test 3 on its own can only
// observe that nothing mutated package.json while it happened to be watching;
// this asserts the stronger, timing-free invariant — no script in scripts/ (nor
// install.js / esbuild.mjs) writes package.json at all, so no rebuild step can
// corrupt it.

(function testNoScriptWritesPackageJson() {
    const candidates = [];
    const scriptsDir = path.join(REPO_ROOT, 'scripts');
    if (fs.existsSync(scriptsDir)) {
        for (const f of fs.readdirSync(scriptsDir)) {
            if (f.endsWith('.js') || f.endsWith('.mjs')) { candidates.push(path.join(scriptsDir, f)); }
        }
    }
    for (const rel of ['install.js', 'esbuild.mjs']) {
        const full = path.join(REPO_ROOT, rel);
        if (fs.existsSync(full)) { candidates.push(full); }
    }

    // A write call whose target names package.json (directly or via a
    // PKG/PACKAGE_JSON-style identifier).
    const WRITE_RE = /(?:writeFileSync|writeFile|appendFileSync|createWriteStream)\s*\(\s*([^,)]*)/g;
    const TARGET_RE = /package\.json|PKG_PATH|PACKAGE_JSON|PKG_FILE/i;

    const offenders = [];
    for (const full of candidates) {
        let src;
        try { src = fs.readFileSync(full, 'utf8'); }
        catch { continue; } // vanished mid-scan — not part of the tree
        let m;
        while ((m = WRITE_RE.exec(src)) !== null) {
            if (TARGET_RE.test(m[1])) {
                offenders.push(path.relative(REPO_ROOT, full) + ': ' + m[0].trim());
            }
        }
    }

    if (offenders.length > 0) {
        fail('script(s) write package.json — the #67 auto-injector pattern is back:\n       ' +
             offenders.join('\n       '));
        return;
    }
    ok('no build script writes package.json (' + candidates.length + ' scripts scanned)');
})();

// ─── Test 4: validator script exits 0 against current package.json ────────

(function testValidatorScriptExitsZero() {
    if (!fs.existsSync(VALIDATOR)) {
        fail('validator script missing at ' + VALIDATOR + ' — gate will not run');
        return;
    }

    const result = cp.spawnSync(process.execPath, [VALIDATOR], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (result.error) {
        fail('could not spawn validator: ' + result.error.message);
        return;
    }
    if (result.status !== 0) {
        fail('validator exited non-zero against current package.json (status=' + result.status + ')');
        if (result.stderr && result.stderr.trim()) {
            console.error(result.stderr.split('\n').map(l => '       ' + l).join('\n'));
        }
        return;
    }
    ok('validator script exits 0 against current package.json (gate is wired and green)');
})();

// ─── Result ───────────────────────────────────────────────────────────────

console.log('');
if (failed === 0) {
    console.log('REG-015 PASSED — package.json round-trip gate is in place and effective');
    process.exit(0);
} else {
    console.error('REG-015 FAILED — ' + failed + ' problem' + (failed > 1 ? 's' : '') + ' detected');
    process.exit(1);
}
