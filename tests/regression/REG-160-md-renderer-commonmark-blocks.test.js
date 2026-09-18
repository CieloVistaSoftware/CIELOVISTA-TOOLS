// Copyright (c) 2026 CieloVista Software. All rights reserved.
// REG-160: Issue #773 — md-renderer: h5/h6, ordered-list start, blockquote
// lines with no space or no text, + bullets and underscore emphasis are not
// rendered
//
// Run: node tests/regression/REG-160-md-renderer-commonmark-blocks.test.js
//
// mdToHtml() supported only part of CommonMark. "##### x" was a paragraph,
// "3. x" started an <ol> numbered from 1, ">x" and a lone ">" were paragraphs,
// "+ x" was a paragraph, and __bold__ / _italic_ kept their underscores.
//
// Underscore emphasis must follow CommonMark's intraword rule, because this
// repo's docs are full of identifiers: an opening _ may not follow a letter or
// digit and a closing _ may not be followed by one, so snake_case_names and
// file_name.md stay literal. Part 6 generates that rule's cases from a table
// of contexts and an oracle rather than hand-picking them, and Part 7 checks
// every intraword identifier in the repo's markdown survives rendering.
//
// Renders through the real renderer (out-test/, built by the runners) and
// asserts exact HTML. Reads the repo's markdown; writes nothing.

'use strict';

const path = require('path');
const { walkFiles, readIfPresent } = require('../../scripts/source-tree-walk');

const ROOT    = path.join(__dirname, '..', '..');
const outFile = path.join(ROOT, 'out-test', 'shared', 'md-renderer.js');
let mdToHtml;
try {
    ({ mdToHtml } = require(outFile));
} catch (err) {
    console.error(`FAIL: cannot load the renderer from ${outFile}: ${err.message}`);
    process.exit(1);
}

let passed = 0;
let failed = 0;
function check(name, ok, detail) {
    if (ok) { console.log(`  PASS ${name}`); passed += 1; }
    else    { console.error(`  FAIL ${name}\n       ${detail}`); failed += 1; }
}

const BT = String.fromCharCode(96); // a backtick
const BS = String.fromCharCode(92); // a backslash

/** Assert that `md` renders to exactly `want`. */
function exact(name, md, want) {
    const got = mdToHtml(md);
    check(`${name}: ${JSON.stringify(md)}`, got === want,
        `want ${JSON.stringify(want)}\n       got  ${JSON.stringify(got)}`);
}

console.log('REG-160: md-renderer renders h5/h6, list start, blockquote lines, + bullets, _ emphasis (#773)');
console.log('-'.repeat(64));

// ── Part 1: ATX headings h1 to h6 ─────────────────────────────────────────────
exact('h5', '##### Level five', '<h5 id="level-five">Level five</h5>');
exact('h6', '###### Level six', '<h6 id="level-six">Level six</h6>');
exact('h4 unchanged', '#### Level four', '<h4 id="level-four">Level four</h4>');
exact('h1 unchanged', '# Title', '<h1 id="title">Title</h1>');
exact('seven hashes is text', '####### Seven', '<p>####### Seven</p>');
exact('h5 needs the space', '#####Five', '<p>#####Five</p>');
exact('h6 with inline markup', '###### A **b** ' + BT + 'c' + BT, '<h6 id="a-b-c">A <strong>b</strong> <code>c</code></h6>');
exact('repeated h5 gets a unique id', '##### Same\n##### Same', '<h5 id="same">Same</h5>\n<h5 id="same-1">Same</h5>');
exact('h5 ends a paragraph', 'Some text\n##### Next', '<p>Some text</p>\n<h5 id="next">Next</h5>');
exact('h5 text is escaped', '##### <script>x</script>', '<h5 id="scriptxscript">&lt;script&gt;x&lt;/script&gt;</h5>');

// ── Part 2: ordered lists keep their start number ────────────────────────────
exact('list starting at 3', '3. third\n4. fourth', '<ol start="3"><li>third</li><li>fourth</li></ol>');
exact('list starting at 1 has no start', '1. one\n2. two', '<ol><li>one</li><li>two</li></ol>');
exact('list starting at 0', '0. zero\n1. one', '<ol start="0"><li>zero</li><li>one</li></ol>');
exact('list starting at 10', '10. ten', '<ol start="10"><li>ten</li></ol>');
exact('leading zeros are the number', '007. bond', '<ol start="7"><li>bond</li></ol>');
exact('only the first number counts', '5. a\n9. b\n2. c', '<ol start="5"><li>a</li><li>b</li><li>c</li></ol>');
exact('list resumed after a code block keeps its number',
    '1. one\n' + BT.repeat(3) + 'text\ncode\n' + BT.repeat(3) + '\n2. two',
    '<ol><li>one</li></ol>\n<pre><code class="language-text">code</code></pre>\n<ol start="2"><li>two</li></ol>');
exact('ten digits is not a list marker', '1234567890. big', '<p>1234567890. big</p>');
exact('a list starting at 3 ends a paragraph', 'Intro\n3. three', '<p>Intro</p>\n<ol start="3"><li>three</li></ol>');
exact('bullet item text starting with a number keeps it', '- 1. keep', '<ul><li>1. keep</li></ul>');
exact('numbered item text starting with a bullet keeps it', '2. - keep', '<ol start="2"><li>- keep</li></ol>');

// ── Part 3: blockquotes ──────────────────────────────────────────────────────
exact('> with a space unchanged', '> quoted', '<blockquote>quoted</blockquote>');
exact('> with no space', '>quoted', '<blockquote>quoted</blockquote>');
exact('only one space is the marker', '>  two spaces', '<blockquote> two spaces</blockquote>');
exact('lone > is an empty quote', '>', '<blockquote></blockquote>');
exact('lone > separates two paragraphs of one quote', '> first\n>\n> second', '<blockquote><p>first</p><p>second</p></blockquote>');
exact('lone > with trailing space also separates', '> first\n> \n> second', '<blockquote><p>first</p><p>second</p></blockquote>');
exact('consecutive > lines are one quote', '> one\n> two', '<blockquote>one<br>two</blockquote>');
exact('mixed spacing lines are one quote', '> one\n>two', '<blockquote>one<br>two</blockquote>');
exact('leading and trailing lone > are dropped', '>\n> text\n>', '<blockquote>text</blockquote>');
exact('a blank line ends the quote', '> a\n\n> b', '<blockquote>a</blockquote>\n<blockquote>b</blockquote>');
// Since #785 a plain line right after quoted text is a lazy continuation line
// of the quote (CommonMark); after a blank line it is a paragraph again.
exact('text after a quote continues it (lazy, #785)', '> a\nafter', '<blockquote>a<br>after</blockquote>');
exact('text after a quote and a blank line is a paragraph', '> a\n\nafter', '<blockquote>a</blockquote>\n<p>after</p>');
exact('>x ends a paragraph', 'para\n>quote', '<p>para</p>\n<blockquote>quote</blockquote>');
exact('lone > ends a paragraph', 'para\n>', '<p>para</p>\n<blockquote></blockquote>');
exact('quote text is escaped', '><b>x</b> & y', '<blockquote>&lt;b&gt;x&lt;/b&gt; &amp; y</blockquote>');
exact('quote inline markup', '>**bold** and [l](u)', '<blockquote><strong>bold</strong> and <a href="u">l</a></blockquote>');
exact('quote script link neutralised', '>[x](javascript:alert(1))', '<blockquote><a href="#">x</a></blockquote>');

// ── Part 4: + is a bullet marker ─────────────────────────────────────────────
exact('+ bullets', '+ one\n+ two', '<ul><li>one</li><li>two</li></ul>');
exact('+ bullet with markup', '+ **b** _i_', '<ul><li><strong>b</strong> <em>i</em></li></ul>');
exact('+ needs the space', '+one', '<p>+one</p>');
exact('+ ends a paragraph', 'para\n+ item', '<p>para</p>\n<ul><li>item</li></ul>');
exact('+ joins a - list as before', '- a\n+ b', '<ul><li>a</li><li>b</li></ul>');
exact('arithmetic in a paragraph is not a list', 'a\n1 + 2 = 3', '<p>a<br>1 + 2 = 3</p>');

// ── Part 5: underscore emphasis ──────────────────────────────────────────────
exact('__strong__', '__bold__', '<p><strong>bold</strong></p>');
exact('_em_', '_italic_', '<p><em>italic</em></p>');
exact('both in a sentence', 'a __b__ and _c_ d', '<p>a <strong>b</strong> and <em>c</em> d</p>');
exact('___both___', '___x___', '<p><em><strong>x</strong></em></p>');
exact('em spans words', '_two words_', '<p><em>two words</em></p>');
exact('em inside strong', '__a _b_ c__', '<p><strong>a <em>b</em> c</strong></p>');
exact('strong inside em', '_a __b__ c_', '<p><em>a <strong>b</strong> c</em></p>');
exact('* and _ together', '*a* _b_ **c** __d__', '<p><em>a</em> <em>b</em> <strong>c</strong> <strong>d</strong></p>');
exact('punctuation around', '(_x_), "_y_". [_z_]', '<p>(<em>x</em>), "<em>y</em>". [<em>z</em>]</p>');
exact('a whole identifier in em keeps its underscore', '_snake_case_', '<p><em>snake_case</em></p>');
exact('an intraword __ inside em stays literal', '_foo__bar_', '<p><em>foo__bar</em></p>');
exact('CommonMark: __init__ at a word start is strong', '__init__.py', '<p><strong>init</strong>.py</p>');
exact('em text is escaped', '_<b>&_', '<p><em>&lt;b&gt;&amp;</em></p>');
exact('_ around a code span', '_' + BT + 'code' + BT + '_', '<p><em><code>code</code></em></p>');
exact('_ around a link', '_[l](u)_', '<p><em><a href="u">l</a></em></p>');
exact('_ inside link text', '[_em_ text](u)', '<p><a href="u"><em>em</em> text</a></p>');
exact('_ around a script link still neutralised', '_[x](javascript:alert(1))_', '<p><em><a href="#">x</a></em></p>');
exact('__ around a data: link still neutralised', '__[x](data:text/html,y)__', '<p><strong><a href="#">x</a></strong></p>');
exact('_ em in a heading', '## A _b_ c', '<h2 id="a-b-c">A <em>b</em> c</h2>');
exact('_ em in a list item', '- _b_', '<ul><li><em>b</em></li></ul>');
exact('_ em in a table cell', '| h |\n|---|\n| _b_ |', '<table><thead><tr><th>h</th></tr></thead><tbody><tr><td><em>b</em></td></tr></tbody></table>');

// Negative: intraword and other cases that must stay literal.
exact('snake_case_names', 'snake_case_names', '<p>snake_case_names</p>');
exact('file_name.md', 'file_name.md', '<p>file_name.md</p>');
exact('my_file_name.md', 'see my_file_name.md now', '<p>see my_file_name.md now</p>');
exact('two identifiers on a line', 'a_b and c_d', '<p>a_b and c_d</p>');
exact('identifiers that would pair across words', 'foo_bar baz_qux', '<p>foo_bar baz_qux</p>');
exact('CONST_VALUE_MAX', 'CONST_VALUE_MAX', '<p>CONST_VALUE_MAX</p>');
exact('digits', '1_000_000', '<p>1_000_000</p>');
exact('trailing underscore identifier', 'foo_bar_', '<p>foo_bar_</p>');
exact('leading underscore identifier', '_private_var', '<p>_private_var</p>');
exact('dunder in a word', 'foo__bar__', '<p>foo__bar__</p>');
exact('dunder word then letters', '__proto__type', '<p>__proto__type</p>');
exact('closer followed by a letter', 'x_y_ z', '<p>x_y_ z</p>');
exact('unicode letter before', 'café_x_', '<p>café_x_</p>');
exact('unicode letter after', '_x_été', '<p>_x_été</p>');
exact('space inside the opener', '_ a _', '<p>_ a _</p>');
exact('space inside the strong opener', '__ a __', '<p>__ a __</p>');
exact('a lone underscore', 'a _ b', '<p>a _ b</p>');
// Since #785 the escape also hides its backslash, as CommonMark specifies.
exact('backslash-escaped underscores are not emphasis', BS + '_not' + BS + '_', '<p>_not_</p>');
exact('underscores in a code span', BT + '_a_ __b__ snake_case' + BT, '<p><code>_a_ __b__ snake_case</code></p>');
exact('underscores in a URL', '[x](path/_a_/__b__/c_d.md)', '<p><a href="path/_a_/__b__/c_d.md">x</a></p>');
exact('underscores in a link title', '[x](u "_t_")', '<p><a href="u" title="_t_">x</a></p>');
exact('identifier as link text', '[my_var_name](u)', '<p><a href="u">my_var_name</a></p>');
exact('underscores in an image', '![a_b_c](x_y_.png)', '<p><img alt="a_b_c" src="x_y_.png"></p>');
exact('_em_ alt text is plain', '![_a_](i.png)', '<p><img alt="a" src="i.png"></p>');
exact('snake_case in a heading', '### run_all_tests', '<h3 id="runalltests">run_all_tests</h3>');
exact('snake_case in a list item', '- set MAX_RETRY_COUNT', '<ul><li>set MAX_RETRY_COUNT</li></ul>');
exact('snake_case in a quote', '> use file_name.md', '<blockquote>use file_name.md</blockquote>');
exact('snake_case in a table cell', '| a_b_c |\n|---|\n| d_e_f |', '<table><thead><tr><th>a_b_c</th></tr></thead><tbody><tr><td>d_e_f</td></tr></tbody></table>');
exact('code span between underscores in a word', 'x_' + BT + 'c' + BT + '_y', '<p>x_<code>c</code>_y</p>');

// ── Part 6: the intraword rule, generated ────────────────────────────────────
// Oracle: X_body_Y renders as em exactly when the character before the opener
// is not a letter or digit AND the character after the closer is not one.
// Same for __body__ as strong. Every combination of the contexts is tested.
{
    const WORDY    = ['a', 'Z', '7', 'é', 'ж'];        // letters and digits, incl. non-ASCII
    const BOUNDARY = ['', ' ', '(', ')', '.', ',', '"', '-', '/', ':', '*'];
    const bodies   = ['x', 'two words', 'a_b'];
    let cases = 0;
    let wrong = [];
    for (const before of [...WORDY, ...BOUNDARY]) {
        for (const after of [...WORDY, ...BOUNDARY]) {
            for (const body of bodies) {
                for (const [delim, tag] of [['_', 'em'], ['__', 'strong']]) {
                    // A * context next to the delimiter would pair with a * elsewhere; keep it on one side only.
                    if (before === '*' && after === '*') { continue; }
                    const md = 'L ' + before + delim + body + delim + after + ' R';
                    const html = mdToHtml(md);
                    const emphasised = WORDY.indexOf(before) < 0 && WORDY.indexOf(after) < 0;
                    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    const want = emphasised
                        ? '<p>L ' + esc(before) + '<' + tag + '>' + body + '</' + tag + '>' + esc(after) + ' R</p>'
                        : '<p>' + esc(md) + '</p>';
                    cases += 1;
                    if (html !== want) { wrong.push(`${JSON.stringify(md)} want ${JSON.stringify(want)} got ${JSON.stringify(html)}`); }
                }
            }
        }
    }
    check(`generated intraword rule: ${cases} cases match the oracle`, wrong.length === 0,
        `${wrong.length} wrong, first 10:\n       ` + wrong.slice(0, 10).join('\n       '));
}

// ── Part 7: every intraword identifier in the repo's markdown survives ────────
// Every token with an underscore between two letters or digits (snake_case,
// file_name.md, __init__ inside a word) that appears in a prose line of a
// .md file under docs/ or src/ must still appear, underscores and all, in the
// rendered HTML. An identifier turned into emphasis would lose an underscore.
{
    const FENCE   = /^(`{3,}|~{3,})/;
    const IDENT   = /[\p{L}\p{N}_]*[\p{L}\p{N}]_+[\p{L}\p{N}][\p{L}\p{N}_]*/gu;
    const files = [...walkFiles(path.join(ROOT, 'docs'), { extensions: ['.md'] }),
                   ...walkFiles(path.join(ROOT, 'src'),  { extensions: ['.md'] })];
    let idents = 0;
    let checkedFiles = 0;
    const lost = [];
    for (const file of files) {
        const src = readIfPresent(file);
        if (src === null) { continue; }
        checkedFiles += 1;
        const html = mdToHtml(src);
        const lines = src.split('\n').map(l => l.replace(/\r$/, ''));
        let i = 0;
        if (lines[0] !== undefined && lines[0].trim() === '---') {
            const end = lines.findIndex((l, idx) => idx > 0 && l.trim() === '---');
            if (end > 0) { i = end + 1; }
        }
        for (; i < lines.length; i++) {
            const fence = FENCE.exec(lines[i]);
            if (fence) {
                i++;
                while (i < lines.length && !lines[i].startsWith(fence[1])) { i++; }
                continue;
            }
            for (const id of lines[i].match(IDENT) || []) {
                // Underscores at the ends of a token are delimiters, not part of the identifier.
                const core = id.replace(/^_+|_+$/g, '');
                idents += 1;
                if (!html.includes(core)) {
                    lost.push(`${path.relative(ROOT, file).replace(/\\/g, '/')}:${i + 1}: ${core}`);
                }
            }
        }
    }
    console.log(`  (checked ${idents} intraword identifiers in ${checkedFiles} markdown files)`);
    check('the repo has intraword identifiers to check', idents >= 50,
        `found only ${idents}; the corpus check would be vacuous`);
    check('every intraword identifier in the repo renders with its underscores', lost.length === 0,
        `${lost.length} lost, first 25:\n       ` + lost.slice(0, 25).join('\n       '));
}

console.log('-'.repeat(64));
console.log(`REG-160: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
