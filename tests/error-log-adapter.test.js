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

check('getLogSourceSummary counts the workspace log',
    /workspace: 2\b/.test(adapter.getLogSourceSummary()), adapter.getLogSourceSummary());

process.chdir(ROOT);
fs.rmSync(STUB_DIR, { recursive: true, force: true });

if (failed) {
    console.log(`\nFAIL — ${failed} check(s) failed`);
    process.exit(1);
}
console.log('\nPASS — adapter returns unified entries with the viewer-expected shape');
