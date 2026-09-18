// Copyright (c) CieloVista Software. All rights reserved.
// REG-146: Issue #736 — every top-level tests/*.test.js runs in a gate
//
// Run: node tests/regression/REG-146-top-level-tests-are-gated.test.js
//
// The 31 test files directly under tests/ (not tests/unit/, not
// tests/regression/) were run by no gate: not npm run rebuild, not CI, not the
// regression runner. 11 of them had failed for months without anyone seeing
// it: some because the code had regressed (the doc catalog's Archive button,
// the View-a-Doc toolbar), some because the behaviour had changed on purpose
// and the test never followed.
//
// Guards:
//   1. scripts/run-unit-tests.js --list names every top-level tests/*.test.js,
//      except one that npm run rebuild already runs as its own named step.
//   2. The same holds for every file in tests/unit/ (#734 stays fixed).
//   3. A file the runner says belongs to a rebuild step really is named by
//      that step in package.json, so "owned elsewhere" cannot hide a test.
//   4. The runner builds the shipped out/ itself (esbuild.mjs), because
//      several top-level tests read it; a test never finds it missing or stale.
//   5. npm run rebuild runs the runner.
//   6. No gated test reads the copy of the extension installed on the
//      developer's machine: tests own their environment.

'use strict';

const cp   = require('child_process');
const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

let passed = 0;
let failed = 0;
function check(name, ok, detail) {
    if (ok) { console.log(`  PASS ${name}`); passed += 1; }
    else    { console.error(`  FAIL ${name}\n       ${detail}`); failed += 1; }
}
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

console.log('REG-146: every top-level tests/*.test.js runs in a gate (#736)');
console.log('-'.repeat(64));

const testFiles = dir => fs.readdirSync(path.join(ROOT, dir))
    .filter(n => /\.test\.(js|ts)$/.test(n) && fs.statSync(path.join(ROOT, dir, n)).isFile())
    .map(n => `${dir}/${n}`);

const topLevel = testFiles('tests');
const unit     = testFiles('tests/unit');

// What the runner says it runs, and what it says runs elsewhere.
const r = cp.spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'run-unit-tests.js'), '--list'],
    { cwd: ROOT, encoding: 'utf8', timeout: 300000 });
const lines  = (r.stdout || '').split(/\r?\n/);
const listed = new Set(lines.filter(l => l.startsWith('tests/')).map(l => l.trim()));
const owned  = new Map();
for (const l of lines) {
    const m = l.match(/^\s+-\s+(\S+\.test\.(?:js|ts)) — runs at its own rebuild step \(npm run ([\w:.-]+)\)/);
    if (m) { owned.set(`tests/${m[1]}`, m[2]); }
}

check('run-unit-tests.js --list exits 0', r.status === 0,
    `exit ${r.status}${r.error ? ` (${r.error.message})` : ''}\n       ${(r.stderr || '').slice(0, 300)}`);

// 1 + 2 ── coverage
const uncovered = files => files.filter(f => !listed.has(f) && !owned.has(f));
const topMissing = uncovered(topLevel);
check(`the runner covers all ${topLevel.length} top-level tests/*.test.js files`,
    topMissing.length === 0,
    `${topMissing.length} not run by any gate:\n       ${topMissing.join('\n       ')}`);
const unitMissing = uncovered(unit);
check(`the runner covers all ${unit.length} tests/unit/ files`,
    unitMissing.length === 0,
    `${unitMissing.length} not run by any gate:\n       ${unitMissing.join('\n       ')}`);

// 3 ── "owned elsewhere" is true
const pkg = JSON.parse(read('package.json'));
const falseOwners = [...owned].filter(([file, step]) => {
    const body = step === 'rebuild' ? pkg.scripts.rebuild : pkg.scripts[step];
    return !body || !body.includes(file);
});
check('every file said to run at its own rebuild step is named by that step',
    falseOwners.length === 0,
    falseOwners.map(([f, s]) => `${f} -> npm run ${s}`).join('\n       '));

// 4 ── the runner builds what the top-level tests read
const runner = read('scripts/run-unit-tests.js');
check('the runner builds the shipped out/ itself (esbuild.mjs)',
    /esbuild\.mjs/.test(runner), 'scripts/run-unit-tests.js never runs esbuild.mjs');

// 5 ── the gate
check('npm run rebuild runs the runner',
    pkg.scripts['test:unit'] === 'node scripts/run-unit-tests.js' && /\bnpm run test:unit\b/.test(pkg.scripts.rebuild),
    `test:unit is "${pkg.scripts['test:unit']}"`);

// 6 ── tests own their environment
const readsInstalled = [...listed].filter(f => {
    const full = path.join(ROOT, f);
    return fs.existsSync(full) && /\.vscode-insiders/.test(fs.readFileSync(full, 'utf8'));
});
check('no gated test reads the extension installed on this machine',
    readsInstalled.length === 0, readsInstalled.join('\n       '));

console.log('-'.repeat(64));
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
