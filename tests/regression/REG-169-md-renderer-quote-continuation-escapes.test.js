// Copyright (c) 2026 CieloVista Software. All rights reserved.
// REG-169: Issue #785 — md-renderer: lazy blockquote continuation, blocks
// inside quotes and backslash escapes are not CommonMark
//
// Run: node tests/regression/REG-169-md-renderer-quote-continuation-escapes.test.js
//
// Three CommonMark behaviours mdToHtml() was missing:
//
// 1. Lazy continuation. A plain line right after quoted paragraph text
//    continues that paragraph inside the quote ("> a" then "b" is one quote).
//    The renderer ended the quote and started a new paragraph.
// 2. Blocks inside a quote. Quote content was rendered inline only, so
//    "> - item", "> ## heading", a fence or "> > x" inside a quote were
//    literal text. The quote's inside is now rendered by the same block
//    renderer, so every block rule applies there.
// 3. Backslash escapes. A backslash before any ASCII punctuation character
//    makes that character literal: it is shown without the backslash and
//    starts no syntax. Only \_ was half-handled (not emphasis, backslash
//    still shown). Escapes do nothing inside code spans and fences.
//
// Renders through the real renderer (out-test/, built by the runners) and
// asserts exact HTML. Writes nothing.

'use strict';

const path = require('path');

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

const BT    = String.fromCharCode(96); // a backtick
const BS    = String.fromCharCode(92); // a backslash
const FENCE = BT.repeat(3);

/** Assert that `md` renders to exactly `want`. */
function exact(name, md, want) {
    const got = mdToHtml(md);
    check(`${name}: ${JSON.stringify(md)}`, got === want,
        `want ${JSON.stringify(want)}\n       got  ${JSON.stringify(got)}`);
}

function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

console.log('REG-169: md-renderer lazy quote continuation, blocks inside quotes, backslash escapes (#785)');
console.log('-'.repeat(64));

// ── Part 1: lazy continuation ────────────────────────────────────────────────
exact('a plain line continues the quote', '> a\nb', '<blockquote>a<br>b</blockquote>');
exact('several lazy lines', '> a\nb\nc', '<blockquote>a<br>b<br>c</blockquote>');
exact('lazy line after two quoted lines', '> a\n> b\nc', '<blockquote>a<br>b<br>c</blockquote>');
exact('quoted, lazy, quoted again is one quote', '> a\nb\n> c', '<blockquote>a<br>b<br>c</blockquote>');
exact('lazy line keeps its inline markup', '> **a**\n*b* and ' + BT + 'c' + BT,
    '<blockquote><strong>a</strong><br><em>b</em> and <code>c</code></blockquote>');
exact('lazy line is escaped', '> a\n<b>&', '<blockquote>a<br>&lt;b&gt;&amp;</blockquote>');
exact('lazy continuation of a nested quote', '> > a\nb', '<blockquote><blockquote>a<br>b</blockquote></blockquote>');
exact('lazy continuation after a paragraph and a quote', 'x\n\n> a\nb', '<p>x</p>\n<blockquote>a<br>b</blockquote>');
exact('lazy line inside the second paragraph of a quote', '> a\n>\n> b\nc', '<blockquote><p>a</p><p>b<br>c</p></blockquote>');
// Not lazy: a blank line, a line that starts a block, or no open paragraph.
exact('a blank line ends the quote', '> a\n\nb', '<blockquote>a</blockquote>\n<p>b</p>');
exact('a lone > closes the paragraph, so the next line is not lazy', '> a\n>\nb', '<blockquote>a</blockquote>\n<p>b</p>');
exact('a list line ends the quote', '> a\n- item', '<blockquote>a</blockquote>\n<ul><li>item</li></ul>');
exact('a heading line ends the quote', '> a\n# H', '<blockquote>a</blockquote>\n<h1 id="h">H</h1>');
exact('a rule line ends the quote', '> a\n---', '<blockquote>a</blockquote>\n<hr>');
exact('a fence line ends the quote', '> a\n' + FENCE + 'text\nx\n' + FENCE,
    '<blockquote>a</blockquote>\n<pre><code class="language-text">x</code></pre>');
exact('after a heading in a quote there is no paragraph to continue', '> # H\nb',
    '<blockquote><h1 id="h">H</h1></blockquote>\n<p>b</p>');
exact('after a rule in a quote there is no paragraph to continue', '> ---\nb', '<blockquote><hr></blockquote>\n<p>b</p>');
exact('a line after an open fence in a quote is not lazy', '> ' + FENCE + 'text\n> code\nb',
    '<blockquote><pre><code class="language-text">code</code></pre></blockquote>\n<p>b</p>');
// The renderer's list items take no continuation lines ("- a" then "b" is a
// list and a paragraph), and a list inside a quote behaves the same way.
exact('a list item in a quote takes no lazy line, as outside a quote', '> - a\nb',
    '<blockquote><ul><li>a</li></ul></blockquote>\n<p>b</p>');

// ── Part 2: blocks inside a quote ────────────────────────────────────────────
exact('bullet list in a quote', '> - one\n> - two', '<blockquote><ul><li>one</li><li>two</li></ul></blockquote>');
exact('+ and * bullets in a quote', '> + one\n> * two', '<blockquote><ul><li>one</li><li>two</li></ul></blockquote>');
exact('ordered list in a quote keeps its start', '> 3. step\n> 4. next', '<blockquote><ol start="3"><li>step</li><li>next</li></ol></blockquote>');
exact('text then a list in a quote', '> Steps:\n> 1. one\n> 2. two',
    '<blockquote><p>Steps:</p><ol><li>one</li><li>two</li></ol></blockquote>');
exact('heading in a quote', '> ## Heading', '<blockquote><h2 id="heading">Heading</h2></blockquote>');
exact('heading and text in a quote', '> ### Note\n> read this',
    '<blockquote><h3 id="note">Note</h3><p>read this</p></blockquote>');
exact('heading ids stay unique across quotes', '## Same\n> ## Same\n\n> ## Same',
    '<h2 id="same">Same</h2>\n<blockquote><h2 id="same-1">Same</h2></blockquote>\n<blockquote><h2 id="same-2">Same</h2></blockquote>');
exact('fence in a quote', '> ' + FENCE + 'text\n> a *b* <c>\n> ' + FENCE,
    '<blockquote><pre><code class="language-text">a *b* &lt;c&gt;</code></pre></blockquote>');
exact('fence in a quote keeps > lines of code as code', '> ' + FENCE + 'text\n> > not a quote\n> ' + FENCE,
    '<blockquote><pre><code class="language-text">&gt; not a quote</code></pre></blockquote>');
exact('text, fence, text in a quote', '> before\n> ' + FENCE + 'text\n> x\n> ' + FENCE + '\n> after',
    '<blockquote><p>before</p><pre><code class="language-text">x</code></pre><p>after</p></blockquote>');
exact('rule in a quote', '> ---', '<blockquote><hr></blockquote>');
exact('table in a quote', '> | h |\n> |---|\n> | c |',
    '<blockquote><table><thead><tr><th>h</th></tr></thead><tbody><tr><td>c</td></tr></tbody></table></blockquote>');
exact('nested quote', '> > x', '<blockquote><blockquote>x</blockquote></blockquote>');
exact('nested quote with no spaces', '>>x', '<blockquote><blockquote>x</blockquote></blockquote>');
exact('three levels', '> > > deep', '<blockquote><blockquote><blockquote>deep</blockquote></blockquote></blockquote>');
exact('text then a nested quote', '> a\n> > b', '<blockquote><p>a</p><blockquote>b</blockquote></blockquote>');
exact('nested quote then text', '> > a\n>\n> b', '<blockquote><blockquote>a</blockquote><p>b</p></blockquote>');
exact('nested quote paragraphs', '> > a\n> >\n> > b', '<blockquote><blockquote><p>a</p><p>b</p></blockquote></blockquote>');
exact('list in a nested quote', '> > - x', '<blockquote><blockquote><ul><li>x</li></ul></blockquote></blockquote>');
exact('comment line in a quote is hidden', '> <!-- note -->\n> text', '<blockquote>text</blockquote>');
// Protections from #757 / #773 still hold inside a quote's blocks.
exact('script link in a quoted list item is neutralised', '> - [x](javascript:alert(1))',
    '<blockquote><ul><li><a href="#">x</a></li></ul></blockquote>');
exact('data: link in a quoted heading is neutralised', '> # [x](data:text/html,y)',
    '<blockquote><h1 id="x"><a href="#">x</a></h1></blockquote>');
exact('HTML in a quoted list item is escaped', '> - <script>x</script>',
    '<blockquote><ul><li>&lt;script&gt;x&lt;/script&gt;</li></ul></blockquote>');
exact('snake_case in a quoted list item', '> - my_file_name.md', '<blockquote><ul><li>my_file_name.md</li></ul></blockquote>');

// ── Part 3: backslash escapes ────────────────────────────────────────────────
exact('escaped * is not emphasis', BS + '*not em' + BS + '*', '<p>*not em*</p>');
exact('escaped ** is not strong', BS + '*' + BS + '*not strong' + BS + '*' + BS + '*', '<p>**not strong**</p>');
exact('one escaped * leaves no pair', BS + '*a*', '<p>*a*</p>');
exact('escaped _ is not emphasis and loses its backslash', BS + '_a' + BS + '_', '<p>_a_</p>');
exact('escaped __ around a word', BS + '_' + BS + '_init' + BS + '_' + BS + '_', '<p>__init__</p>');
exact('escaped ~~ is not struck', BS + '~~a~~', '<p>~~a~~</p>');
exact('escaped # is not a heading', BS + '# not a heading', '<p># not a heading</p>');
exact('escaped ## is not a heading', BS + '## x', '<p>## x</p>');
exact('escaped - is not a list', BS + '- not a list', '<p>- not a list</p>');
exact('escaped + is not a list', BS + '+ not a list', '<p>+ not a list</p>');
exact('escaped . is not a numbered list', '1' + BS + '. not a list', '<p>1. not a list</p>');
exact('escaped > is not a quote', BS + '> not a quote', '<p>&gt; not a quote</p>');
exact('escaped --- is not a rule', BS + '---', '<p>---</p>');
exact('escaped [ is not a link', BS + '[not a link](u)', '<p>[not a link](u)</p>');
exact('escaped ! and [ is not an image', '!' + BS + '[not an image](i.png)', '<p>![not an image](i.png)</p>');
exact('escaped ] inside link text', '[a' + BS + ']b](u)', '<p><a href="u">a]b</a></p>');
exact('escaped backtick is not a code span', BS + BT + 'not code' + BS + BT, '<p>' + BT + 'not code' + BT + '</p>');
exact('escaped backtick then a real code span', BS + BT + ' and ' + BT + 'c' + BT, '<p>' + BT + ' and <code>c</code></p>');
exact('escaped < and > are text', BS + '<b' + BS + '>', '<p>&lt;b&gt;</p>');
exact('escaped & is text', BS + '&copy;', '<p>&amp;copy;</p>');
exact('escaped backslash', BS + BS, '<p>' + BS + '</p>');
exact('escaped backslash leaves the next * live', BS + BS + '*a*', '<p>' + BS + '<em>a</em></p>');
exact('escapes in a heading', '## a ' + BS + '*b' + BS + '*', '<h2 id="a-b">a *b*</h2>');
exact('escapes in a list item', '- ' + BS + '*x' + BS + '*', '<ul><li>*x*</li></ul>');
exact('escape in a quote', '> ' + BS + '- not a list', '<blockquote>- not a list</blockquote>');
exact('escapes in a table cell', '| ' + BS + '*h' + BS + '* |\n|---|\n| ' + BS + '_c' + BS + '_ |',
    '<table><thead><tr><th>*h*</th></tr></thead><tbody><tr><td>_c_</td></tr></tbody></table>');
exact('escaped pipe in a table cell', '| a ' + BS + '| b |\n|---|\n| ' + BT + 'c ' + BS + '| d' + BT + ' |',
    '<table><thead><tr><th>a | b</th></tr></thead><tbody><tr><td><code>c | d</code></td></tr></tbody></table>');
// A backslash before anything that is not ASCII punctuation stays.
exact('backslash before a letter stays', 'C:' + BS + 'Users' + BS + 'x', '<p>C:' + BS + 'Users' + BS + 'x</p>');
exact('backslash before a space stays', 'a ' + BS + ' b', '<p>a ' + BS + ' b</p>');
exact('trailing backslash stays', 'a' + BS, '<p>a' + BS + '</p>');
exact('backslash before a non-ASCII symbol stays', BS + '§ ' + BS + '→', '<p>' + BS + '§ ' + BS + '→</p>');
// Links, titles and images.
exact('escape in a link destination', '[x](a' + BS + '_b)', '<p><a href="a_b">x</a></p>');
exact('escaped parentheses in a destination', '[x](a' + BS + '(b)', '<p><a href="a(b">x</a></p>');
exact('escaped quotes in a title', '[x](u "a ' + BS + '"b' + BS + '"")', '<p><a href="u" title="a &quot;b&quot;">x</a></p>');
exact('escape cannot hide a script scheme', '[x](javascript' + BS + ':alert(1))', '<p><a href="#">x</a></p>');
exact('escape cannot hide a data: link', '[x](data' + BS + ':text/html,y)', '<p><a href="#">x</a></p>');
exact('escaped * in link text', '[a' + BS + '*b' + BS + '*](u)', '<p><a href="u">a*b*</a></p>');
exact('escaped * in image alt text', '![a' + BS + '*b' + BS + '*](i.png)', '<p><img alt="a*b*" src="i.png"></p>');
exact('escaped " in image alt text is an attribute-safe quote', '![a' + BS + '"b](i.png)', '<p><img alt="a&quot;b" src="i.png"></p>');
exact('escaped < in a title is attribute-escaped', '[x](u "' + BS + '<t")', '<p><a href="u" title="&lt;t">x</a></p>');
// Escapes do nothing inside code.
exact('escapes inside a code span stay', BT + BS + '*a' + BS + '* ' + BS + '#' + BT, '<p><code>' + BS + '*a' + BS + '* ' + BS + '#</code></p>');
exact('a backslash cannot escape the closing backtick', BT + 'a' + BS + BT, '<p><code>a' + BS + '</code></p>');
exact('escapes inside a fence stay', FENCE + 'text\n' + BS + '*x' + BS + '* ' + BS + '# ' + BS + '[y](z)\n' + FENCE,
    '<pre><code class="language-text">' + BS + '*x' + BS + '* ' + BS + '# ' + BS + '[y](z)</code></pre>');
exact('escapes inside a fence in a quote stay', '> ' + FENCE + 'text\n> ' + BS + '*x' + BS + '*\n> ' + FENCE,
    '<blockquote><pre><code class="language-text">' + BS + '*x' + BS + '*</code></pre></blockquote>');

// Every ASCII punctuation character, generated: an escape renders the
// character alone, in the middle of a sentence and at the start of a line.
// Every letter, digit and space: the backslash stays.
{
    const wrong = [];
    let cases = 0;
    for (let c = 33; c < 127; c++) {
        const ch = String.fromCharCode(c);
        const punct = /[!-/:-@[-`{-~]/.test(ch);
        for (const [md, want] of [
            [BS + ch,               '<p>' + esc(punct ? ch : BS + ch) + '</p>'],
            ['a ' + BS + ch + ' b', '<p>a ' + esc(punct ? ch : BS + ch) + ' b</p>'],
        ]) {
            cases += 1;
            const got = mdToHtml(md);
            if (got !== want) { wrong.push(`${JSON.stringify(md)} want ${JSON.stringify(want)} got ${JSON.stringify(got)}`); }
        }
    }
    check(`generated escapes: ${cases} cases match the oracle`, wrong.length === 0,
        `${wrong.length} wrong, first 10:\n       ` + wrong.slice(0, 10).join('\n       '));
}

console.log('-'.repeat(64));
console.log(`REG-169: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
