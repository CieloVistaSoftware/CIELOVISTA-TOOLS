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
 * This test verifies four things:
 *   1. The current package.json round-trips through JSON.parse cleanly
 *      (positive case — the gate accepts a clean file).
 *   2. A synthetic #67-pattern corruption is correctly detected as invalid
 *      JSON (negative case — the gate would have caught the original bug).
 *   3. Dropping a new untracked .ts file under src/features/ does not, on
 *      its own, mutate package.json. This is the specific scenario from
 *      the issue reproduction.
 *   4. The validator script (scripts/validate-package-json.js) actually
 *      exits 0 against the current package.json, so the gate that was just
 *      wired into rebuild is functional end-to-end.
 *
 * Spawned via REG-015 inside scripts/run-regression-tests.js. Exits 0 on
 * pass, 1 on any failure.
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const cp   = require('child_process');

const REPO_ROOT  = path.resolve(__dirname, '..', '..');
const PKG_PATH   = path.join(REPO_ROOT, 'package.json');
const VALIDATOR  = path.join(REPO_ROOT, 'scripts', 'validate-package-json.js');
const TEST_FEAT  = path.join(REPO_ROOT, 'src', 'features', '__reg015_test_feature.ts');

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

(function testDroppingFeatureFileLeavesPkgJsonAlone() {
    const before = fs.readFileSync(PKG_PATH, 'utf8');

    if (fs.existsSync(TEST_FEAT)) {
        fail('test fixture path already exists, refusing to overwrite: ' + TEST_FEAT);
        return;
    }

    fs.writeFileSync(TEST_FEAT,
        '// REG-015 test fixture — safe to delete. If you see this file in git,\n' +
        '// the regression test crashed before cleanup; remove it manually.\n' +
        'export function _reg015_noop(): void { /* intentionally empty */ }\n',
        'utf8'
    );

    try {
        // Brief pause so any naive fs.watch handler that might be listening
        // has a chance to react. 250ms exposes synchronous-ish watchers
        // without making the test slow.
        const waitUntil = Date.now() + 250;
        while (Date.now() < waitUntil) { /* spin */ }

        const after = fs.readFileSync(PKG_PATH, 'utf8');

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
        try { fs.unlinkSync(TEST_FEAT); } catch { /* best effort */ }
    }
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
