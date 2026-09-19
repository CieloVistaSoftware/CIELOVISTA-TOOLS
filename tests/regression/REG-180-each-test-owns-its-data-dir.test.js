// Copyright (c) CieloVista Software. All rights reserved.
// REG-180: Issue #825 — every test process owns its data directory
//
// Run: node tests/regression/REG-180-each-test-owns-its-data-dir.test.js
//
// The modules kept their data files in path.join(__dirname, '..', 'data'). In
// the test build that is out-test/data/ (out/data/ for the bundled features),
// one directory for every test process. The unit runner starts up to 8 tests
// at once. error-log-utils.test.js read, deleted and rewrote
// out-test/data/cielovista-errors.json while doc-header.test.js and
// corequisite-checker.test.js logged errors into the same file through
// output-channel's logError(), and error-log.test.js and
// background-health-runner.test.js did the same to tools-errors.json and
// out/data/. On Windows a read that overlaps another process's unlink fails
// with EPERM, and the unit suite reported a false failure.
//
// The fix: src/shared/data-dir.ts resolves every module's data directory, and
// CVT_DATA_DIR overrides it. Both runners start each test with a fresh
// CVT_DATA_DIR (scripts/lib/test-data-dir.js), and the tests that clear or
// read a data file themselves take their own with useOwnDataDir().
//
// Guards:
//   1. Every src/ module that builds a data/ path from __dirname (or from a
//      constant built from __dirname) goes through dataDir().
//   2. data-dir.ts and scripts/lib/test-data-dir.js name the same variable.
//   3. Both runners spawn every test with the env from testDataEnv().
//   4. No unit test (tests/unit/, tests/*.test.js) names a path under
//      out-test/data/ or out/data/. A self-check runs this rule on the old
//      error-log-utils and background-health-runner text first.
//   5. Live: the five tests that wrote the shared files run concurrently, three
//      rounds, with extra copies of error-log-utils.test.js (six copies of it
//      alone reproduced the EPERM). Any failure or EPERM fails, and so does any
//      change to out-test/data/ or out/data/ (cross-talk into the shared
//      directory).
//
// Issue #832 widened this from data/ to all of out/ and out-test/:
// codebase-auditor.test.js wrote a fixture folder into out-test/src/features/
// while other tests read the build. Tracing every fs write under out/ and
// out-test/ over the whole unit and regression suites found that test and no
// other. The fix: scripts/lib/build-write-guard.js, preloaded into every test
// process by both runners, logs any such write and the runner fails the test.
//   6. Both runners start every test with the guard (data.execArgv) and fail
//      a test whose buildWrites() is not empty.
//   7. Live: the guard, pointed at a temp root, records writes into its out/
//      and out-test/ by every kind of fs call and nothing outside them.
//   8. Live: codebase-auditor.test.js under the guard passes with no write
//      under out/ or out-test/.

'use strict';

const cp     = require('child_process');
const crypto = require('crypto');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC  = path.join(ROOT, 'src');
const { DATA_DIR_ENV, testDataEnv } = require(path.join(ROOT, 'scripts', 'lib', 'test-data-dir'));
const { ROOT_ENV: GUARD_ROOT_ENV }  = require(path.join(ROOT, 'scripts', 'lib', 'build-write-guard'));

let passed = 0, failed = 0;
function check(name, ok, detail) {
    if (ok) { console.log(`  PASS ${name}`); passed++; }
    else    { console.error(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`); failed++; }
}

function walk(dir, keep, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { walk(full, keep, out); }
        else if (keep(e.name)) { out.push(full); }
    }
    return out;
}
const rel = f => path.relative(ROOT, f).split(path.sep).join('/');

/** Source text without comments, so prose about the old paths never matches. */
function stripComments(text) {
    return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\w])\/\/.*$/gm, '$1');
}

// ── 1. src/: data paths from __dirname go through dataDir() ──────────────────

/** Lines in one module that build a data/ path from __dirname without dataDir(). */
function unroutedDataPaths(text) {
    const code  = stripComments(text);
    const bases = ['__dirname'];
    for (const m of code.matchAll(/(?:const|let)\s+(\w+)\s*=\s*path\.(?:join|resolve)\(\s*__dirname\b/g)) { bases.push(m[1]); }
    const base = new RegExp(`\\b(?:${bases.join('|')})\\b`);
    return code.split(/\r?\n/)
        .filter(l => base.test(l) && /['"](?:\.\.\/)?data['"/]/.test(l) && !/\bdataDir\(/.test(l))
        .map(l => l.trim());
}

check('self-check: rule 1 flags the old error-log-utils and error-log lines',
    unroutedDataPaths("const LOG_FILE_PATH = path.join(__dirname, '..', 'data', 'cielovista-errors.json');").length === 1
    && unroutedDataPaths("const TOOLS_ROOT = path.join(__dirname, '..');\nconst LOG_PATH = path.join(TOOLS_ROOT, 'data', 'tools-errors.json');").length === 1
    && unroutedDataPaths("const P = path.join(__dirname, '../data/mcp-build-result.md');").length === 1
    && unroutedDataPaths("const LOG = path.join(dataDir(path.join(__dirname, '..', 'data')), 'x.json');").length === 0);

const unrouted = [];
for (const f of walk(SRC, n => n.endsWith('.ts') && !n.endsWith('.d.ts'))) {
    if (rel(f) === 'src/shared/data-dir.ts') { continue; }
    for (const line of unroutedDataPaths(fs.readFileSync(f, 'utf8'))) { unrouted.push(`${rel(f)}: ${line}`); }
}
check('every src/ module that keeps a data/ file beside its build resolves it through dataDir()',
    unrouted.length === 0, unrouted.join('\n       '));

// ── 2. One variable name on both sides ───────────────────────────────────────

const DATA_DIR_TS = path.join(SRC, 'shared', 'data-dir.ts');
const dataDirSrc  = fs.existsSync(DATA_DIR_TS) ? fs.readFileSync(DATA_DIR_TS, 'utf8') : '';
check(`src/shared/data-dir.ts reads ${DATA_DIR_ENV}, the variable the runners set`,
    new RegExp(`DATA_DIR_ENV\\s*=\\s*'${DATA_DIR_ENV}'`).test(dataDirSrc) && /process\.env\[DATA_DIR_ENV\]/.test(dataDirSrc));

// ── 3. Both runners give each test its own data directory ────────────────────

for (const runner of ['run-unit-tests.js', 'run-regression-tests.js']) {
    const text = stripComments(fs.readFileSync(path.join(ROOT, 'scripts', runner), 'utf8'));
    const nodeSpawns = [...text.matchAll(/spawn\(process\.execPath,[^\n]*/g)].map(m => m[0]);
    check(`scripts/${runner} spawns every test with a data directory from testDataEnv()`,
        /require\('\.\/lib\/test-data-dir'\)/.test(text) && /testDataEnv\(/.test(text)
        && nodeSpawns.length > 0 && nodeSpawns.every(s => /env:\s*data\.env/.test(s)),
        nodeSpawns.filter(s => !/env:\s*data\.env/.test(s)).join('\n       '));
    // 6. ... and with the build-write guard, failing a test that wrote under out/ or out-test/ (#832).
    check(`scripts/${runner} starts every test with the build-write guard and fails a test that wrote under out/ or out-test/`,
        nodeSpawns.length > 0 && nodeSpawns.every(s => /\[\s*\.\.\.data\.execArgv\s*,/.test(s))
        && /data\.buildWrites\(\)/.test(text) && /buildWriteFailure\(/.test(text),
        nodeSpawns.filter(s => !/\[\s*\.\.\.data\.execArgv\s*,/.test(s)).join('\n       '));
}

// ── 4. No unit test names a path in the shared build data directory ──────────

function sharedDataPaths(text) {
    const code = stripComments(text);
    const hits = [];
    const rules = [
        /['"`][^'"`\n]*\bout(?:-test)?[\\/]+data\b[^'"`\n]*['"`]/g,        // '../../out/data/bg-health.json'
        /['"]out(?:-test)?['"]\s*,\s*['"]data['"]/g,                          // path.join(ROOT, 'out-test', 'data')
        /path\.dirname\(\s*OUT\w*\s*\)\s*,\s*['"]\.\.['"]\s*,\s*['"]data['"]/g, // path.join(path.dirname(OUT), '..', 'data')
    ];
    for (const r of rules) { for (const m of code.matchAll(r)) { hits.push(m[0]); } }
    return hits;
}

check('self-check: rule 4 flags the old error-log-utils and background-health-runner tests',
    sharedDataPaths("const LOG_FILE = path.join(path.dirname(OUT), '..', 'data', 'cielovista-errors.json');").length === 1
    && sharedDataPaths("const DATA_FILE = path.join(__dirname, '../../out/data/bg-health.json');").length === 1
    && sharedDataPaths("const D = path.join(ROOT, 'out-test', 'data');").length === 1
    && sharedDataPaths("// the module writes out-test/data/tools-errors.json\nconst D = useOwnDataDir('x');").length === 0);

const TESTS = path.join(ROOT, 'tests');
const unitTests = [
    ...walk(path.join(TESTS, 'unit'), n => /\.test\.(js|ts)$/.test(n)),
    ...fs.readdirSync(TESTS).filter(n => /\.test\.(js|ts)$/.test(n)).map(n => path.join(TESTS, n)),
];
const shared = [];
for (const f of unitTests) {
    for (const hit of sharedDataPaths(fs.readFileSync(f, 'utf8'))) { shared.push(`${rel(f)}: ${hit}`); }
}
check(`no unit test (${unitTests.length} files) names a path under out-test/data/ or out/data/`,
    shared.length === 0, shared.join('\n       '));

// ── 5. Live: the tests that shared the files, concurrently ───────────────────

const SHARED_DIRS = [path.join(ROOT, 'out-test', 'data'), path.join(ROOT, 'out', 'data')];

/** name -> size:sha1 for every file under the shared data directories. */
function snapshot() {
    const out = new Map();
    for (const dir of SHARED_DIRS) {
        if (!fs.existsSync(dir)) { continue; }
        for (const f of walk(dir, () => true)) {
            const buf = fs.readFileSync(f);
            out.set(rel(f), `${buf.length}:${crypto.createHash('sha1').update(buf).digest('hex')}:${fs.statSync(f).mtimeMs}`);
        }
    }
    return out;
}

const LIVE = ['error-log-utils', 'error-log-utils', 'error-log-utils', 'error-log', 'background-health-runner', 'doc-header', 'corequisite-checker']
    .map(n => path.join(TESTS, 'unit', `${n}.test.js`));
const ROUNDS = 3;

/** Runs one script the way the runners do: own data directory, build-write guard preloaded. */
function runOne(file, extraEnv = {}) {
    return new Promise(resolve => {
        const data  = testDataEnv(path.basename(file));
        const child = cp.spawn(process.execPath, [...data.execArgv, file], { cwd: ROOT, env: { ...data.env, ...extraEnv } });
        let out = '';
        child.stdout.on('data', d => { out += d; });
        child.stderr.on('data', d => { out += d; });
        const done = code => { const writes = data.buildWrites(); data.dispose(); resolve({ file, code, out, writes }); };
        child.on('error', err => { out += String(err); done(-1); });
        child.on('close', done);
    });
}

// ── 7. The guard records writes under out/ and out-test/, and nothing else ───

/** A probe that writes into <root>/out-test, <root>/out and <root>/elsewhere by every kind of fs call. */
const PROBE = `'use strict';
const fs = require('fs'), path = require('path');
const root = process.env.${GUARD_ROOT_ENV};
(async () => {
    for (const d of ['out-test', 'out', 'elsewhere']) {
        const dir = path.join(root, d, 'sub');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'a.txt'), 'a');
        fs.appendFileSync(path.join(dir, 'a.txt'), 'b');
        fs.copyFileSync(path.join(dir, 'a.txt'), path.join(dir, 'b.txt'));
        fs.renameSync(path.join(dir, 'b.txt'), path.join(dir, 'c.txt'));
        await fs.promises.writeFile(path.join(dir, 'd.txt'), 'd');
        fs.closeSync(fs.openSync(path.join(dir, 'e.txt'), 'w'));
        await new Promise(r => { const s = fs.createWriteStream(path.join(dir, 'f.txt')); s.end('f', r); });
        fs.unlinkSync(path.join(dir, 'a.txt'));
        fs.rmSync(dir, { recursive: true, force: true });
    }
})();
`;

const EXPECTED_FNS = ['mkdirSync', 'writeFileSync', 'appendFileSync', 'copyFileSync', 'renameSync', 'writeFile',
    'openSync', 'createWriteStream', 'unlinkSync', 'rmSync'];

async function guardSelfCheck() {
    const tmp   = fs.mkdtempSync(path.join(os.tmpdir(), 'cvt-reg180-guard-'));
    const probe = path.join(tmp, 'probe.js');
    fs.writeFileSync(probe, PROBE, 'utf8');
    try {
        const r = await runOne(probe, { [GUARD_ROOT_ENV]: path.join(tmp, 'root') });
        const fnsIn = dir => r.writes.filter(w => w.split(' ').slice(1).join(' ').startsWith(path.join(tmp, 'root', dir) + path.sep))
            .map(w => w.split(' ')[0]);
        const missing = ['out-test', 'out'].flatMap(d => EXPECTED_FNS.filter(fn => !fnsIn(d).includes(fn)).map(fn => `${d}: ${fn}`));
        check('self-check: the guard records every kind of write under out/ and out-test/',
            r.code === 0 && missing.length === 0, `exit ${r.code}; not recorded: ${missing.join(', ')}\n       ${r.out.trim()}`);
        check('self-check: the guard records nothing outside out/ and out-test/',
            fnsIn('elsewhere').length === 0, r.writes.filter(w => w.includes('elsewhere')).join('\n       '));
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
}

(async () => {
    const before = snapshot();
    const bad = [];
    let runs = 0;
    for (let round = 1; round <= ROUNDS; round++) {
        const results = await Promise.all(LIVE.map(runOne));
        runs += results.length;
        for (const r of results) {
            const eperm = /\bEPERM\b|\bEBUSY\b/.test(r.out);
            if (r.code !== 0 || eperm) {
                const lines = r.out.split(/\r?\n/);
                const line  = lines.find(l => /\bEPERM\b|\bEBUSY\b/.test(l)) || lines.find(l => /✗|\bFAIL/.test(l)) || '';
                bad.push(`round ${round}: ${rel(r.file)} exit ${r.code}${eperm ? ' (EPERM/EBUSY)' : ''} ${line.trim().slice(0, 160)}`);
            }
            for (const w of r.writes) { bad.push(`round ${round}: ${rel(r.file)} wrote under out/ or out-test/: ${w}`); }
        }
    }
    check(`${runs} concurrent runs of the tests that shared the error log pass with no EPERM`,
        bad.length === 0, bad.join('\n       '));

    const after = snapshot();
    const changed = [...new Set([...before.keys(), ...after.keys()])].filter(k => before.get(k) !== after.get(k));
    check('none of them wrote, replaced or removed a file in out-test/data/ or out/data/',
        changed.length === 0, changed.join('\n       '));

    await guardSelfCheck();

    // ── 8. codebase-auditor.test.js keeps its fixtures out of the build (#832) ──
    const auditor = await runOne(path.join(TESTS, 'unit', 'codebase-auditor.test.js'));
    check('codebase-auditor.test.js passes under the build-write guard',
        auditor.code === 0, auditor.out.split(/\r?\n/).filter(l => /✗|FAIL/.test(l)).slice(0, 5).join('\n       '));
    check('codebase-auditor.test.js writes nothing under out/ or out-test/',
        auditor.writes.length === 0, auditor.writes.join('\n       '));

    console.log(`\nREG-180: ${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
})();
