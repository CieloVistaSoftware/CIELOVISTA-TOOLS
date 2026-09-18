// Copyright (c) 2026 CieloVista Software. All rights reserved.
// REG-176: Issue #812 — one markdown walk and one skip list, in the extension,
// the MCP server and the scripts
//
// Run: node tests/regression/REG-176-one-doc-skip-list-everywhere.test.js
//
// #802 put every doc walk in src/ on one collector with one skip list, but the
// MCP server's doc catalog (mcp-server/src/tools/catalog-helpers.ts) and five
// scripts walked for markdown with lists of their own. The MCP list did not
// skip .claude/, so every git worktree under .claude/worktrees/ added a full
// copy of every doc to get_catalog and search_docs: Claude, through MCP, saw a
// different doc set from the Doc Catalog, Doc Auditor and Doc Intelligence.
// The walk and DOC_SKIP_DIRS now live once, in mcp-server/src/shared/doc-walk.ts;
// the extension re-exports it (src/shared/doc-collector.ts), the MCP server
// imports it, and scripts load the same source through scripts/lib/doc-walk.js.
//
// Guards:
//   1. The walker detector (tests/utils/markdown-walkers.js) still recognises
//      each shape of markdown walk seen in this repo -- recursion, a listDir()
//      wrapper, a while-loop work list, /\.(md|html)$/ -- so a green result
//      below means "no walker", not "detector went blind".
//   2. No function in src/, mcp-server/src/ or scripts/ walks a tree for
//      markdown except the one in mcp-server/src/shared/doc-walk.ts. A second
//      walker is how a second skip list gets in.
//   3. The MCP catalog, the extension's collector and the scripts' loader
//      share one skip list, and for a fixture holding a doc in .claude/worktrees/
//      and in every skipped directory, the MCP catalog returns exactly the docs
//      the extension's collector returns.

'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');

const ROOT    = path.resolve(__dirname, '..', '..');
const esbuild = require(path.join(ROOT, 'node_modules', 'esbuild'));
const { sourceFiles, walkersIn } = require(path.join(ROOT, 'tests', 'utils', 'markdown-walkers.js'));

let passed = 0, failed = 0;
function check(name, ok, detail) {
    if (ok) { console.log(`  PASS ${name}`); passed++; }
    else    { console.error(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`); failed++; }
}

console.log('REG-176: one markdown walk and skip list everywhere (#812)');
console.log('-'.repeat(64));

const THE_WALK = 'mcp-server/src/shared/doc-walk.ts';
const TREES    = ['src', 'mcp-server/src', 'scripts'];
const TMP      = fs.mkdtempSync(path.join(os.tmpdir(), 'reg176-'));

try {
    // ── 1. The detector sees every walker shape ──────────────────────────────
    const shapes = {
        'recursion.js': [
            "const fs = require('fs'); const path = require('path');",
            'function walk(dir, out = []) {',
            '    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {',
            "        if (e.name === 'node_modules') { continue; }",
            '        const full = path.join(dir, e.name);',
            "        if (e.isDirectory()) { walk(full, out); } else if (e.name.endsWith('.md')) { out.push(full); }",
            '    }',
            '    return out;',
            '}',
        ],
        'list-dir-wrapper.js': [
            "const fs = require('fs'); const path = require('path');",
            'function listDir(dir) { try { return fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; } }',
            'function walk(dir, out = []) {',
            '    for (const e of listDir(dir)) {',
            '        const full = path.join(dir, e.name);',
            "        if (e.isDirectory()) { walk(full, out); } else if (e.name.endsWith('.md')) { out.push(full); }",
            '    }',
            '    return out;',
            '}',
        ],
        'work-list.ts': [
            "import * as fs from 'fs'; import * as path from 'path';",
            'const DOC = /README|\\.md$/i;',
            'export function docs(root: string): string[] {',
            '    const stack = [root]; const out: string[] = [];',
            '    while (stack.length) {',
            '        const dir = stack.pop() as string;',
            '        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {',
            '            const full = path.join(dir, e.name);',
            '            if (e.isDirectory()) { stack.push(full); } else if (DOC.test(e.name)) { out.push(full); }',
            '        }',
            '    }',
            '    return out;',
            '}',
        ],
        'md-or-html.js': [
            "const fs = require('fs'); const path = require('path');",
            'function collect(dir, out = []) {',
            '    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {',
            '        const full = path.join(dir, e.name);',
            '        if (e.isDirectory()) { collect(full, out); continue; }',
            '        if (/\\.(md|html)$/.test(e.name)) { out.push(full); }',
            '    }',
            '    return out;',
            '}',
        ],
        'recursive-option.js': [
            "const fs = require('fs');",
            "function docs(dir) { return fs.readdirSync(dir, { recursive: true }).filter((f) => String(f).endsWith('.md')); }",
        ],
    };
    const notWalkers = {
        'code-walker.js': [
            "const fs = require('fs'); const path = require('path');",
            'function walk(dir, out = []) {',
            '    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {',
            '        const full = path.join(dir, e.name);',
            "        if (e.isDirectory()) { walk(full, out); } else if (e.name.endsWith('.ts')) { out.push(full); }",
            '    }',
            '    return out;',
            '}',
        ],
        'one-folder.js': [
            "const fs = require('fs');",
            "function reports(dir) { return fs.readdirSync(dir).filter((f) => f.endsWith('.md')); }",
        ],
    };
    const shapeDir = path.join(TMP, 'shapes');
    fs.mkdirSync(shapeDir, { recursive: true });
    for (const [name, lines] of Object.entries({ ...shapes, ...notWalkers })) {
        fs.writeFileSync(path.join(shapeDir, name), lines.join('\n') + '\n');
    }
    for (const name of Object.keys(shapes)) {
        const found = walkersIn(path.join(shapeDir, name));
        check(`detector: sees a markdown walker in ${name}`, found.length === 1, `found ${JSON.stringify(found)}`);
    }
    for (const name of Object.keys(notWalkers)) {
        const found = walkersIn(path.join(shapeDir, name));
        check(`detector: no walker in ${name}`, found.length === 0, `found ${JSON.stringify(found)}`);
    }

    // ── 2. One walker in src/, mcp-server/src/ and scripts/ ──────────────────
    const theWalk = path.join(ROOT, THE_WALK);
    check(`${THE_WALK} exists`, fs.existsSync(theWalk));
    check('the detector recognises the one walk (so it can see others)',
        fs.existsSync(theWalk) && walkersIn(theWalk).length === 1,
        'walkDocTree was not detected: the detector is broken, not the source');

    for (const tree of TREES) {
        const others = sourceFiles(path.join(ROOT, tree))
            .filter((f) => path.resolve(f) !== path.resolve(theWalk))
            .flatMap(walkersIn);
        check(`${tree}/: no function walks a tree for markdown with its own skip list`, others.length === 0,
            `use walkDocTree() -- src/shared/doc-collector.ts in the extension, ../shared/doc-walk.js in `
            + `mcp-server, ./lib/doc-walk in scripts/:\n       ${others.join('\n       ')}`);
    }

    // ── 3. The MCP catalog and the extension walk the same tree ──────────────
    function bundle(entry, name) {
        const outfile = path.join(TMP, 'build', `${name}.js`);
        esbuild.buildSync({ entryPoints: [path.join(ROOT, entry)], outfile, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
        return require(outfile);
    }
    const collector = bundle('src/shared/doc-collector.ts', 'collector');
    const catalog   = bundle('mcp-server/src/tools/catalog-helpers.ts', 'catalog');
    const loader    = path.join(ROOT, 'scripts', 'lib', 'doc-walk.js');
    check('scripts/lib/doc-walk.js exists', fs.existsSync(loader));
    const scripts   = fs.existsSync(loader) ? require(loader) : {};

    const list = (set) => (set ? [...set].sort() : []);
    const extList = list(collector.DOC_SKIP_DIRS);
    check('the extension skips .claude/', extList.includes('.claude'), JSON.stringify(extList));
    check('scripts/lib/doc-walk.js loads the extension\'s skip list',
        JSON.stringify(list(scripts.DOC_SKIP_DIRS)) === JSON.stringify(extList),
        `scripts: ${JSON.stringify(list(scripts.DOC_SKIP_DIRS))}\n       extension: ${JSON.stringify(extList)}`);
    check('catalog-helpers.ts declares no skip list of its own',
        !/SKIP_DIRS\s*=/.test(fs.readFileSync(path.join(ROOT, 'mcp-server', 'src', 'tools', 'catalog-helpers.ts'), 'utf8')));

    const fx = path.join(TMP, 'fixture');
    const write = (rel, body) => { const p = path.join(fx, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };
    write('README.md', '---\nid: readme\ntitle: Readme\ndescription: Root.\n---\n# Root\n');
    write('docs/guide.md', '# Guide\n');
    write('docs/a/b/deep.md', '# Deep\n');
    write('docs/a/test-failed-1-error-context.md', '# Playwright dump\n');
    // The #812 bug: a worktree's full copy of the project's docs.
    write('.claude/worktrees/some-branch/README.md', '# Worktree copy\n');
    write('.claude/worktrees/some-branch/docs/guide.md', '# Worktree copy\n');
    for (const dir of extList) { write(`${dir}/skip-me.md`, '# Should be skipped\n'); write(`docs/${dir}/skip-me.md`, '# Should be skipped\n'); }

    const rel = (files, base = fx) => files.map((f) => path.relative(base, f).split(path.sep).join('/')).sort();
    const expected = ['README.md', 'docs/a/b/deep.md', 'docs/guide.md'];
    const ext = typeof collector.collectDocs === 'function' ? rel(collector.collectDocs(fx, 'fx').map((d) => d.filePath)) : [];
    const mcp = typeof catalog.scanProjectDocs === 'function' ? rel(catalog.scanProjectDocs(fx, 'fx', fx, 'product').map((d) => d.filePath)) : [];
    check('fixture: the extension collects exactly the docs', JSON.stringify(ext) === JSON.stringify(expected), `got ${JSON.stringify(ext)}`);
    check('fixture: the MCP catalog (get_catalog, search_docs) sees exactly the docs, no worktree copies',
        JSON.stringify(mcp) === JSON.stringify(expected), `got ${JSON.stringify(mcp)}`);

    const extRepo = typeof collector.collectDocs === 'function' ? rel(collector.collectDocs(ROOT, 'cvt').map((d) => d.filePath), ROOT) : [];
    const mcpRepo = typeof catalog.scanProjectDocs === 'function' ? rel(catalog.scanProjectDocs(ROOT, 'cvt', ROOT, 'product').map((d) => d.filePath), ROOT) : [];
    const onlyMcp = mcpRepo.filter((f) => !extRepo.includes(f));
    const onlyExt = extRepo.filter((f) => !mcpRepo.includes(f));
    check(`this repo: the MCP catalog and the extension see the same ${extRepo.length} docs`,
        extRepo.length > 0 && onlyMcp.length === 0 && onlyExt.length === 0,
        `only MCP: ${JSON.stringify(onlyMcp.slice(0, 10))}; only the extension: ${JSON.stringify(onlyExt.slice(0, 10))}`);
} finally {
    fs.rmSync(TMP, { recursive: true, force: true });
}

console.log('-'.repeat(64));
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
