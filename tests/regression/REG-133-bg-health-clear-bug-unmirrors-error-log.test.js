/**
 * REG-133-bg-health-clear-bug-unmirrors-error-log.test.js
 *
 * Regression test for issue #705 — "clearBug() has no un-mirror, so a fixed bug
 * stays in the Error Log forever".
 *
 * background-health-runner mirrored every detected bug into the persistent error
 * log via addBug() → logError(), which increments `count` on each re-detection.
 * clearBug() only flipped an in-memory `fixed` flag. Nothing ever set the log
 * entry's `solved`, so a bug that had been fixed kept showing in the Error Log
 * panel as unsolved, with a climbing count, until dismissed by hand. The
 * counterpart it needed — markErrorSolved() — existed in error-log-utils, was
 * documented in its README, and was never called anywhere in src/.
 *
 * Two traps the fix has to avoid, both called out on the issue:
 *   • markErrorSolved() matches on SUBSTRING, so un-mirroring a short or generic
 *     bug title would also mark unrelated entries solved. Hence the exact-match
 *     markErrorSolvedExact().
 *   • The log key is built from bug.title, and titles carry variable detail
 *     ("2 untagged fenced code block(s)" → "3 …"). Recomputing the key from the
 *     current title at clear time would miss the entry actually written, so the
 *     key is stored on the bug record when it is logged.
 *
 * Invariants:
 *   1. markErrorSolvedExact solves the entry whose message matches exactly.
 *   2. It does NOT touch entries that merely contain the message as a substring
 *      — the trap markErrorSolved() would fall into.
 *   3. It reports false when nothing matches, and leaves the log untouched.
 *   4. addBug records the exact key it logged under, and clearBug un-mirrors
 *      that stored key rather than recomputing it from the current title.
 *   5. A re-detection under a changed title retires the superseded entry.
 *
 * The log is redirected into os.tmpdir() by binding __dirname — the shared repo
 * tree and the real error log are never written to (REG-130 invariant 1, and
 * the standing rule that logs are never clobbered).
 *
 * Run: node tests/regression/REG-133-bg-health-clear-bug-unmirrors-error-log.test.js
 */
'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const ts   = require('typescript');

const ROOT   = path.resolve(__dirname, '..', '..');
const UTILS  = path.join(ROOT, 'src', 'shared', 'error-log-utils.ts');
const RUNNER = path.join(ROOT, 'src', 'features', 'background-health-runner.ts');

let passed = 0, failed = 0;

function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  ✓ ${name}`);
    } catch (err) {
        failed++;
        console.error(`  ✗ ${name}\n      ${err && err.message}`);
    }
}

function assert(cond, message) {
    if (!cond) { throw new Error(message); }
}

// ─── Load error-log-utils with its log redirected into a sandbox ──────────────

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'reg133-'));
// LOG_FILE_PATH is path.join(__dirname, '..', 'data', ...), so binding __dirname
// to <sandbox>/anything puts the log at <sandbox>/data/cielovista-errors.json.
const fakeDirname = path.join(sandbox, 'out');
const LOG_FILE    = path.join(sandbox, 'data', 'cielovista-errors.json');

const utilsJs = ts.transpileModule(fs.readFileSync(UTILS, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

const logged = [];

function loadUtils() {
    const module = { exports: {} };
    const shimRequire = (request) => {
        if (request === 'vscode') { return {}; }
        if (request === './output-channel') { return { log: (...a) => logged.push(a) }; }
        return require(request);
    };
    new Function('module', 'exports', 'require', '__dirname', utilsJs)(
        module, module.exports, shimRequire, fakeDirname,
    );
    return module.exports;
}

const utils = loadUtils();

function writeEntries(entries) {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.writeFileSync(LOG_FILE, JSON.stringify(entries, null, 2));
}

function readEntries() {
    return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
}

function entry(message, extra = {}) {
    return {
        id: String(Math.random()).slice(2),
        timestamp: '2026-01-01T00:00:00.000Z',
        lastOccurred: '2026-01-01T00:00:00.000Z',
        count: 3,
        message,
        stacktrace: '',
        context: 'background-health-runner',
        solved: false,
        ...extra,
    };
}

console.log('\nREG-133: a cleared bg-health bug is un-mirrored from the Error Log (#705)\n');

// ─── Invariants 1-3 — markErrorSolvedExact ────────────────────────────────────

test('markErrorSolvedExact is exported (the un-mirror counterpart exists)', () => {
    assert(typeof utils.markErrorSolvedExact === 'function',
        'error-log-utils exports no exact-match un-mirror — clearBug has nothing to call (#705)');
});

test('solves the entry whose message matches exactly', () => {
    writeEntries([entry('[bg-health] Regression tests failing')]);
    const changed = utils.markErrorSolvedExact('[bg-health] Regression tests failing', 'fixed');
    const after = readEntries();
    assert(changed === true, 'reported no change for an entry that matches exactly');
    assert(after[0].solved === true, 'entry still unsolved after being cleared (#705)');
    assert(after[0].solution === 'fixed', 'solution text not recorded');
});

test('does NOT solve entries that merely contain the message as a substring', () => {
    writeEntries([
        entry('[bg-health] Registry'),
        entry('[bg-health] Registry paths are stale'),
        entry('[bg-health] Registry missing entirely'),
    ]);
    utils.markErrorSolvedExact('[bg-health] Registry', 'fixed');
    const after = readEntries();
    assert(after[0].solved === true, 'the exact match was not solved');
    assert(after[1].solved === false && after[2].solved === false,
        'substring matches were solved too — this is the markErrorSolved trap the fix must avoid');
});

test('reports false and changes nothing when no entry matches', () => {
    writeEntries([entry('[bg-health] Something else')]);
    const before = JSON.stringify(readEntries());
    const changed = utils.markErrorSolvedExact('[bg-health] Not present', 'fixed');
    assert(changed === false, 'claimed to solve an entry that does not exist');
    assert(JSON.stringify(readEntries()) === before, 'log was rewritten despite no match');
});

// ─── Invariants 4-5 — the bg-health wiring ────────────────────────────────────

const runnerSrc = fs.readFileSync(RUNNER, 'utf8');

function functionBody(name) {
    const start = runnerSrc.indexOf(`function ${name}(`);
    assert(start !== -1, `${name}() not found in background-health-runner.ts`);
    // Walk braces from the first { after the signature to find the real end.
    const open = runnerSrc.indexOf('{', start);
    let depth = 0;
    for (let i = open; i < runnerSrc.length; i++) {
        if (runnerSrc[i] === '{') { depth++; }
        else if (runnerSrc[i] === '}') {
            depth--;
            if (depth === 0) { return runnerSrc.slice(start, i + 1); }
        }
    }
    throw new Error(`could not find the end of ${name}()`);
}

test('clearBug un-mirrors the entry addBug wrote', () => {
    const body = functionBody('clearBug');
    assert(/markErrorSolvedExact\s*\(/.test(body),
        'clearBug still only flips the in-memory flag — the log entry stays unsolved forever (#705)');
});

test('clearBug uses the stored key, not one recomputed from the current title', () => {
    const body = functionBody('clearBug');
    assert(/\blogKey\b/.test(body),
        'clearBug recomputes the key from the current title; a title that changed between '
        + 'detection and clear leaves the original entry unsolved (#705)');
});

test('addBug records the key it logged under', () => {
    const body = functionBody('addBug');
    assert(/logKey/.test(body), 'addBug does not record the key it logged under (#705)');
});

test('the logged message and the stored key render identically', () => {
    // REG-002 requires logError's first argument to be a literal, so the prefix
    // is written out in both places. If they ever drift, clearBug un-mirrors a
    // key that was never written and the entry lingers unsolved — #705 again.
    const keyBuilder = functionBody('bugLogKey');
    const addBody    = functionBody('addBug');

    const fromBuilder = keyBuilder.match(/`([^`]*)\$\{\s*title\s*\}`/);
    assert(fromBuilder, 'bugLogKey no longer builds the key from a template literal');

    const fromLog = addBody.match(/logError\(\s*`([^`]*)\$\{\s*bug\.title\s*\}`/);
    assert(fromLog, 'addBug no longer logs a template literal built from bug.title');

    assert(fromBuilder[1] === fromLog[1],
        `prefix drift: bugLogKey builds "${fromBuilder[1]}" but addBug logs "${fromLog[1]}" — `
        + 'clearBug would un-mirror a key that was never written (#705)');
});

test('a re-detection under a changed title retires the superseded entry', () => {
    const body = functionBody('addBug');
    assert(/markErrorSolvedExact\s*\(/.test(body),
        'a re-detection with a new title orphans the previous entry, which then lingers '
        + 'unsolved forever — the same defect as #705 by another route');
});

fs.rmSync(sandbox, { recursive: true, force: true });

console.log('─'.repeat(60));
if (failed === 0) {
    console.log(`✓ All ${passed} REG-133 tests passed\n`);
    process.exit(0);
} else {
    console.error(`\n✗ ${failed} REG-133 test(s) FAILED\n`);
    process.exit(1);
}
