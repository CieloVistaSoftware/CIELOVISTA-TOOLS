// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
'use strict';

/**
 * tests/unit/doc-contract.test.ts
 *
 * Validates every .md doc in cielovista-tools conforms to the CDC doc contract:
 *   - docid    present
 *   - dewey    present, hundreds match project prefix (150)
 *   - category present, equals "{dewey} — {label}"
 *
 * Run: node tests/unit/doc-contract.test.ts
 */

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const REGISTRY = JSON.parse(fs.readFileSync(
    path.join('C:\\Users\\jwpmi\\Downloads\\CieloVistaStandards\\project-registry.json'), 'utf8'));
const HUNDREDS_BY_PATH: Map<string, number> = new Map(
    REGISTRY.projects.map((p: any) => [p.path.toLowerCase(), p.dewey]));

function getHundredsForFile(filePath: string): number | null {
    for (const [projPath, dewey] of HUNDREDS_BY_PATH) {
        if (filePath.toLowerCase().startsWith(projPath)) { return dewey as number; }
    }
    return null;
}

const TAXONOMY: Record<string, string> = {
    '1': 'Components / Features',
    '2': 'Architecture',
    '3': 'Testing',
    '4': 'Policy & Standards',
    '5': 'AI Coordination',
    '6': 'Release & Deployment',
    '7': 'Getting Started',
    '8': 'API / Reference',
    '9': 'Meta',
};

const EXCLUDE = ['node_modules', '.git', 'worktrees', '\\bin\\', '.vscode-test'];

function collectMdFiles(dir: string): string[] {
    const results: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (EXCLUDE.some(e => full.includes(e))) { continue; }
            results.push(...collectMdFiles(full));
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
            results.push(full);
        }
    }
    return results;
}

function parseFrontmatter(content: string): Record<string, string> | null {
    if (!content.trimStart().startsWith('---')) { return null; }
    const end = content.indexOf('\n---', 3);
    if (end === -1) { return null; }
    const block = content.slice(content.indexOf('\n') + 1, end);
    const fm: Record<string, string> = {};
    for (const line of block.split('\n')) {
        const m = line.match(/^(\w+):\s*(.+)/);
        if (m) { fm[m[1].trim()] = m[2].trim(); }
    }
    return fm;
}

let passed = 0, failed = 0;
const results: { ok: boolean; name: string; err?: string }[] = [];

function test(name: string, fn: () => void) {
    try   { fn(); passed++; results.push({ ok: true, name }); }
    catch (e: any) { failed++; results.push({ ok: false, name, err: e.message }); }
}

// Collect docs from all registry projects
const allFiles: string[] = [];
for (const project of REGISTRY.projects) {
    if (!fs.existsSync(project.path)) { continue; }
    allFiles.push(...collectMdFiles(project.path));
}

const docsWithFrontmatter = allFiles
    .map(f => ({ file: f, fm: parseFrontmatter(fs.readFileSync(f, 'utf8')) }))
    .filter(d => d.fm !== null);

test('At least 200 docs with frontmatter found across all projects', () => {
    assert.ok(docsWithFrontmatter.length >= 200,
        `Only ${docsWithFrontmatter.length} docs found`);
});

for (const { file, fm } of docsWithFrontmatter) {
    const hundreds = getHundredsForFile(file);
    const rel = file;

    test(`${path.basename(file)} (${hundreds}) — has docid`, () => {
        assert.ok(fm!['docid'], `missing docid in ${rel}`);
    });

    test(`${path.basename(file)} (${hundreds}) — has dewey`, () => {
        assert.ok(fm!['dewey'], `missing dewey in ${rel}`);
    });

    test(`${path.basename(file)} (${hundreds}) — dewey hundreds match project`, () => {
        const dewey = fm!['dewey'];
        if (!dewey || !hundreds) { return; }
        const docHundreds = parseInt(dewey.split('.')[0], 10);
        assert.strictEqual(docHundreds, hundreds,
            `dewey "${dewey}" hundreds ${docHundreds} !== ${hundreds}`);
    });

    test(`${path.basename(file)} (${hundreds}) — has category`, () => {
        assert.ok(fm!['category'], `missing category in ${rel}`);
    });

    test(`${path.basename(file)} (${hundreds}) — docid matches dewey`, () => {
        const docid = fm!['docid'];
        const dewey = fm!['dewey'];
        if (!docid || !dewey) { return; }
        assert.strictEqual(docid, dewey,
            `docid "${docid}" !== dewey "${dewey}" in ${rel}`);
    });

    test(`${path.basename(file)} (${hundreds}) — category matches dewey`, () => {
        const dewey    = fm!['dewey'];
        const category = fm!['category'];
        if (!dewey || !category) { return; }
        const sub   = dewey.split('.')[1];
        const label = TAXONOMY[sub];
        if (!label) { return; }
        const expected = `${dewey} — ${label}`;
        assert.strictEqual(category, expected,
            `category "${category}" !== "${expected}" in ${rel}`);
    });
}

console.log('\n' + '='.repeat(70));
console.log('Doc Contract — Unit Tests');
console.log('='.repeat(70));
for (const r of results) {
    if (!r.ok) {
        console.log(`  \x1b[31mFAIL\x1b[0m  ${r.name}`);
        console.log(`         \x1b[31m-> ${r.err}\x1b[0m`);
    }
}
const okCount  = results.filter(r => r.ok).length;
const failCount = results.filter(r => !r.ok).length;
console.log('='.repeat(70));
const failStr = failCount > 0 ? `\x1b[31m${failCount} failed\x1b[0m` : '0 failed';
console.log(`${results.length} tests: \x1b[32m${okCount} passed\x1b[0m, ${failStr}\n`);
if (failCount > 0) { process.exit(1); }
