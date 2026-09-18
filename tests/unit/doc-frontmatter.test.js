/**
 * tests/unit/doc-frontmatter.test.js
 *
 * src/shared/doc-frontmatter.ts — the one frontmatter reader/writer (#730).
 *
 * The case that matters most is the first group: a horizontal rule in a
 * document's body must never be taken for frontmatter. Two of the parsers this
 * module replaced did exactly that, and doc-header's "fix" then deleted
 * everything below the rule (the damage #731 repaired).
 *
 * Run: node tests/unit/doc-frontmatter.test.js   (build: scripts/build-test-modules.mjs)
 */
'use strict';

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');

const OUT = path.join(__dirname, '../../out-test/shared/doc-frontmatter.js');
if (!fs.existsSync(OUT)) {
    console.error(`FAIL: ${OUT} missing — run node scripts/run-unit-tests.js, which builds it`);
    process.exit(1);
}
const fm = require(OUT);

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log(`  ✓ ${name}`); passed++; }
    catch (e) { console.error(`  ✗ ${name}\n    → ${e.message}`); failed++; }
}
const eq = assert.strictEqual;

console.log('\ndoc-frontmatter unit tests\n' + '─'.repeat(50));

// ── A horizontal rule is body, not frontmatter ──────────────────────────────
const WITH_RULE = [
    '# Guide', '', 'Intro paragraph.', '', '---', '',
    '## Architecture', '', 'Step one: build it.', 'Step two: ship it.', '', '---', '',
    '## Notes', '', 'Last words.', '',
].join('\n');

test('a doc with horizontal rules and no frontmatter reads as placement "none"', () => {
    eq(fm.readFrontmatter(WITH_RULE).placement, 'none');
});

test('toContract keeps every line of a body that contains horizontal rules', () => {
    const out = fm.toContract(WITH_RULE, 'guide.md');
    for (const line of ['Intro paragraph.', '## Architecture', 'Step one: build it.', 'Step two: ship it.', '## Notes', 'Last words.']) {
        assert.ok(out.includes(line), `lost: ${line}`);
    }
    eq(out.split('\n').filter(l => l.trim() === '---').length, 4, 'two rules + the two block delimiters');
});

// The shape of every src/ README before #707: a rule in the body, a trailer at
// the end. The old parsers read everything from the FIRST rule as metadata.
test('with a rule in the body AND a trailer, only the trailer is frontmatter', () => {
    const doc = ['# Guide', '', 'Intro.', '', '---', '', '## Architecture', '', 'Step one: build it.', '',
                 '---', 'id: guide', 'title: Guide', 'description: A guide.', '---', ''].join('\n');
    const r = fm.readFrontmatter(doc);
    eq(r.placement, 'bottom');
    eq(Object.keys(r.fields).join(','), 'id,title,description');
    for (const line of ['Intro.', '## Architecture', 'Step one: build it.']) { assert.ok(r.body.includes(line), `body lost: ${line}`); }
    const out = fm.toContract(doc, 'guide.md');
    for (const line of ['Intro.', '## Architecture', 'Step one: build it.']) { assert.ok(out.includes(line), `toContract lost: ${line}`); }
});

test('a body ending in a rule followed by "key: value" prose is not a trailer', () => {
    const doc = '# T\n\nText.\n\n---\nNote: this is prose, not a field.\nSo is this line\n---\n';
    eq(fm.readFrontmatter(doc).placement, 'none');
});

// ── Reading ─────────────────────────────────────────────────────────────────
test('top block is read, quotes removed, keys lower-cased', () => {
    const r = fm.readFrontmatter('---\nid: a\nTitle: "Hello: world"\ndescription: d\n---\n\n# Body\n');
    eq(r.placement, 'top');
    eq(r.fields.title, 'Hello: world');
    eq(r.body, '\n# Body\n');
});

test('a 13-field trailer, including a YAML list, is read as placement "bottom"', () => {
    const doc = '# T\n\nBody.\n\n---\ndocid: 150.1.x\nid: x\ntitle: T\ntags:\n  - a\n  - b\nrelativepath: src/x.md\n---\n';
    const r = fm.readFrontmatter(doc);
    eq(r.placement, 'bottom');
    eq(r.fields.docid, '150.1.x');
    eq(r.body.trim().startsWith('# T'), true);
});

// ── Judging ─────────────────────────────────────────────────────────────────
test('a compliant doc has no violations', () => {
    eq(fm.contractViolations('---\nid: a\ntitle: A\ndescription: The A doc.\n---\n\n# A\n').length, 0);
});

test('bottom placement, a missing field and extra fields are each reported', () => {
    const v = fm.contractViolations('# T\n\n---\nid: x\ntitle: T\ncategory: 150.1\n---\n');
    assert.ok(v.includes('frontmatter at the bottom'), v.join('; '));
    assert.ok(v.includes('missing description'), v.join('; '));
    assert.ok(v.some(s => s.startsWith('fields beyond the contract: category')), v.join('; '));
});

test('no frontmatter is reported', () => {
    assert.deepStrictEqual(fm.contractViolations('# Just a doc\n'), ['no frontmatter']);
});

// ── Writing ─────────────────────────────────────────────────────────────────
test('toContract moves a trailer to the top, keeps id/title/description, drops the rest', () => {
    const doc = '# Feature: X\n\nDoes X.\n\n---\ndocid: 150.1.x\nid: feature-x\ntitle: Feature: X\ndescription: Does X well.\nstatus: active\n---\n';
    const out = fm.toContract(doc, 'x.README.md');
    eq(out.startsWith('---\nid: feature-x\ntitle: "Feature: X"\ndescription: Does X well.\n---\n'), true, out.slice(0, 120));
    assert.ok(!out.includes('docid'), 'docid kept');
    assert.ok(!out.includes('status'), 'status kept');
    assert.ok(out.includes('Does X.'), 'body lost');
    eq(fm.contractViolations(out).length, 0, fm.contractViolations(out).join('; '));
});

test('toContract derives missing fields from the file name and body', () => {
    const out = fm.toContract('# My Guide\n\nHow to use the thing.\n', 'my_guide.md');
    const r = fm.readFrontmatter(out);
    eq(r.fields.id, 'my-guide');
    eq(r.fields.title, 'My Guide');
    eq(r.fields.description, 'How to use the thing.');
});

test('toContract is idempotent on a compliant doc', () => {
    const doc = '---\nid: a\ntitle: A\ndescription: The A doc.\n---\n\n# A\n\nBody.\n';
    eq(fm.toContract(doc, 'a.md'), doc);
});

test('toContract preserves CRLF line endings', () => {
    const out = fm.toContract('# T\r\n\r\nBody text.\r\n', 't.md');
    assert.ok(!/[^\r]\n/.test(out), 'found a bare LF in CRLF output');
});

console.log('─'.repeat(50));
if (failed) { console.error(`✗ ${failed} test(s) FAILED`); process.exit(1); }
console.log(`✓ All ${passed} tests passed`);
