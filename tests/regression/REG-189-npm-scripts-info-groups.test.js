// Copyright (c) 2026 CieloVista Software. All rights reserved.
// REG-189: the NPM Scripts panel reads "scripts-info" and "scripts-groups"
//
// Run: node tests/regression/REG-189-npm-scripts-info-groups.test.js
//
// wb-starter has 74 scripts; listed as name + raw command they told nobody
// what to run or when (wb-starter #1911). A package.json can now carry:
//   "scripts-info":   { "<script>": "<what it does and when to use it>" }
//   "scripts-groups": { "<heading>": ["<script>", ...] }   (reading order)
//
// Guards:
//   1. readPkgScripts (the compiled production reader) attaches each
//      description and resolves the groups: given order, unknown names
//      dropped, a script listed once, leftovers in a final "Other",
//      "Internal…" headings collapsed.
//   2. The real webview page, loaded in jsdom: one section per group, the
//      description under the name, Internal starts collapsed, the filter
//      matches description text.
//   3. A package.json with neither key renders exactly as before: no
//      sections, no description, name | command | Run.

'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { spawnSync } = require('child_process');
const { JSDOM } = require('jsdom');

const ROOT     = path.join(__dirname, '../..');
const srcFile  = path.join(ROOT, 'src/shared/npm-scripts-reader.ts');
const compiled = path.join(ROOT, 'out-test/reg189/npm-scripts-reader.js');
const htmlFile = path.join(ROOT, 'src/features/npm-scripts-tree.html');

const build = spawnSync(process.execPath, [
    require.resolve('esbuild/bin/esbuild'),
    srcFile, '--bundle', '--platform=node', '--format=cjs', `--outfile=${compiled}`,
], { cwd: ROOT, stdio: 'pipe' });
if (build.status !== 0) {
    console.error(`  FAIL could not compile npm-scripts-reader: ${build.stderr || build.error}`);
    process.exit(1);
}
const { readPkgScripts } = require(compiled);

let passed = 0, failed = 0;
function check(name, ok, detail) {
    if (ok) { console.log(`  PASS ${name}`); passed++; }
    else    { console.error(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`); failed++; }
}

function tempPkg(pkg) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cvt-reg189-'));
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
    return dir;
}

// ── 1. Reader ────────────────────────────────────────────────────────────────
const groupedDir = tempPkg({
    name: 'grouped',
    scripts: { start: 'node s.js', 'test:one': 'pw test', precommit: 'node hook.js', stray: 'echo hi' },
    'scripts-info': { start: 'Start the dev server. Use first every day.', 'test:one': 'Run one spec while you work.' },
    'scripts-groups': {
        'Daily: start here': ['start', 'missing-script'],
        'Test one area': ['test:one', 'start'],
        'Internal: run by git hooks and CI, not by hand': ['precommit'],
    },
});
const grouped = readPkgScripts(groupedDir, '');
check('description attached from scripts-info',
    grouped.scripts.find(s => s.name === 'start').desc === 'Start the dev server. Use first every day.');
check('script with no description has no desc', !('desc' in grouped.scripts.find(s => s.name === 'stray')));
const headings = (grouped.groups || []).map(g => g.heading);
check('groups keep the given order, leftovers go last in Other',
    JSON.stringify(headings) === JSON.stringify(['Daily: start here', 'Test one area', 'Internal: run by git hooks and CI, not by hand', 'Other']),
    JSON.stringify(headings));
check('unknown names dropped, a script appears once',
    JSON.stringify(grouped.groups.map(g => g.scripts)) === JSON.stringify([['start'], ['test:one'], ['precommit'], ['stray']]),
    JSON.stringify(grouped.groups.map(g => g.scripts)));
check('only the Internal group is collapsed',
    JSON.stringify(grouped.groups.map(g => g.collapsed)) === JSON.stringify([false, false, true, false]));

const plainDir = tempPkg({ name: 'plain', scripts: { build: 'tsc', test: 'node t.js' } });
const plain = readPkgScripts(plainDir, '');
check('no keys: entry is unchanged (no groups, no desc)',
    !('groups' in plain) && plain.scripts.every(s => !('desc' in s)));

// ── 2/3. Webview page in jsdom ───────────────────────────────────────────────
function loadPage(entries) {
    const dom = new JSDOM(fs.readFileSync(htmlFile, 'utf8'), {
        runScripts: 'dangerously',
        beforeParse(win) { win.acquireVsCodeApi = () => ({ postMessage() {} }); },
    });
    const win = dom.window;
    win.dispatchEvent(new win.MessageEvent('message', { data: { type: 'init', entries } }));
    return win;
}

const gw = loadPage([grouped]);
const gd = gw.document;
const secs = [...gd.querySelectorAll('.script-group')];
check('one section per group', secs.length === 4, `got ${secs.length}`);
check('section headings in order',
    secs.map(s => s.querySelector('.sg-name').textContent).join('|') === headings.join('|'));
check('Internal section starts collapsed, others open',
    secs.map(s => s.querySelector('.sg-list').classList.contains('open')).join() === 'true,true,false,true');
const startRow = gd.querySelector('.script-row[data-name="start"]');
check('description shown under the script name',
    startRow.querySelector('.script-main .script-desc').textContent === 'Start the dev server. Use first every day.');
check('raw command still on the row, in its tooltip',
    startRow.querySelector('.script-name').title === 'node s.js');

const filter = gd.getElementById('filter');
filter.value = 'every day';
filter.dispatchEvent(new gw.Event('input'));
const visible = [...gd.querySelectorAll('.script-row')].filter(r => r.style.display !== 'none').map(r => r.dataset.name);
check('filter matches description text', JSON.stringify(visible) === JSON.stringify(['start']), JSON.stringify(visible));
filter.value = 'hook';
filter.dispatchEvent(new gw.Event('input'));
check('a filter hit opens a collapsed Internal section',
    secs[2].querySelector('.sg-list').classList.contains('open') && secs[2].style.display !== 'none');
filter.value = '';
filter.dispatchEvent(new gw.Event('input'));
check('clearing the filter collapses Internal again',
    !secs[2].querySelector('.sg-list').classList.contains('open'));

const pw = loadPage([plain]);
const pd = pw.document;
check('no keys: no sections', pd.querySelectorAll('.script-group').length === 0);
const prow = pd.querySelector('.script-row');
check('no keys: row is name | command | Run as before',
    prow.className === 'script-row' &&
    [...prow.children].map(c => c.className).join(',') === 'script-name,script-cmd,btn-run');

fs.rmSync(groupedDir, { recursive: true, force: true });
fs.rmSync(plainDir, { recursive: true, force: true });

console.log(`\nREG-189: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
