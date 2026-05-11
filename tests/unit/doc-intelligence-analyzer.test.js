/**
 * tests/unit/doc-intelligence-analyzer.test.js
 *
 * Unit tests for src/features/doc-intelligence/analyzer.ts
 *
 * Covers:
 *   - Same filename + different content across projects → NOT a duplicate
 *   - Same content (hash) across projects → exact-duplicate
 *   - Nested README within the SAME project (different hash) → NOT a duplicate
 *
 * Run: node tests/unit/doc-intelligence-analyzer.test.js
 */
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const path   = require('path');
const fs     = require('fs');

const OUT = path.join(__dirname, '../../out/features/doc-intelligence/analyzer.js');
if (!fs.existsSync(OUT)) {
    console.error(`SKIP: ${OUT} not found — run npm run compile`);
    process.exit(0);
}

const { analyze } = require(OUT);

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log(`  ✓ ${name}`); passed++; }
    catch (e) { console.error(`  ✗ ${name}\n    → ${e.message}`); failed++; }
}
function eq(a, b, msg)  { assert.strictEqual(a, b, msg); }
function ok(v, msg)     { assert.ok(v, msg); }

console.log('\ndoc-intelligence analyzer unit tests\n' + '─'.repeat(50));

// ── Helpers ───────────────────────────────────────────────────────────────────

function hash(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
}

function makeDoc(filePath, projectName, content) {
    return {
        filePath,
        fileName:    path.basename(filePath),
        projectName,
        sizeBytes:   Buffer.byteLength(content),
        content,
        normalized:  content.toLowerCase(),
        hash:        hash(content),
        mtime:       Date.now(),
    };
}

const projects = [
    { name: 'project-a', path: 'C:/projects/project-a', type: 'vscode-extension', description: '' },
    { name: 'project-b', path: 'C:/projects/project-b', type: 'vscode-extension', description: '' },
    { name: 'project-c', path: 'C:/projects/project-c', type: 'vscode-extension', description: '' },
];

// ── Test 1: Same filename, different content across projects → NOT duplicate ──
test('#312 README.md in different projects with different content is not a duplicate', () => {
    const docs = [
        makeDoc('C:/projects/project-a/README.md', 'project-a', '# Project A\n\nThis is project A with unique content about widgets.'),
        makeDoc('C:/projects/project-b/README.md', 'project-b', '# Project B\n\nThis is project B with unique content about gadgets.'),
        makeDoc('C:/projects/project-c/README.md', 'project-c', '# Project C\n\nThis is project C with unique content about doohickeys.'),
    ];

    const findings = analyze({ allDocs: docs, projects });
    const duplicates = findings.filter(f => f.kind === 'duplicate' || f.kind === 'exact-duplicate');
    eq(duplicates.length, 0,
        `Expected 0 duplicate findings, got ${duplicates.length}: ${duplicates.map(f => f.title).join(', ')}`);
});

// ── Test 2: Same content (hash) across projects → IS exact-duplicate ──────────
test('README.md with identical content across projects IS an exact-duplicate', () => {
    const content = '# Shared README\n\nThis exact text appears in two projects verbatim.';
    const docs = [
        makeDoc('C:/projects/project-a/README.md', 'project-a', content),
        makeDoc('C:/projects/project-b/README.md', 'project-b', content),
    ];

    const findings = analyze({ allDocs: docs, projects });
    const exactDups = findings.filter(f => f.kind === 'exact-duplicate');
    eq(exactDups.length, 1, `Expected 1 exact-duplicate finding, got ${exactDups.length}`);
    eq(exactDups[0].paths.length, 2, 'Should list both file paths');
});

// ── Test 3: Nested README in same project, different content → NOT duplicate ──
test('Nested README.md inside a project subfolder with different content is not a duplicate', () => {
    const docs = [
        makeDoc('C:/projects/project-a/README.md',         'project-a', '# Project A root README with lots of content about the overall project.'),
        makeDoc('C:/projects/project-a/samples/README.md', 'project-a', '# Samples\n\nThese samples demonstrate usage patterns for various scenarios.'),
    ];

    const findings = analyze({ allDocs: docs, projects });
    const duplicates = findings.filter(f => f.kind === 'duplicate' || f.kind === 'exact-duplicate');
    eq(duplicates.length, 0,
        `Expected 0 duplicate findings, got ${duplicates.length}: ${duplicates.map(f => f.title).join(', ')}`);
});

// ── Test 4: CLAUDE.md in different projects, different content → NOT duplicate ─
test('CLAUDE.md in different projects with different content is not a duplicate', () => {
    const docs = [
        makeDoc('C:/projects/project-a/CLAUDE.md', 'project-a', '# CLAUDE.md — project-a\n\nBuild: npm run build\nSession start: read docs/_today/CURRENT-STATUS.md'),
        makeDoc('C:/projects/project-b/CLAUDE.md', 'project-b', '# CLAUDE.md — project-b\n\nBuild: dotnet build\nSession start: read CURRENT-STATUS.md'),
    ];

    const findings = analyze({ allDocs: docs, projects });
    const duplicates = findings.filter(f => f.kind === 'duplicate' || f.kind === 'exact-duplicate');
    eq(duplicates.length, 0,
        `Expected 0 duplicate findings, got ${duplicates.length}: ${duplicates.map(f => f.title).join(', ')}`);
});

// ── Test 5: Non-standard filename, same content → exact-duplicate fires ────────
test('Non-standard filename with identical content across projects IS a duplicate', () => {
    const content = '# Architecture decisions\n\nAll microservices use the same auth pattern.\n'.repeat(10);
    const docs = [
        makeDoc('C:/projects/project-a/docs/arch.md', 'project-a', content),
        makeDoc('C:/projects/project-b/docs/arch.md', 'project-b', content),
    ];

    const findings = analyze({ allDocs: docs, projects });
    const exactDups = findings.filter(f => f.kind === 'exact-duplicate');
    eq(exactDups.length, 1, `Expected 1 exact-duplicate, got ${exactDups.length}`);
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { process.exit(1); }
