// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * run-unit-tests.js — build out-test/, then run EVERY unit test (#734).
 *
 *   node scripts/run-unit-tests.js            all of tests/unit/
 *   node scripts/run-unit-tests.js doc-header only files whose name contains "doc-header"
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

const files = fs.readdirSync(UNIT_DIR)
    .filter(n => /\.test\.(js|ts)$/.test(n) && n.includes(FILTER))
    .sort();

function runOne(name) {
    return new Promise(resolve => {
        const started = Date.now();
        const child = cp.spawn(process.execPath, [path.join(UNIT_DIR, name)], { cwd: ROOT });
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

(async () => {
    const results = [];
    const queue = [...files];
    await Promise.all(Array.from({ length: WORKERS }, async () => {
        while (queue.length) { results.push(await runOne(queue.shift())); }
    }));
    results.sort((a, b) => a.name.localeCompare(b.name));

    for (const r of results) {
        if (r.ok) { console.log(`  ✓ ${r.name}`); continue; }
        const why = r.skipped ? 'SKIPPED for a missing build artifact — counts as a failure (#734)'
                              : `exit ${r.code}`;
        console.log(`  ✗ ${r.name} — ${why}`);
        const tail = r.out.trim().split(/\r?\n/).filter(l => /fail|✗|error|assert|skip/i.test(l)).slice(0, 8);
        for (const line of tail) { console.log(`      ${line.slice(0, 200)}`); }
    }
    const failed = results.filter(r => !r.ok);
    console.log(`\n${results.length} unit test file(s): ${results.length - failed.length} passed, ${failed.length} failed`);
    process.exit(failed.length ? 1 : 0);
})();
