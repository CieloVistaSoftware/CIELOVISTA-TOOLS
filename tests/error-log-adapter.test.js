// Stub vscode (we're outside the extension host) and exercise the adapter.
'use strict';
const Module = require('module');
const path   = require('path');
const fs     = require('fs');

// Stub vscode.workspace.workspaceFolders to point at the cielovista-tools
// repo, since that's where .vscode/logs/cielovista-errors.json lives.
const fakePath = path.resolve(__dirname, '.fake-vscode-adapter.js');
fs.writeFileSync(
    fakePath,
    `const path = require('path');
     const repoRoot = ${JSON.stringify(path.resolve(__dirname, '..'))};
     module.exports = {
         workspace: { workspaceFolders: [{ uri: { fsPath: repoRoot }, name: 'cielovista-tools' }] },
         window: {}, ViewColumn: { One: 1 }, Uri: { parse: s => ({ toString: () => s }) }, env: {}
     };`,
    'utf8'
);
const realResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
    if (request === 'vscode') { return fakePath; }
    return realResolve.call(this, request, parent, ...rest);
};

// Stub the output-channel module (legacy error-log.ts pulls it in)
const ocPath = path.resolve(__dirname, '.fake-output-channel.js');
fs.writeFileSync(ocPath, `module.exports = { getChannel: () => ({ appendLine: () => {} }), log: () => {} };`, 'utf8');

const adapterPath = path.resolve(__dirname, '..', 'out', 'shared', 'error-log-adapter.js');
const adapter = require(adapterPath);

console.log('=== Adapter integration test ===');

const errors = adapter.getErrors();
console.log(`getErrors() returned ${errors.length} entries`);

if (errors.length === 0) {
    console.log('FAIL — expected errors from cielovista-errors.json (which has ~50+ entries on disk)');
    fs.unlinkSync(fakePath); fs.unlinkSync(ocPath);
    process.exit(1);
}

console.log('First entry shape:');
const e = errors[0];
const expectedFields = ['id','timestamp','type','prefix','context','command','message','stack','filename','lineno','colno','raw'];
for (const f of expectedFields) {
    const v = e[f];
    const display = (typeof v === 'string' ? v.slice(0, 60) : String(v));
    console.log(`  ${f.padEnd(10)} ${typeof v} : ${display}`);
}

// Validate shape — the viewer expects all these fields
const missing = expectedFields.filter(f => !(f in e));
if (missing.length > 0) {
    console.log(`FAIL — missing fields: ${missing.join(', ')}`);
    fs.unlinkSync(fakePath); fs.unlinkSync(ocPath);
    process.exit(1);
}

console.log('');
console.log(`Sample of last 3 entries (newest):`);
errors.slice(-3).forEach(e => console.log(`  [${e.timestamp.slice(0,19)}] ${e.prefix} ${e.message.slice(0,80)}`));

console.log('');
console.log('=== getLogPath ===');
console.log(`  ${adapter.getLogPath()}`);

console.log('');
console.log('PASS — adapter returns', errors.length, 'unified entries with the viewer-expected shape');

// Cleanup
fs.unlinkSync(fakePath); fs.unlinkSync(ocPath);
