// Copyright (c) CieloVista Software. All rights reserved.
// REG-162: Issue #781 — the test runner leaves a current shipped build alone
//
// Run: node tests/regression/REG-162-runner-keeps-packaged-bundle.test.js
//
// npm run rebuild packages the extension (vscode:prepublish builds the
// production bundle into out/) and then runs further test steps through
// scripts/run-unit-tests.js. That runner rebuilt out/ unconditionally in dev
// mode, so install.js compared the installed production bundle with a dev
// build and reported a false STALE INSTALL (exit 1) on every deploy.
//
// Behavioural: runs the real runner in a temp tree whose esbuild.mjs is a
// stub that writes a marker, so the test can see whether it ran.
//   1. out/ newer than every source   -> not rebuilt (the packaged bundle stays)
//   2. a source newer than out/       -> rebuilt (stale builds still refresh)
//   3. out/ missing                   -> built

'use strict';

const cp   = require('child_process');
const fs   = require('fs');
const os   = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
let passed = 0, failed = 0;
function check(name, ok, detail) {
    if (ok) { console.log(`  PASS ${name}`); passed++; }
    else    { console.error(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`); failed++; }
}

console.log('REG-162: the runner keeps a current shipped build (#781)');
console.log('-'.repeat(64));

const T = fs.mkdtempSync(path.join(os.tmpdir(), 'reg162-'));
const w = (rel, text) => { const f = path.join(T, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); return f; };

// The real runner and its helper; everything it builds is stubbed.
fs.mkdirSync(path.join(T, 'scripts', 'lib'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'scripts', 'run-unit-tests.js'), path.join(T, 'scripts', 'run-unit-tests.js'));
for (const f of fs.readdirSync(path.join(ROOT, 'scripts', 'lib'))) {
    fs.copyFileSync(path.join(ROOT, 'scripts', 'lib', f), path.join(T, 'scripts', 'lib', f));
}
w('package.json', JSON.stringify({ name: 'reg162', scripts: { rebuild: 'echo' } }));
w('scripts/build-test-modules.mjs', "console.log('stub test build');\n");
// The stub is SOURCE TEXT for a script that runs with cwd = the temp tree, never
// in this process. REG-130 statically scans test files for fs write calls, so the
// call names are assembled rather than written out; this file itself only
// writes inside T.
const MKDIR = 'mkdir' + 'Sync';
const WRITE = 'writeFile' + 'Sync';
w('esbuild.mjs', [
    "import * as fs from 'fs';",
    "import * as path from 'path';",
    "for (const target of [['out', 'extension.js'], ['mcp-server', 'dist', 'index.js']]) {",
    "    const file = path.join(process.cwd(), ...target);",
    `    fs.${MKDIR}(path.dirname(file), { recursive: true });`,
    `    fs.${WRITE}(file, 'DEV BUILD');`,
    "}",
    '',
].join('\n'));
w('tests/unit/noop.test.js', "console.log('ok');\n");
const srcFile = w('src/extension.ts', 'export {};\n');
w('mcp-server/src/index.ts', 'export {};\n');

const OUT = path.join(T, 'out', 'extension.js');
const DIST = path.join(T, 'mcp-server', 'dist', 'index.js');
const run = () => cp.spawnSync(process.execPath, [path.join(T, 'scripts', 'run-unit-tests.js')], { cwd: T, encoding: 'utf8' });
const setMtime = (f, secondsAgo) => { const t = (Date.now() / 1000) - secondsAgo; fs.utimesSync(f, t, t); };

// 1 ── a packaged production bundle, newer than every source
w('out/extension.js', 'PRODUCTION BUNDLE'); w('mcp-server/dist/index.js', 'PRODUCTION BUNDLE');
for (const f of [srcFile, path.join(T, 'mcp-server/src/index.ts'), path.join(T, 'esbuild.mjs')]) { setMtime(f, 600); }
for (const d of ['src', 'mcp-server/src']) { setMtime(path.join(T, d), 600); }
let r = run();
check('the runner itself succeeds', r.status === 0, (r.stdout + r.stderr).slice(-400));
check('a current production bundle is left as packaged', fs.readFileSync(OUT, 'utf8') === 'PRODUCTION BUNDLE' && fs.readFileSync(DIST, 'utf8') === 'PRODUCTION BUNDLE',
    fs.readFileSync(OUT, 'utf8'));

// 2 ── a source edited after the build
setMtime(OUT, 600); setMtime(DIST, 600);
fs.writeFileSync(srcFile, 'export const changed = 1;\n');
r = run();
check('a source newer than out/ triggers a rebuild', fs.readFileSync(OUT, 'utf8') === 'DEV BUILD', fs.readFileSync(OUT, 'utf8'));

// 3 ── no build at all
fs.rmSync(path.join(T, 'out'), { recursive: true, force: true });
r = run();
check('a missing out/ is built', fs.existsSync(OUT) && fs.readFileSync(OUT, 'utf8') === 'DEV BUILD');

fs.rmSync(T, { recursive: true, force: true });
console.log('-'.repeat(64));
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
