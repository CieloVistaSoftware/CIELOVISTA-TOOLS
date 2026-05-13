// Copyright (c) CieloVista Software. All rights reserved.
// REG-033: Issue #321 — No .md file in src/ may have a dewey: frontmatter field
//
// docid: is the canonical identifier. dewey: is a legacy alias that must be
// removed. Any file with both fields is a violation; any file with only dewey:
// and no docid: is also a violation (needs migration).
//
// Run: node tests/regression/REG-033-no-dewey-field-in-src-docs.test.js

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT    = path.resolve(__dirname, '..', '..');
const SRC_DIR = path.join(ROOT, 'src');

let passed = 0, failed = 0;

function test(name, fn) {
    try { fn(); console.log(`  PASS ${name}`); passed++; }
    catch (e) { console.error(`  FAIL ${name}\n       ${e.message}`); failed++; }
}

// Walk src/ and collect all .md files
function walkMd(dir, acc = []) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
    for (const e of entries) {
        if (['node_modules', '.git', 'out', 'dist'].includes(e.name)) { continue; }
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { walkMd(full, acc); }
        else if (e.isFile() && /\.md$/i.test(e.name)) { acc.push(full); }
    }
    return acc;
}

function parseFrontmatter(content) {
    if (!content.startsWith('---')) { return {}; }
    const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) { return {}; }
    const fields = {};
    for (const line of m[1].split(/\r?\n/)) {
        const kv = line.match(/^\s*([A-Za-z0-9_.-]+)\s*:/);
        if (kv) { fields[kv[1].toLowerCase()] = true; }
    }
    return fields;
}

console.log('REG-033: No dewey: field in src/ .md files (#321)');
console.log('─'.repeat(60));

const mdFiles = walkMd(SRC_DIR);
const withDewey    = [];
const deweyNoDocid = [];

for (const fp of mdFiles) {
    const content = fs.readFileSync(fp, 'utf8');
    const fields  = parseFrontmatter(content);
    if (fields['dewey']) {
        withDewey.push(path.relative(ROOT, fp));
        if (!fields['docid']) { deweyNoDocid.push(path.relative(ROOT, fp)); }
    }
}

test(`No src/ .md file has a dewey: field (scanned ${mdFiles.length} files)`, () => {
    if (withDewey.length > 0) {
        throw new Error(
            `${withDewey.length} file(s) still have dewey: — remove the field, keep only docid::\n` +
            withDewey.map(f => `  ${f}`).join('\n')
        );
    }
});

test('No src/ .md file has dewey: without docid: (needs migration)', () => {
    if (deweyNoDocid.length > 0) {
        throw new Error(
            `${deweyNoDocid.length} file(s) have dewey: but no docid: — rename dewey: → docid::\n` +
            deweyNoDocid.map(f => `  ${f}`).join('\n')
        );
    }
});

test('Scanner code reads docid first with dewey as fallback', () => {
    // Verify all scanner/parser files that read the dewey field use docid as primary
    const scannerFiles = [
        path.join(ROOT, 'src/features/doc-intelligence/scanner.ts'),
        path.join(ROOT, 'src/features/doc-catalog/scanner.ts'),
    ];
    for (const sf of scannerFiles) {
        if (!fs.existsSync(sf)) { continue; }
        const src = fs.readFileSync(sf, 'utf8');
        if (src.includes("fm['dewey']") || src.includes('fm["dewey"]')) {
            // If dewey is read, docid must also be read and must come first
            const docidIdx = src.indexOf("fm['docid']") !== -1 ? src.indexOf("fm['docid']") : src.indexOf('fm["docid"]');
            const deweyIdx = src.indexOf("fm['dewey']") !== -1 ? src.indexOf("fm['dewey']") : src.indexOf('fm["dewey"]');
            if (docidIdx === -1 || deweyIdx < docidIdx) {
                throw new Error(`${path.relative(ROOT, sf)}: dewey read before docid — docid must be primary`);
            }
        }
    }
});

console.log('─'.repeat(60));
if (failed === 0) { console.log(`✓ REG-033 passed (${passed} checks).\n`); process.exit(0); }
else { console.error(`✗ REG-033 FAILED (${failed} of ${passed + failed} checks failed).\n`); process.exit(1); }
