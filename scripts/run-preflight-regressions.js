// Copyright (c) CieloVista Software. All rights reserved.
// Fast preflight regression gate for high-risk UI behaviors.

'use strict';

const path = require('path');
const { spawnSync } = require('child_process');
const { skippedForMissingArtifact } = require('./lib/missing-artifact');

const ROOT = path.resolve(__dirname, '..');

const TESTS = [
    'tests/regression/REG-019-filelist-feature.test.js',
    'tests/regression/REG-054-home-filelist-click.test.js',
    'tests/regression/REG-046-filelist-run-test-context-menu.test.js',
    'tests/regression/REG-049-filelist-webview-basic-render.test.js',
    'tests/regression/REG-055-filelist-initial-rows-folder-click.test.js',
    'tests/regression/REG-056-filelist-default-viewers.test.js',
    'tests/regression/REG-057-filelist-special-file-actions.test.js',
    'tests/regression/REG-058-filelist-folder-open-fallback.test.js',
    'tests/regression/REG-059-filelist-explorer-context-menu.test.js',
    'tests/regression/REG-047-frontmatter-viewer-rescan-preserves-filed-issues.test.js',
    'tests/regression/REG-048-frontmatter-fix-all-no-new-issues.test.js',
];

let failed = 0;

function run(testPath) {
    const abs = path.join(ROOT, testPath);
    console.log(`\n[preflight] ${testPath}`);
    // Output is captured so the shared missing-artifact rule can read it (#748).
    const res = spawnSync(process.execPath, [abs], {
        cwd: ROOT,
        encoding: 'utf8',
        env: process.env,
    });
    process.stdout.write(res.stdout || '');
    process.stderr.write(res.stderr || '');
    if (res.status !== 0) {
        failed += 1;
        console.error(`[preflight] FAIL: ${testPath}`);
    } else if (skippedForMissingArtifact((res.stdout || '') + (res.stderr || ''))) {
        failed += 1;
        console.error(`[preflight] FAIL: ${testPath} SKIPPED for a missing build artifact — counts as a failure (#734, #748)`);
    } else {
        console.log(`[preflight] PASS: ${testPath}`);
    }
}

console.log('=== CVT Preflight Regression Gate ===');
for (const t of TESTS) {
    run(t);
}

if (failed > 0) {
    console.error(`\nPreflight FAILED: ${failed} test(s) failed.`);
    process.exit(1);
}

console.log('\nPreflight PASSED: all critical regressions green.');
