/**
 * docs-sync.js — the one command that keeps docs/ in sync (#708).
 *
 *   node scripts/docs-sync.js           regenerate hub listings + catalog, validate
 *   node scripts/docs-sync.js --check   validate only, write nothing (CI/gate)
 *
 * WHY THIS EXISTS
 *
 * The old contract asked for 13 hand-typed frontmatter fields per document.
 * That much metadata at the top of a file buries the prose, so it was moved to
 * the BOTTOM to get it out of the way — a reasonable call that had one fatal
 * side effect: no standard parser reads a trailer, so the ids became invisible.
 * 82 docids were declared and 2 were ever referenced (#707).
 *
 * The fix is volume, not placement. Three fields cost five lines and can sit at
 * the top without being in the way:
 *
 *     ---
 *     id: regression-log
 *     title: Regression Log
 *     description: What each REG-NNN test guards and why it exists.
 *     ---
 *
 * Both placements are accepted so the choice stays reversible; TOP is preferred
 * because GitHub, VS Code and Obsidian only parse it there.
 *
 * PROGRESSIVE DISCLOSURE
 *
 * John: "the whole introduction must be simple, and point the user deeper as
 * they go. Just have links to all the docs becomes overwhelming to even me."
 *
 * So there is deliberately NO generated page listing every document. The front
 * door (docs/README.md) is hand-written and short. Each section folder has a
 * hub whose document list is generated between markers — curated prose stays,
 * the list never goes stale. THE FOLDER IS THE CATEGORY: drop a file in
 * docs/using/ and it is categorised, with no number to assign and no index to
 * hand-edit. That is what makes "updates are simple and done often" true.
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const cp   = require('child_process');

const ROOT       = path.resolve(__dirname, '..');
const DOCS_DIR   = path.join(ROOT, 'docs');
const CATALOG    = path.join(DOCS_DIR, 'catalog.json');
const CHECK_ONLY = process.argv.includes('--check');

const FRONT_DOOR   = 'README.md';   // hand-written, never generated
const HUB          = 'README.md';   // one per section folder
/**
 * The entire hand-written contract. Three fields, at the top.
 * Everything else -- path, section, updated -- is derived and generated into
 * catalog.json, so there is nothing in a document that can drift out of date.
 */
const ALLOWED_FIELDS = new Set(['id', 'title', 'description']);

const BEGIN_MARKER = '<!-- docs-sync:begin -->';
const END_MARKER   = '<!-- docs-sync:end -->';

const problems = [];
const notes    = [];

// ─── Discovery ────────────────────────────────────────────────────────────────

function listDir(dir) {
    try {
        return fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
        // A directory can vanish between listing and read (REG-130 invariant 2).
        if (err && err.code === 'ENOENT') { return []; }
        throw err;
    }
}

function walk(dir, out = []) {
    for (const entry of listDir(dir)) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            // archive/ holds retired documents on their way out. They are kept (never
            // deleted) but exempt from the contract -- forcing a doc you are retiring to
            // satisfy a new contract is pure waste.
            if (entry.name === 'assets' || entry.name === 'archive'
                || entry.name.startsWith('.') || entry.name.startsWith('_')) { continue; }
            walk(full, out);
        } else if (entry.name.endsWith('.md')) {
            out.push(full);
        }
    }
    return out;
}

// ─── Frontmatter (top preferred, trailer tolerated) ───────────────────────────

function parseFields(block) {
    const fields = {};
    for (const line of block.split(/\r?\n/)) {
        const kv = line.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
        if (kv) { fields[kv[1].toLowerCase()] = kv[2].trim().replace(/^["']|["']$/g, ''); }
    }
    return fields;
}

function readFrontmatter(text) {
    const top = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (top) {
        return { fields: parseFields(top[1]), placement: 'top', body: text.slice(top[0].length) };
    }
    // Trailer: a --- block that ends the file. Only this script can see it.
    const bottom = text.match(/\r?\n---\r?\n([\s\S]*?)\r?\n---\s*$/);
    if (bottom && /^\s*[A-Za-z][A-Za-z0-9_-]*\s*:/m.test(bottom[1])) {
        return { fields: parseFields(bottom[1]), placement: 'bottom', body: text.slice(0, bottom.index) };
    }
    return { fields: {}, placement: 'none', body: text };
}

function slugFor(file) {
    return path.basename(file, '.md')
        .replace(/[_\s]+/g, '-')
        .replace(/[^A-Za-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase();
}

function lastUpdated(relPath) {
    try {
        return cp.execSync(`git log -1 --format=%ad --date=short -- "${relPath}"`,
            { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch { return ''; }
}

// ─── Build the model ──────────────────────────────────────────────────────────

const docs = [];
const byId = new Map();
let trailerCount = 0;

for (const file of walk(DOCS_DIR).sort()) {
    const rel      = path.relative(ROOT, file).replace(/\\/g, '/');
    const relDocs  = path.relative(DOCS_DIR, file).replace(/\\/g, '/');
    const segments = relDocs.split('/');
    const section  = segments.length > 1 ? segments[0] : '';
    const isHub    = segments.length === 2 && segments[1] === HUB;
    const isFront  = relDocs === FRONT_DOOR;

    const text = fs.readFileSync(file, 'utf8');
    const { fields, placement, body } = readFrontmatter(text);
    const id = fields.id || slugFor(file);

    if (placement === 'none') {
        problems.push(`${rel}: no frontmatter — needs id, title, description at the top`);
    } else {
        if (placement === 'bottom') {
            trailerCount++;
            problems.push(`${rel}: frontmatter is at the bottom, where only this script can read it — `
                + `move it to the top (at three fields it costs five lines)`);
        }
        if (!fields.title)       { problems.push(`${rel}: missing \`title\``); }
        if (!fields.description) { problems.push(`${rel}: missing \`description\``); }

        // THE CONTRACT IS THREE FIELDS. This check is the whole reason the block
        // can live at the top without being in the way: it is what stops the
        // creep back to 13 fields that pushed it to the bottom in the first
        // place (#708). Anything derivable belongs in catalog.json, generated —
        // never typed into a document.
        const extra = Object.keys(fields).filter(k => !ALLOWED_FIELDS.has(k));
        if (extra.length) {
            problems.push(`${rel}: frontmatter has ${extra.length} field(s) beyond the contract `
                + `(${extra.join(', ')}) — only id, title and description are hand-written; `
                + `anything derivable is generated into docs/catalog.json`);
        }
    }

    if (byId.has(id)) {
        problems.push(`duplicate id "${id}": ${byId.get(id)} and ${rel}`);
    } else {
        byId.set(id, rel);
    }

    if (!isFront && !section) {
        problems.push(`${rel}: sits loose in docs/ — every document belongs to a section folder `
            + `(the folder is its category)`);
    }

    docs.push({
        id,
        title:       fields.title || path.basename(file, '.md'),
        description: fields.description || '',
        path:        rel,
        section,
        isHub,
        isFront,
        placement,
        refs:        [...body.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)].map(m => m[1].trim()),
        updated:     lastUpdated(rel),
    });
}

// A reference nothing checks is why the old ids went unused (#707).
for (const doc of docs) {
    for (const ref of doc.refs) {
        if (!byId.has(ref)) {
            problems.push(`${doc.path}: [[${ref}]] does not resolve to any document`);
        }
    }
}

// ─── The other two ways a reference breaks ────────────────────────────────────
//
// [[id]] refs survive a file rename because the id lives in frontmatter, not in
// the path. Two other forms do NOT, and both break silently:
//
//   2. relative markdown links — [text](../working/regression-log.md)
//   3. doc paths hardcoded in source — 'docs/REGRESSION-LOG.md' in a .ts file
//
// (3) is not hypothetical: moving nine documents in #708 broke live references
// in regression-log-viewer.ts, cvs-command-launcher/catalog.ts, docs-manager.ts,
// registry-promote.ts and mcp-server/src/tools/index.ts. Nothing caught it. That
// is exactly the code/docs drift this contract exists to prevent, so it is
// checked here rather than left to whoever notices.

for (const doc of docs) {
    const abs  = path.join(ROOT, doc.path);
    const text = fs.readFileSync(abs, 'utf8');

    for (const m of text.matchAll(/\]\(([^)\s#]+\.md)(?:#[^)]*)?\)/g)) {
        const target = m[1];
        if (/^[a-z]+:/i.test(target)) { continue; }            // external URL
        const resolved = path.resolve(path.dirname(abs), target);
        if (!fs.existsSync(resolved)) {
            problems.push(`${doc.path}: link to \`${target}\` points at a file that does not exist`);
        }
    }
}

/**
 * Production source that names a docs/ path must name one that is really there.
 *
 * tests/ is deliberately out of scope. Test files legitimately contain paths
 * that do not exist, for two distinct reasons, both seen here:
 *   - fixtures the test creates and deletes itself
 *     (REG-066 writes docs/_today/REG-066-frontmatter-scope-control.md)
 *   - synthetic input to a pure function, never touching disk
 *     (doc-header.test.js passes '/home/user/project/docs/guide.md')
 * Flagging those trains people to ignore the check, which is worse than the
 * narrower coverage.
 */
const CODE_ROOTS = ['src', 'scripts', 'mcp-server/src'];
const CODE_EXT   = new Set(['.ts', '.js', '.mjs']);

function walkCode(dir, out = []) {
    for (const entry of listDir(dir)) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) { continue; }
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walkCode(full, out); }
        else if (CODE_EXT.has(path.extname(entry.name))) { out.push(full); }
    }
    return out;
}

const SELF = path.resolve(__filename);

for (const root of CODE_ROOTS) {
    for (const file of walkCode(path.join(ROOT, root))) {
        if (path.resolve(file) === SELF) { continue; }          // this file documents the patterns
        let text;
        try { text = fs.readFileSync(file, 'utf8'); }
        catch (err) { if (err && err.code === 'ENOENT') { continue; } throw err; }

        // Match a docs/ path ANYWHERE, not just as a whole quoted string. The
        // real references are embedded: a doc comment ("...lives in
        // docs/working/regression-log.md."), a template literal
        // (`<code>docs/working/regression-log.md</code>`), a sentence inside a
        // tooltip string. An earlier version required the path to be the entire
        // string literal and therefore caught none of them — it reported clean
        // while regression-log-viewer.ts pointed at a file that did not exist.
        const rel = path.relative(ROOT, file).replace(/\\/g, '/');

        for (const m of text.matchAll(/\b(docs\/[A-Za-z0-9_\-./]*\.md)\b/g)) {
            const target = m[1];
            if (target.startsWith('docs/archive/')) { continue; }
            if (!fs.existsSync(path.join(ROOT, target))) {
                problems.push(`${rel}: references \`${target}\`, which no longer exists — `
                    + `a moved document left a dangling path in code`);
            }
        }

        // A path COMPOSED from segments — path.join(root, 'docs', '_today') —
        // hides from the literal scan above; test-coverage-auditor.ts read its
        // reports from exactly that while the writer had already moved away.
        //
        // Flagging every such call was tried and reverted: docs/_today holds the
        // published website, so generate-marketplace-features.js and friends
        // MUST compose paths into it. A check that fires on correct code is a
        // check people learn to ignore.
        //
        // The invariant is asserted on the OUTCOME instead — see below.
    }
}

const sections = [...new Set(docs.map(d => d.section).filter(Boolean))].sort();
for (const section of sections) {
    if (!docs.some(d => d.section === section && d.isHub)) {
        problems.push(`docs/${section}/: no ${HUB} — every section needs a hub so the front door `
            + `can point at one page instead of a flat list of everything`);
    }
}

if (!docs.some(d => d.isFront)) {
    problems.push(`docs/${FRONT_DOOR}: missing — this is the front door and is hand-written, not generated`);
}

if (trailerCount) {
    notes.push(`${trailerCount} document(s) keep frontmatter at the bottom. Only this script reads it — `
        + `GitHub, VS Code and Obsidian render it as visible text (#708).`);
}

// ─── docs/_today holds the website, not documents ─────────────────────────────
//
// This is the invariant that actually matters, and it does not care how a path
// was built. Both audit scripts used to write datestamped reports here, which is
// how 5,778 lines of generated artifacts came to be 81% of the docs folder
// (#708). Assert the outcome: no markdown in _today, ever. Generated reports go
// to reports/ (git-ignored); real documents go in a section folder.
const TODAY_DIR = path.join(DOCS_DIR, '_today');
for (const entry of listDir(TODAY_DIR)) {
    if (entry.isFile() && entry.name.endsWith('.md')) {
        problems.push(`docs/_today/${entry.name}: docs/_today holds the published website only. `
            + `A generated report belongs in reports/; a real document belongs in a section folder.`);
    }
}

// ─── Emit ─────────────────────────────────────────────────────────────────────

/** Replaces the generated block inside a hub, leaving its hand-written prose alone. */
function renderHubBlock(section) {
    const entries = docs
        .filter(d => d.section === section && !d.isHub)
        .sort((a, b) => a.title.localeCompare(b.title));

    if (!entries.length) { return `${BEGIN_MARKER}\n\n_No documents yet._\n\n${END_MARKER}`; }

    const lines = [BEGIN_MARKER, ''];
    for (const d of entries) {
        const href = path.relative(path.join(DOCS_DIR, section), path.join(ROOT, d.path)).replace(/\\/g, '/');
        lines.push(`- **[${d.title}](${href})** — ${d.description || '_no description_'}`);
    }
    lines.push('', END_MARKER);
    return lines.join('\n');
}

const writes = [];

for (const section of sections) {
    const hub = docs.find(d => d.section === section && d.isHub);
    if (!hub) { continue; }

    const file    = path.join(ROOT, hub.path);
    const current = fs.readFileSync(file, 'utf8');
    const block   = renderHubBlock(section);

    if (!current.includes(BEGIN_MARKER)) {
        problems.push(`${hub.path}: no ${BEGIN_MARKER} … ${END_MARKER} block — `
            + `docs-sync has nowhere to write this section's document list`);
        continue;
    }

    const next = current.replace(
        new RegExp(`${BEGIN_MARKER}[\\s\\S]*?${END_MARKER}`),
        () => block,
    );
    if (next !== current) { writes.push([file, next, hub.path]); }
}

// Backlinks: "what points AT this document?" — the question you need answered
// before retiring or renaming one. Outbound refs are visible in the prose; the
// reverse direction is not, so it is generated rather than written. This is why
// there is no hand-maintained cross-reference page: it would duplicate the prose
// and immediately go stale.
const backlinks = new Map(docs.map(d => [d.id, []]));
for (const doc of docs) {
    for (const ref of new Set(doc.refs)) {
        if (backlinks.has(ref) && ref !== doc.id) { backlinks.get(ref).push(doc.id); }
    }
}

const catalogJson = JSON.stringify({
    generatedBy: 'scripts/docs-sync.js',
    sections,
    docs: docs.map(({ isHub, isFront, refs, ...rest }) => ({
        ...rest,
        refs: [...new Set(refs)].sort(),
        backlinks: (backlinks.get(rest.id) || []).sort(),
    })),
}, null, 2) + '\n';

let catalogCurrent = null;
try { catalogCurrent = fs.readFileSync(CATALOG, 'utf8'); } catch { /* absent */ }
if (catalogCurrent !== catalogJson) { writes.push([CATALOG, catalogJson, 'docs/catalog.json']); }

if (CHECK_ONLY) {
    for (const [, , label] of writes) {
        problems.push(`out of date: ${label} — run \`npm run docs:sync\``);
    }
} else {
    for (const [file, content] of writes) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, content);
    }
}

// ─── Report ───────────────────────────────────────────────────────────────────

console.log(`docs-sync: ${docs.length} document(s) across ${sections.length} section(s)`);
if (!CHECK_ONLY) {
    console.log(writes.length
        ? `  regenerated: ${writes.map(w => w[2]).join(', ')}`
        : '  already up to date');
}
for (const note of notes) { console.log(`  note: ${note}`); }

if (problems.length) {
    console.error(`\n✗ ${problems.length} doc contract violation(s):\n`);
    for (const p of problems) { console.error(`  - ${p}`); }
    console.error('');
    process.exit(1);
}

console.log('✓ doc contract clean');
process.exit(0);
