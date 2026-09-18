// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * with-test-run-lock.js — run a command while holding this checkout's test-run lock (#818).
 *
 *   node scripts/with-test-run-lock.js "npm run clean && npm run compile && ..."
 *
 * npm run rebuild is a chain of steps that clean out/, compile, package and
 * run the test runners, several of them in single-file mode. Each runner takes
 * the lock (scripts/lib/test-run-lock.js), but a lock per runner would leave
 * the gaps between steps open: a watcher run could start while `npm run clean`
 * deletes out/, or rebuild out/ in dev mode right after the package step built
 * it for production. So rebuild runs its whole chain under this wrapper. It
 * takes the lock once (waiting like any run if another holds it), passes its
 * token down in the environment, and every runner in the chain sees it holds
 * the lock already and goes straight through.
 *
 * The command runs in a shell, so it is one quoted argument. Exits with the
 * command's exit code.
 */
'use strict';

const cp   = require('child_process');
const path = require('path');
const { acquireTestRunLock, TestRunLockTimeout } = require('./lib/test-run-lock');

const ROOT    = path.resolve(__dirname, '..');
const command = process.argv.slice(2).join(' ').trim();

if (!command) {
    console.error('usage: node scripts/with-test-run-lock.js "<command>"');
    process.exit(2);
}

(async () => {
    const label = process.env.npm_lifecycle_event ? `npm run ${process.env.npm_lifecycle_event}` : command.slice(0, 80);
    let lock;
    try { lock = await acquireTestRunLock(ROOT, { label }); }
    catch (e) {
        if (!(e instanceof TestRunLockTimeout)) { throw e; }
        console.error(`✗ ${e.message}`);
        process.exit(1);
    }
    // stdio inherited, so the chain's output streams as it runs. Its runners
    // inherit the lock token through process.env.
    const child = cp.spawn(command, { cwd: ROOT, stdio: 'inherit', shell: true, env: process.env });
    child.on('error', err => { console.error(`✗ could not start: ${err.message}`); lock.release(); process.exit(1); });
    child.on('close', (code, signal) => {
        lock.release();
        process.exit(code === null ? (signal ? 1 : 0) : code);
    });
})();
