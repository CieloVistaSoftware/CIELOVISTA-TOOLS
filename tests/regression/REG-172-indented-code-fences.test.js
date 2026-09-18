// Copyright (c) 2026 CieloVista Software. All rights reserved.
// REG-172: Issue #799 — a code fence indented 1 to 3 spaces is not recognised,
// so later fences pair off by one
//
// Run: node tests/regression/REG-172-indented-code-fences.test.js
//
// CommonMark (spec 4.5) lets an opening and a closing code fence be indented
// by 0 to 3 spaces, independently of each other, and strips up to the
// opener's indentation from each content line. Four spaces is not a fence.
// The closer uses the opener's character, is at least as long, and has
// nothing after it.
//
// cvt found fences in six places, each with its own rule, most anchored at
// column 0 (doc-frontmatter and doc-catalog accepted any indent, and
// doc-catalog never paired them at all). A closer written as
// " ```" did not close the block, so the block swallowed the prose after it
// and every later fence in the file paired off by one. The rule now lives in
// src/shared/md-fence.ts and every scanner asks it.
//
// Part 1 generates its cases from a table: opener indent 0-4 x closer indent
// 0-4 x backtick/tilde, each with an oracle computed from the spec, and
// asserts the renderer's exact HTML and the shared scanner's pairing.
// Part 2 pins the other fence rules (length, character, info string).
// Part 3 drives every other consumer (help panel, the two description
// scanners, code-highlight audit, README compliance) through an indented fence.
// Part 4 is a corpus check: every Markdown file in the repo is rendered, and
// each code block the renderer produces must be a code block markdown-it
// (a reference CommonMark parser) also finds. A fence pairing off by one
// renders prose as code, which markdown-it never does. It also requires that
// no repo document leaves a fence open at end of file (#811).
//
// Loads modules from out-test/ (built by the runners). Writes only to a temp dir.

'use strict';

const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const Module = require('module');

const ROOT = path.join(__dirname, '..', '..');
const OUT  = path.join(ROOT, 'out-test');

let passed = 0;
let failed = 0;
function check(name, ok, detail) {
    if (ok) { passed += 1; }
    else    { console.error(`  FAIL ${name}\n       ${detail}`); failed += 1; }
}
function section(title, fn) {
    const before = failed;
    const beforePass = passed;
    fn();
    console.log(`  ${failed === before ? 'PASS' : 'FAIL'} ${title} (${passed - beforePass} passed, ${failed - before} failed)`);
}

// vscode is only needed by the two feature modules; a stub is enough for their pure scanners.
const origLoad = Module._load;
Module._load = function (req, parent, isMain) {
    if (req === 'vscode') {
        return { window: {}, workspace: {}, commands: { registerCommand() { return { dispose() {} }; } }, Uri: {}, ViewColumn: {} };
    }
    return origLoad.call(this, req, parent, isMain);
};
let mdToHtml, fence, descriptionFromBody, extractDescription, buildHelpPanelHtml, scanFile, readme;
try {
    ({ mdToHtml }            = require(path.join(OUT, 'shared', 'md-renderer.js')));
    fence                    = require(path.join(OUT, 'shared', 'md-fence.js'));
    ({ descriptionFromBody } = require(path.join(OUT, 'shared', 'doc-frontmatter.js')));
    ({ buildHelpPanelHtml }  = require(path.join(OUT, 'shared', 'help-panel.js')));
    ({ extractDescription }  = require(path.join(OUT, 'features', 'doc-catalog', 'content.js')));
    ({ scanFile }            = require(path.join(OUT, 'features', 'code-highlight-audit.js')));
    ({ _test: readme }       = require(path.join(OUT, 'features', 'readme-compliance', 'feature.js')));
} catch (err) {
    console.error(`FAIL: cannot load the modules under test from ${OUT}: ${err.message}`);
    process.exit(1);
} finally {
    Module._load = origLoad;
}

const BT = String.fromCharCode(96); // a backtick
const sp = n => ' '.repeat(n);

console.log('REG-172: code fences indented 0 to 3 spaces open and close (#799)');
console.log('-'.repeat(64));

// ── Part 1: the generated table ──────────────────────────────────────────────
const TABLE = [];
for (const ch of [BT, '~']) {
    for (let openIndent = 0; openIndent <= 4; openIndent++) {
        for (let closeIndent = 0; closeIndent <= 4; closeIndent++) {
            TABLE.push({ ch, openIndent, closeIndent });
        }
    }
}

/**
 * The oracle: what CommonMark says the document
 *   <openIndent>FFFtext / <openIndent>code / <openIndent+1> more / <closeIndent>FFF / after
 * is. `text` is plaintext, so the highlighter leaves the code as it is.
 */
function oracle({ ch, openIndent, closeIndent }) {
    const F = ch.repeat(3);
    const md = [sp(openIndent) + F + 'text', sp(openIndent) + 'code', sp(openIndent + 1) + 'more', sp(closeIndent) + F, 'after'].join('\n');
    if (openIndent > 3) { return { md, opens: false }; }
    const strip = l => l.replace(new RegExp('^ {0,' + openIndent + '}'), '');
    if (closeIndent <= 3) {
        return { md, opens: true, closeLine: 3,
            html: '<pre><code class="language-text">code\n more</code></pre>\n<p>after</p>' };
    }
    // A closer indented four spaces is content; the block runs to the end.
    const content = ['code', ' more', strip(sp(closeIndent) + F), 'after'].join('\n');
    return { md, opens: true, closeLine: -1,
        html: '<pre><code class="language-text">' + content + '</code></pre>' };
}

section(`generated table: ${TABLE.length} cases (indent 0-4 x closer indent 0-4 x backtick/tilde)`, () => {
    for (const row of TABLE) {
        const want = oracle(row);
        const name = `${row.ch === BT ? 'backtick' : 'tilde'} opener indent ${row.openIndent}, closer indent ${row.closeIndent}`;
        const got  = mdToHtml(want.md);
        const blocks = fence.scanFences(want.md.split('\n'));
        if (!want.opens) {
            // Four spaces is not a fence: line 0 opens nothing, and the renderer
            // has no <pre> before the (possible) later fence at line 3.
            check(`${name}: not a fence`, fence.parseFenceOpen(want.md.split('\n')[0]) === undefined,
                'a fence indented four spaces was accepted');
            check(`${name}: renders no code block from line 0`, got.startsWith('<p>'), `got ${JSON.stringify(got)}`);
            continue;
        }
        check(`${name}: exact HTML`, got === want.html,
            `md   ${JSON.stringify(want.md)}\n       want ${JSON.stringify(want.html)}\n       got  ${JSON.stringify(got)}`);
        check(`${name}: scanner pairing`, blocks.length === 1 && blocks[0].openLine === 0 && blocks[0].closeLine === want.closeLine,
            `want one block 0..${want.closeLine}, got ${JSON.stringify(blocks)}`);
        check(`${name}: opener indent recorded`, blocks.length > 0 && blocks[0].open.indent === row.openIndent,
            `got ${JSON.stringify(blocks[0])}`);
    }
});

// ── Part 2: the other fence rules ────────────────────────────────────────────
const F3 = BT.repeat(3);
const F4 = BT.repeat(4);
const RULES = [
    // [name, markdown, exact HTML]
    ['the issue: an indented closer then a second block pairs correctly',
        'a\n\n' + F3 + 'text\nx\n ' + F3 + '\n\nprose\n\n' + F3 + 'text\ny\n' + F3,
        '<p>a</p>\n<pre><code class="language-text">x</code></pre>\n<p>prose</p>\n<pre><code class="language-text">y</code></pre>'],
    ['content loses up to the opener indent, no more',
        '  ' + F3 + 'text\n x\n   y\n    z\n  ' + F3,
        '<pre><code class="language-text">x\n y\n  z</code></pre>'],
    ['a shorter closer does not close',
        F4 + 'text\nx\n' + F3 + '\n' + F4,
        '<pre><code class="language-text">x\n' + F3 + '</code></pre>'],
    ['a longer closer closes',
        F3 + 'text\nx\n  ' + F4,
        '<pre><code class="language-text">x</code></pre>'],
    ['the other fence character does not close',
        F3 + 'text\nx\n~~~\n' + F3,
        '<pre><code class="language-text">x\n~~~</code></pre>'],
    ['a closer with an info string does not close',
        F3 + 'text\nx\n' + F3 + 'ts\n' + F3,
        '<pre><code class="language-text">x\n' + F3 + 'ts</code></pre>'],
    ['a closer may have trailing spaces',
        F3 + 'text\nx\n ' + F3 + '   \nafter',
        '<pre><code class="language-text">x</code></pre>\n<p>after</p>'],
    ['a tilde info string may hold a backtick',
        '~~~text ' + BT + '\nx\n~~~',
        '<pre><code class="language-text">x</code></pre>'],
    ['an indented fence interrupts a paragraph',
        'para\n  ' + F3 + 'text\nx\n  ' + F3,
        '<p>para</p>\n<pre><code class="language-text">x</code></pre>'],
    ['an unclosed fence runs to the end',
        '   ' + F3 + 'text\nx\n\ny',
        '<pre><code class="language-text">x\n\ny</code></pre>'],
    ['CRLF input',
        ' ' + F3 + 'text\r\nx\r\n  ' + F3 + '\r\nafter',
        '<pre><code class="language-text">x</code></pre>\n<p>after</p>'],
];
section(`fence rules: ${RULES.length + 1} cases`, () => {
    for (const [name, md, want] of RULES) {
        const got = mdToHtml(md);
        check(`${name}: ${JSON.stringify(md)}`, got === want, `want ${JSON.stringify(want)}\n       got  ${JSON.stringify(got)}`);
    }
    // The inline code-span rule decides what such a line renders as; the fence rule only says it is no fence.
    const md = F3 + 'a' + BT + 'b\nx\n' + F3;
    const got = mdToHtml(md);
    check(`a backtick info string with a backtick is not a fence: ${JSON.stringify(md)}`,
        fence.parseFenceOpen(F3 + 'a' + BT + 'b') === undefined && got.startsWith('<p>'), `got ${JSON.stringify(got)}`);
});

// ── Part 3: every other consumer agrees ──────────────────────────────────────
const DOC = ['# Title', '', ' ' + F3 + 'bash', '# not a heading', '  ' + F3, '', 'The real description.', ''].join('\n');

section('doc-frontmatter description scanner skips an indented fence', () => {
    const got = descriptionFromBody(['  ' + F3, 'code line', ' ' + F3, '', 'Real prose.'].join('\n'));
    check('description is the prose after the block', got === 'Real prose.', `got ${JSON.stringify(got)}`);
    // "```ts" inside a block is content, not a closer, so the next bare fence closes the block.
    const nested = descriptionFromBody([F3 + 'md', F3 + 'ts', 'x', F3, '', 'Real prose.'].join('\n'));
    check('an opener-looking line inside a block does not close it', nested === 'Real prose.', `got ${JSON.stringify(nested)}`);
});

section('doc-catalog description skips fenced code, indented or not', () => {
    const got = extractDescription(DOC);
    check('the description is the prose, not the code', got === 'The real description.', `got ${JSON.stringify(got)}`);
});

section('help panel renders an indented fence as one code block', () => {
    const html = buildHelpPanelHtml(DOC + '\n## Next\n', [], 'f');
    check('the "#" line inside the block is code, not a heading', !/<h1>not a heading<\/h1>/.test(html) && html.includes('# not a heading'),
        'the fenced "# not a heading" line rendered as a heading');
    check('the heading after the block still renders', /<h2>Next<\/h2>/.test(html), 'the block swallowed the rest of the document');
    const code = /<pre><code class="lang-bash">([\s\S]*?)<\/code><\/pre>/.exec(html);
    check('the block holds exactly the content line', !!code && code[1].trim() === '# not a heading', `got ${code ? JSON.stringify(code[1]) : 'no block'}`);
});

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reg172-'));
try {
    section('code-highlight audit pairs indented fences', () => {
        const f = path.join(tmp, 'a.md');
        fs.writeFileSync(f, ['  ' + F3 + 'ts', 'x', ' ' + F3, '', 'prose', '', '   ' + F3, 'y', F3, ''].join('\n'));
        const got = scanFile(f, 'p');
        check('only the second (untagged) block is reported, at its own line', got.length === 1 && got[0].lineNumber === 7 && got[0].preview === 'y',
            `got ${JSON.stringify(got)}`);
    });

    section('README compliance counts and tags only untagged openers', () => {
        const f = path.join(tmp, 'README.md');
        fs.writeFileSync(f, ['# feature: x', '', ' ' + F3 + 'ts', 'const a = 1;', ' ' + F3, '', '  ' + F3, 'const b = 2;', '  ' + F3, ''].join('\n'));
        const report = readme.checkCompliance(f, 'p', tmp);
        const issue = report.issues.find(i => i.fixKey === 'code-block-lang');
        check('one untagged block is reported', !!issue && /^1 code block/.test(issue.message), `got ${JSON.stringify(issue)}`);
        const fixed = issue ? readme.applyFix({ ...report, issues: [issue] }) : '';
        const want = ['# feature: x', '', ' ' + F3 + 'ts', 'const a = 1;', ' ' + F3, '', '  ' + F3 + 'javascript', 'const b = 2;', '  ' + F3, ''].join('\n');
        check('the fix tags only the untagged opener and keeps its indent', fixed === want, `got ${JSON.stringify(fixed)}`);
    });
} finally {
    fs.rmSync(tmp, { recursive: true, force: true });
}

// ── Part 4: the repo corpus against a reference parser ───────────────────────
section('corpus: every code block the renderer makes is one markdown-it makes', () => {
    let MarkdownIt;
    try { MarkdownIt = require(path.join(ROOT, 'node_modules', 'markdown-it')); }
    catch (err) { check('markdown-it loads', false, err.message); return; }
    const md = new MarkdownIt();
    const SKIP = new Set(['node_modules', '.git', 'out', 'out-test', '.claude', '.vscode-test']);
    const files = [];
    (function walk(dir) {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (SKIP.has(e.name)) { continue; }
            const full = path.join(dir, e.name);
            if (e.isDirectory()) { walk(full); }
            else if (e.name.endsWith('.md')) { files.push(full); }
        }
    })(ROOT);
    const unEsc = s => s.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#39;/g, "'").replace(/&amp;/g, '&');
    let blocks = 0;
    for (const file of files) {
        const text = fs.readFileSync(file, 'utf8');
        const ref = new Set(md.parse(text.replace(/\r\n/g, '\n'), {})
            .filter(t => t.type === 'fence').map(t => t.content.replace(/\n+$/, '')));
        // Trailing newlines differ only for a block left open at the end of a file.
        const ours = [...mdToHtml(text).matchAll(/<pre><code[^>]*>([\s\S]*?)<\/code><\/pre>/g)].map(m => unEsc(m[1]).replace(/\n+$/, ''));
        // A fence open at end of file means a closer did not close (#811: the old
        // README fixer tagged closers, so each file became one code block).
        const open = fence.scanFences(text.split(/\r?\n/)).filter(b => b.closeLine === -1);
        check(`${path.relative(ROOT, file)}: no fence left open at end of file`, open.length === 0,
            `fence opened on line ${open.length ? open[0].openLine + 1 : 0} never closes`);
        for (const code of ours) {
            blocks += 1;
            check(`${path.relative(ROOT, file)}: code block matches a reference fence`, ref.has(code),
                `no markdown-it fence has this content: ${JSON.stringify(code.slice(0, 120))}`);
        }
    }
    check(`corpus is not empty (${files.length} files, ${blocks} code blocks)`, files.length > 50 && blocks > 50, 'the walk found almost nothing');
});

console.log('-'.repeat(64));
console.log(`REG-172: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
