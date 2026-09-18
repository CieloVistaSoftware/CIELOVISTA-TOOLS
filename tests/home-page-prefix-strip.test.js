// Copyright (c) CieloVista Software. All rights reserved.
// Test for home-page.ts: a command's label under its group heading does not
// repeat the group prefix the heading already shows.
//
// Run: node tests/home-page-prefix-strip.test.js
//
// Runs the real rule, commandLabel() from the out-test build of
// src/features/home-page.ts, over the real groups buildGroupedCommands()
// makes from package.json (#823). Until #823 this test grouped and stripped
// with its own copy of the logic, so the page could change and it stayed green.

'use strict';

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const Module = require('module');

const HOME_OUT = path.join(__dirname, '..', 'out-test', 'features', 'home-page.js');
if (!fs.existsSync(HOME_OUT)) {
    // Not a skip: the runners build out-test/ first, so this is a real failure.
    console.error(`FAIL: out-test build missing: ${HOME_OUT}. Run through node scripts/run-unit-tests.js, which builds it.`);
    process.exit(1);
}

const origLoad = Module._load;
Module._load = function (req) { return req === 'vscode' ? {} : origLoad.apply(this, arguments); };
const { buildGroupedCommands, commandLabel } = require(HOME_OUT);
Module._load = origLoad;

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log(`  PASS ${name}`); passed++; }
    catch (e) { console.error(`  FAIL ${name}\n       ${e.message}`); failed++; }
}

test('commandLabel drops the "Group:" prefix', () => {
    assert.strictEqual(commandLabel('Docs: Open Catalog'), 'Open Catalog');
});
test('commandLabel keeps a title with no prefix whole', () => {
    assert.strictEqual(commandLabel('Open Home Dashboard'), 'Open Home Dashboard');
});
test('commandLabel strips only up to the first colon', () => {
    assert.strictEqual(commandLabel('Audit: Step 1: Scan'), 'Step 1: Scan');
});

const pkg      = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const commands = (pkg.contributes && pkg.contributes.commands) || [];
const grouped  = buildGroupedCommands(new Set(commands.map(c => c.command)));

test('buildGroupedCommands groups the package.json commands', () => {
    assert.ok(Object.keys(grouped).length > 1, `got ${Object.keys(grouped).length} group(s)`);
});

test('no label in a group starts with that group\'s prefix', () => {
    const bad = [];
    for (const [prefix, cmds] of Object.entries(grouped)) {
        for (const cmd of cmds) {
            const label = commandLabel(cmd.title);
            if (prefix !== 'Other' && label.startsWith(prefix)) { bad.push(`${cmd.command}: '${label}' in '${prefix}'`); }
        }
    }
    assert.deepStrictEqual(bad, []);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
