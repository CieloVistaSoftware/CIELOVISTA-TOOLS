// Copyright (c) CieloVista Software. All rights reserved.
// REG-151: Issue #730 — every tool that writes or judges a doc header uses the
// three-field contract, and none of them can delete prose
//
// Run: node tests/regression/REG-151-header-tools-write-the-contract.test.js
//
// #707 stage 1 moved src/ to the contract docs/ already followed: id, title,
// description, at the TOP. Four shipped tools still wrote or enforced the
// retired 13-field block at the bottom, each with its own parser:
//   - cvs.headers.fixAll / fixFile  wrote the 13 fields
//   - cvs.headers.moveToBottom / scanAuto  moved every header to the bottom
//   - cvs.headers.frontmatterViewer  flagged a TOP block and a missing docid,
//                                    and generated fix tests demanding a trailer
//   - cvs.tags.enrichAuto  wrote a tags: field
// Two of the parsers also read a horizontal rule in the body as the start of a
// trailer; on main, doc-header's "fix" deleted 5 of 6 prose lines of a doc
// shaped like every pre-#707 README.
//
// Guards:
//   1. One parser: every header tool imports src/shared/doc-frontmatter.ts and
//      no src/ file outside it defines its own frontmatter parser.
//   2. Retired commands and the tags feature are gone from package.json.
//   3. The viewer (from out-test/) finds nothing wrong with a compliant doc,
//      reports a bottom trailer, and the fix test it generates passes on a
//      compliant doc and fails on a trailer doc.

'use strict';

const cp     = require('child_process');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..', '..');
let passed = 0, failed = 0;
function check(name, ok, detail) {
    if (ok) { console.log(`  PASS ${name}`); passed++; }
    else    { console.error(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`); failed++; }
}
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

console.log('REG-151: header tools write the three-field contract (#730)');
console.log('-'.repeat(64));

// 1 ── one parser
const TOOLS = ['src/features/doc-header/feature.ts', 'src/features/doc-header-scan.ts', 'src/features/frontmatter-viewer.ts'];
for (const rel of TOOLS) {
    check(`${rel} reads headers through shared/doc-frontmatter`, /from '(\.\.\/)+shared\/doc-frontmatter'/.test(read(rel)));
}
const PRIVATE_PARSER = /function\s+(parseFrontmatter|serializeFrontmatter|moveFrontmatterToBottom|moveAllFrontmatterToBottom|buildRequiredFrontmatter)\s*\(/;
const privateParsers = [];
(function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { walk(full); continue; }
        if (!e.name.endsWith('.ts')) { continue; }
        const rel = path.relative(ROOT, full).split(path.sep).join('/');
        if (rel === 'src/shared/doc-frontmatter.ts') { continue; }
        if (PRIVATE_PARSER.test(fs.readFileSync(full, 'utf8')) && TOOLS.includes(rel)) { privateParsers.push(rel); }
    }
})(path.join(ROOT, 'src'));
check('no header tool keeps a private parser or bottom-mover', privateParsers.length === 0, privateParsers.join(', '));

// 2 ── retired surface
const pkg = JSON.parse(read('package.json'));
const cmds = (pkg.contributes.commands || []).map(c => c.command);
check('cvs.headers.moveToBottom is gone', !cmds.includes('cvs.headers.moveToBottom'));
check('cvs.tags.enrich / enrichAuto are gone', !cmds.some(c => c.startsWith('cvs.tags.')));
check('src/features/tags-enrichment.ts is gone', !fs.existsSync(path.join(ROOT, 'src/features/tags-enrichment.ts')));

// 3 ── the viewer, behaviourally
const OUT = path.join(ROOT, 'out-test', 'features', 'frontmatter-viewer.js');
if (!fs.existsSync(OUT)) {
    check('out-test/ build present (the runner builds it before every run)', false, OUT);
} else {
    const origLoad = Module._load;
    Module._load = function (req, parent, isMain) {
        if (req === 'vscode') { return { window: {}, workspace: {}, commands: { registerCommand() { return { dispose() {} }; } }, ViewColumn: {} }; }
        return origLoad.call(this, req, parent, isMain);
    };
    const t = require(OUT)._test;
    Module._load = origLoad;

    const GOOD = '---\nid: good\ntitle: Good\ndescription: A fine doc.\n---\n\n# Good\n\nBody.\n';
    const OLD  = '# Old\n\nIntro.\n\n---\n\nMore.\n\n---\ndocid: 150.1.old\nid: old\ntitle: Old\ndescription: d\n---\n';
    const asFile = (content, name) => {
        const p = t.parseFm(content);
        return { filename: name, path: name, hasFrontmatter: p.hasFrontmatter, atBottom: p.atBottom,
                 contractIssues: require(path.join(ROOT, 'out-test', 'shared', 'doc-frontmatter.js')).contractViolations(content),
                 fieldCount: Object.keys(p.fields).length, keys: Object.keys(p.fields), fields: p.fields, error: p.error };
    };
    const goodV = t.violations(asFile(GOOD, 'good.md'), new Set());
    const oldV  = t.violations(asFile(OLD, 'old.md'), new Set());
    check('a compliant doc has no violations (no docid demanded, top is right)', goodV.length === 0, goodV.join('; '));
    check('a bottom trailer is a violation', oldV.includes('frontmatter at the bottom'), oldV.join('; '));
    check('proposed fixes never tell anyone to move a header to the bottom',
        !t.proposedFixes(oldV).some(f => /to the (end|bottom)/i.test(f)), t.proposedFixes(oldV).join(' | '));

    // The generated fix test is a real test: run it against both docs.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reg151-'));
    const runGenerated = (docText) => {
        const docRel = 'doc.md';
        fs.writeFileSync(path.join(tmp, docRel), docText, 'utf8');
        const testDir = path.join(tmp, 'tests', 'regression');
        fs.mkdirSync(testDir, { recursive: true });
        const testFile = path.join(testDir, 'generated.test.js');
        fs.writeFileSync(testFile, t.buildFailureTestContent(docRel, 'doc.md', oldV), 'utf8');
        return cp.spawnSync(process.execPath, [testFile], { encoding: 'utf8' }).status;
    };
    check('the generated fix test PASSES on a compliant doc', runGenerated(GOOD) === 0);
    check('the generated fix test FAILS on a bottom-trailer doc', runGenerated(OLD) !== 0);
    fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('-'.repeat(64));
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
