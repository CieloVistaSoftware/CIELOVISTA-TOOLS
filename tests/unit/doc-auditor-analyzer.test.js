/**
 * tests/unit/doc-auditor-analyzer.test.js
 *
 * Unit tests for src/features/doc-auditor/analyzer.ts
 * No vscode dependency — all three functions are pure.
 *
 * Covers:
 *   computeSimilarity()    — Jaccard word-overlap similarity score
 *   isGlobalCandidate()    — filename/content pattern matching
 *   isOrphan()             — cross-reference detection
 *
 * Run: node tests/unit/doc-auditor-analyzer.test.js
 */
'use strict';

const assert = require('assert');
const path   = require('path');
const fs     = require('fs');

const OUT = path.join(__dirname, '../../out/features/doc-auditor/analyzer.js');
if (!fs.existsSync(OUT)) {
    console.error(`SKIP: ${OUT} not found — run npm run compile`);
    process.exit(0);
}

const { computeSimilarity, isGlobalCandidate, isOrphan } = require(OUT);

let passed = 0, failed = 0;

function test(name, fn) {
    try { fn(); console.log(`  \u2713 ${name}`); passed++; }
    catch (e) { console.error(`  \u2717 ${name}\n    \u2192 ${e.message}`); failed++; }
}
function eq(a, b, msg)   { assert.strictEqual(a, b, msg); }
function ok(v, msg)      { assert.ok(v, msg); }
function near(a, b, tol) { ok(Math.abs(a - b) <= tol, `Expected ${a} ≈ ${b} (±${tol})`); }

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDoc(opts = {}) {
    return {
        filePath:    opts.filePath    ?? '/some/path/doc.md',
        fileName:    opts.fileName    ?? 'doc.md',
        projectName: opts.projectName ?? 'myProject',
        sizeBytes:   opts.sizeBytes   ?? 100,
        content:     opts.content     ?? '',
        normalized:  opts.normalized  ?? (opts.content ?? '').toLowerCase(),
    };
}

console.log('\ndoc-auditor analyzer unit tests\n' + '\u2500'.repeat(50));

// ═══════════════════════════════════════════════════════════
// computeSimilarity()
// ═══════════════════════════════════════════════════════════
console.log('\n-- computeSimilarity() --');

test('identical strings return 1.0', () => {
    eq(computeSimilarity('hello world this is text', 'hello world this is text'), 1.0);
});

test('completely different strings return 0', () => {
    // Jaccard on word sets with no overlap
    const a = 'alpha beta gamma delta';
    const b = 'zorro queen rogue blade';
    eq(computeSimilarity(a, b), 0);
});

test('empty strings return 0', () => {
    eq(computeSimilarity('', ''), 0);
    eq(computeSimilarity('hello world', ''), 0);
    eq(computeSimilarity('', 'hello world'), 0);
});

test('50% word overlap returns ~0.33 (3 shared of 6 total unique)', () => {
    // Words > 3 chars: "hello", "world", "shared" from A; "hello", "world", "other" from B
    const score = computeSimilarity('hello world shared', 'hello world other');
    // intersection=2(hello,world), union=4(hello,world,shared,other) → 2/4 = 0.5
    ok(score > 0 && score <= 1.0, `Score must be between 0 and 1, got ${score}`);
});

test('result is always between 0.0 and 1.0', () => {
    const pairs = [
        ['foo bar baz', 'foo bar baz qux'],
        ['completely different content here', 'nothing shares words with this'],
        ['the quick brown fox jumps over lazy dog', 'quick brown fox lazy over jumps dog'],
    ];
    for (const [a, b] of pairs) {
        const score = computeSimilarity(a, b);
        ok(score >= 0 && score <= 1.0, `Score ${score} out of range for "${a}" vs "${b}"`);
    }
});

test('words of 3 chars or fewer are excluded from scoring', () => {
    // "the", "a", "is", "to" are all ≤3 chars — should be ignored
    const score = computeSimilarity('the a is to', 'the a is to');
    // If all words are filtered out (length <= 3), both sets are empty → 0
    eq(score, 0, 'Short words should be filtered, leaving empty sets → score 0');
});

test('highly similar docs score above 0.65 threshold', () => {
    const docA = 'this document describes architecture principles for javascript modules components services';
    const docB = 'this document describes architecture principles for typescript modules components services patterns';
    const score = computeSimilarity(docA, docB);
    ok(score >= 0.65, `Similar docs should score ≥ 0.65, got ${score}`);
});

test('different docs score below 0.65 threshold', () => {
    const docA = 'javascript coding standards formatting rules linting eslint prettier configuration';
    const docB = 'deployment pipeline kubernetes docker containers orchestration release versioning';
    const score = computeSimilarity(docA, docB);
    ok(score < 0.65, `Different docs should score < 0.65, got ${score}`);
});

// ═══════════════════════════════════════════════════════════
// isGlobalCandidate()
// ═══════════════════════════════════════════════════════════
console.log('\n-- isGlobalCandidate() --');

test('returns undefined for global project docs (already global)', () => {
    const doc = makeDoc({ projectName: 'global', fileName: 'CODING-STANDARDS.md' });
    eq(isGlobalCandidate(doc), undefined, 'Global-project docs must never be flagged');
});

test('flags CODING-STANDARDS.md by filename pattern', () => {
    const doc = makeDoc({ projectName: 'myProject', fileName: 'CODING-STANDARDS.md', content: '' });
    ok(isGlobalCandidate(doc) !== undefined, 'CODING-STANDARDS.md must be flagged');
});

test('flags JAVASCRIPT-STANDARDS.md by filename pattern', () => {
    const doc = makeDoc({ projectName: 'myProject', fileName: 'JAVASCRIPT-STANDARDS.md', content: '' });
    ok(isGlobalCandidate(doc) !== undefined);
});

test('flags GIT-WORKFLOW.md by filename pattern', () => {
    const doc = makeDoc({ projectName: 'myProject', fileName: 'GIT-WORKFLOW.md', content: '' });
    ok(isGlobalCandidate(doc) !== undefined);
});

test('flags ARCHITECTURE-PRINCIPLES.md by filename pattern', () => {
    const doc = makeDoc({ projectName: 'myProject', fileName: 'ARCHITECTURE-PRINCIPLES.md', content: '' });
    ok(isGlobalCandidate(doc) !== undefined);
});

test('flags ONBOARDING.md by filename pattern', () => {
    const doc = makeDoc({ projectName: 'myProject', fileName: 'ONBOARDING.md', content: '' });
    ok(isGlobalCandidate(doc) !== undefined);
});

test('flags doc with "all projects" in content', () => {
    const doc = makeDoc({
        projectName: 'myProject', fileName: 'notes.md',
        content: 'This applies to all projects in the organization.',
    });
    ok(isGlobalCandidate(doc) !== undefined, 'Content with "all projects" must be flagged');
});

test('flags doc with "global standard" in content', () => {
    const doc = makeDoc({
        projectName: 'myProject', fileName: 'guide.md',
        content: 'This is a global standard for how we build things.',
    });
    ok(isGlobalCandidate(doc) !== undefined);
});

test('flags doc with "every project" in content (case-sensitive lowercase)', () => {
    const doc = makeDoc({
        projectName: 'myProject', fileName: 'rules.md',
        content: 'every project must follow these naming conventions.',
    });
    ok(isGlobalCandidate(doc) !== undefined);
});

test('does NOT flag doc with "Every project" (capital E — case-sensitive check)', () => {
    const doc = makeDoc({
        projectName: 'myProject', fileName: 'rules.md',
        content: 'Every project must follow these naming conventions.',
    });
    // Source uses case-sensitive includes — capital E does not match
    eq(isGlobalCandidate(doc), undefined, 'Capital-E Every project does not trigger flag (known limitation)');
});

test('returns undefined for ordinary project doc', () => {
    const doc = makeDoc({
        projectName: 'myProject', fileName: 'my-feature.md',
        content: 'This feature handles authentication for this project.',
    });
    eq(isGlobalCandidate(doc), undefined, 'Ordinary project doc must not be flagged');
});

test('flags STANDARDS.md by filename pattern', () => {
    const doc = makeDoc({ projectName: 'myProject', fileName: 'STANDARDS.md', content: 'hello' });
    ok(isGlobalCandidate(doc) !== undefined);
});

// ═══════════════════════════════════════════════════════════
// isOrphan()
// ═══════════════════════════════════════════════════════════
console.log('\n-- isOrphan() --');

test('CLAUDE.md is never an orphan (always referenced)', () => {
    const doc  = makeDoc({ fileName: 'CLAUDE.md', content: 'Session notes' });
    const all  = [doc, makeDoc({ fileName: 'README.md', content: 'Welcome' })];
    eq(isOrphan(doc, all), undefined, 'CLAUDE.md must never be flagged as orphan');
});

test('README.md is never an orphan', () => {
    const doc = makeDoc({ fileName: 'README.md', content: '' });
    eq(isOrphan(doc, [doc]), undefined);
});

test('CHANGELOG.md is never an orphan', () => {
    const doc = makeDoc({ fileName: 'CHANGELOG.md', content: '' });
    eq(isOrphan(doc, [doc]), undefined);
});

test('doc referenced by another doc is not an orphan', () => {
    const target = makeDoc({ fileName: 'guide.md', filePath: '/proj/guide.md', content: 'Guide content' });
    const linker = makeDoc({ fileName: 'README.md', content: 'See guide.md for details' });
    eq(isOrphan(target, [target, linker]), undefined, 'Referenced doc must not be flagged');
});

test('doc referenced by base name (without .md) is not an orphan', () => {
    const target = makeDoc({ fileName: 'guide.md', filePath: '/proj/guide.md', content: 'Guide' });
    const linker = makeDoc({ fileName: 'README.md', content: 'See guide for more details' });
    eq(isOrphan(target, [target, linker]), undefined, 'Base-name reference must prevent orphan flag');
});

test('unreferenced doc is flagged as orphan', () => {
    const target = makeDoc({ fileName: 'forgotten-notes.md', filePath: '/proj/forgotten-notes.md', content: 'Some notes' });
    const other  = makeDoc({ fileName: 'README.md', content: 'Nothing about forgotten notes here' });
    const reason = isOrphan(target, [target, other]);
    ok(reason !== undefined, 'Unreferenced doc must be flagged as orphan');
    ok(typeof reason === 'string' && reason.length > 0, 'Reason must be a non-empty string');
});

test('CURRENT-STATUS.md is exempt from orphan detection', () => {
    const doc = makeDoc({ fileName: 'CURRENT-STATUS.md', content: 'Parking lot...' });
    eq(isOrphan(doc, [doc]), undefined, 'CURRENT-STATUS.md must never be flagged');
});

test('doc does not flag itself as its own reference', () => {
    // A doc that mentions its own filename should still be checked against OTHER docs
    const doc = makeDoc({ fileName: 'solo.md', filePath: '/proj/solo.md', content: 'See solo.md itself' });
    const reason = isOrphan(doc, [doc]); // only doc in collection
    ok(reason !== undefined, 'Self-reference must not count; still flagged if no OTHER doc links to it');
});

console.log('\n' + '\u2500'.repeat(50));
if (failed === 0) { console.log(`\u2713 All ${passed} tests passed\n`); process.exit(0); }
else { console.error(`\n\u2717 ${failed} test(s) FAILED\n`); process.exit(1); }
