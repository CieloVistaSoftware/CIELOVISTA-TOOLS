// Copyright (c) CieloVista Software. All rights reserved.
// REG-031: Doc Catalog cards carry a clickable FOLDER badge, not a Dewey number
//
// History: REG-031 was written for #330 ("dewey badges must be clickable").
// #707 retired the Dewey system; stage 2 regrouped the catalog by project and
// folder, the rule docs/ already follows ("the folder is the category"). The
// badge a user clicks is now the doc's folder, and clicking it narrows the
// catalog to that project's folder, through the same toolbar filters.
//
// Behavioural: builds the real card payload (out-test/ build of html.ts and
// scanner.ts) and drives the real catalog.html in jsdom.
//
// Run: node tests/regression/REG-031-catalog-folder-badges.test.js
'use strict';

const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const Module = require('module');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT  = path.join(ROOT, 'out-test', 'features', 'doc-catalog');

let passed = 0, failed = 0;
function check(name, ok, detail) {
    if (ok) { console.log(`  PASS ${name}`); passed++; }
    else    { console.error(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`); failed++; }
}

console.log('REG-031: Doc Catalog folder badges (#707 stage 2)');
console.log('─'.repeat(60));

for (const f of ['html.js', 'scanner.js']) {
    if (!fs.existsSync(path.join(OUT, f))) {
        console.error(`  FAIL out-test/features/doc-catalog/${f} missing — the runner builds out-test/ before every run`);
        process.exit(1);
    }
}

const origLoad = Module._load;
Module._load = function (req, parent, isMain) {
    if (req === 'vscode') { return { window: {}, workspace: {}, commands: { registerCommand() { return { dispose() {} }; } } }; }
    return origLoad.call(this, req, parent, isMain);
};
const { buildCatalogInitPayload } = require(path.join(OUT, 'html.js'));
const { scanForCards, resetCardCounter } = require(path.join(OUT, 'scanner.js'));
Module._load = origLoad;

// ── Real scan of two projects in a temp dir ──────────────────────────────────
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'reg031-'));
function doc(rel, title, docid) {
    const full = path.join(TMP, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    const fm = docid ? `---\ndocid: ${docid}\n---\n` : '';
    fs.writeFileSync(full, `${fm}# ${title}\n\nAbout ${title}.\n`, 'utf8');
}
doc('zeta/README.md', 'Zeta Readme', '900.1.z');           // docid must not decide order
doc('zeta/docs/guide.md', 'Zeta Guide');
doc('alpha/README.md', 'Alpha Readme', '100.1.a');
doc('alpha/docs/using/setup.md', 'Alpha Setup');
doc('alpha/notes/todo.md', 'Alpha Todo');

resetCardCounter();
const cards = [
    ...scanForCards(path.join(TMP, 'zeta'), 'zeta', path.join(TMP, 'zeta')),
    ...scanForCards(path.join(TMP, 'alpha'), 'alpha', path.join(TMP, 'alpha')),
];
const byTitle = t => cards.find(c => c.title === t);

check('scanner records each doc\'s folder relative to its project',
    byTitle('Alpha Setup') && byTitle('Alpha Setup').folder === 'docs/using' && byTitle('Alpha Readme').folder === '',
    cards.map(c => `${c.title}=${JSON.stringify(c.folder)}`).join(', '));
check('scanner no longer assigns a Dewey category number', cards.every(c => !('categoryNum' in c)));

const payload = buildCatalogInitPayload(cards);
const html = payload.html;

check('no Dewey numbers are rendered', !/\b\d{3}\.\d{3}\b/.test(html) && !/card-dewey|cat-dewey|data-dewey-prefix/.test(html),
    (html.match(/\b\d{3}\.\d{3}\b/) || [])[0]);
const sectionOrder = [...html.matchAll(/<section class="cat-section" data-category="([^"]+)"/g)].map(m => m[1]);
check('projects are ordered by name, not by any docid number', sectionOrder.join(',') === 'alpha,zeta', sectionOrder.join(','));
const badges = [...html.matchAll(/<span class="card-folder" data-action="filter-folder" data-project="([^"]+)" data-section="([^"]+)"[^>]*>[^<]*?([^<;]+)<\/span>/g)];
check('every card has a clickable folder badge', badges.length === cards.length, `${badges.length} badges for ${cards.length} cards`);
check('a nested doc\'s badge shows its folder and filters by its top-level section',
    badges.some(m => m[1] === 'alpha' && m[2] === 'docs' && /docs\/using/.test(m[3])),
    badges.map(m => m.slice(1).join('|')).join(' ; '));
check('a root doc\'s badge says so', badges.some(m => m[1] === 'alpha' && m[2] === 'root' && /project root/.test(m[3])));

// ── Real page: clicking the badge narrows the catalog ────────────────────────
const shell = fs.readFileSync(path.join(ROOT, 'src', 'features', 'doc-catalog', 'catalog.html'), 'utf8');
const messages = [];
const dom = new JSDOM(shell, {
    runScripts: 'dangerously',
    url: 'http://localhost',
    beforeParse(win) {
        win.acquireVsCodeApi = () => ({ postMessage: m => messages.push(m), getState: () => ({}), setState() {} });
        win.requestAnimationFrame = fn => setTimeout(fn, 0);
        win.scrollTo = () => {};
        win.HTMLElement.prototype.scrollIntoView = function () {};
    },
});
const { window: win } = dom;
const d = win.document;
win.dispatchEvent(new win.MessageEvent('message', { data: {
    command: 'init', html, totalCards: payload.totalCards, totalCats: payload.totalCats, totalProjects: payload.totalProjects,
} }));

const setupBadge = [...d.querySelectorAll('.card-folder')].find(b => b.dataset.project === 'alpha' && b.dataset.section === 'docs');
if (!setupBadge) {
    check('the page renders the folder badge', false);
} else {
    setupBadge.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    const visible = [...d.querySelectorAll('.card')].filter(c => !c.classList.contains('hidden')).map(c => c.dataset.project + ':' + c.dataset.section);
    check('clicking a folder badge selects that project in the toolbar', d.getElementById('proj-filter').value === 'alpha', d.getElementById('proj-filter').value);
    check('…and that folder in the section filter', d.getElementById('section-filter').value === 'docs', d.getElementById('section-filter').value);
    check('…and only that project\'s folder stays visible', visible.length === 1 && visible[0] === 'alpha:docs', visible.join(', '));
}
const page = shell;
check('catalog.html has no Dewey handling left', !/dewey/i.test(page));

fs.rmSync(TMP, { recursive: true, force: true });
console.log('─'.repeat(60));
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
