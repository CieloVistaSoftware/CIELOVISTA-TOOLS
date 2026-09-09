/**
 * docs-site.js — generates docs/index.html, the browsable docs page (#708).
 *
 * WHY THIS EXISTS
 *
 * The rebuilt docs are markdown, and the .io site has .nojekyll (added in #681
 * so Pages would stop dropping docs/_today/). Jekyll off means Pages serves .md
 * as raw text, never rendered — so the new docs were invisible on the site.
 *
 * WHAT IT IS NOT
 *
 * John: "Just have links to all the docs becomes overwhelming to even me... we
 * want ease of use for the end user, not just every document out there thrown
 * at them."
 *
 * So this is a browser, not a dump. The page opens on THREE doors and a search
 * box. Nothing else is visible until asked for: each door expands in place, and
 * the archive is collapsed behind its own disclosure — reachable, never in the
 * way. A reader who wants one thing sees one thing.
 *
 * Document links point at GitHub's blob view rather than the raw .md, because
 * that is where the markdown actually renders.
 *
 * Run via `npm run docs:sync` (after docs-sync.js has refreshed catalog.json).
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT     = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(ROOT, 'docs');
const CATALOG  = path.join(DOCS_DIR, 'catalog.json');
const OUT      = path.join(DOCS_DIR, 'index.html');
const BLOB     = 'https://github.com/CieloVistaSoftware/CIELOVISTA-TOOLS/blob/main';

/** Doors, in reading order. Anything not listed still appears, after these. */
const DOORS = {
    using:   { icon: '🧭', label: 'Using it',      blurb: 'What the tools do, and how to quiet the ones you do not want.' },
    working: { icon: '🔧', label: 'Working on it',  blurb: 'Issues, the closure gate, the regression suite, releases.' },
    status:  { icon: '📍', label: 'Right now',      blurb: 'What the last session did and what the next one picks up.' },
};

function esc(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function titleFromFile(file) {
    try {
        const heading = fs.readFileSync(file, 'utf8').match(/^#\s+(.+)$/m);
        if (heading) { return heading[1].trim(); }
    } catch { /* unreadable — fall through */ }
    return path.basename(file).replace(/\.(md|html)$/, '').replace(/[-_]/g, ' ');
}

/** The archive is deliberately outside the contract, so read it from disk. */
function collectArchive(dir = path.join(DOCS_DIR, 'archive'), out = []) {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return out; }

    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { collectArchive(full, out); continue; }
        if (!/\.(md|html)$/.test(entry.name)) { continue; }
        out.push({
            title: titleFromFile(full),
            path:  path.relative(ROOT, full).split(path.sep).join('/'),
        });
    }
    return out;
}

const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
const archive = collectArchive().sort((a, b) => a.title.localeCompare(b.title));

const sections = [
    ...Object.keys(DOORS).filter(s => catalog.sections.includes(s)),
    ...catalog.sections.filter(s => !DOORS[s]),
];

function docRow(d) {
    return `<li class="doc" data-search="${esc((d.title + ' ' + d.description).toLowerCase())}">
<a class="doc-link" href="${esc(BLOB)}/${esc(d.path)}">
<span class="doc-title">${esc(d.title)}</span>
<span class="doc-desc">${esc(d.description || '')}</span>
</a></li>`;
}

const doorsHtml = sections.map(section => {
    const meta = DOORS[section] || { icon: '📄', label: section, blurb: '' };
    const entries = catalog.docs
        .filter(d => d.section === section && d.id !== section)
        .sort((a, b) => a.title.localeCompare(b.title));

    return `<details class="door" data-section="${esc(section)}">
<summary>
<span class="door-icon" aria-hidden="true">${meta.icon}</span>
<span class="door-text">
<span class="door-label">${esc(meta.label)}</span>
<span class="door-blurb">${esc(meta.blurb)}</span>
</span>
<span class="door-count">${entries.length}</span>
</summary>
<ul class="docs">${entries.map(docRow).join('\n')}</ul>
</details>`;
}).join('\n');

const archiveHtml = `<details class="door door-archive">
<summary>
<span class="door-icon" aria-hidden="true">🗄️</span>
<span class="door-text">
<span class="door-label">Archive</span>
<span class="door-blurb">Retired documents and past audit reports. Kept for history, not maintained.</span>
</span>
<span class="door-count">${archive.length}</span>
</summary>
<ul class="docs">${archive.map(a => `<li class="doc" data-search="${esc(a.title.toLowerCase())}">
<a class="doc-link" href="${esc(BLOB)}/${esc(a.path)}">
<span class="doc-title">${esc(a.title)}</span>
<span class="doc-desc">${esc(a.path)}</span>
</a></li>`).join('\n')}</ul>
</details>`;

const html = `<!DOCTYPE html>
<html lang="en" data-theme="cielo-midnight"><head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>Cielo Vista Software | Documentation</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg"/>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet"/>
<!-- GENERATED by scripts/docs-site.js — do not hand-edit. Run \`npm run docs:sync\`. -->
<style>
:root, html[data-theme="cielo-midnight"] {
  --color-surface: 11 15 20;
  --color-surface-container-lowest: 17 21 27;
  --color-surface-container-low: 23 28 35;
  --color-primary: 138 215 230;
  --color-outline-variant: 62 72 83;
  --color-on-surface: 228 231 235;
  --color-on-surface-variant: 174 183 194;
}
* { box-sizing: border-box; }
body {
  margin: 0; padding: 2.5rem 1.25rem 4rem;
  background: rgb(var(--color-surface));
  color: rgb(var(--color-on-surface));
  font-family: Inter, system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 1rem; line-height: 1.6;
}
.wrap { max-width: 46rem; margin: 0 auto; }
h1 { font-family: Manrope, Inter, sans-serif; font-size: 1.75rem; font-weight: 800; margin: 0 0 .35rem; }
.lede { color: rgb(var(--color-on-surface-variant)); margin: 0 0 1.75rem; }
.lede a { color: rgb(var(--color-primary)); }
#q {
  width: 100%; padding: .7rem .9rem; margin-bottom: 1.5rem;
  background: rgb(var(--color-surface-container-lowest));
  border: 1px solid rgb(var(--color-outline-variant) / .5);
  border-radius: .7rem; color: inherit; font: inherit;
}
#q:focus { outline: 2px solid rgb(var(--color-primary) / .6); outline-offset: 1px; }
.door {
  background: rgb(var(--color-surface-container-lowest));
  border: 1px solid rgb(var(--color-outline-variant) / .35);
  border-radius: .85rem; margin-bottom: .75rem;
}
.door > summary {
  display: flex; align-items: center; gap: .85rem;
  padding: 1rem 1.1rem; cursor: pointer; list-style: none;
}
.door > summary::-webkit-details-marker { display: none; }
.door > summary:hover .door-label { color: rgb(var(--color-primary)); }
.door-icon { font-size: 1.35rem; }
.door-text { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.door-label { font-family: Manrope, Inter, sans-serif; font-weight: 700; font-size: 1.05rem; }
.door-blurb { color: rgb(var(--color-on-surface-variant)); font-size: .875rem; }
.door-count {
  color: rgb(var(--color-on-surface-variant)); font-size: .8rem;
  border: 1px solid rgb(var(--color-outline-variant) / .5);
  border-radius: 999px; padding: .1rem .55rem; flex-shrink: 0;
}
.door-archive { opacity: .72; }
.door-archive:hover, .door-archive[open] { opacity: 1; }
.docs { list-style: none; margin: 0; padding: 0 .6rem .6rem; }
.doc-link {
  display: flex; flex-direction: column;
  padding: .6rem .75rem; border-radius: .55rem;
  color: inherit; text-decoration: none;
}
.doc-link:hover { background: rgb(var(--color-surface-container-low)); }
.doc-title { font-weight: 600; color: rgb(var(--color-primary)); }
.doc-desc { color: rgb(var(--color-on-surface-variant)); font-size: .875rem; }
.doc[hidden] { display: none; }
.empty { color: rgb(var(--color-on-surface-variant)); font-size: .9rem; padding: .5rem .75rem; }
footer { margin-top: 2.5rem; color: rgb(var(--color-on-surface-variant)); font-size: .85rem; }
footer a { color: rgb(var(--color-primary)); }
</style>
</head><body>
<div class="wrap">
<h1>cielovista-tools</h1>
<p class="lede">One VS Code extension holding every CieloVista developer tool.
Start with a door below, or search. <a href="${BLOB}/docs/README.md">Read the overview →</a></p>

<input id="q" type="search" placeholder="Search the docs…" aria-label="Search the docs" autocomplete="off"/>

<div id="doors">
${doorsHtml}
${archiveHtml}
</div>

<p class="empty" id="noresults" hidden>Nothing matches that.</p>

<footer>
Generated from <code>docs/catalog.json</code> by <code>scripts/docs-site.js</code>.
Documents open on GitHub, where markdown renders.
</footer>
</div>

<script>
(function () {
  var q = document.getElementById('q');
  var doors = Array.prototype.slice.call(document.querySelectorAll('.door'));
  var none = document.getElementById('noresults');

  q.addEventListener('input', function () {
    var term = q.value.trim().toLowerCase();
    var anyVisible = false;

    doors.forEach(function (door) {
      var docs = Array.prototype.slice.call(door.querySelectorAll('.doc'));
      var matches = 0;

      docs.forEach(function (doc) {
        var hit = !term || doc.getAttribute('data-search').indexOf(term) !== -1;
        doc.hidden = !hit;
        if (hit) { matches++; }
      });

      // With no search term the page returns to its resting state: every door
      // shut. That is the point of the page -- three choices, not fourteen.
      door.hidden = term ? matches === 0 : false;
      door.open = term ? matches > 0 : false;
      if (!door.hidden) { anyVisible = true; }
    });

    none.hidden = anyVisible;
  });
})();
</script>
</body></html>
`;

let current = null;
try { current = fs.readFileSync(OUT, 'utf8'); } catch { /* absent */ }

if (process.argv.includes('--check')) {
    if (current !== html) {
        console.error('✗ docs/index.html is out of date — run `npm run docs:sync`');
        process.exit(1);
    }
    console.log('✓ docs/index.html is up to date');
    process.exit(0);
}

if (current !== html) {
    fs.writeFileSync(OUT, html);
    console.log(`docs-site: wrote docs/index.html (${sections.length} doors, ${archive.length} archived)`);
} else {
    console.log('docs-site: docs/index.html already up to date');
}
