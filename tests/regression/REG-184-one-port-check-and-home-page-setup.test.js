// Copyright (c) CieloVista Software. All rights reserved.
// REG-184: Issues #834 and #836 — one port check, one badge poller, and a
// Home page whose command count and page setup each live in one place
//
// Run: node tests/regression/REG-184-one-port-check-and-home-page-setup.test.js
//
// #834: cvt checked "is anything listening on this port?" four ways. The Home
// page's DiskCleanUp and dev-server badges each had a 25-line poller that
// opened its own net.createConnection(); the launcher's DiskCleanUp start
// opened a third; the Fix Bugs panel had a private isPortOpen() with a
// different timeout. The Start button used the shared isPortOpen(), so the
// dev-server badge and the button beside it could disagree.
// Fix: src/shared/port-check.ts holds the one check (isPortOpen) and the one
// poller (watchPort). Everything else calls them.
//
// #836: the Guided Launcher tile said "81 commands" while the launcher listed
// 130, because the number was typed in. The Configure dialog's section list
// was written twice (a handwritten SECTIONS object and an unused cfgItems
// array), two handlers ran npm start, and the page setup (head, CSS reset,
// flash animation, body font, flash listener) was copied into both views.
// Fix: the tile counts launcherCommands(registered), the list the launcher
// renders; DASHBOARD_SECTIONS is the one section list; devServerAction is
// the one handler that starts the dev server; homePageHead() and
// flashScript() hold the page setup.
//
// Guards:
//   1. Source: no socket connect in src/ outside port-check.ts, no poller
//      state or interval-driven port check outside it, no command count
//      literal on the Home page, and each duplicated fragment appears once,
//      inside its owner. Self-checks run each rule over the old shape.
//   2. Live (out-test build): the tile shows the launcher's own count and
//      follows the registered set; the Configure dialog lists the sections
//      and hides a panel; both views flash; watchPort reports up, then down,
//      once each, and stops when told to.

'use strict';

const fs     = require('fs');
const net    = require('net');
const path   = require('path');
const Module = require('module');

const ROOT     = path.resolve(__dirname, '..', '..');
const SRC      = path.join(ROOT, 'src');
const OUT      = path.join(ROOT, 'out-test');
const HOME_TS  = path.join(SRC, 'features', 'home-page.ts');
const PORT_TS  = 'src/shared/port-check.ts';

let passed = 0, failed = 0;
function check(name, ok, detail) {
    if (ok) { console.log(`  PASS ${name}`); passed++; }
    else    { console.error(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`); failed++; }
}

console.log('\nREG-184: one port check, one poller, one home page setup (#834, #836)\n' + '-'.repeat(60));

// ── 1. Source ────────────────────────────────────────────────────────────────

function walk(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { walk(full, out); }
        else if (e.name.endsWith('.ts')) { out.push(full); }
    }
    return out;
}
const lineOf = (text, i) => text.slice(0, i).split('\n').length;
/** The text with comment lines blanked (line numbers kept): a comment naming a function is not a call. */
const code = text => text.split('\n').map(l => /^\s*(\/\/|\/?\*)/.test(l) ? '' : l).join('\n');

/** A socket connect or a private port-check function: only port-check.ts may have one. */
const CONNECT = /\bcreateConnection\s*\(|new\s+(?:net\.)?Socket\s*\(|\bnet\.connect\s*\(|function\s+isPortOpen\b/g;
/** Poller state the old badge pollers carried, and an interval that drives a port check. */
function portCheckStrays(files) {
    const out = [];
    for (const [rel, raw] of files) {
        if (rel === PORT_TS) { continue; }
        const text = code(raw);
        for (const m of text.matchAll(CONNECT)) { out.push(`${rel}:${lineOf(text, m.index)} port check (${m[0].trim()})`); }
        for (const m of text.matchAll(/\blastStatus\b/g)) { out.push(`${rel}:${lineOf(text, m.index)} poller state (lastStatus)`); }
        const lines = text.split('\n');
        lines.forEach((l, i) => {
            if (!/\bisPortOpen\(/.test(l)) { return; }
            const near = lines.slice(Math.max(0, i - 25), i + 25).join('\n');
            if (/\bsetInterval\(/.test(near)) { out.push(`${rel}:${i + 1} isPortOpen() driven by setInterval: use watchPort()`); }
        });
    }
    return out;
}

/** [start, end) of a top-level function's text (as REG-183). */
function fnRange(text, name) {
    const m = new RegExp(`^(?:export )?function ${name}\\(`, 'm').exec(text);
    if (!m) { return null; }
    const next = /^(?:export )?(?:async )?(?:function|const|let|type|interface|class)\b|^\/\/ ─── /mg;
    next.lastIndex = m.index + m[0].length;
    const n = next.exec(text);
    return [m.index, n ? n.index : text.length];
}

/** Each fragment of page setup, and the one function allowed to hold it. */
const SETUP = [
    { fn: 'homePageHead', marker: '*{box-sizing:border-box;margin:0;padding:0}' },
    { fn: 'homePageHead', marker: '@keyframes cvs-flash-anim' },
    { fn: 'homePageHead', marker: '.cvs-flash{' },
    { fn: 'homePageHead', marker: 'http-equiv="Content-Security-Policy"' },
    { fn: 'homePageHead', marker: 'font-family:var(--vscode-font-family);font-size:13px' },
    { fn: 'flashScript',  marker: "classList.add('cvs-flash')" },
];

/** Every #836 duplicate still in a Home page source text. */
function homeStrays(text) {
    const out = [];
    for (const m of text.matchAll(/\b\d+\s+commands\b/gi)) {
        out.push(`:${lineOf(text, m.index)} command count literal "${m[0]}": count it`);
    }
    for (const { fn, marker } of SETUP) {
        const range = fnRange(text, fn);
        let i = text.indexOf(marker);
        while (i !== -1) {
            if (!range || i < range[0] || i >= range[1]) { out.push(`:${lineOf(text, i)} page setup (${marker}) outside ${fn}()`); }
            i = text.indexOf(marker, i + marker.length);
        }
    }
    if (/\bcfgItems\b/.test(text)) { out.push(': cfgItems, a second Configure section list'); }
    const labels = (text.match(/label:\s*'Recent Projects'/g) || []).length;
    if (labels !== 1) { out.push(`: the Configure section list is written ${labels} times, not once`); }
    if (/\bhistory\s*:\s*\{\s*panelId/.test(text)) { out.push(': a handwritten SECTIONS object in the page script'); }
    const starts = (text.match(/sendText\('npm start'\)/g) || []).length;
    if (starts !== 1) { out.push(`: ${starts} places run npm start, not one`); }
    if (text.includes("msg.type === 'npmStart'")) { out.push(": an npmStart handler beside devServerAction"); }
    return out;
}

// Self-checks: the old shapes must be caught.
const oldPoller = [
    'function _startDcPoller(panel) {',
    '  let lastStatus = null;',
    "  const socket = net.createConnection({ port: 5000, host: '127.0.0.1' });",
    '}',
    'async function start() { if (await isPortOpen(5000)) {} }',
    'const id = setInterval(check, 8000);',
].join('\n');
const oldPortHits = portCheckStrays([['src/features/old.ts', oldPoller], [PORT_TS, 'let lastStatus; new net.Socket();']]);
check('self-check: a hand-written connect, poller state and an interval-driven isPortOpen are caught',
    ['createConnection', 'lastStatus', 'setInterval'].every(w => oldPortHits.some(h => h.includes(w))), JSON.stringify(oldPortHits));
check('self-check: port-check.ts itself is not reported', !oldPortHits.some(h => h.startsWith(PORT_TS)), JSON.stringify(oldPortHits));

const oldHome = [
    "const quickLaunch = [{ desc: 'Search & run all 81 commands' }];",
    '*{box-sizing:border-box;margin:0;padding:0}',
    "var SECTIONS = { history:  { panelId: 'panel-history', label: 'Recent Runs' }, recents: { panelId: 'panel-recents', label: 'Recent Projects' } };",
    "const cfgItems = [{ key: 'recents', label: 'Recent Projects' }];",
    "if (msg.type === 'npmStart') { terminal.sendText('npm start'); }",
    "if (!existing) { terminal.sendText('npm start'); }",
].join('\n');
const oldHomeHits = homeStrays(oldHome);
check('self-check: the old Home page shape is caught on every count',
    ['81 commands', 'box-sizing', 'cfgItems', 'written 2 times', 'handwritten SECTIONS', '2 places run npm start', 'npmStart handler']
        .every(w => oldHomeHits.some(h => h.includes(w))), JSON.stringify(oldHomeHits));

const files = walk(SRC).map(f => [path.relative(ROOT, f).split(path.sep).join('/'), fs.readFileSync(f, 'utf8')]);
const portHits = portCheckStrays(files);
check('no port check in src/ outside src/shared/port-check.ts (#834)', portHits.length === 0, portHits.join('\n       '));

const home = fs.readFileSync(HOME_TS, 'utf8');
check('home-page.ts starts both badges through one poller built on watchPort() (#834)',
    (code(home).match(/\bwatchPort\(/g) || []).length === 1 && /_startPortBadgePoller\(panel, 5000, 'dcStatus'/.test(home)
        && /_startPortBadgePoller\(panel, devServerConfig\.port, 'devServerStatus'/.test(home));
const homeHits = homeStrays(home);
check('home-page.ts: no count literal, and each #836 fragment appears once in its owner', homeHits.length === 0,
    homeHits.map(h => 'src/features/home-page.ts' + h).join('\n       '));

// ── 2. Live ──────────────────────────────────────────────────────────────────

function loadOut(rel) {
    const origLoad = Module._load;
    Module._load = function (req) { return req === 'vscode' ? {} : origLoad.apply(this, arguments); };
    try { return require(path.join(OUT, rel)); } finally { Module._load = origLoad; }
}

async function live() {
    const { JSDOM } = require('jsdom');
    const home    = loadOut('features/home-page.js');
    const catalog = loadOut('features/cvs-command-launcher/catalog.js');
    const launch  = loadOut('features/cvs-command-launcher/html.js');
    const port    = loadOut('shared/port-check.js');

    const pkg        = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const registered = new Set(pkg.contributes.commands.map(c => c.command));
    const grouped    = home.buildGroupedCommands(registered);

    const render = (reg) => new JSDOM(home.buildDashboardHtml('ws', 'C:/ws', true, [], [], grouped, new Set(), reg, true, '1.0.0'),
        { runScripts: 'dangerously', url: 'http://localhost/',
          beforeParse(w) { w.acquireVsCodeApi = () => ({ postMessage() {}, getState() {}, setState() {} }); } });
    const tileText = (dom) => {
        const d = dom.window.document.querySelector('.ql-btn[data-cmd="cvs.commands.showAll"] .ql-desc');
        return d ? d.textContent : '(no Guided Launcher tile)';
    };

    // The oracle: what the launcher lists, computed here from the catalog, not asked of the code under test.
    const listed = reg => catalog.CATALOG.filter(c => reg.has(c.id)).length;
    const n = listed(registered);
    const statMatch = /<span id="stat">(\d+) commands<\/span>/.exec(launch.buildLauncherHtml(null, 'C:/ws', [], [], registered));
    check(`the launcher lists ${n} commands for the registered set`, statMatch && Number(statMatch[1]) === n,
        statMatch ? `launcher says ${statMatch[1]}` : 'no #stat in launcher html');

    let dom = render(registered);
    check(`the Guided Launcher tile says the launcher's own count: "Search & run all ${n} commands"`,
        tileText(dom) === `Search & run all ${n} commands`, `tile says "${tileText(dom)}"`);
    dom.window.close();

    const fewer = new Set([...registered].filter(id => !catalog.CATALOG.slice(0, 10).some(c => c.id === id)));
    dom = render(fewer);
    check(`the tile follows the registered set (${listed(fewer)} when ten catalog commands are unregistered)`,
        tileText(dom) === `Search & run all ${listed(fewer)} commands`, `tile says "${tileText(dom)}"`);
    dom.window.close();

    // Configure dialog: built from the one section list, and it still hides a panel.
    check('home-page exports DASHBOARD_SECTIONS, the one Configure section list', Array.isArray(home.DASHBOARD_SECTIONS));
    const sections = home.DASHBOARD_SECTIONS || [];
    dom = render(registered);
    const doc = dom.window.document;
    doc.getElementById('btn-configure').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    const items = [...doc.querySelectorAll('#cfg-list .cfg-item')];
    check('the Configure dialog lists exactly the DASHBOARD_SECTIONS labels, in order',
        sections.length > 0 && JSON.stringify(items.map(i => i.textContent.trim())) === JSON.stringify(sections.map(s => s.label)),
        JSON.stringify(items.map(i => i.textContent.trim())));
    const recentsCb = items.map(i => i.querySelector('input')).find(cb => cb && cb.dataset.key === 'recents');
    if (recentsCb) { recentsCb.checked = false; recentsCb.dispatchEvent(new dom.window.Event('change', { bubbles: true })); }
    check('unticking Recent Projects hides its panel', !!recentsCb && doc.getElementById('panel-recents').style.display === 'none');
    dom.window.close();

    // Flash: both views flash on {type:'flash'} through the one listener.
    const views = [
        ['dashboard', home.buildDashboardHtml('ws', 'C:/ws', true, [], [], grouped, new Set(), registered, false, '')],
        ['Browse All panel', home.buildBrowseAllHtml(grouped, 1)],
    ];
    for (const [name, html] of views) {
        const errors = [];
        const v = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/',
            beforeParse(w) { w.acquireVsCodeApi = () => ({ postMessage() {}, getState() {}, setState() {} }); } });
        v.window.addEventListener('error', e => errors.push(e.error || e.message));
        v.window.dispatchEvent(new v.window.MessageEvent('message', { data: { type: 'flash' } }));
        check(`${name}: {type:'flash'} flashes the page, with no script error`,
            v.window.document.body.classList.contains('cvs-flash') && errors.length === 0, errors.map(String).join('; '));
        v.window.close();
    }

    // watchPort: up once, down once, silent while shouldCheck() is false, silent after stop.
    check('port-check exports watchPort()', typeof port.watchPort === 'function');
    if (typeof port.watchPort !== 'function') { return; }
    const server = net.createServer();
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const p = server.address().port;
    const events = [];
    let wake = null;
    const next = (ms) => new Promise(r => { wake = r; setTimeout(r, ms); });
    const stop = port.watchPort(p, 30, s => { events.push(s); if (wake) { wake(); } });
    await next(2000);
    await new Promise(r => setTimeout(r, 200));
    check('watchPort reports up once for a listening port, and does not repeat it', JSON.stringify(events) === '["up"]', JSON.stringify(events));
    await new Promise(r => server.close(r));
    await next(2000);
    await new Promise(r => setTimeout(r, 200));
    check('watchPort reports down once when the port closes', JSON.stringify(events) === '["up","down"]', JSON.stringify(events));
    stop();
    const quiet = [];
    const stop2 = port.watchPort(p, 30, s => quiet.push(s), () => false);
    await new Promise(r => setTimeout(r, 200));
    stop2();
    check('watchPort does not check while shouldCheck() is false', quiet.length === 0, JSON.stringify(quiet));
}

function finish() {
    console.log(`\n  ${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
}

if (!fs.existsSync(path.join(OUT, 'features', 'home-page.js'))) {
    check('out-test build exists', false, `${OUT} missing: the regression runner builds out-test/ first`);
    finish();
} else {
    live().then(finish, e => { check('live render ran', false, e && e.stack || String(e)); finish(); });
}
