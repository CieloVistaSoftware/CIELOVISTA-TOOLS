// Copyright (c) CieloVista Software. All rights reserved.
// REG-142: Issue #734 — a test that skips for a missing build artifact FAILS
//
// Run: node tests/regression/REG-142-no-skip-green-tests.test.js
//
// For four months 54 unit test files printed "SKIP: not compiled" and exited 0.
// #264 had moved shipping to one esbuild bundle, so the per-module files the
// tests required stopped existing. Every runner counted exit 0 as a pass, and
// most of those tests were not in any gate anyway.
//
// Guards:
//   1. The skip detector matches every wording those tests used, and does not
//      match an ordinary test that merely mentions skipping.
//   2. Both runners use it: run-unit-tests.js and run-regression-tests.js.
//   3. Both runners build out-test/ themselves before any test runs.
//   4. npm run rebuild runs the unit suite, so it gates what ships.
//   5. out-test/ is never committed and never packaged.
//   6. No test under tests/ reads a per-module file from out/, which the
//      shipped build does not produce.

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const { skippedForMissingArtifact } = require(path.join(ROOT, 'scripts', 'lib', 'missing-artifact.js'));

let passed = 0;
let failed = 0;
function check(name, ok, detail) {
    if (ok) { console.log(`  PASS ${name}`); passed += 1; }
    else    { console.error(`  FAIL ${name}\n       ${detail}`); failed += 1; }
}
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

console.log('REG-142: tests that skip for a missing build artifact fail (#734)');
console.log('-'.repeat(64));

// 1 ── the detector
const SKIPS = [
    'SKIP: C:\\repo\\out\\features\\doc-header.js not found — run npm run compile',
    'SKIP: not compiled',
    '  SKIP: Compiled output not found at:',
    'SKIP: no thin features compiled — run npm run compile',
    '  (runtime tests skipped — compiled output not found)',
    'SKIP: compiled output not found at C:\\repo\\out\\shared\\md-renderer.js',
    '  SKIP bundle checks — out/extension.js not built',   // mcp-viewer.test.js (#748)
];
const NOT_SKIPS = [
    '  ✓ skips node_modules and .git',
    '  ✓ project path missing → skipped (not counted)',
    '  ✓ scan skips projects whose folder does not exist on disk',
    'REG-124: bg-health skips the regression run from unbuilt/worktree copies',
];
const missed = SKIPS.filter(s => !skippedForMissingArtifact(s));
check('the detector recognises every missing-artifact skip wording seen in #734',
    missed.length === 0, `not recognised: ${missed.join(' | ')}`);
const falsePos = NOT_SKIPS.filter(s => skippedForMissingArtifact(s));
check('the detector ignores ordinary lines that mention skipping',
    falsePos.length === 0, `wrongly flagged: ${falsePos.join(' | ')}`);

// 2 + 3 ── both runners
for (const runner of ['scripts/run-unit-tests.js', 'scripts/run-regression-tests.js']) {
    const src = read(runner);
    check(`${runner} fails a test that skipped for a missing artifact`,
        src.includes("require('./lib/missing-artifact')") && src.includes('skippedForMissingArtifact('),
        'runner does not use scripts/lib/missing-artifact.js');
    check(`${runner} builds out-test/ before running tests`,
        src.includes('build-test-modules.mjs'),
        'runner does not run scripts/build-test-modules.mjs');
}

// 4 ── the gate
const pkg = JSON.parse(read('package.json'));
check('npm run test:unit runs every unit test',
    pkg.scripts['test:unit'] === 'node scripts/run-unit-tests.js',
    `test:unit is "${pkg.scripts['test:unit']}"`);
check('npm run rebuild runs the unit suite',
    /\bnpm run test:unit\b/.test(pkg.scripts.rebuild),
    'rebuild does not run test:unit');

// 5 ── never shipped, never committed
check('.gitignore excludes out-test/', /^out-test\/?$/m.test(read('.gitignore')), 'out-test/ not in .gitignore');
check('.vscodeignore excludes out-test/', /^out-test\/\*\*$/m.test(read('.vscodeignore')), 'out-test/** not in .vscodeignore');

// 6 ── no test reads a per-module file from the shipped out/
const BUNDLE_OUTPUTS = /out[\\/](extension\.js|catalog\.html|cvt-demo\.html|npm-scripts-tree\.html|data[\\/])/;
const offenders = [];
(function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { walk(full); continue; }
        if (!/\.test\.(js|ts)$/.test(e.name)) { continue; }
        const text = fs.readFileSync(full, 'utf8');
        for (const m of text.matchAll(/['"`](?:\.\.\/)+out\/((?:features|shared)\/[A-Za-z0-9_\-./]+\.js)['"`]/g)) {
            if (!BUNDLE_OUTPUTS.test(`out/${m[1]}`) && !fs.existsSync(path.join(ROOT, 'out', m[1]))) {
                offenders.push(`${path.relative(ROOT, full)} -> out/${m[1]}`);
            }
        }
    }
})(path.join(ROOT, 'tests'));
check('no test requires a per-module file from out/ that the shipped build does not produce',
    offenders.length === 0, offenders.slice(0, 8).join('\n       '));

console.log('-'.repeat(64));
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
