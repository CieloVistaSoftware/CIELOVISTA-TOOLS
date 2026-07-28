/**
 * tests/unit/doc-auditor-analyzer.test.js
 *
 * Unit tests for src/features/doc-auditor/analyzer.ts
 * No vscode dependency — all three functions are pure.
 *
 * Covers:
 *   computeSimilarity()      — Jaccard word-overlap similarity score
 *   isGlobalCandidate()      — filename/content pattern matching
 *   isOrphan()               — cross-reference detection
 *   isContainerBoilerplate() — container-project boilerplate exemption (#667)
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

const { computeSimilarity, isGlobalCandidate, isOrphan, isContainerBoilerplate } = require(OUT);

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

// #667 regression: a suspicious filename ALONE (e.g. wb-starter's TIER1-LAWS.md, which is
// genuinely project-specific despite its generic-sounding name) must not be flagged without
// corroborating self-referential content.
test('does NOT flag TIER1-LAWS.md by filename alone when content is project-specific', () => {
    const doc = makeDoc({
        projectName: 'myProject', fileName: 'TIER1-LAWS.md',
        content: 'These are the non-negotiable rules for the WB-Starter project.',
    });
    eq(isGlobalCandidate(doc), undefined, 'Filename pattern alone must not trigger without content corroboration');
});

test('flags CODING-STANDARDS.md when content also confirms project-wide applicability', () => {
    const doc = makeDoc({
        projectName: 'myProject', fileName: 'CODING-STANDARDS.md',
        content: 'This standard applies to all projects across the organization.',
    });
    ok(isGlobalCandidate(doc) !== undefined, 'CODING-STANDARDS.md with corroborating content must be flagged');
});

test('flags JAVASCRIPT-STANDARDS.md when content also confirms project-wide applicability', () => {
    const doc = makeDoc({
        projectName: 'myProject', fileName: 'JAVASCRIPT-STANDARDS.md',
        content: 'This document applies to all projects.',
    });
    ok(isGlobalCandidate(doc) !== undefined);
});

test('does NOT flag GIT-WORKFLOW.md when content is empty/unrelated', () => {
    const doc = makeDoc({ projectName: 'myProject', fileName: 'GIT-WORKFLOW.md', content: '' });
    eq(isGlobalCandidate(doc), undefined, 'Filename alone is too weak a signal (#667)');
});

test('does NOT flag ARCHITECTURE-PRINCIPLES.md when content is empty/unrelated', () => {
    const doc = makeDoc({ projectName: 'myProject', fileName: 'ARCHITECTURE-PRINCIPLES.md', content: '' });
    eq(isGlobalCandidate(doc), undefined);
});

test('does NOT flag ONBOARDING.md when content is empty/unrelated', () => {
    const doc = makeDoc({ projectName: 'myProject', fileName: 'ONBOARDING.md', content: '' });
    eq(isGlobalCandidate(doc), undefined);
});

// #667 regression: docs/ViewADoc.md was flagged because "global standards folder" contains
// "global standard" as a raw substring, and mentioning a feature that works "across all
// registered projects" is not the same as the file declaring itself a global standard.
test('does NOT flag a doc merely mentioning "global standards folder" in passing', () => {
    const doc = makeDoc({
        projectName: 'myProject', fileName: 'ViewADoc.md',
        content: 'A searchable catalog of docs across all registered projects and the global standards folder.',
    });
    eq(isGlobalCandidate(doc), undefined, 'Passing mention must not trigger — no self-referential claim');
});

test('flags doc with a self-referential "applies to all projects" sentence', () => {
    const doc = makeDoc({
        projectName: 'myProject', fileName: 'notes.md',
        content: 'This document applies to all projects in the organization.',
    });
    ok(isGlobalCandidate(doc) !== undefined, 'Self-referential "applies to all projects" must be flagged');
});

test('flags doc that declares itself the global standard for all projects', () => {
    const doc = makeDoc({
        projectName: 'myProject', fileName: 'guide.md',
        content: 'This is the global standard for all projects — follow it exactly.',
    });
    ok(isGlobalCandidate(doc) !== undefined);
});

test('flags doc with "these rules apply to every project"', () => {
    const doc = makeDoc({
        projectName: 'myProject', fileName: 'rules.md',
        content: 'These rules apply to every project in the organization.',
    });
    ok(isGlobalCandidate(doc) !== undefined);
});

test('does NOT flag a doc that mentions "every project" without self-referential framing', () => {
    const doc = makeDoc({
        projectName: 'myProject', fileName: 'rules.md',
        content: 'Every project must follow these naming conventions.',
    });
    eq(isGlobalCandidate(doc), undefined, 'Bare mention without a self-referential claim must not trigger');
});

test('returns undefined for ordinary project doc', () => {
    const doc = makeDoc({
        projectName: 'myProject', fileName: 'my-feature.md',
        content: 'This feature handles authentication for this project.',
    });
    eq(isGlobalCandidate(doc), undefined, 'Ordinary project doc must not be flagged');
});

test('does NOT flag STANDARDS.md when content is unrelated', () => {
    const doc = makeDoc({ projectName: 'myProject', fileName: 'STANDARDS.md', content: 'hello' });
    eq(isGlobalCandidate(doc), undefined);
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

// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
// isContainerBoilerplate()  (#667)
// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
console.log('\n-- isContainerBoilerplate() --');

test('flags CLAUDE.md from a container project as boilerplate', () => {
    const doc = makeDoc({ fileName: 'CLAUDE.md', projectName: 'samples' });
    doc.projectStatus = 'container';
    ok(isContainerBoilerplate(doc), 'container-project CLAUDE.md must be treated as boilerplate');
});

test('flags README.md from a container project as boilerplate (case-insensitive)', () => {
    const doc = makeDoc({ fileName: 'Readme.md', projectName: 'tooling' });
    doc.projectStatus = 'container';
    ok(isContainerBoilerplate(doc));
});

test('does NOT flag CLAUDE.md from a non-container project', () => {
    const doc = makeDoc({ fileName: 'CLAUDE.md', projectName: 'realProduct' });
    doc.projectStatus = 'product';
    eq(isContainerBoilerplate(doc), false);
});

test('does NOT flag a non-boilerplate file even from a container project', () => {
    const doc = makeDoc({ fileName: 'notes.md', projectName: 'samples' });
    doc.projectStatus = 'container';
    eq(isContainerBoilerplate(doc), false, 'Only CLAUDE.md/README.md are exempt, not arbitrary docs');
});

test('does NOT flag when projectStatus is undefined', () => {
    const doc = makeDoc({ fileName: 'CLAUDE.md', projectName: 'unknown' });
    eq(isContainerBoilerplate(doc), false);
});

console.log('\n' + '\u2500'.repeat(50));
if (failed === 0) { console.log(`\u2713 All ${passed} tests passed\n`); process.exit(0); }
else { console.error(`\n\u2717 ${failed} test(s) FAILED\n`); process.exit(1); }
