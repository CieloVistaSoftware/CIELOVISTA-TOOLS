// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Test: every Dewey number in the launcher catalog is unique (no duplicates allowed)
//
// #777: this test used to match /export const CATALOG[\s\S]*?\[([\s\S]*?)\];/.
// Once the catalog was split into RAW_CATALOG plus
// "export const CATALOG: CmdEntry[] = RAW_CATALOG.map(...)", the first "[" after
// "export const CATALOG" was the one in "CmdEntry[]", the captured text held no
// dewey: fields, and the duplicate list was always empty. Its pattern also
// skipped four-digit classes such as 1000.000. It could never fail.
//
// Now it reads the RAW_CATALOG array itself, refuses to pass unless it read one
// Dewey number per entry (so it cannot silently read nothing again), accepts
// 3- and 4-digit classes, and proves on fixtures that it catches a duplicate.
//
// Whether per-command Dewey numbers should exist at all is #787. For as long as
// they do, they must be unique.

'use strict';
const assert = require('assert');
const path   = require('path');
const fs     = require('fs');

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log('  PASS  ' + name); passed++; }
    catch (e) { console.error('  FAIL  ' + name + '\n         → ' + e.message); failed++; }
}

/** Fewer entries than this means the parser read the wrong text, not a small catalog. */
const MIN_PLAUSIBLE_ENTRIES = 50;

/**
 * Reads the body of the RAW_CATALOG array out of catalog.ts source and returns
 * its entry ids, its Dewey numbers, and every dewey: field that is not a
 * well-formed 3- or 4-digit class.
 */
function parseCatalog(src) {
    const start = src.search(/\bconst RAW_CATALOG\s*:\s*CmdEntry\[\]\s*=\s*\[/);
    if (start === -1) { throw new Error('could not locate "const RAW_CATALOG: CmdEntry[] = [" in catalog.ts'); }
    const open = src.indexOf('= [', start) + 2;
    const close = src.indexOf('\n];', open);
    if (close === -1) { throw new Error('could not locate the closing "];" of RAW_CATALOG'); }
    const body = src.slice(open + 1, close);
    const ids       = [...body.matchAll(/\bid:\s*'([^']+)'/g)].map(m => m[1]);
    const deweyAll  = [...body.matchAll(/\bdewey:\s*(['"])(.*?)\1/g)].map(m => m[2]);
    const deweys    = deweyAll.filter(d => /^\d{3,4}\.\d{3}$/.test(d));
    const malformed = deweyAll.filter(d => !/^\d{3,4}\.\d{3}$/.test(d));
    return { ids, deweys, malformed };
}

function duplicatesOf(values) {
    const seen = new Set(), dups = new Set();
    for (const v of values) { if (seen.has(v)) { dups.add(v); } else { seen.add(v); } }
    return [...dups];
}

console.log('\nCatalog Dewey Number Uniqueness (#777)\n' + '─'.repeat(50));

const catalogPath = path.join(__dirname, '../src/features/cvs-command-launcher/catalog.ts');
const content = fs.readFileSync(catalogPath, 'utf8');
let parsed = { ids: [], deweys: [], malformed: [] };
test('RAW_CATALOG array is found in catalog.ts', () => { parsed = parseCatalog(content); });

test(`read a plausible number of entries (at least ${MIN_PLAUSIBLE_ENTRIES})`, () => {
    assert.ok(parsed.ids.length >= MIN_PLAUSIBLE_ENTRIES,
        `read ${parsed.ids.length} entries — the parser is reading the wrong text`);
});

test('read one well-formed Dewey number per entry', () => {
    assert.deepStrictEqual(parsed.malformed, [], 'dewey fields that are not NNN.NNN or NNNN.NNN: ' + parsed.malformed.join(', '));
    assert.strictEqual(parsed.deweys.length, parsed.ids.length,
        `${parsed.ids.length} entries but ${parsed.deweys.length} Dewey numbers — an entry lacks one, or the parser missed some`);
});

test(`catalog.ts has no duplicate Dewey numbers (${parsed.deweys.length} checked)`, () => {
    const dups = duplicatesOf(parsed.deweys);
    assert.deepStrictEqual(dups, [], 'Duplicate Dewey numbers found: ' + dups.join(', '));
});

// The check itself: a catalog shaped like the real one, with a duplicate,
// must be caught, three- and four-digit classes alike.
const fixture = (a, b) => [
    'const RAW_CATALOG: CmdEntry[] = [',
    `    { id: 'cvs.a', title: 'A', dewey: '${a}', scope: 'global' },`,
    `    { id: 'cvs.b', title: 'B', dewey: '${b}', scope: 'global' },`,
    '];',
    '',
    'export const CATALOG: CmdEntry[] = RAW_CATALOG.map((cmd) => ({ ...cmd }));',
].join('\n');

test('a duplicate three-digit Dewey number is caught', () => {
    const p = parseCatalog(fixture('100.001', '100.001'));
    assert.strictEqual(p.ids.length, 2);
    assert.deepStrictEqual(duplicatesOf(p.deweys), ['100.001']);
});

test('a duplicate four-digit Dewey number is caught', () => {
    const p = parseCatalog(fixture('1000.000', '1000.000'));
    assert.deepStrictEqual(duplicatesOf(p.deweys), ['1000.000']);
});

test('distinct Dewey numbers pass', () => {
    const p = parseCatalog(fixture('100.001', '1000.001'));
    assert.deepStrictEqual(duplicatesOf(p.deweys), []);
    assert.strictEqual(p.deweys.length, 2);
});

console.log('\nResult: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) { process.exit(1); }
