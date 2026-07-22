/**
 * tests/regression/REG-111-md-frontmatter-at-bottom.test.js
 *
 * Regression test for issue #527:
 *   "fix: move frontmatter to bottom of all .md doc files"
 *
 * Every .md file that contains a YAML frontmatter block (--- delimited)
 * must have that block at the BOTTOM of the file, not the top.
 * Frontmatter at the top renders as visible text in the Doc Catalog preview.
 *
 * Each run samples up to 100 .md files at random (seeded by date so the
 * set rotates daily). If the total count is ≤ 100, all files are checked.
 *
 * Run: node tests/regression/REG-111-md-frontmatter-at-bottom.test.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT    = path.resolve(__dirname, '../..');
// docs/_today/REG-066-frontmatter-scope-control.md: REG-066 creates this
// fixture with frontmatter DELIBERATELY at the top (to prove its own
// scanner still includes real in-scope paths), then deletes it in its own
// finally block. Unlike the OTHER fixtures a concurrently-running test
// (see run-regression-tests.js -- every regression test is its own
// subprocess sharing this checkout) might create, this one has genuine
// well-formed frontmatter -- so if this scan catches it mid-existence,
// it isn't a vanishing-file race the try/catches below can paper over,
// it's a file that's legitimately violating the convention on purpose.
// Excluded by exact name, not a real doc.
const EXCLUDE = new Set(['node_modules', '.vscode-test', '.claude', 'out', 'dist', 'mcp-server', 'REG-066-frontmatter-scope-control.md']);
const SAMPLE  = 100;

// ── Collect all .md files ────────────────────────────────────────────────────
// All regression tests run as concurrent subprocesses (see
// run-regression-tests.js) sharing this same repo checkout -- another test
// (e.g. REG-066) can create and delete its own temp fixture directories at
// the repo root while this walk is in flight. A directory that existed when
// listed by the parent's readdirSync but is gone by the time we recurse into
// it isn't a real problem, just a benign race -- skip it, same defensive
// pattern REG-027's own walkMd() already uses.
function walk(dir, results = []) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return results; }
    for (const entry of entries) {
        if (EXCLUDE.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full, results); }
        else if (entry.name.endsWith('.md')) { results.push(full); }
    }
    return results;
}

const all = walk(ROOT);

// ── Deterministic daily shuffle (rotate sample each day) ─────────────────────
const seed = Math.floor(Date.now() / 86400000); // changes daily
function seededRand(i) { return ((seed * 1664525 + i * 1013904223) >>> 0) / 0xffffffff; }
const shuffled = [...all].sort((a, b) => seededRand(all.indexOf(a)) - seededRand(all.indexOf(b)));
const sample   = shuffled.slice(0, SAMPLE);

// ── Check each sampled file ───────────────────────────────────────────────────
let passed = 0, failed = 0, noFm = 0;

console.log(`\nREG-111: Frontmatter at bottom — checking ${sample.length} / ${all.length} .md files\n` + '─'.repeat(60));

// YAML frontmatter marker — must be present between the --- delimiters
const YAML_KEYS = /^(docid|id|title|description|status|tags|category|created|updated|version|author|project|relativepath)\s*:/im;

for (const f of sample) {
    // Another concurrently-running test (e.g. REG-066) can create and
    // delete its own temp fixture files anywhere under the repo root while
    // this scan is in flight (see run-regression-tests.js -- every
    // regression test runs as its own subprocess sharing one checkout). A
    // file that existed when this scan's own walk() listed it, but is gone
    // by the time we get here to read it, isn't a real problem -- skip it,
    // rather than exclude every fixture path some other test might ever use
    // by name (which is what this file did before, and still missed one).
    let src;
    try { src = fs.readFileSync(f, 'utf8'); }
    catch { continue; }
    const lines = src.split('\n');

    // Find first --- that opens a YAML frontmatter block
    // We scan all --- pairs and look for one whose content matches YAML keys
    let fmFirst = -1, fmSecond = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() !== '---') { continue; }
        // Look for matching closing ---
        for (let j = i + 1; j < lines.length; j++) {
            if (lines[j].trim() !== '---') { continue; }
            const between = lines.slice(i + 1, j).join('\n');
            if (YAML_KEYS.test(between)) {
                fmFirst  = i;
                fmSecond = j;
            }
            break; // only check the nearest closing ---
        }
        if (fmFirst !== -1) { break; }
    }

    if (fmFirst === -1) { noFm++; continue; }

    // Non-compliant: YAML frontmatter opens in the first 10 lines AND content follows it
    const afterClose = lines.slice(fmSecond + 1).some(l => l.trim() !== '');
    const rel        = path.relative(ROOT, f);

    if (fmFirst <= 9 && afterClose) {
        console.error(`  ✗ ${rel}  (frontmatter at line ${fmFirst + 1}, content follows)`);
        failed++;
    } else {
        passed++;
    }
}

console.log('');
console.log(`  Files with frontmatter: ${passed + failed}  |  No frontmatter: ${noFm}  |  Sampled: ${sample.length}`);
console.log('');
if (failed > 0) {
    console.error(`FAILED ${failed} / ${passed + failed} — move frontmatter to end of file`);
    process.exit(1);
}
console.log(`PASSED ${passed} / ${passed} — all sampled files have frontmatter at bottom`);
process.exit(0);
