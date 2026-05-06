/**
 * tests/unit/mcp-vsix-contents.test.js
 *
 * Verifies the packaged VSIX contains the esbuild-bundled MCP server entry
 * and does NOT contain node_modules (which are now inlined by esbuild).
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

function has(entry) {
    return entries.includes(entry);
}
function hasPrefix(prefix) {
    return entries.some((name) => name.startsWith(prefix));
}

console.log(`Checking VSIX: ${latest.name} (${entries.length} entries)`);

const mcpDistFile  = 'extension/mcp-server/dist/index.js';
const extFile      = 'extension/out/extension.js';
const nodeModules  = 'extension/node_modules/';

try {
    assert.ok(has(mcpDistFile),   `Missing ${mcpDistFile} in VSIX`);
    assert.ok(has(extFile),       `Missing ${extFile} in VSIX`);
    assert.ok(!hasPrefix(nodeModules), `VSIX must not contain node_modules — deps should be inlined by esbuild (found ${nodeModules})`);
} catch (err) {
    fail(err.message);
}

console.log('PASS: VSIX contains bundled extension + MCP server and excludes node_modules.');
process.exit(0);
