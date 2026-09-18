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
// Guards:
//   1. No source file under src/ other than shared/doc-collector.ts walks a
//      directory tree for markdown. A walker is recognised from the TypeScript
//      AST, not by text: a function that calls readdir/readdirSync and either
//      calls itself or passes { recursive: true }, together with a markdown
//      test -- a literal naming .md or README, in the function, the function
//      enclosing it, or a module-level const/function it uses. Code inside a
//      string, such as the test Frontmatter Viewer generates, is not a call.
//   2. Doc Auditor and Doc Intelligence, built from source, return the same
//      set of files for a fixture tree holding a doc in every skipped
//      directory, and for this repo itself.

'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const ts      = require(path.join(ROOT, 'node_modules', 'typescript'));
const esbuild = require(path.join(ROOT, 'node_modules', 'esbuild'));

let passed = 0, failed = 0;
function check(name, ok, detail) {
    if (ok) { console.log(`  PASS ${name}`); passed++; }
    else    { console.error(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`); failed++; }
}

console.log('REG-174: one doc collector (#802)');
console.log('-'.repeat(64));

// ── 1. No second walker ──────────────────────────────────────────────────────

const THE_COLLECTOR = 'src/shared/doc-collector.ts';
const MARKDOWN_LITERAL = /\.md\b|readme/i;

function sourceFiles(dir, acc = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { sourceFiles(full, acc); }
        else if (/\.ts$/.test(e.name) && !/\.d\.ts$/.test(e.name)) { acc.push(full); }
    }
    return acc;
}

function isFunctionLike(node) {
    return ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)
        || ts.isArrowFunction(node) || ts.isMethodDeclaration(node);
}

function calleeName(call) {
    const e = call.expression;
    if (ts.isIdentifier(e)) { return e.text; }
    if (ts.isPropertyAccessExpression(e)) { return e.name.text; }
    return '';
}

function functionName(node) {
    if (node.name) { return node.name.getText(); }
    if (node.parent && ts.isVariableDeclaration(node.parent)) { return node.parent.name.getText(); }
    return '';
}

function isMarkdownLiteral(node) {
    return (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || node.kind === ts.SyntaxKind.RegularExpressionLiteral)
        && MARKDOWN_LITERAL.test(node.getText());
}

/** Facts about one function: does it read a directory, call itself, test for markdown? */
function facts(root, markdownNames) {
    const self = functionName(root);
    const f = { readdir: false, recurses: false, markdown: false };
    (function visit(node) {
        if (ts.isCallExpression(node)) {
            const name = calleeName(node);
            if (/^readdir(Sync)?$/.test(name)) {
                f.readdir = true;
                for (const arg of node.arguments) {
                    if (ts.isObjectLiteralExpression(arg) && arg.properties.some((p) =>
                        p.name && p.name.getText() === 'recursive' && p.initializer && p.initializer.kind === ts.SyntaxKind.TrueKeyword)) {
                        f.recurses = true;
                    }
                }
            }
            if (self && ts.isIdentifier(node.expression) && node.expression.text === self) { f.recurses = true; }
        }
        if (isMarkdownLiteral(node)) { f.markdown = true; }
        if (ts.isIdentifier(node) && markdownNames.has(node.text)) { f.markdown = true; }
        ts.forEachChild(node, visit);
    })(root);
    return f;
}

/** The functions that walk a tree for markdown, as "file:line name". */
function walkersIn(file) {
    const text = fs.readFileSync(file, 'utf8');
    const sf   = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    // Module-level consts and functions that hold a markdown test, followed
    // through one another (isMarkdownDoc uses MARKDOWN) until nothing changes.
    const topLevel = new Map();
    for (const st of sf.statements) {
        if (ts.isFunctionDeclaration(st) && st.name) { topLevel.set(st.name.text, st); }
        if (ts.isVariableStatement(st)) { for (const d of st.declarationList.declarations) { topLevel.set(d.name.getText(), d); } }
    }
    const markdownNames = new Set();
    for (let grew = true; grew;) {
        grew = false;
        for (const [name, decl] of topLevel) {
            if (markdownNames.has(name)) { continue; }
            let hit = false;
            (function visit(n) {
                if (hit) { return; }
                if (isMarkdownLiteral(n) || (ts.isIdentifier(n) && n.text !== name && markdownNames.has(n.text))) { hit = true; return; }
                ts.forEachChild(n, visit);
            })(decl);
            if (hit) { markdownNames.add(name); grew = true; }
        }
    }

    const found = [];
    (function visit(node) {
        if (isFunctionLike(node)) {
            // The function and the one enclosing it: a nested walk() often
            // takes its markdown test from its parent.
            let scope = node;
            for (let p = node.parent; p; p = p.parent) { if (isFunctionLike(p)) { scope = p; break; } }
            const own = facts(node, markdownNames);
            const wide = scope === node ? own : facts(scope, markdownNames);
            if (own.readdir && own.recurses && (own.markdown || wide.markdown)) {
                const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
                const name = functionName(node) || '(anonymous)';
                found.push(`${path.relative(ROOT, file).split(path.sep).join('/')}:${line} ${name}`);
                return;   // report the outermost walking function once
            }
        }
        ts.forEachChild(node, visit);
    })(sf);
    return found;
}

const files = sourceFiles(path.join(ROOT, 'src'));
const collectorFile = path.join(ROOT, THE_COLLECTOR);
check('src/shared/doc-collector.ts exists', fs.existsSync(collectorFile));
check('the detector recognises the one collector as a walker (so it can see others)',
    fs.existsSync(collectorFile) && walkersIn(collectorFile).length > 0,
    'walkDocTree was not detected: the detector is broken, not the source');

const others = files
    .filter((f) => path.resolve(f) !== path.resolve(collectorFile))
    .flatMap(walkersIn);
check('no other source file walks a tree for markdown', others.length === 0,
    `use walkDocTree()/collectDocs() from src/shared/doc-collector.ts instead:\n       ${others.join('\n       ')}`);

// ── 2. Doc Auditor and Doc Intelligence see the same docs ───────────────────

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
