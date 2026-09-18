// Copyright (c) 2026 CieloVista Software. All rights reserved.
// REG-153: Issue #756 — md-renderer deletes any paragraph that starts with bold,
// italic, a code span, # or ~
//
// Run: node tests/regression/REG-153-md-renderer-keeps-every-paragraph.test.js
//
// mdToHtml()'s paragraph collector stopped at any line starting with one of
// # > * - ` ~ (meant to stop before the next block). When the FIRST line of a
// paragraph matched, it collected nothing and skipped the line, so
// "**Note:** read this" rendered as nothing at all. A later line of a
// paragraph that started the same way ended the paragraph and was then
// dropped the same way. This has been true since the renderer was added
// (fc7f1e9, 2026-04-21).
//
// Part 1 renders a corpus of paragraphs that start with every inline construct
// and checks that every word of the input is in the output, and that a
// paragraph still stops before a real block.
//
// Part 2 renders every .md file under docs/ and src/ and checks that no
// non-blank prose line loses a word: it counts the words of the source (outside
// front matter, fenced code and comment lines) and requires each one to be
// present in the rendered HTML. Markdown syntax characters are not words, so
// only lost text can fail it.
//
// Renders through the real renderer (out-test/, built by the runners). Reads
// the repo's markdown; writes nothing.

'use strict';

const fs   = require('fs');
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

// ── Word counting ────────────────────────────────────────────────────────────

const WORD = /[\p{L}\p{N}]+/gu;

function words(text) {
    return text.match(WORD) || [];
}

function decode(v) {
    return v.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

/**
 * The words a reader can get from rendered HTML: its text plus the values of
 * href, src, alt and title (a link destination is where a URL's words go).
 * Tag and attribute names are not words. Front matter and <pre> blocks are
 * removed because Part 2 does not count their source either.
 */
function htmlWords(html) {
    const body = html
        .replace(/^<div class="fm-block">[\s\S]*?<\/div><\/div>(?=\n|$)/, ' ')
        .replace(/<pre><code[^>]*>[\s\S]*?<\/code><\/pre>/g, ' ')
        .replace(/<[^>]*>/g, tag => {
            const vals = [];
            tag.replace(/\b(?:href|src|alt|title)="([^"]*)"/g, (_, v) => { vals.push(v); return ''; });
            return ' ' + vals.join(' ') + ' ';
        });
    return words(decode(body));
}

function bagOf(list) {
    const bag = new Map();
    for (const w of list) { bag.set(w, (bag.get(w) || 0) + 1); }
    return bag;
}

/** Words of `sourceText` missing from `html`, counting repeats. */
function missingWords(sourceText, html) {
    const bag = bagOf(htmlWords(html));
    const missing = [];
    for (const w of words(sourceText)) {
        const n = bag.get(w) || 0;
        if (n > 0) { bag.set(w, n - 1); } else { missing.push(w); }
    }
    return missing;
}

console.log('REG-153: md-renderer keeps every paragraph (#756)');
console.log('-'.repeat(64));

// ── Part 1: paragraphs that start with each inline construct ─────────────────

const STARTS = [
    { name: 'bold',                   md: '**Note:** read this before you start' },
    { name: 'bold with underscores',  md: '__Warning__ this deletes nothing' },
    { name: 'italic with *',          md: '*italic* start of a sentence' },
    { name: 'italic with _',          md: '_italic_ start of a sentence' },
    { name: 'code span',              md: '`npm run compile` builds the extension' },
    { name: 'literal #word',          md: '#hashtag is not a heading' },
    // Six hashes is h6 since #773; seven is still text in CommonMark.
    { name: 'seven hashes',           md: '####### deeper than any heading level' },
    { name: 'strikethrough ~~',       md: '~~old~~ text that was replaced' },
    { name: 'single ~',               md: '~approximately ten files' },
    // ">text" is a blockquote since #773 (the space is optional); see the
    // paragraph-stop cases below. "+text" with no space is still text.
    { name: '+ with no space',        md: '+plus sign glued to a word' },
    { name: '- with no space',        md: '-flag style option text' },
    { name: '* with no space',        md: '*star without a closing mate' },
    { name: 'link',                   md: '[the guide](docs/guide.md) explains setup' },
    { name: 'image',                  md: '![logo](logo.png) sits above the title' },
    { name: 'HTML entity',            md: '&copy; 2026 CieloVista Software' },
    { name: 'number with no space',   md: '2026.The year it shipped' },
];

for (const c of STARTS) {
    const html = mdToHtml(c.md);
    const missing = missingWords(c.md, html);
    check(`paragraph starting with ${c.name} keeps every word`,
        missing.length === 0 && /^<p>[\s\S]*<\/p>$/.test(html),
        `missing ${JSON.stringify(missing)} from ${JSON.stringify(html)}`);
}

// The issue's exact examples, with their exact HTML.
{
    const cases = [
        ['**Note:** read this', '<p><strong>Note:</strong> read this</p>'],
        ['*italic* start',      '<p><em>italic</em> start</p>'],
        ['#hashtag',            '<p>#hashtag</p>'],
        ['~~old~~ text',        '<p><del>old</del> text</p>'],
        ['`code` first',        '<p><code>code</code> first</p>'],
    ];
    for (const [md, want] of cases) {
        const got = mdToHtml(md);
        check(`${md} renders as ${want}`, got === want, `got ${JSON.stringify(got)}`);
    }
}

// Multi-line paragraphs: a later line that starts with inline markup is part
// of the same paragraph, not a new one and not dropped.
{
    const md = 'First line is plain\n**Second** line starts bold\n*third* line starts italic\n`fourth` starts with code\n#fifth starts with a hash';
    const html = mdToHtml(md);
    check('multi-line paragraph keeps every line',
        missingWords(md, html).length === 0, `missing ${JSON.stringify(missingWords(md, html))} from ${html}`);
    check('multi-line paragraph is one <p> with one <br> per line break',
        (html.match(/<p>/g) || []).length === 1 && (html.match(/<br>/g) || []).length === 4, `got ${html}`);

    const md2 = '**Bold first line**\nplain second line\n~~struck~~ third line';
    const html2 = mdToHtml(md2);
    check('multi-line paragraph whose first line is bold keeps every line',
        missingWords(md2, html2).length === 0 && (html2.match(/<p>/g) || []).length === 1,
        `missing ${JSON.stringify(missingWords(md2, html2))} from ${html2}`);

    const md3 = '**One** paragraph\n\n*Two* paragraphs\n\n`Three` paragraphs';
    const html3 = mdToHtml(md3);
    check('three paragraphs separated by blank lines are three <p>',
        (html3.match(/<p>/g) || []).length === 3 && missingWords(md3, html3).length === 0, `got ${html3}`);
}

// A paragraph still ends where a real block starts.
{
    const blocks = [
        { name: 'bullet list',   next: '- item one',        want: /<p><strong>Note:<\/strong> text<\/p>\n<ul><li>item one<\/li><\/ul>/ },
        { name: 'star list',     next: '* item one',        want: /<p><strong>Note:<\/strong> text<\/p>\n<ul><li>item one<\/li><\/ul>/ },
        { name: 'plus list (#773)', next: '+ item one',     want: /<p><strong>Note:<\/strong> text<\/p>\n<ul><li>item one<\/li><\/ul>/ },
        { name: 'list numbered from 3 (#773)', next: '3. item three', want: /<p><strong>Note:<\/strong> text<\/p>\n<ol start="3"><li>item three<\/li><\/ol>/ },
        { name: 'h5 heading (#773)', next: '##### Deep',    want: /<p><strong>Note:<\/strong> text<\/p>\n<h5 id="deep">Deep<\/h5>/ },
        { name: 'h6 heading (#773)', next: '###### Deeper', want: /<p><strong>Note:<\/strong> text<\/p>\n<h6 id="deeper">Deeper<\/h6>/ },
        { name: 'blockquote with no space (#773)', next: '>quoted words', want: /<p><strong>Note:<\/strong> text<\/p>\n<blockquote>quoted words<\/blockquote>/ },
        { name: 'lone > line (#773)', next: '>',            want: /<p><strong>Note:<\/strong> text<\/p>\n<blockquote><\/blockquote>/ },
        { name: 'numbered list', next: '1. item one',       want: /<p><strong>Note:<\/strong> text<\/p>\n<ol><li>item one<\/li><\/ol>/ },
        { name: 'heading',       next: '## Next section',   want: /<p><strong>Note:<\/strong> text<\/p>\n<h2 id="next-section">Next section<\/h2>/ },
        { name: 'blockquote',    next: '> quoted words',    want: /<p><strong>Note:<\/strong> text<\/p>\n<blockquote>quoted words<\/blockquote>/ },
        { name: 'rule',          next: '---',               want: /<p><strong>Note:<\/strong> text<\/p>\n<hr>/ },
        { name: 'fence',         next: '~~~\ncode here\n~~~', want: /<p><strong>Note:<\/strong> text<\/p>\n<pre><code>/ },
        { name: 'table',         next: '| a | b |\n|---|---|\n| 1 | 2 |', want: /<p><strong>Note:<\/strong> text<\/p>\n<table>/ },
    ];
    for (const b of blocks) {
        const html = mdToHtml('**Note:** text\n' + b.next);
        check(`a paragraph stops before a ${b.name}`, b.want.test(html), `got ${JSON.stringify(html)}`);
    }
}

// ── Part 2: every markdown document in the repo ──────────────────────────────

// Which lines are fenced code is the shared CommonMark rule (#799); REG-172
// checks that rule against markdown-it over this same corpus.
let fencedLineMask;
try {
    ({ fencedLineMask } = require(path.join(ROOT, 'out-test', 'shared', 'md-fence.js')));
} catch (err) {
    console.error(`FAIL: cannot load the fence scanner: ${err.message}`);
    process.exit(1);
}
const COMMENT = /^\s*<!--[\s\S]*?-->\s*$/;

/**
 * The prose lines of a markdown source: every non-blank line outside front
 * matter, fenced code and whole-line HTML comments (which the renderer hides
 * by design). Returns [{ n, text }] with 1-based line numbers.
 */
function proseLines(src) {
    const lines = src.split('\n').map(l => l.replace(/\r$/, ''));
    const out = [];
    let start = 0;
    if (lines[0] !== undefined && lines[0].trim() === '---') {
        const end = lines.findIndex((l, idx) => idx > 0 && l.trim() === '---');
        if (end > 0) { start = end + 1; }
    }
    const fenced = [...new Array(start).fill(false), ...fencedLineMask(lines.slice(start))];
    for (let i = start; i < lines.length; i++) {
        const line = lines[i];
        if (fenced[i]) { continue; }
        if (COMMENT.test(line) || line.trim() === '') { continue; }
        // A numbered list's "1." is list syntax; the renderer emits it as <ol>.
        out.push({ n: i + 1, text: line.replace(/^\d+\. /, '') });
    }
    return out;
}

{
    const files = [...walkFiles(path.join(ROOT, 'docs'), { extensions: ['.md'] }),
                   ...walkFiles(path.join(ROOT, 'src'),  { extensions: ['.md'] })];
    let checkedFiles = 0;
    let checkedLines = 0;
    const lost = [];
    for (const file of files) {
        const src = readIfPresent(file);
        if (src === null) { continue; }
        checkedFiles += 1;
        const bag = bagOf(htmlWords(mdToHtml(src)));
        for (const { n, text } of proseLines(src)) {
            checkedLines += 1;
            const missing = [];
            for (const w of words(text)) {
                const k = bag.get(w) || 0;
                if (k > 0) { bag.set(w, k - 1); } else { missing.push(w); }
            }
            if (missing.length > 0) {
                lost.push(`${path.relative(ROOT, file).replace(/\\/g, '/')}:${n}: ${text.slice(0, 80)}  (missing: ${missing.slice(0, 6).join(' ')})`);
            }
        }
    }
    console.log(`  (checked ${checkedLines} prose lines in ${checkedFiles} markdown files)`);
    check('the repo has markdown to check (docs/ and src/)', checkedFiles >= 20,
        `found only ${checkedFiles} .md files; the corpus check would be vacuous`);
    const lostFiles = new Set(lost.map(l => l.split(':')[0]));
    check('no prose line of any repo document loses a word when rendered', lost.length === 0,
        `${lost.length} line(s) in ${lostFiles.size} file(s) lost words, first 25:\n       ` + lost.slice(0, 25).join('\n       '));
}

console.log('-'.repeat(64));
console.log(`REG-153: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
