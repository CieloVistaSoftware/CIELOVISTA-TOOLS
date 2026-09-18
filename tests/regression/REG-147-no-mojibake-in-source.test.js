/**
 * REG-147-no-mojibake-in-source.test.js
 *
 * Guards #743. Sixteen "Other Tools" entries in the launcher catalog showed a
 * garbled group icon: the toolbox emoji (U+1F9F0) had been written out as its
 * four UTF-8 bytes read back as Windows-1252 text, so the launcher displayed
 * four Latin characters instead of the icon. The same class of damage had
 * already been found and fixed by hand in src/extension.ts and
 * src/shared/doc-preview.ts, so this test looks for the class, not the one
 * string.
 *
 * It asserts:
 *   1. the "Other Tools" group icon in
 *      src/features/cvs-command-launcher/catalog.ts (html.ts takes it from the
 *      group's first entry) is the real toolbox emoji
 *   2. the 16 entries #743 found damaged carry the real toolbox emoji (a few
 *      other "Other Tools" entries use their own icon on purpose, e.g. the
 *      File List folder, and are not forced to the toolbox)
 *   3. every groupIcon in the catalog is free of mojibake
 *   4. no tracked text file under src/, scripts/, tests/, docs/,
 *      mcp-server/src/, package.json or a root *.md contains mojibake
 *   5. every ALLOWED exemption still exists and still needs exempting
 *   6. the detector flags the mis-decoded form of sample characters and not
 *      the real characters
 *
 * What counts as mojibake: a UTF-8 lead byte (0xC2-0xF4) read as its
 * Windows-1252 / Latin-1 character, followed by the right number of UTF-8
 * continuation bytes (0x80-0xBF) also read as Windows-1252 characters. That is
 * exactly the shape a UTF-8 file takes after one wrong decode-and-save, and it
 * almost never occurs in real text. The lead-plus-plain-space form (an NBSP
 * whose second byte was later normalized to a space) is flagged too.
 *
 * The markers are built from character codes, so this file does not contain
 * them literally and does not trip its own check.
 *
 * Files are listed with "git ls-files" when a git checkout is present (the
 * check is about tracked files, not local scratch output). Outside a checkout,
 * e.g. an extracted "git archive" tree, it walks the same roots, skipping
 * node_modules, out, out-test and dist.
 *
 * Read-only: it reads files and writes nothing.
 *
 * Run: node tests/regression/REG-147-no-mojibake-in-source.test.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT    = path.resolve(__dirname, '..', '..');
const CATALOG = path.join(ROOT, 'src', 'features', 'cvs-command-launcher', 'catalog.ts');

const TOOLBOX = String.fromCodePoint(0x1F9F0);

/** Roots scanned, relative to the repo root, in forward-slash form. */
const SCAN_DIRS  = ['src/', 'scripts/', 'tests/', 'docs/', 'mcp-server/src/'];
const SKIP_DIRS  = new Set(['node_modules', 'out', 'out-test', 'dist', '.git']);
const TEXT_EXT   = /\.(ts|tsx|js|mjs|cjs|json|md|html|css|txt|ya?ml|ps1|py|sh|svg|xml)$/i;

/**
 * Files allowed to contain mojibake, each with the reason. A file belongs here
 * only when the mojibake is its subject (a fixture ABOUT mis-decoded text).
 * Empty as of #743: no tracked file needs it.
 */
const ALLOWED = new Map([
    // ['tests/fixtures/example.txt', 'fixture that demonstrates mis-decoded UTF-8'],
]);

// Windows-1252 maps these code points into bytes 0x80-0x9F.
const CP1252 = new Map([
    [0x20AC, 0x80], [0x201A, 0x82], [0x0192, 0x83], [0x201E, 0x84], [0x2026, 0x85],
    [0x2020, 0x86], [0x2021, 0x87], [0x02C6, 0x88], [0x2030, 0x89], [0x0160, 0x8A],
    [0x2039, 0x8B], [0x0152, 0x8C], [0x017D, 0x8E], [0x2018, 0x91], [0x2019, 0x92],
    [0x201C, 0x93], [0x201D, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
    [0x02DC, 0x98], [0x2122, 0x99], [0x0161, 0x9A], [0x203A, 0x9B], [0x0153, 0x9C],
    [0x017E, 0x9E], [0x0178, 0x9F],
]);

/** The byte a character stood for if it came from a Windows-1252/Latin-1 decode. */
function byteOf(cp) {
    if (cp >= 0x80 && cp <= 0xFF) { return cp; }
    return CP1252.get(cp);
}

const LEAD_NBSP_SPACE = String.fromCharCode(0xC2, 0x20);

/**
 * Return the first mojibake sequence in a string, or null.
 * Lead 0xC2-0xDF needs 1 continuation byte, 0xE0-0xEF needs 2, 0xF0-0xF4 needs 3.
 */
function findMojibake(text) {
    const chars = Array.from(text);
    for (let i = 0; i < chars.length; i++) {
        const lead = chars[i].codePointAt(0);
        if (lead < 0xC2 || lead > 0xF4) { continue; }
        const need = lead >= 0xF0 ? 3 : lead >= 0xE0 ? 2 : 1;
        if (i + need >= chars.length) { continue; }
        let ok = true;
        for (let k = 1; k <= need; k++) {
            const b = byteOf(chars[i + k].codePointAt(0));
            if (b === undefined || b < 0x80 || b > 0xBF) { ok = false; break; }
        }
        if (ok) { return chars.slice(i, i + need + 1).join(''); }
    }
    const nb = text.indexOf(LEAD_NBSP_SPACE);
    return nb === -1 ? null : LEAD_NBSP_SPACE;
}

function inScope(rel) {
    if (rel.split('/').some(part => SKIP_DIRS.has(part))) { return false; }
    if (rel === 'package.json') { return true; }
    if (!rel.includes('/') && rel.toLowerCase().endsWith('.md')) { return true; }
    return SCAN_DIRS.some(d => rel.startsWith(d)) && TEXT_EXT.test(rel);
}

function walk(dir, out) {
    if (!fs.existsSync(dir)) { return out; }
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (SKIP_DIRS.has(e.name)) { continue; }
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { walk(full, out); }
        else if (e.isFile()) { out.push(path.relative(ROOT, full).split(path.sep).join('/')); }
    }
    return out;
}

function listFiles() {
    let rels = null;
    if (fs.existsSync(path.join(ROOT, '.git'))) {
        try {
            rels = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, maxBuffer: 1 << 28 })
                .toString('utf8').split('\0').filter(Boolean);
        } catch { rels = null; }
    }
    if (!rels) {
        rels = walk(ROOT, []).filter(r => r.includes('/') ? SCAN_DIRS.some(d => r.startsWith(d)) : true);
    }
    return rels.filter(inScope).filter(r => fs.existsSync(path.join(ROOT, r)));
}

function describe(seq) {
    return Array.from(seq).map(c => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')).join(' ');
}

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`  ✓ ${name}`); }
    catch (err) { failed++; console.error(`  ✗ ${name}\n      → ${err && err.message}`); }
}
function assert(cond, message) { if (!cond) { throw new Error(message); } }

console.log('\nREG-147: no mojibake in tracked source and docs (#743)\n');

const catalogSrc = fs.readFileSync(CATALOG, 'utf8');
const groupIcons = [...catalogSrc.matchAll(/id:\s*'([^']+)'[^\n]*?group:\s*'([^']*)',\s*groupIcon:\s*'([^']*)'/g)]
    .map(m => ({ id: m[1], group: m[2], icon: m[3] }));

/** The 16 entries #743 found with the mis-decoded toolbox icon. */
const DAMAGED_IN_743 = [
    'cvs.features.configure', 'cvs.health.fixBugs', 'cvs.tools.errorLog', 'cvs.imageReader.open',
    'cvs.mcp.viewer.open', 'cvs.registry.promote', 'cvs.registry.demote', 'cvs.registry.archive',
    'cvs.editor.copyJsonToCopilotChat', 'cvs.corequisites.check', 'cvs.corequisites.install',
    'cvs.issues.openViewer', 'cvs.issues.newIssue', 'cvs.registry.showCommands',
    'cvs.registry.showComponents', 'cvs.registry.rebuild',
];

test('the "Other Tools" group icon is the real toolbox emoji', () => {
    const other = groupIcons.filter(g => g.group === 'Other Tools');
    assert(other.length > 0, 'no "Other Tools" entries found in catalog.ts; the test pattern no longer matches the file');
    // html.ts takes a group's icon from its first entry.
    assert(other[0].icon === TOOLBOX,
        `first "Other Tools" entry (${other[0].id}) has groupIcon ${describe(other[0].icon)}, expected ${describe(TOOLBOX)}`);
});

test('the 16 entries damaged in #743 carry the real toolbox emoji', () => {
    const byId = new Map(groupIcons.map(g => [g.id, g]));
    // An entry later removed from the catalog is not a failure; the pattern
    // still matching is checked by requiring at least one to be found.
    const present = DAMAGED_IN_743.filter(id => byId.has(id));
    assert(present.length > 0, 'none of the #743 entries were found; the test pattern no longer matches catalog.ts');
    const wrong = present.filter(id => byId.get(id).icon !== TOOLBOX)
        .map(id => `${id} has ${describe(byId.get(id).icon)}`);
    assert(wrong.length === 0, `expected ${describe(TOOLBOX)}:\n        ${wrong.join('\n        ')}`);
});

test('no catalog groupIcon is mojibake', () => {
    const bad = groupIcons.filter(g => findMojibake(g.icon));
    assert(bad.length === 0,
        `${bad.length} groupIcon(s) are mojibake, e.g. group "${bad[0] && bad[0].group}" ` +
        `icon ${bad[0] && describe(bad[0].icon)}`);
});

test('no tracked source or doc file contains mojibake', () => {
    const files = listFiles();
    assert(files.length > 50, `only ${files.length} files found to scan; the file listing is broken`);
    const hits = [];
    for (const rel of files) {
        if (ALLOWED.has(rel)) { continue; }
        const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const seq = findMojibake(lines[i]);
            if (seq) { hits.push(`${rel}:${i + 1} (${describe(seq)})`); }
        }
    }
    assert(hits.length === 0,
        `${hits.length} line(s) contain mojibake (UTF-8 bytes decoded as Windows-1252). ` +
        `Fix the text, or, if the file is a fixture about mojibake, add it to ALLOWED with the reason:\n        ` +
        hits.slice(0, 25).join('\n        ') + (hits.length > 25 ? `\n        ... and ${hits.length - 25} more` : ''));
});

test('every ALLOWED entry still exists and still needs the exemption', () => {
    for (const [rel, why] of ALLOWED) {
        assert(typeof why === 'string' && why.length > 10, `${rel}: exemption has no reason`);
        const full = path.join(ROOT, rel);
        assert(fs.existsSync(full), `${rel} is exempted but no longer exists`);
        assert(findMojibake(fs.readFileSync(full, 'utf8')), `${rel} is exempted but no longer contains mojibake`);
    }
});

test('the detector recognises the damaged forms it guards against', () => {
    const mangle = s => Array.from(Buffer.from(s, 'utf8')).map(b => {
        for (const [cp, byte] of CP1252) { if (byte === b) { return String.fromCodePoint(cp); } }
        return String.fromCharCode(b);
    }).join('');
    for (const good of [TOOLBOX, '—', '─', 'é', '→', '✓']) {
        assert(findMojibake(good) === null, `false positive on the real character ${describe(good)}`);
        assert(findMojibake('x ' + mangle(good) + ' y'), `missed the mis-decoded form of ${describe(good)}`);
    }
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
