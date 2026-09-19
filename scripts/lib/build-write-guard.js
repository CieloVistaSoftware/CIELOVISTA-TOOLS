// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * build-write-guard.js — records every write a test makes under out/ or out-test/ (#832).
 *
 * out/ and out-test/ are the build output every test process reads. The unit
 * runner runs up to 8 tests at once and the regression runner runs them all at
 * once, so a test that writes there changes what the others see:
 * codebase-auditor.test.js made out-test/src/features/deadTest/ for a moment,
 * and a test that crashed midway left it behind for later runs.
 *
 * Both runners start every test with this file preloaded (node --require) and
 * CVT_BUILD_WRITE_LOG naming a log of that test's own (testDataEnv() in
 * test-data-dir.js sets both). Every fs call that creates, changes or removes
 * something under out/ or out-test/ appends one line to the log, and the runner
 * fails a test whose log is not empty. The build itself runs in the runner and
 * its build scripts, never inside a test process, so it is not recorded.
 *
 * With CVT_BUILD_WRITE_LOG unset (a test run directly with node) this does
 * nothing. CVT_BUILD_WRITE_ROOT points it at another root instead of this
 * checkout, which REG-180's self-check uses so it never writes into out-test/.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const LOG_ENV  = 'CVT_BUILD_WRITE_LOG';
const ROOT_ENV = 'CVT_BUILD_WRITE_ROOT';

/** fs functions whose first argument is the path they create, change or remove. */
const FIRST_ARG = ['writeFile', 'appendFile', 'mkdir', 'mkdtemp', 'rm', 'rmdir', 'unlink', 'truncate',
    'utimes', 'lutimes', 'chmod', 'chown', 'createWriteStream'];
/** fs functions whose second argument is the path they create or change. */
const SECOND_ARG = ['rename', 'copyFile', 'cp', 'symlink', 'link'];

function install(log, root) {
    const dirs = ['out', 'out-test'].map(d => path.join(root, d));
    const same = process.platform === 'win32' ? s => s.toLowerCase() : s => s;
    const underBuild = p => {
        let s;
        if (typeof p === 'string') { s = p; }
        else if (Buffer.isBuffer(p)) { s = p.toString(); }
        else if (p instanceof URL && p.protocol === 'file:') { s = require('url').fileURLToPath(p); }
        else { return false; }
        const abs = same(path.resolve(s));
        return dirs.some(d => abs === same(d) || abs.startsWith(same(d) + path.sep));
    };
    const appendFileSync = fs.appendFileSync;
    const record = (fn, p) => {
        try { appendFileSync(log, `${fn} ${path.resolve(String(p))}\n`); } catch { /* never break the test */ }
    };
    const wrap = (target, name, argIndex, isWrite = () => true) => {
        const original = target[name];
        if (typeof original !== 'function') { return; }
        target[name] = function (...args) {
            if (underBuild(args[argIndex]) && isWrite(args)) { record(name, args[argIndex]); }
            return original.apply(this, args);
        };
    };
    const writeFlags = args => typeof args[1] === 'string' && /[wa+]/.test(args[1]);
    for (const base of FIRST_ARG) {
        wrap(fs, base, 0); wrap(fs, `${base}Sync`, 0); wrap(fs.promises, base, 0);
    }
    for (const base of SECOND_ARG) {
        wrap(fs, base, 1); wrap(fs, `${base}Sync`, 1); wrap(fs.promises, base, 1);
    }
    wrap(fs, 'open', 0, writeFlags); wrap(fs, 'openSync', 0, writeFlags); wrap(fs.promises, 'open', 0, writeFlags);
}

if (process.env[LOG_ENV]) {
    install(process.env[LOG_ENV], path.resolve(process.env[ROOT_ENV] || path.join(__dirname, '..', '..')));
}

module.exports = { LOG_ENV, ROOT_ENV };
