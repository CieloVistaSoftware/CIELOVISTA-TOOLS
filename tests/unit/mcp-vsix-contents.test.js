/**
 * tests/unit/mcp-vsix-contents.test.js
 *
 * Fails if the packaged VSIX does not include MCP runtime SDK files.
 *
 * Run: node tests/unit/mcp-vsix-contents.test.js
 */
'use strict';

const assert = require('assert');
const cp = require('child_process');
const fs = require('fs');
const path = require('path');

function fail(msg) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
}

const root = path.join(__dirname, '..', '..');
const files = fs.readdirSync(root)
    .filter((name) => name.endsWith('.vsix'))
    .map((name) => {
        const full = path.join(root, name);
        return { name, full, mtime: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);

if (files.length === 0) {
    fail('No .vsix file found in repository root. Run npm run package first.');
}

const latest = files[0];

function getZipEntries(vsixPath) {
    const script = [
        "$ErrorActionPreference = 'Stop'",
        `Add-Type -AssemblyName System.IO.Compression.FileSystem; $zip = [System.IO.Compression.ZipFile]::OpenRead('${vsixPath.replace(/'/g, "''")}')`,
        "$zip.Entries | ForEach-Object { $_.FullName }",
        '$zip.Dispose()'
    ].join('; ');

    const output = cp.execSync(`powershell -NoProfile -Command \"${script}\"`, { encoding: 'utf8' });
    return output
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
}

let entries = [];
try {
    entries = getZipEntries(latest.full);
} catch (err) {
    fail(`Unable to inspect VSIX zip entries: ${err instanceof Error ? err.message : String(err)}`);
}

function hasPrefix(prefix) {
    return entries.some((name) => name.startsWith(prefix));
}

console.log(`Checking VSIX: ${latest.name}`);

const sdkPrefix = 'extension/node_modules/@modelcontextprotocol/sdk/';
const sdkDistPrefix = 'extension/node_modules/@modelcontextprotocol/sdk/dist/';
const mcpDistFile = 'extension/mcp-server/dist/index.js';

try {
    assert.ok(hasPrefix(sdkPrefix), `Missing ${sdkPrefix} in VSIX`);
    assert.ok(hasPrefix(sdkDistPrefix), `Missing ${sdkDistPrefix} in VSIX`);
    assert.ok(entries.includes(mcpDistFile), `Missing ${mcpDistFile} in VSIX`);
} catch (err) {
    fail(err.message);
}

console.log('PASS: VSIX contains MCP runtime SDK and mcp-server dist entry.');
process.exit(0);
