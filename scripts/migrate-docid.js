'use strict';
/**
 * scripts/migrate-docid.js
 *
 * Issue #321 — Remove redundant dewey: field from all .md frontmatter.
 *
 * Standard: docid: is the single canonical identifier (the dewey number).
 *           dewey: is a duplicate and must be removed.
 *
 * Rules:
 *   - File has both docid: and dewey: → remove dewey: line
 *   - File has only dewey: (no docid:) → rename dewey: → docid:
 *   - File has only docid: → no change
 *   - File has neither → no change
 */

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const SKIP_DIRS = new Set([
    'node_modules', '.git', 'out', 'dist', '.vscode', '.vscode-test',
    '.claude', 'reports', 'test-results', 'playwright-report',
]);

function walk(dir, results = []) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return results; }
    for (const e of entries) {
        if (SKIP_DIRS.has(e.name)) { continue; }
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { walk(full, results); }
        else if (e.isFile() && /\.md$/i.test(e.name)) { results.push(full); }
    }
    return results;
}

function migrate(filePath) {
    const original = fs.readFileSync(filePath, 'utf8');

    // Only process files with YAML frontmatter
    if (!original.startsWith('---')) { return null; }

    const fmEnd = original.indexOf('\n---', 3);
    if (fmEnd < 0) { return null; }

    const fmBlock  = original.slice(0, fmEnd + 4); // includes closing ---
    const rest     = original.slice(fmEnd + 4);

    const hasDocid = /^docid\s*:/im.test(fmBlock);
    const hasDewey = /^dewey\s*:/im.test(fmBlock);

    if (!hasDewey) { return null; } // nothing to do

    let newFm;
    if (hasDocid) {
        // Remove the dewey: line entirely
        newFm = fmBlock.replace(/^dewey\s*:.*\r?\n/im, '');
    } else {
        // Rename dewey: → docid:
        newFm = fmBlock.replace(/^(dewey\s*:)/im, 'docid:');
    }

    if (newFm === fmBlock) { return null; } // no change
    return newFm + rest;
}

const files = walk(ROOT);
let changed = 0;
let renamed = 0;

for (const f of files) {
    const result = migrate(f);
    if (!result) { continue; }
    const original = fs.readFileSync(f, 'utf8');
    const hadBoth = /^docid\s*:/im.test(original) && /^dewey\s*:/im.test(original);
    fs.writeFileSync(f, result, 'utf8');
    if (hadBoth) { changed++; } else { renamed++; }
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    console.log((hadBoth ? 'REMOVED dewey: ' : 'RENAMED dewey→docid: ') + rel);
}

console.log('');
console.log('Migration complete: ' + changed + ' dewey: removed, ' + renamed + ' dewey: renamed to docid:');
