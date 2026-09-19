// Copyright (c) CieloVista Software. All rights reserved.
// REG-183: Issue #831 — the Browse All command directory is built in one place
//
// Run: node tests/regression/REG-183-one-browse-all-directory.test.js
//
// The Home page built the "Browse All Commands" directory twice:
// buildBrowseAllHtml() for the separate panel, and a copy inside
// buildDashboardHtml() with its own CSS and its own toggle and search script.
// A change to one (a label rule, grouping, search) never reached the other;
// #823 had to route three copies of the label rule through commandLabel().
//
// The fix: src/features/home-page.ts builds the directory in one function,
// buildBrowseDirectoryHtml(), keeps its CSS in browseDirectoryCss() and its
// click, toggle and search script in browseDirectoryScript(). Both views call
// those three.
//
// Guards:
//   1. Source: every piece of directory markup, directory CSS rule and
//      directory script in src/ sits inside its one function. A self-check
//      runs the same rule over a file with a second builder and a second
//      filter script, the shape the dashboard had, and must catch both.
//   2. Live: the out-test build renders both views. Each view's #browse-body
//      holds exactly buildBrowseDirectoryHtml(grouped), and in a DOM the
//      view's script works: a click posts that view's own message
//      ({type:'run', cmd} in the panel, {type:'runCommand', command} in the
//      dashboard), the filter hides what doesn't match, and the dashboard's
//      toggle opens the directory and its no-match line shows.

'use strict';

const fs     = require('fs');
const path   = require('path');
const Module = require('module');

const ROOT     = path.resolve(__dirname, '..', '..');
const SRC      = path.join(ROOT, 'src');
const HOME_TS  = path.join(SRC, 'features', 'home-page.ts');
const HOME_OUT = path.join(ROOT, 'out-test', 'features', 'home-page.js');

let passed = 0, failed = 0;
function check(name, ok, detail) {
    if (ok) { console.log(`  PASS ${name}`); passed++; }
    else    { console.error(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`); failed++; }
}

console.log('\nREG-183: the Browse All command directory is built in one place (#831)\n' + '-'.repeat(60));

// ── 1. Source ────────────────────────────────────────────────────────────────

/** Which function owns each kind of directory code, and the text that marks it. */
const OWNERS = [
    { fn: 'buildBrowseDirectoryHtml', what: 'directory markup',
      markers: ['class="browse-group"', 'class="browse-group-hd"', 'class="browse-items"', 'class="browse-item"', 'class="browse-link"', 'class="browse-desc"'] },
    { fn: 'browseDirectoryCss', what: 'directory CSS',
      markers: ['.browse-group{', '.browse-group-hd{', '.browse-items{', '.browse-item{', '.browse-link{', '.browse-link:hover{', '.browse-desc{', '#browse-body{', '#browse-toggle{', '#browse-search{', '#filter{'] },
    { fn: 'browseDirectoryScript', what: 'directory script',
      markers: [".querySelectorAll('.browse-group')", ".querySelectorAll('.browse-item')", ".closest('.browse-link')", ".querySelectorAll('.browse-link')", "getElementById('browse-toggle')"] },
];

/** [start, end) of a top-level function's text: from its declaration to the next top-level declaration. */
function fnRange(text, name) {
    const m = new RegExp(`^(?:export )?function ${name}\\(`, 'm').exec(text);
    if (!m) { return null; }
    const next = /^(?:export )?(?:async )?(?:function|const|let|type|interface|class)\b|^\/\/ ─── /mg;
    next.lastIndex = m.index + m[0].length;
    const n = next.exec(text);
    return [m.index, n ? n.index : text.length];
}

/** Every marker occurrence in files that is outside its owning function. */
function strays(files) {
    const out = [];
    for (const [rel, text] of files) {
        for (const owner of OWNERS) {
            const range = fnRange(text, owner.fn);
            for (const marker of owner.markers) {
                let i = text.indexOf(marker);
                while (i !== -1) {
                    if (!range || i < range[0] || i >= range[1]) {
                        const line = text.slice(0, i).split('\n').length;
                        out.push(`${rel}:${line} ${owner.what} (${marker}) outside ${owner.fn}()`);
                    }
                    i = text.indexOf(marker, i + marker.length);
                }
            }
        }
    }
    return out;
}

function walk(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { walk(full, out); }
        else if (e.name.endsWith('.ts')) { out.push(full); }
    }
    return out;
}

// Self-check: the dashboard's old shape, a second builder and a second filter.
const oldShape = [
    'export function buildBrowseDirectoryHtml(grouped) {',
    '    return `<div class="browse-group">`;',
    '}',
    'export function buildDashboardHtml(grouped) {',
    '    const browseHtml = `<div class="browse-group"><div class="browse-item"></div></div>`;',
    "    const js = `document.querySelectorAll('.browse-group').forEach(f);`;",
    '}',
].join('\n');
const caught = strays([['old-shape.ts', oldShape]]);
check('self-check: a second builder and a second filter script are caught',
    caught.some(s => s.includes('class="browse-group"') && s.includes(':5 '))
        && caught.some(s => s.includes('directory script')),
    JSON.stringify(caught));
check('self-check: code inside the owning function is not reported',
    !caught.some(s => s.includes(':2 ')), JSON.stringify(caught));

const home = fs.readFileSync(HOME_TS, 'utf8');
for (const owner of OWNERS) {
    check(`home-page.ts defines ${owner.fn}()`, fnRange(home, owner.fn) !== null);
}
const files = walk(SRC).map(f => [path.relative(ROOT, f).split(path.sep).join('/'), fs.readFileSync(f, 'utf8')]);
const found = strays(files);
check('no directory markup, CSS or script in src/ outside its one function', found.length === 0,
    found.slice(0, 12).join('\n       '));

// ── 2. Live ──────────────────────────────────────────────────────────────────

if (!fs.existsSync(HOME_OUT)) {
    check('out-test build exists', false, `${HOME_OUT} missing: the regression runner builds out-test/ first`);
    finish();
} else {
    live().then(finish, e => { check('live render ran', false, e && e.stack || String(e)); finish(); });
}

async function live() {
    const { JSDOM } = require('jsdom');
    const origLoad = Module._load;
    Module._load = function (req) { return req === 'vscode' ? {} : origLoad.apply(this, arguments); };
    let mod;
    try { mod = require(HOME_OUT); } finally { Module._load = origLoad; }

    const need = ['buildBrowseDirectoryHtml', 'buildBrowseAllHtml', 'buildDashboardHtml', 'buildGroupedCommands'];
    const missing = need.filter(n => typeof mod[n] !== 'function');
    check('home-page exports the directory builder and both views', missing.length === 0, `missing: ${missing.join(', ')}`);
    if (missing.length) { return; }

    const pkg        = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const registered = new Set(pkg.contributes.commands.map(c => c.command));
    const grouped    = mod.buildGroupedCommands(registered);
    const total      = Object.values(grouped).reduce((n, a) => n + a.length, 0);
    const directory  = mod.buildBrowseDirectoryHtml(grouped);
    const first      = Object.values(grouped)[0][0];

    const views = [
        { name: 'panel', html: mod.buildBrowseAllHtml(grouped, total), searchId: 'filter',
          expect: { type: 'run', cmd: first.command } },
        { name: 'dashboard', html: mod.buildDashboardHtml('ws', 'C:/ws', true, [], [], grouped, new Set(), registered, false, '1.0.0'),
          searchId: 'browse-search', expect: { type: 'runCommand', command: first.command } },
    ];

    for (const v of views) {
        const messages = [], errors = [];
        const dom = new JSDOM(v.html, {
            runScripts: 'dangerously', url: 'http://localhost/',
            beforeParse(w) { w.acquireVsCodeApi = () => ({ postMessage(m) { messages.push(m); }, getState() {}, setState() {} }); },
        });
        const win = dom.window, doc = win.document;
        win.addEventListener('error', e => errors.push(e.error || e.message));
        await new Promise(r => setTimeout(r, 0));

        check(`${v.name}: script runs without an error`, errors.length === 0, errors.map(String).join('; '));
        const body = doc.getElementById('browse-body');
        check(`${v.name}: #browse-body holds exactly buildBrowseDirectoryHtml(grouped)`,
            body && body.innerHTML === new JSDOM(`<div>${directory}</div>`).window.document.body.firstChild.innerHTML);

        if (v.name === 'dashboard') {
            doc.getElementById('browse-toggle').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
            check('dashboard: the toggle opens the directory and its search box',
                body.classList.contains('open') && doc.getElementById('browse-search-wrap').classList.contains('open'));
        }

        messages.length = 0;
        doc.querySelector(`.browse-link[data-cmd="${first.command}"]`).dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
        check(`${v.name}: a click posts ${JSON.stringify(v.expect)}`,
            messages.length === 1 && JSON.stringify(messages[0]) === JSON.stringify(v.expect), JSON.stringify(messages));

        const search = doc.getElementById(v.searchId);
        const type = q => { search.value = q; search.dispatchEvent(new win.Event('input', { bubbles: true })); };
        const visible = () => [...doc.querySelectorAll('.browse-item')].filter(i => !i.classList.contains('hidden')
            && !i.closest('.browse-group').classList.contains('hidden'));

        const label = doc.querySelector(`.browse-link[data-cmd="${first.command}"]`).textContent;
        type(label.toLowerCase());
        const shown = visible();
        check(`${v.name}: filtering by a label shows that command and hides non-matching ones`,
            shown.some(i => i.querySelector('.browse-link').dataset.cmd === first.command) && shown.length < total,
            `${shown.length} of ${total} shown`);

        type('zzqx-no-such-command');
        check(`${v.name}: a filter that matches nothing hides every group`,
            visible().length === 0 && [...doc.querySelectorAll('.browse-group')].every(g => g.classList.contains('hidden')));
        if (v.name === 'dashboard') {
            check('dashboard: the no-match line shows', doc.getElementById('browse-no-match').style.display === 'block');
        }

        type('');
        check(`${v.name}: clearing the filter shows every command again`, visible().length === total);
        win.close();
    }
}

function finish() {
    console.log(`\n  ${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
}
