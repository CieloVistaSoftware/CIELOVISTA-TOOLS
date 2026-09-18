// Copyright (c) CieloVista Software. All rights reserved.
// REG-141: Issue #728 — the Doc Catalog no longer launches a demo server from wb-core
//
// Run: node tests/regression/REG-141-no-wb-core-demo-server.test.js
//
// The catalog showed a "Demo" button on wb-core cards. Clicking it spawned
// `demo-server.js` from the literal path C:\dev\wb-core, detached with
// stdio:'ignore', so on any machine without that directory it failed with no
// output. wb-core is abandoned; wb-starter is the source of truth. The feature
// was deleted, not redirected.
//
// This replaces REG-046 (#369), which tested that handler's port polling.
// Deleting the handler made REG-046 test nothing, so it went too.
//
// Guards, in the three places the feature lived:
//   1. commands.ts   has no 'wb-demo' message handler
//   2. html.ts       renders no Demo button
//   3. catalog.html  posts no 'wb-demo' message and styles no .btn-demo
// And the one that stops it coming back in another shape:
//   4. no source file under src/ names C:\dev\wb-core

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const CAT  = path.join(ROOT, 'src', 'features', 'doc-catalog');

let passed = 0;
let failed = 0;

function check(name, ok, detail) {
    if (ok) { console.log(`  PASS ${name}`); passed += 1; }
    else    { console.error(`  FAIL ${name}\n       ${detail}`); failed += 1; }
}

function read(file) { return fs.readFileSync(file, 'utf8'); }

console.log('REG-141: no wb-core demo server in the Doc Catalog (#728)');
console.log('-'.repeat(64));

const commands = read(path.join(CAT, 'commands.ts'));
check('commands.ts has no wb-demo handler',
    !commands.includes("'wb-demo'"),
    "found 'wb-demo' in commands.ts — the demo-server launcher is back");

const html = read(path.join(CAT, 'html.ts'));
check('html.ts renders no Demo button',
    !html.includes('btn-demo') && !html.includes('wb-demo'),
    'html.ts still builds a btn-demo / wb-demo button');

const page = read(path.join(CAT, 'catalog.html'));
check('catalog.html neither posts wb-demo nor styles .btn-demo',
    !page.includes('wb-demo') && !page.includes('.btn-demo'),
    'catalog.html still wires or styles the demo button');

// A path to one machine's copy of an abandoned repo is the root defect.
// REG-127 does not catch it because C:\dev is not under a user profile.
const WB_CORE_PATH = /C:(\\\\|\\|\/)dev(\\\\|\\|\/)wb-core/i;
const offenders = [];
(function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!/\.(ts|js|html)$/.test(entry.name)) { continue; }
        if (WB_CORE_PATH.test(read(full))) { offenders.push(path.relative(ROOT, full)); }
    }
})(path.join(ROOT, 'src'));
check('no file under src/ names C:\\dev\\wb-core',
    offenders.length === 0,
    `hardcoded wb-core path in: ${offenders.join(', ')}`);

console.log('-'.repeat(64));
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
