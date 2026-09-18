// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * test-run-lock.js — one test run per checkout at a time (#818).
 *
 * Both runners (run-unit-tests.js, run-regression-tests.js) build out/ and
 * out-test/ and then read them. build-test-modules.mjs starts by deleting
 * out-test/. Two runs in one checkout at once therefore delete and rewrite the
 * modules the other run is loading, and the other run reports dozens of false
 * "not compiled" failures (44 of 98 unit files on 2026-09-18, while the same
 * tree was 98 of 98 alone). So a run takes this lock before it builds anything
 * and holds it until it exits.
 *
 * The lock is the file .test-run.lock at the root of the checkout, holding
 * { pid, token, command, started }. It is created atomically (hard link of a
 * fully written temp file, so a reader never sees half a record).
 *
 *   - Held by a live process: the second run prints "waiting for pid N" once
 *     and waits. The holder deleting the file wakes it (fs.watch); a holder
 *     that dies without deleting it is noticed by a liveness check every
 *     second. After the timeout (30 min, CVT_TEST_RUN_LOCK_TIMEOUT_MS) it
 *     gives up with an error that names the holder and the lock file.
 *   - Held by a dead pid: the lock is taken over, and that is printed too.
 *   - Held by this process tree: the call is nested and returns at once.
 *
 * Nesting. The lock belongs to the OUTERMOST run and is passed down through
 * the environment: the holder puts its token in CVT_TEST_RUN_LOCK, every child
 * inherits it, and a runner whose inherited token matches the lock file is
 * part of the run that holds it. Two cases need this:
 *
 *   1. npm run rebuild holds the lock for its whole chain (it runs under
 *      scripts/with-test-run-lock.js). Its steps clean out/, package it and
 *      run the runners one after another, some in single-file mode. A lock
 *      per runner would leave the gaps between steps open: a watcher run could
 *      start while `npm run clean` deletes out/, or rebuild out/ in dev mode
 *      right after `npm run package` built it for production (the #781 false
 *      STALE INSTALL). Held by the outer process, the steps run as one unit
 *      and each nested runner goes straight through instead of waiting for
 *      its own parent until the timeout.
 *   2. A test inside a run starts a runner on the same checkout. Waiting would
 *      deadlock: the outer run waits for that test, the test waits for the
 *      outer run's lock. (Tests that exercise a runner use a temp copy, which
 *      has its own lock; this covers one that does not.)
 *
 * A nested runner does not rebuild what its holder already built. The holder
 * sets CVT_TEST_RUN_BUILT to its token after building, and only its children
 * see that. Rebuilding there is the same collision inside one run: until #820
 * REG-175's runner deleted out-test/ while ~180 other regression tests read
 * it, and REG-031 failed on a missing module. Sibling
 * rebuild steps do not inherit it (env only flows down), so each step still
 * builds what the steps before it may have changed.
 */
'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const LOCK_NAME  = '.test-run.lock';
const TOKEN_ENV  = 'CVT_TEST_RUN_LOCK';
const BUILT_ENV  = 'CVT_TEST_RUN_BUILT';
const TIMEOUT_ENV = 'CVT_TEST_RUN_LOCK_TIMEOUT_MS';
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
/** A dead holder announces nothing, so the waiter checks on it this often. */
const LIVENESS_CHECK_MS = 1000;

/** Absolute path of the lock file for the checkout at root. */
function lockPath(root) {
    return path.join(root, LOCK_NAME);
}

/** The record in a lock file, null when there is none, { corrupt: true } when unreadable. */
function readLock(file) {
    let text;
    try { text = fs.readFileSync(file, 'utf8'); }
    catch (e) { return e.code === 'ENOENT' ? null : { corrupt: true }; }
    try { return JSON.parse(text); } catch { return { corrupt: true }; }
}

/** True when a process with this pid exists. EPERM means it exists but is not ours. */
function isAlive(pid) {
    if (!Number.isInteger(pid) || pid <= 0) { return false; }
    try { process.kill(pid, 0); return true; }
    catch (e) { return e.code === 'EPERM'; }
}

function sleepSync(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Create the lock holding record. False when it already exists. */
function tryCreate(file, record) {
    const tmp = `${file}.${record.token}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(record, null, 2));
    try {
        fs.linkSync(tmp, file);
        return true;
    } catch (e) {
        if (e.code === 'EEXIST') { return false; }
        if (e.code !== 'EPERM' && e.code !== 'ENOTSUP' && e.code !== 'EXDEV') { throw e; }
        // No hard links on this filesystem: exclusive create, then write.
        try { fs.writeFileSync(file, JSON.stringify(record, null, 2), { flag: 'wx' }); return true; }
        catch (e2) { if (e2.code === 'EEXIST') { return false; } throw e2; }
    } finally {
        try { fs.unlinkSync(tmp); } catch { /* already gone */ }
    }
}

/**
 * Remove the lock only if it still holds token. Windows refuses to unlink a
 * file another process is reading at that instant, so this retries briefly.
 */
function removeIfHeldBy(file, token) {
    for (let i = 0; i < 40; i++) {
        const cur = readLock(file);
        if (!cur || cur.token !== token) { return; }
        try { fs.unlinkSync(file); return; }
        catch (e) {
            if (e.code === 'ENOENT') { return; }
            sleepSync(25);
        }
    }
}

/**
 * Take over a lock whose holder is dead. Moving it aside first is atomic, so
 * of two waiters that both saw the same dead holder only one removes it; the
 * other finds nothing to move. If what got moved is not the dead holder's
 * record (a live run took the lock in between), it is put back.
 */
function takeOver(file, staleToken) {
    const aside = `${file}.${process.pid}-${crypto.randomBytes(4).toString('hex')}.stale`;
    try { fs.renameSync(file, aside); } catch { return; }
    const moved = readLock(aside);
    if (moved && !moved.corrupt && moved.token !== staleToken) {
        try { fs.linkSync(aside, file); } catch { /* a newer lock exists; it wins */ }
    }
    try { fs.unlinkSync(aside); } catch { /* already gone */ }
}

/** Resolve when the lock file changes (released or replaced) or after ms, whichever is first. */
function waitForChange(file, ms) {
    return new Promise(resolve => {
        let watcher = null;
        const done = () => { clearTimeout(timer); if (watcher) { try { watcher.close(); } catch { /* closed */ } } resolve(); };
        const timer = setTimeout(done, ms);
        try {
            watcher = fs.watch(path.dirname(file), (_event, name) => {
                if (!name || name === path.basename(file)) { done(); }
            });
            watcher.on('error', () => { /* fall back to the timer */ });
        } catch { watcher = null; }
    });
}

/** Thrown when the lock is still held by a live process at the timeout. */
class TestRunLockTimeout extends Error {
    constructor(file, holder, waitedMs) {
        const mins = Math.round(waitedMs / 60000 * 10) / 10;
        super(`another test run holds this checkout (pid ${holder.pid}: ${holder.command}, since ${holder.started}). `
            + `Waited ${mins} min and gave up; nothing was built or run. `
            + `If pid ${holder.pid} is not a cielovista-tools test run, delete ${file}.`);
        this.name = 'TestRunLockTimeout';
        this.holder = holder;
    }
}

/**
 * Take the test-run lock for the checkout at root, waiting while another live
 * run holds it. Resolves to a handle:
 *
 *   nested     true when this process tree already holds the lock
 *   built      true when the holder has already built out/ and out-test/
 *   markBuilt  call after building; children then skip rebuilding
 *   release    delete the lock (also done automatically on exit)
 *
 * Rejects with TestRunLockTimeout when the wait times out.
 */
async function acquireTestRunLock(root, options = {}) {
    const file = lockPath(root);
    const log = options.log || (line => console.log(line));
    const timeoutMs = options.timeoutMs
        ?? (Number(process.env[TIMEOUT_ENV]) > 0 ? Number(process.env[TIMEOUT_ENV]) : DEFAULT_TIMEOUT_MS);

    const inherited = process.env[TOKEN_ENV];
    if (inherited) {
        const cur = readLock(file);
        if (cur && cur.token === inherited) {
            return {
                nested: true, holder: cur, built: process.env[BUILT_ENV] === inherited,
                markBuilt() { process.env[BUILT_ENV] = inherited; },
                release() { /* the outer run owns it */ },
            };
        }
    }

    const token = `${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
    const record = {
        pid: process.pid,
        token,
        command: options.label || ['node', ...process.argv.slice(1).map(a => path.basename(a) === a ? a : path.relative(root, a))].join(' '),
        started: new Date().toISOString(),
    };
    const startedWaiting = Date.now();
    let announced = null;
    for (;;) {
        if (tryCreate(file, record)) { break; }
        const holder = readLock(file);
        if (!holder) { continue; }
        if (holder.corrupt) {
            // Only the no-hard-link fallback can leave a half-written file, and
            // only for an instant. One that stays unreadable is abandoned.
            let age = 0;
            try { age = Date.now() - fs.statSync(file).mtimeMs; } catch { continue; }
            if (age > 10000) { log(`  test-run lock: ${file} is unreadable — taking it over`); takeOver(file, undefined); continue; }
        } else if (!isAlive(holder.pid)) {
            log(`  test-run lock: pid ${holder.pid} (${holder.command}) is gone — taking over its lock`);
            takeOver(file, holder.token);
            continue;
        } else if (announced !== holder.token) {
            log(`  waiting for pid ${holder.pid} — another test run holds this checkout (${holder.command}, since ${holder.started})`);
            announced = holder.token;
        }
        const left = startedWaiting + timeoutMs - Date.now();
        if (left <= 0) { throw new TestRunLockTimeout(file, holder, Date.now() - startedWaiting); }
        await waitForChange(file, Math.min(LIVENESS_CHECK_MS, left));
    }
    if (announced) { log(`  test-run lock taken after waiting ${Math.round((Date.now() - startedWaiting) / 1000)}s`); }

    process.env[TOKEN_ENV] = token;
    let released = false;
    const release = () => {
        if (released) { return; }
        released = true;
        removeIfHeldBy(file, token);
        if (process.env[TOKEN_ENV] === token) { delete process.env[TOKEN_ENV]; }
        if (process.env[BUILT_ENV] === token) { delete process.env[BUILT_ENV]; }
    };
    process.on('exit', release);
    // Ctrl+C and kill skip 'exit' handlers. Release, then die the way the
    // signal would have. (A hard kill leaves the file; the next run sees a
    // dead pid and takes it over.)
    for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
        process.once(sig, () => { release(); process.exit(128 + (sig === 'SIGINT' ? 2 : sig === 'SIGTERM' ? 15 : 1)); });
    }
    return {
        nested: false, holder: record, built: false,
        markBuilt() { process.env[BUILT_ENV] = token; },
        release,
    };
}

module.exports = { acquireTestRunLock, lockPath, readLock, isAlive, TestRunLockTimeout, LOCK_NAME, TOKEN_ENV, BUILT_ENV, TIMEOUT_ENV };
