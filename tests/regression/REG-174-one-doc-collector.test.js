// Copyright (c) CieloVista Software. All rights reserved.
// REG-174: Issue #802 — one doc collector; the doc features see one doc set
//
// Run: node tests/regression/REG-174-one-doc-collector.test.js
//
// Doc Auditor and Doc Intelligence each had their own collectDocs(), with
// different skip lists: the auditor read markdown under reports/,
// test-results/, .vscode-test/ and bin/ that Doc Intelligence skipped, so the
// two panels disagreed about which docs exist. Nine more features walked the
// tree for .md files with nine more skip lists (Doc Consolidator did not even
// skip .claude/, so every worktree's copy of every doc was a "duplicate").
// All of them now go through src/shared/doc-collector.ts.
//
// Guard: Doc Auditor and Doc Intelligence, built from source, return the
// same set of files for a fixture tree holding a doc in every skipped
// directory, and for this repo itself.
//
// The "no second walker" guard this test had over src/ moved to REG-176
// (#812), which holds src/, mcp-server/src/ and scripts/ to the one walk,
// now in mcp-server/src/shared/doc-walk.ts. Its detector is
// tests/utils/markdown-walkers.js.

'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const esbuild = require(path.join(ROOT, 'node_modules', 'esbuild'));

let passed = 0, failed = 0;
function check(name, ok, detail) {
    if (ok) { console.log(`  PASS ${name}`); passed++; }
    else    { console.error(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`); failed++; }
}

console.log('REG-174: one doc collector (#802)');
console.log('-'.repeat(64));

// ── Doc Auditor and Doc Intelligence see the same docs ───────────────────

const THE_COLLECTOR = 'src/shared/doc-collector.ts';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'reg174-'));
try {
    function bundle(entry, name) {
        const outfile = path.join(TMP, 'build', `${name}.js`);
        esbuild.buildSync({ entryPoints: [path.join(ROOT, entry)], outfile, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
        return require(outfile);
    }
    const auditor      = bundle('src/features/doc-auditor/scanner.ts', 'auditor');
    const intelligence = bundle('src/features/doc-intelligence/scanner.ts', 'intelligence');
    const shared       = bundle(THE_COLLECTOR, 'collector');

    check('doc-auditor/scanner.ts exports auditDocs', typeof auditor.auditDocs === 'function', Object.keys(auditor).join(', '));
    check('doc-intelligence/scanner.ts exports intelligenceDocs', typeof intelligence.intelligenceDocs === 'function', Object.keys(intelligence).join(', '));

    // Fixture: a doc at the root, nested docs, and one doc inside every skipped directory.
    const fx = path.join(TMP, 'fixture');
    const write = (rel, body) => { const p = path.join(fx, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };
    write('README.md', '---\nid: readme\ntitle: Readme\ndescription: Root.\n---\n# Root\n');
    write('docs/guide.md', '# Guide\n');
    write('docs/a/b/deep.md', '# Deep\n');
    write('docs/a/b/c/too-deep.md', '# Beyond the default depth\n');
    write('docs/a/test-failed-1-error-context.md', '# Playwright dump\n');
    const skipped = shared.DOC_SKIP_DIRS ? [...shared.DOC_SKIP_DIRS] : [];
    for (const dir of skipped) { write(`${dir}/skip-me.md`, '# Should be skipped\n'); write(`docs/${dir}/skip-me.md`, '# Should be skipped\n'); }

    const rel = (docs) => docs.map((d) => path.relative(fx, d.filePath).split(path.sep).join('/')).sort();
    const a = typeof auditor.auditDocs === 'function' ? rel(auditor.auditDocs(fx, 'fx')) : [];
    const i = typeof intelligence.intelligenceDocs === 'function' ? rel(intelligence.intelligenceDocs(fx, 'fx')) : [];
    const expected = ['README.md', 'docs/a/b/deep.md', 'docs/guide.md'];

    check('fixture: the Doc Auditor sees exactly the docs', JSON.stringify(a) === JSON.stringify(expected), `got ${JSON.stringify(a)}`);
    check('fixture: Doc Intelligence sees exactly the docs', JSON.stringify(i) === JSON.stringify(expected), `got ${JSON.stringify(i)}`);
    check('the skip list covers both old lists (union, #802)',
        ['node_modules', '.git', 'out', 'dist', '.vscode', '.claude', '.vscode-test', 'reports', 'CommandHelp', 'image-reader-assets', 'test-results', 'playwright-report']
            .every((d) => skipped.includes(d)),
        `DOC_SKIP_DIRS = ${JSON.stringify(skipped)}`);

    const ra = typeof auditor.auditDocs === 'function' ? rel(auditor.auditDocs(ROOT, 'cvt')) : [];
    const ri = typeof intelligence.intelligenceDocs === 'function' ? rel(intelligence.intelligenceDocs(ROOT, 'cvt')) : [];
    const onlyA = ra.filter((f) => !ri.includes(f));
    const onlyI = ri.filter((f) => !ra.includes(f));
    check(`this repo: both features see the same ${ra.length} docs`, ra.length > 0 && onlyA.length === 0 && onlyI.length === 0,
        `only the auditor: ${JSON.stringify(onlyA.slice(0, 10))}; only intelligence: ${JSON.stringify(onlyI.slice(0, 10))}`);
} finally {
    fs.rmSync(TMP, { recursive: true, force: true });
}

console.log('-'.repeat(64));
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
