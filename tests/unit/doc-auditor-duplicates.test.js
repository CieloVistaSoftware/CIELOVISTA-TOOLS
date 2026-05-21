// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * doc-auditor-duplicates.test.js
 * Issue #327: CLAUDE.md across different projects must NOT be flagged as a duplicate.
 * Run: node tests/unit/doc-auditor-duplicates.test.js
 */
'use strict';

const assert = require('assert');
const path   = require('path');
const fs     = require('fs');

const OUT = path.join(__dirname, '../../out/features/doc-auditor/analyzer.js');
if (!fs.existsSync(OUT)) { console.error(`SKIP: ${OUT} not found — run npm run compile`); process.exit(0); }

const { filterDuplicates, PER_PROJECT_EXEMPT } = require(OUT);

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log(`  ✓ ${name}`); passed++; }
    catch (e) { console.error(`  ✗ ${name}\n    → ${e.message}`); failed++; }
}
function eq(a, b, msg) { assert.strictEqual(a, b, msg); }
function ok(v, msg)    { assert.ok(v, msg); }

function makeDoc(fileName, projectName) {
    return { fileName, projectName, filePath: `C:\\projects\\${projectName}\\${fileName}`, sizeBytes: 500, content: '', normalized: '' };
}
function makeMap(docs) {
    const m = new Map();
    for (const d of docs) {
        const k = d.fileName.toLowerCase();
        if (!m.has(k)) { m.set(k, []); }
        m.get(k).push(d);
    }
    return m;
}

console.log('\ndoc-auditor duplicates unit tests (#327)\n' + '─'.repeat(50));

test('CLAUDE.md in two different projects is NOT flagged', () => {
    const docs = [makeDoc('CLAUDE.md', 'alpha'), makeDoc('CLAUDE.md', 'beta')];
    const result = filterDuplicates(makeMap(docs));
    eq(result.length, 0, 'Cross-project CLAUDE.md must not be a duplicate');
});

test('README.md in three different projects is NOT flagged', () => {
    const docs = [makeDoc('README.md', 'alpha'), makeDoc('README.md', 'beta'), makeDoc('README.md', 'gamma')];
    const result = filterDuplicates(makeMap(docs));
    eq(result.length, 0, 'Cross-project README.md must not be a duplicate');
});

test('CHANGELOG.md in two different projects is NOT flagged', () => {
    const docs = [makeDoc('CHANGELOG.md', 'alpha'), makeDoc('CHANGELOG.md', 'beta')];
    const result = filterDuplicates(makeMap(docs));
    eq(result.length, 0);
});

test('CLAUDE.md twice in the SAME project IS flagged', () => {
    const docs = [makeDoc('CLAUDE.md', 'alpha'), makeDoc('CLAUDE.md', 'alpha')];
    const result = filterDuplicates(makeMap(docs));
    eq(result.length, 1, 'Same-project CLAUDE.md duplicate must be flagged');
    eq(result[0].fileName, 'CLAUDE.md');
});

test('copilot-rules.md in two different projects IS flagged (not exempt)', () => {
    const docs = [makeDoc('copilot-rules.md', 'global'), makeDoc('copilot-rules.md', 'cielovista-tools')];
    const result = filterDuplicates(makeMap(docs));
    eq(result.length, 1, 'copilot-rules.md is not exempt and must be flagged');
});

test('single copy of any file is never flagged', () => {
    const result = filterDuplicates(makeMap([makeDoc('guide.md', 'alpha')]));
    eq(result.length, 0);
});

test('PER_PROJECT_EXEMPT includes claude.md, readme.md, changelog.md', () => {
    ok(PER_PROJECT_EXEMPT.has('claude.md'), 'claude.md must be exempt');
    ok(PER_PROJECT_EXEMPT.has('readme.md'), 'readme.md must be exempt');
    ok(PER_PROJECT_EXEMPT.has('changelog.md'), 'changelog.md must be exempt');
});

console.log('\n' + '─'.repeat(50));
if (failed === 0) { console.log(`✓ All ${passed} tests passed\n`); process.exit(0); }
else { console.error(`\n✗ ${failed} test(s) FAILED\n`); process.exit(1); }
