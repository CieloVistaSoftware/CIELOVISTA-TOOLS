// Copyright (c) CieloVista Software. All rights reserved.
// REG-165: Issue #778 — cvs.commands.quickRun shows the quick pick its title
// promises, not the launcher panel
//
// Run: node tests/regression/REG-165-quick-run-is-a-quick-pick.test.js
//
// #778: "Commands: Quick Run (quick pick)" was registered with the same
// handler as cvs.commands.showAll (showLauncherPanel), so it opened the
// launcher webview. Its title and description both promised a quick pick.
// The fix keeps the command and makes it true: quick-run.ts shows every
// registered launcher catalog command in a quick pick (label = title,
// description = group, detail = description) and runs the one picked.
//
// Guards:
//   1. Wiring: index.ts registers cvs.commands.quickRun with showQuickRun, and
//      no longer with showLauncherPanel.
//   2. Behaviour (out-test/ modules, mocked vscode): running the command shows
//      one quick pick of the real catalog, opens no webview panel, and runs
//      exactly the picked command; dismissing the pick runs nothing; a command
//      VS Code has not registered is not offered.
//   3. The launcher has an entry for it, now that it is no longer the
//      launcher-opener REG-156 exempts, and package.json still says "quick pick".

'use strict';

const fs     = require('fs');
const path   = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..', '..');
let passed = 0, failed = 0;
function check(name, ok, detail) {
    if (ok) { console.log(`  PASS ${name}`); passed++; }
    else    { console.error(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`); failed++; }
}
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

console.log('REG-165: cvs.commands.quickRun is a quick pick (#778)');
console.log('-'.repeat(64));

// 1 ── wiring
const indexSrc = read('src/features/cvs-command-launcher/index.ts');
const reg = indexSrc.match(/registerCommand\(\s*QUICKRUN_COMMAND_ID\s*,([^\n]*)/);
check('index.ts registers cvs.commands.quickRun', !!reg);
check('cvs.commands.quickRun is not handled by showLauncherPanel',
    !!reg && !/showLauncherPanel/.test(reg[1]), reg ? reg[1].trim() : '');
check('cvs.commands.quickRun is handled by showQuickRun',
    !!reg && /showQuickRun\b/.test(reg[1]), reg ? reg[1].trim() : '');

// 2 ── behaviour
const OUT_DIR = path.join(ROOT, 'out-test', 'features', 'cvs-command-launcher');
const QR_OUT  = path.join(OUT_DIR, 'quick-run.js');
if (!fs.existsSync(QR_OUT)) {
    check('out-test/features/cvs-command-launcher/quick-run.js is built (the runner builds out-test/ every run)', false, QR_OUT);
} else {
    const calls = { quickPicks: [], executed: [], panels: 0 };
    let registeredIds = null;   // null = every catalog id
    let choose = items => items[0];
    const vscodeMock = {
        commands: {
            async getCommands() { return registeredIds ?? CATALOG.map(c => c.id); },
            async executeCommand(id) { calls.executed.push(id); },
            registerCommand() { return { dispose() {} }; },
        },
        window: {
            async showQuickPick(items, options) { calls.quickPicks.push({ items, options }); return choose(items); },
            createWebviewPanel() { calls.panels++; throw new Error('quick run must not open a webview panel'); },
        },
        ViewColumn: {},
    };
    const origLoad = Module._load;
    Module._load = function (req, parent, isMain) {
        if (req === 'vscode') { return vscodeMock; }
        return origLoad.call(this, req, parent, isMain);
    };
    let CATALOG, qr;
    try {
        CATALOG = require(path.join(OUT_DIR, 'catalog.js')).CATALOG;
        qr      = require(QR_OUT);
    } finally { Module._load = origLoad; }

    (async () => {
        const reset = () => { calls.quickPicks = []; calls.executed = []; calls.panels = 0; };

        // Picks the fifth entry, so the test cannot pass by always running the first.
        reset();
        choose = items => items[4];
        await qr.showQuickRun(CATALOG);
        const pick = calls.quickPicks[0];
        check('running it shows exactly one quick pick', calls.quickPicks.length === 1, `${calls.quickPicks.length} shown`);
        check('it opens no webview panel', calls.panels === 0);
        check(`the quick pick lists every registered catalog command (${CATALOG.length})`,
            !!pick && pick.items.length === CATALOG.length, pick ? `${pick.items.length} items` : 'no pick');
        const fifth = CATALOG[4];
        const row = pick && pick.items[4];
        check('each row shows the launcher title as label, the group as description, the description as detail',
            !!row && row.label === fifth.title && row.description === fifth.group && row.detail === fifth.description,
            JSON.stringify(row));
        check('it runs exactly the picked command', calls.executed.length === 1 && calls.executed[0] === fifth.id,
            `executed: ${calls.executed.join(', ') || '(none)'}`);

        reset();
        choose = () => undefined;
        await qr.showQuickRun(CATALOG);
        check('dismissing the quick pick runs nothing', calls.quickPicks.length === 1 && calls.executed.length === 0,
            `executed: ${calls.executed.join(', ')}`);

        reset();
        registeredIds = CATALOG.slice(1).map(c => c.id);
        choose = () => undefined;
        await qr.showQuickRun(CATALOG);
        const ids = (calls.quickPicks[0]?.items ?? []).map(i => i.id);
        check('a command VS Code has not registered is not offered',
            !ids.includes(CATALOG[0].id) && ids.length === CATALOG.length - 1, `${ids.length} offered`);

        finish();
    })().catch(err => { check('behaviour checks ran', false, err && err.stack || String(err)); finish(); });
}

// 3 ── catalogue and palette text
function staticChecks() {
    const catalogSrc = read('src/features/cvs-command-launcher/catalog.ts');
    check('the launcher catalog has an entry for cvs.commands.quickRun',
        /\bid:\s*'cvs\.commands\.quickRun'/.test(catalogSrc));
    const pkg = JSON.parse(read('package.json'));
    const c = (pkg.contributes.commands || []).find(x => x.command === 'cvs.commands.quickRun');
    check('package.json still contributes it, titled and described as a quick pick',
        !!c && /quick pick/i.test(c.title) && /quick pick/i.test(c.description || ''), JSON.stringify(c));
}

let finished = false;
function finish() {
    if (finished) { return; }
    finished = true;
    staticChecks();
    console.log('-'.repeat(64));
    console.log(`${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
}
if (!fs.existsSync(QR_OUT)) { finish(); }
