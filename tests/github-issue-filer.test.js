// Unit test for github-issue-filer's pure functions (buildTitle / buildBody).
// We can't exercise the real POST without creating actual GitHub issues, so
// this verifies only the deterministic shape of the issue payload.

'use strict';
const Module = require('module');
const path   = require('path');
const fs     = require('fs');

// Stub vscode (for the imports inside github-issue-filer)
const fakePath = path.resolve(__dirname, '.fake-vscode-issue-filer.js');
fs.writeFileSync(
    fakePath,
    `module.exports = {
        authentication: { getSession: async () => undefined },
        window: { showInformationMessage: async () => undefined, showErrorMessage: async () => undefined },
        env: { openExternal: async () => true },
        Uri: { parse: s => ({ toString: () => s }) }
    };`,
    'utf8'
);
const realResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
    if (request === 'vscode') { return fakePath; }
    return realResolve.call(this, request, parent, ...rest);
};

const filerPath = path.resolve(__dirname, '..', 'out', 'shared', 'github-issue-filer.js');
const filer = require(filerPath);

let passed = 0, failed = 0;
function expect(label, cond, detail) {
    if (cond) { console.log('  PASS - ' + label); passed++; }
    else      { console.log('  FAIL - ' + label + (detail ? ': ' + detail : '')); failed++; }
}

const sampleEntry = {
    id:        2093645211,
    timestamp: '2026-04-25T22:35:43.123Z',
    type:      'COMMAND_ERROR',
    prefix:    '[mcp-server-status]',
    context:   'mcp-server-status',
    command:   '',
    message:   'MCP process exited unexpectedly: process killed by signal SIGTERM',
    stack:     'Error: MCP process exited unexpectedly: process killed by signal SIGTERM\n    at ChildProcess.<anonymous> (C:\\foo\\bar.js:42:11)\n    at ChildProcess.emit (node:events:514:28)\n    at maybeClose (node:internal/child_process:1101:16)',
    filename:  'bar.js',
    lineno:    42,
    colno:     11,
    raw:       'MCP process exited unexpectedly: process killed by signal SIGTERM',
};

console.log('=== buildTitle ===');
const title = filer.buildTitle(sampleEntry);
console.log(`  Title: ${title}`);
expect('starts with [type] tag', title.startsWith('[COMMAND_ERROR] '));
expect('under 100 chars total', title.length < 100, `len=${title.length}`);
expect('contains message stem', title.includes('MCP process'));

console.log('');
console.log('=== buildBody ===');
const body = filer.buildBody(sampleEntry);
console.log(`  Body length: ${body.length} chars`);
expect('contains type field',         body.includes('**Type:** `COMMAND_ERROR`'));
expect('contains source prefix',      body.includes('**Source:** [mcp-server-status]'));
expect('contains context',            body.includes('**Context:** `mcp-server-status`'));
expect('contains timestamp',          body.includes('**Timestamp:** 2026-04-25T22:35:43.123Z'));
expect('contains location',           body.includes('**Location:** `bar.js:42:11`'));
expect('contains message section',    body.includes('### Message'));
expect('contains stack section',      body.includes('### Stack trace'));
expect('contains stack frame',        body.includes('at ChildProcess.<anonymous>'));
expect('contains auto-fil note',      body.includes('Auto-filed from CVT Error Log Viewer'));

// Truncation behavior
console.log('');
console.log('=== buildTitle truncation ===');
const longMsg = 'x'.repeat(200);
const longEntry = { ...sampleEntry, message: longMsg };
const longTitle = filer.buildTitle(longEntry);
console.log(`  Long title: ${longTitle.slice(0, 50)}... (${longTitle.length} chars)`);
expect('truncates to ~80 char message', longTitle.length < 100);
expect('ends with ellipsis',            longTitle.endsWith('\u2026'));

// Empty fields don't crash
console.log('');
console.log('=== buildBody with sparse entry ===');
const sparse = {
    id: 0, timestamp: '2026-01-01T00:00:00Z', type: 'APP_ERROR',
    prefix: '[?]', context: '', command: '', message: 'short error',
    stack: '', filename: '', lineno: 0, colno: 0, raw: 'short error',
};
const sparseBody = filer.buildBody(sparse);
expect('no Context line when empty',   !sparseBody.includes('**Context:**'));
expect('no Command line when empty',   !sparseBody.includes('**Command:**'));
expect('no Location when no filename', !sparseBody.includes('**Location:**'));
expect('no Stack section when empty',  !sparseBody.includes('### Stack trace'));
expect('still has Type + Message',     sparseBody.includes('**Type:** `APP_ERROR`') && sparseBody.includes('### Message'));

console.log('');
console.log(`=== Result: ${passed} passed, ${failed} failed ===`);
fs.unlinkSync(fakePath);
process.exit(failed > 0 ? 1 : 0);
