// Stub vscode (we're outside the extension host) and exercise the adapter.
//
// The test owns its environment (#736). It used to point the adapter at the
// repo checkout and require 50+ entries in the developer's real
// .vscode/logs/cielovista-errors.json, so it failed on every clean checkout
// and on CI. It now writes its own utils-style log into a temp workspace and
// runs with that workspace as both the VS Code workspace folder and cwd.
'use strict';
const Module = require('module');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');

// Stubs are written to a private temp dir, never into tests/ (#734): copies of
// them had been committed, so every run of this test deleted tracked files.
const STUB_DIR  = fs.mkdtempSync(path.join(os.tmpdir(), 'cvt-adapter-'));
const WORKSPACE = path.join(STUB_DIR, 'workspace');
const LOG_DIR   = path.join(WORKSPACE, '.vscode', 'logs');
fs.mkdirSync(LOG_DIR, { recursive: true });

// Utils-style entries (shared/error-log-utils.ts ErrorEntry), as the
// extension writes them to .vscode/logs/cielovista-errors.json.
const FIXTURE = [
    {
        id: 'err_1a2b', timestamp: '2026-01-01T10:00:00.000Z', lastOccurred: '2026-01-01T10:05:00.000Z',
        count: 3, message: 'Unexpected token < in JSON at position 0',
        stacktrace: 'SyntaxError: Unexpected token\n    at parse (C:\\repo\\out\\shared\\reader.js:12:34)',
        context: 'doc-catalog', solved: false,
    },
    {
        id: 'err_3c4d', timestamp: '2026-01-02T09:00:00.000Z', lastOccurred: '2026-01-02T09:00:00.000Z',
        count: 1, message: 'ENOENT: no such file or directory, open missing.md',
        stacktrace: 'Error: ENOENT\n    at readFileSync (/repo/out/shared/files.js:7:9)',
        context: 'doc-preview', solved: false,
    },
];
fs.writeFileSync(path.join(LOG_DIR, 'cielovista-errors.json'), JSON.stringify(FIXTURE, null, 2), 'utf8');

// The extension's data dir holds the legacy log and the data utils log. Point
// CVT_DATA_DIR at a temp dir so neither the checkout's nor the developer's is read.
const DATA_DIR = path.join(STUB_DIR, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.CVT_DATA_DIR = DATA_DIR;

// Data utils log: an older copy of err_1a2b (must collapse into the workspace
// copy), a solved entry, and junk that must not crash getErrors().
const DATA_FIXTURE = [
    { ...FIXTURE[0], lastOccurred: '2026-01-01T10:01:00.000Z', count: 2 },
    {
        id: 'err_5e6f', timestamp: '2026-01-03T08:00:00.000Z', lastOccurred: '2026-01-03T08:00:00.000Z',
        count: 1, message: '[bg-health] stale bug', stacktrace: '', context: 'background-health-runner',
        solved: true, solution: 'Fixed — bg-health no longer detects this.',
    },
    null,
    'junk',
];
fs.writeFileSync(path.join(DATA_DIR, 'cielovista-errors.json'), JSON.stringify(DATA_FIXTURE, null, 2), 'utf8');

// Legacy log: one error logged three times (id 42), and id 6699 (= 0x1a2b),
// which used to collide with the utils entry err_1a2b.
const legacyEntry = (id, timestamp, message) => ({
    id, timestamp, type: 'APP_ERROR', prefix: '[legacy]', context: '', command: '',
    message, stack: '', filename: '', lineno: 0, colno: 0, raw: message,
});
const LEGACY = {
    lastUpdated: '2026-01-04T00:00:00.000Z', count: 4,
    errors: [
        legacyEntry(42, '2026-01-01T00:00:00.000Z', 'repeated legacy error'),
        legacyEntry(42, '2026-01-04T00:00:00.000Z', 'repeated legacy error'),
        legacyEntry(6699, '2026-01-02T12:00:00.000Z', 'legacy id that matches 0x1a2b'),
        legacyEntry(42, '2026-01-03T00:00:00.000Z', 'repeated legacy error'),
    ],
};
fs.writeFileSync(path.join(DATA_DIR, 'tools-errors.json'), JSON.stringify(LEGACY, null, 2), 'utf8');

const fakePath = path.join(STUB_DIR, 'fake-vscode-adapter.js');
fs.writeFileSync(
    fakePath,
    `module.exports = {
         workspace: { workspaceFolders: [{ uri: { fsPath: ${JSON.stringify(WORKSPACE)} }, name: 'fixture' }] },
         window: {}, ViewColumn: { One: 1 }, Uri: { parse: s => ({ toString: () => s }) }, env: {}
     };`,
    'utf8'
);
const realResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
    if (request === 'vscode') { return fakePath; }
    return realResolve.call(this, request, parent, ...rest);
};

// The adapter also reads <cwd>/.vscode/logs; run from the fixture workspace so
// the developer's real log is never read.
const ROOT = path.resolve(__dirname, '..');
process.chdir(WORKSPACE);

const adapterPath = path.join(ROOT, 'out-test', 'shared', 'error-log-adapter.js');
const adapter = require(adapterPath);

let failed = 0;
function check(label, cond, detail) {
    if (cond) { console.log('  PASS - ' + label); }
    else      { console.log('  FAIL - ' + label + (detail ? ': ' + detail : '')); failed++; }
}

console.log('=== Adapter integration test ===');

const errors = adapter.getErrors();
console.log(`getErrors() returned ${errors.length} entries`);

const expectedFields = ['id','timestamp','type','prefix','context','command','message','stack','filename','lineno','colno','raw'];
const json = errors.find(e => e.raw === FIXTURE[0].message);
const io   = errors.find(e => e.raw === FIXTURE[1].message);

check('both fixture entries are returned', !!json && !!io);
if (json && io) {
    const missing = expectedFields.filter(f => !(f in json));
    check('entry has every field the viewer expects', missing.length === 0, missing.join(', '));
    check('timestamp is lastOccurred', json.timestamp === FIXTURE[0].lastOccurred, json.timestamp);
    check('type inferred from message (JSON)', json.type === 'JSON_PARSE_ERROR', json.type);
    check('type inferred from message (file I/O)', io.type === 'FILE_IO_ERROR', io.type);
    check('prefix built from context', json.prefix === '[doc-catalog]', json.prefix);
    check('repeat count shown in message', json.message.includes('3'), json.message);
    check('single occurrence message unchanged', io.message === FIXTURE[1].message, io.message);
    check('stack top parsed (filename)', io.filename === 'files.js', io.filename);
    check('stack top parsed (line/col)', io.lineno === 7 && io.colno === 9, `${io.lineno}:${io.colno}`);
    check('sorted by timestamp ascending', errors.indexOf(json) < errors.indexOf(io));
}

const again = adapter.getErrors();
check('reading twice returns the same count (no duplication)', again.length === errors.length);

check('one entry per distinct error (3 utils + 2 legacy)', errors.length === 5, String(errors.length));
check('ids are unique across both logs', new Set(errors.map(e => e.id)).size === errors.length,
    errors.map(e => e.id).join(', '));

const utilsCopies = errors.filter(e => e.raw === FIXTURE[0].message);
check('a utils id in two log files shows once', utilsCopies.length === 1, String(utilsCopies.length));
check('the newest copy wins', json && json.count === 3 && json.timestamp === FIXTURE[0].lastOccurred,
    json && `${json.count} @ ${json.timestamp}`);

const repeated = errors.filter(e => e.raw === 'repeated legacy error');
check('legacy repeats collapse into one entry', repeated.length === 1, String(repeated.length));
if (repeated.length === 1) {
    const r = repeated[0];
    check('collapsed legacy entry has a string id', r.id === 'legacy_42', r.id);
    check('collapsed legacy entry counts occurrences', r.count === 3 && r.message.endsWith('(×3)'), r.message);
    check('collapsed legacy entry shows the newest timestamp', r.timestamp === '2026-01-04T00:00:00.000Z', r.timestamp);
}

const solved = errors.find(e => e.id === 'err_5e6f');
check('solved flag and solution are carried through', !!solved && solved.solved === true && !!solved.solution);
check('a solved entry is not active', !!solved && adapter.isActiveError(solved) === false);
check('an unsolved, unfiled entry is active', !!io && adapter.isActiveError(io) === true);
check('active count excludes the solved entry', errors.filter(adapter.isActiveError).length === 4,
    String(errors.filter(adapter.isActiveError).length));

// Filing a legacy error patches every occurrence, and never a utils entry.
adapter.patchEntry('legacy_6699', 7, 'https://example.test/7');
adapter.patchEntry('legacy_42', 8, 'https://example.test/8');
const legacyAfter = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'tools-errors.json'), 'utf8')).errors;
check('every occurrence of a legacy error is patched',
    legacyAfter.filter(e => e.id === 42).every(e => e.githubIssueNumber === 8));
const wsAfter = JSON.parse(fs.readFileSync(path.join(LOG_DIR, 'cielovista-errors.json'), 'utf8'));
check('patching legacy_6699 leaves utils err_1a2b alone', wsAfter[0].githubIssueNumber === undefined);

adapter.patchEntry('err_1a2b', 9, 'https://example.test/9');
const filed = adapter.getErrors().find(e => e.id === 'err_1a2b');
check('a filed utils entry reads back as filed', !!filed && filed.githubIssueNumber === 9 && !adapter.isActiveError(filed));
const filedLegacy = adapter.getErrors().find(e => e.id === 'legacy_42');
check('a filed legacy entry reads back as filed', !!filedLegacy && filedLegacy.githubIssueNumber === 8);

check('getLogSourceSummary counts the workspace log',
    /workspace: 2\b/.test(adapter.getLogSourceSummary()), adapter.getLogSourceSummary());

process.chdir(ROOT);
fs.rmSync(STUB_DIR, { recursive: true, force: true });

if (failed) {
    console.log(`\nFAIL — ${failed} check(s) failed`);
    process.exit(1);
}
console.log('\nPASS — adapter returns unified entries with the viewer-expected shape');
