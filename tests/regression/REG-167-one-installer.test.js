// Copyright (c) CieloVista Software. All rights reserved.
// REG-167: Issue #793 — there is exactly one installer
//
// Run: node tests/regression/REG-167-one-installer.test.js
//
// scripts/install.js was a diverged copy of the root install.js: it lacked
// verifyInstalledMatchesSource(), still copied node_modules in its fallback
// path (which post-install.test.js says must never happen), and nothing ran
// it. Two installers that disagree is duplicate code with a trap in it:
// whoever runs the wrong one gets the old behaviour.
//
// Guards: the root install.js exists and is what `npm run rebuild` runs, and
// no other file in the repo (outside node_modules and build output) defines an
// installer, recognised by the two functions every copy has carried.

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
let passed = 0, failed = 0;
function check(name, ok, detail) {
    if (ok) { console.log(`  PASS ${name}`); passed++; }
    else    { console.error(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`); failed++; }
}

console.log('REG-167: one installer (#793)');
console.log('-'.repeat(64));

check('the root install.js exists', fs.existsSync(path.join(ROOT, 'install.js')));
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
check('npm run rebuild runs the root install.js', /(^|&&\s*)node install\.js(\s|$)/.test(pkg.scripts.rebuild), pkg.scripts.rebuild);
check('scripts/install.js is gone', !fs.existsSync(path.join(ROOT, 'scripts', 'install.js')));

const SKIP = new Set(['node_modules', '.git', 'out', 'out-test', 'dist', '.claude', '.vscode-test']);
const INSTALLER = /function\s+verifyInstalledFiles\s*\(|function\s+removeInstalledRootWithRetry\s*\(/;
const copies = [];
(function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (SKIP.has(e.name)) { continue; }
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { walk(full); continue; }
        if (!/\.(c|m)?js$/.test(e.name)) { continue; }
        const rel = path.relative(ROOT, full).split(path.sep).join('/');
        if (rel === 'install.js' || rel.startsWith('tests/')) { continue; }
        let text;
        try { text = fs.readFileSync(full, 'utf8'); } catch { continue; }
        if (INSTALLER.test(text)) { copies.push(rel); }
    }
})(ROOT);
check('no other file defines an installer', copies.length === 0, copies.join(', '));

console.log('-'.repeat(64));
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
