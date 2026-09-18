// Copyright (c) CieloVista Software. All rights reserved.
// REG-177: Issue #813 — there is exactly one esbuild build config
//
// Run: node tests/regression/REG-177-one-esbuild-config.test.js
//
// scripts/esbuild.mjs was a copy of the root esbuild.mjs that arrived in the
// #453 bulk commit without a mention, and nothing ever ran it. The root file
// kept growing (the standalone modules the tests need, the doc-catalog HTML
// copy, out/data/) and the copy did not, so whoever edited scripts/esbuild.mjs
// changed nothing and was not told. Same shape as the two installers #793
// removed (REG-167).
//
// REG-171 cannot catch this: it checks that every file a script names exists,
// and an orphan config is a file nothing names.
//
// Guards: the root esbuild.mjs exists and is what compile, vscode:prepublish
// and mcp:build run, and no other file in the repo (outside node_modules,
// build output and tests/) is an esbuild build config. A build config is
// recognised by name (esbuild*.{js,mjs,cjs}, esbuild.config.*) or by content:
// it imports esbuild and names a shipped entry point, src/extension.ts or
// mcp-server/src/index.ts. The mcp-server is built by the root config and has
// no build config of its own. scripts/build-test-modules.mjs is not a second
// config: it transpiles every module unbundled into out-test/ for the unit
// tests (#734) and names no shipped entry point.

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
let passed = 0, failed = 0;
function check(name, ok, detail) {
    if (ok) { console.log(`  PASS ${name}`); passed++; }
    else    { console.error(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`); failed++; }
}

console.log('REG-177: one esbuild config (#813)');
console.log('-'.repeat(64));

check('the root esbuild.mjs exists', fs.existsSync(path.join(ROOT, 'esbuild.mjs')));
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
for (const name of ['compile', 'vscode:prepublish', 'mcp:build']) {
    const cmd = pkg.scripts[name] || '';
    check(`npm run ${name} runs the root esbuild.mjs`, /(^|&&\s*)node esbuild\.mjs(\s|$)/.test(cmd), cmd || '(missing)');
}
check('scripts/esbuild.mjs is gone', !fs.existsSync(path.join(ROOT, 'scripts', 'esbuild.mjs')));

const SKIP = new Set(['node_modules', '.git', 'out', 'out-test', 'dist', '.claude', '.vscode-test']);
const BY_NAME   = /^esbuild(\.config)?(\.[\w-]+)*\.(c|m)?js$/i;
const IMPORTS   = /from\s+['"]esbuild['"]|require\(\s*['"]esbuild['"]\s*\)/;
const SHIPPED   = /['"](\.\/)?(src\/extension\.ts|mcp-server\/src\/index\.ts)['"]/;
const configs = [];
(function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (SKIP.has(e.name)) { continue; }
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { walk(full); continue; }
        if (!/\.(c|m)?js$/.test(e.name)) { continue; }
        const rel = path.relative(ROOT, full).split(path.sep).join('/');
        if (rel === 'esbuild.mjs' || rel.startsWith('tests/')) { continue; }
        if (BY_NAME.test(e.name)) { configs.push(rel); continue; }
        let text;
        try { text = fs.readFileSync(full, 'utf8'); } catch { continue; }
        if (IMPORTS.test(text) && SHIPPED.test(text)) { configs.push(rel); }
    }
})(ROOT);
check('no other file is an esbuild build config', configs.length === 0, configs.join(', '));

console.log('-'.repeat(64));
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
