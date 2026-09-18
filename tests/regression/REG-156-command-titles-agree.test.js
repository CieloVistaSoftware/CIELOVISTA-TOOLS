// Copyright (c) CieloVista Software. All rights reserved.
// REG-156: Issue #761 — every command has one name, and every command is
// reachable
//
// Run: node tests/regression/REG-156-command-titles-agree.test.js
//
// #761 reported cvs.launch.pick as titled "Install Missing Corequisite
// Extensions". It never was: git log -S shows that title was added in ff44b44
// for cvs.corequisites.install and has belonged to it ever since, and
// cvs.launch.pick has been "Pick Any Project Action" in every commit. The
// report came from reading a unified diff, where the last context line of one
// hunk (cvs.launch.pick) sat directly above the first context line of the next
// hunk (the corequisites title, 300 lines further down the file).
//
// The report was wrong, but the question it asked had no guard: nothing
// compared a command's Command Palette title (package.json) with its launcher
// title (src/features/cvs-command-launcher/catalog.ts), or either list with
// what src/ actually registers. The sweep for #761 found 71 commands whose two
// titles differed as written (34 still differ under rule 3 below), 10 palette
// commands missing from the launcher, and 9 registered commands that are not
// contributed. #761 fixed the 8 title pairs where one side was plainly wrong;
// the rest are wording decisions and are filed.
//
// Those filed lists were then worked down: #766 contributed 3 unreachable
// commands, #765 put 7 palette commands in the launcher, and #764 gave the
// 26 remaining pairs one name each and dropped emoji from launcher titles
// (checked below). What is still allow-listed waits on #768 or has a reason.
//
// Rules, across ALL commands:
//   1. Every launcher catalog entry is contributed in package.json.
//   2. Every contributed command is registered by a registerCommand() in src/.
//   3. A command's package.json title and launcher title agree once a leading
//      area prefix is removed from each. The palette writes the prefix as
//      "Docs: ", the launcher's Project Launcher group as "SnapIt — ", and the
//      launcher often drops it because the group header already says it. So
//      "Docs: Search All Docs" agrees with "Search All Docs", and
//      "DiskCleanUp: Console Mode" with "DiskCleanUp — Console Mode". What is
//      left must match exactly, case included.
//   4. Every contributed command is in the launcher catalog.
//   5. Every registered command is contributed.
// Exceptions to 3, 4 and 5 are listed below, each with the issue that owns it.
// An exception that no longer applies fails the test, so the lists only shrink.

'use strict';

const fs   = require('fs');
const path = require('path');
const { walkFiles } = require('../../scripts/source-tree-walk');

const ROOT = path.resolve(__dirname, '..', '..');
let passed = 0, failed = 0;
function check(name, ok, detail) {
    if (ok) { console.log(`  PASS ${name}`); passed++; }
    else    { console.error(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`); failed++; }
}
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const list = ids => ids.join(', ');

console.log('REG-156: every command has one name, and every command is reachable (#761)');
console.log('-'.repeat(64));

// ── Exceptions ───────────────────────────────────────────────────────────────

// Rule 3. Titles that differ in wording, not just in prefix. #764 chose one
// name for each of the 26 it listed, so this is empty; a new entry needs an
// issue that owns the wording decision.
const TITLE_MISMATCH_ALLOWED = new Set([
]);

// Rule 4. Palette commands with no launcher entry. #765 catalogued seven; these
// stay out. The two launcher commands open the launcher itself, so an entry
// inside it would only reopen the panel you are in (#778 asks whether quickRun
// should exist at all). #768 deleted config-editor and its cvs.config.edit.
const NOT_IN_CATALOG_ALLOWED = new Set([
    'cvs.commands.showAll',               // #765: opens the launcher itself
    'cvs.commands.quickRun',              // #765: opens the launcher itself (#778)
]);

// Rule 5, permanent. Internal commands: called by code with arguments or by
// the integration tests, never by a person, so they must NOT be in the palette.
const INTERNAL_COMMANDS = new Set([
    'cvs.launcher.refresh',               // #761: executeCommand from daily-audit to repaint the launcher
    'cvs.launcher.runWithOutput',         // #761: takes a command id; called from home-page.ts
    'cvs.tools.fileList._debugState',     // #448: integration-test hook (REG-079)
    'cvs.tools.fileList._debugEntries',   // #448: integration-test hook (REG-079)
    'cvs.tools.fileList._debugOpenEntry', // #448: integration-test hook (REG-079)
]);

// Rule 5, pending. User-facing commands nobody can reach: contribute or delete.
// #766 contributed cvs.mcp.build, cvs.mcp.build.stop and cvs.health.stopRunner;
// #768 deleted script-runner and its cvs.scripts.runScript. Empty: a new entry
// needs an issue that owns the contribute-or-delete decision.
const UNCONTRIBUTED_ALLOWED = new Set([
]);

// ── Sources ──────────────────────────────────────────────────────────────────

const pkg = JSON.parse(read('package.json'));
const contributed = new Map((pkg.contributes?.commands ?? []).map(c => [c.command, c]));

const CATALOG_REL = 'src/features/cvs-command-launcher/catalog.ts';
const catalogSrc = read(CATALOG_REL);
const catalog = new Map();
for (const m of catalogSrc.matchAll(/\{\s*id:\s*'([^']+)',\s*title:\s*'((?:[^'\\]|\\.)*)'/g)) {
    catalog.set(m[1], m[2].replace(/\\(.)/g, '$1'));
}
// Parser guard: every entry id in the file was read with its title.
const idCount = [...catalogSrc.matchAll(/\bid:\s*'cvs\./g)].length;
check(`catalog parser read every entry (${catalog.size} of ${idCount})`,
    catalog.size > 0 && catalog.size === idCount,
    'an entry whose id is not directly followed by its title escaped the parser; update it or the parser');

// Registered ids: literal or same-file const arguments to registerCommand().
const registered = new Map();
const unresolved = [];
for (const file of walkFiles(path.join(ROOT, 'src'), { extensions: ['.ts'] })) {
    let src;
    try { src = fs.readFileSync(file, 'utf8'); } catch { continue; }
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const consts = {};
    for (const c of src.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*(?::\s*string\s*)?=\s*['"`](cvs\.[^'"`$]+)['"`]/g)) {
        consts[c[1]] = c[2];
    }
    for (const r of src.matchAll(/\bcommands\.registerCommand\(\s*([^,)]+)/g)) {
        const arg = r[1].trim();
        const lit = arg.match(/^['"`]([^'"`$]+)['"`]$/);
        const id  = lit ? lit[1] : consts[arg];
        if (id) { registered.set(id, rel); } else { unresolved.push(`${rel}: ${arg}`); }
    }
}
check(`every registerCommand() id resolves (${registered.size} registered)`,
    registered.size > 0 && unresolved.length === 0,
    `cannot tell which command these register: ${list(unresolved)}`);

// ── The #761 report itself ───────────────────────────────────────────────────

check('cvs.launch.pick is titled as the project-action picker in package.json',
    contributed.get('cvs.launch.pick')?.title === 'Pick Any Project Action',
    `title is ${JSON.stringify(contributed.get('cvs.launch.pick')?.title)}`);
check('cvs.corequisites.install is contributed, registered, and titled as an install',
    /install/i.test(contributed.get('cvs.corequisites.install')?.title ?? '') &&
    registered.get('cvs.corequisites.install') === 'src/features/corequisite-checker.ts');

// ── Rule 1: catalog ⊆ contributed ────────────────────────────────────────────

const catalogNotContributed = [...catalog.keys()].filter(id => !contributed.has(id));
check(`rule 1: all ${catalog.size} launcher entries are contributed in package.json`,
    catalogNotContributed.length === 0, list(catalogNotContributed));

// ── Rule 2: contributed ⊆ registered ─────────────────────────────────────────

const neverRegistered = [...contributed.keys()].filter(id => !registered.has(id));
check(`rule 2: all ${contributed.size} contributed commands are registered in src/`,
    neverRegistered.length === 0, list(neverRegistered));

// ── Rule 3: titles agree ─────────────────────────────────────────────────────

// One leading area prefix, ending in ": " or " — ". Letters, digits, spaces,
// dots and hyphens only, so a colon or dash later in the title is untouched.
const AREA_PREFIX = /^[A-Za-z][A-Za-z0-9 .-]{0,30}?(?::| —)\s+/;
const normalise = title => title.replace(AREA_PREFIX, '').trim();

const titleMismatches = [];
const staleTitleExceptions = [];
let agreeing = 0;
for (const [id, catTitle] of catalog) {
    const c = contributed.get(id);
    if (!c) { continue; } // rule 1 reports it
    const agrees = normalise(c.title) === normalise(catTitle);
    if (agrees) { agreeing++; }
    if (TITLE_MISMATCH_ALLOWED.has(id)) {
        if (agrees) { staleTitleExceptions.push(id); }
    } else if (!agrees) {
        titleMismatches.push(`${id}: package.json "${c.title}" vs launcher "${catTitle}"`);
    }
}
const goneTitleExceptions = [...TITLE_MISMATCH_ALLOWED].filter(id => !catalog.has(id) || !contributed.has(id));
check(`rule 3: package.json and launcher titles agree (${agreeing} agree, ${TITLE_MISMATCH_ALLOWED.size} allow-listed)`,
    titleMismatches.length === 0, titleMismatches.join('\n       '));
check('rule 3 allow-list is current (no entry already agrees or has gone)',
    staleTitleExceptions.length === 0 && goneTitleExceptions.length === 0,
    `remove from TITLE_MISMATCH_ALLOWED: ${list([...staleTitleExceptions, ...goneTitleExceptions])}`);

// #764: no title carries an emoji. The launcher already shows the group icon
// next to every entry, and a title that starts with a pictograph cannot agree
// with its palette title or be found by typing its name.
const PICTOGRAPH = /\p{Extended_Pictographic}/u;
const emojiTitles = [
    ...[...contributed].filter(([, c]) => PICTOGRAPH.test(c.title ?? '')).map(([id, c]) => `${id}: package.json "${c.title}"`),
    ...[...catalog].filter(([, t]) => PICTOGRAPH.test(t)).map(([id, t]) => `${id}: launcher "${t}"`),
];
check(`no command title carries an emoji (${contributed.size} palette, ${catalog.size} launcher titles)`,
    emojiTitles.length === 0, emojiTitles.join('\n       '));

// ── Rule 4: contributed ⊆ catalog ────────────────────────────────────────────

const notCatalogued = [...contributed.keys()].filter(id => !catalog.has(id) && !NOT_IN_CATALOG_ALLOWED.has(id));
const staleCatalogExceptions = [...NOT_IN_CATALOG_ALLOWED].filter(id => catalog.has(id) || !contributed.has(id));
check(`rule 4: every contributed command is in the launcher (${NOT_IN_CATALOG_ALLOWED.size} allow-listed: launcher openers and #768)`,
    notCatalogued.length === 0, list(notCatalogued));
check('rule 4 allow-list is current (no entry is catalogued or gone)',
    staleCatalogExceptions.length === 0,
    `remove from NOT_IN_CATALOG_ALLOWED: ${list(staleCatalogExceptions)}`);

// ── Rule 5: registered ⊆ contributed ─────────────────────────────────────────

const uncontributed = [...registered.keys()].filter(id =>
    !contributed.has(id) && !INTERNAL_COMMANDS.has(id) && !UNCONTRIBUTED_ALLOWED.has(id));
check(`rule 5: every registered command is contributed (${INTERNAL_COMMANDS.size} internal, ${UNCONTRIBUTED_ALLOWED.size} allow-listed under #768)`,
    uncontributed.length === 0,
    `${list(uncontributed)}; contribute it, or if code alone calls it, add it to INTERNAL_COMMANDS with the reason`);
const internalContributed = [...INTERNAL_COMMANDS].filter(id => contributed.has(id));
check('internal commands stay out of package.json', internalContributed.length === 0, list(internalContributed));
const staleUncontributed = [...INTERNAL_COMMANDS, ...UNCONTRIBUTED_ALLOWED].filter(id =>
    !registered.has(id) || (UNCONTRIBUTED_ALLOWED.has(id) && contributed.has(id)));
check('rule 5 allow-lists are current (no entry is contributed or unregistered)',
    staleUncontributed.length === 0,
    `remove from INTERNAL_COMMANDS / UNCONTRIBUTED_ALLOWED: ${list(staleUncontributed)}`);

console.log('-'.repeat(64));
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
