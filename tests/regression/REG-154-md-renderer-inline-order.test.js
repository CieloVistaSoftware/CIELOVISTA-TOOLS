// Copyright (c) 2026 CieloVista Software. All rights reserved.
// REG-154: Issue #754 — md-renderer: emphasis runs before links, so * in a URL,
// links in code spans and alt text get mangled
//
// Run: node tests/regression/REG-154-md-renderer-inline-order.test.js
//
// inlineMarkdown() applied bold, italic, code and strikethrough to the whole
// line before it parsed links and images. So a * in a link destination became
// <em> inside the href, [a](b) inside a code span became a link, and an
// image's alt text kept <strong> tags. CommonMark precedence is: code spans
// first, then links and images, then emphasis.
//
// Renders through the real renderer (out-test/, built by the runners) and
// parses the emitted attributes. Reads nothing from, and writes nothing to,
// the repo tree.

'use strict';

const path = require('path');

const outFile = path.join(__dirname, '..', '..', 'out-test', 'shared', 'md-renderer.js');
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

/** Render one line of markdown and return the inner HTML of its paragraph. */
function render(md) {
    const html = mdToHtml(md);
    const m = /^<p>([\s\S]*)<\/p>$/.exec(html);
    return m ? m[1] : html;
}

/** Attributes of the first <tag ...>, tokenized so a broken quote shows up. */
function attrsOf(html, tag) {
    const start = html.indexOf('<' + tag + ' ');
    if (start < 0) { return undefined; }
    const attrs = {};
    let i = start + tag.length + 2;
    while (i < html.length && html[i] !== '>') {
        if (html[i] === ' ') { i++; continue; }
        const nameMatch = /^[^\s=>]+/.exec(html.slice(i));
        if (!nameMatch) { return { __malformed: html.slice(i) }; }
        const name = nameMatch[0];
        i += name.length;
        if (html[i] !== '=') { attrs[name] = ''; continue; }
        i++;
        if (html[i] !== '"') { return { __malformed: html.slice(i) }; }
        const close = html.indexOf('"', i + 1);
        if (close < 0) { return { __malformed: html.slice(i) }; }
        attrs[name] = decode(html.slice(i + 1, close));
        i = close + 1;
    }
    return attrs;
}

function decode(v) {
    return v.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function sameAttrs(actual, expected) {
    if (!actual) { return false; }
    const a = Object.keys(actual).sort();
    const e = Object.keys(expected).sort();
    return a.length === e.length && a.every((k, n) => k === e[n] && actual[k] === expected[k]);
}

console.log('REG-154: md-renderer inline order (#754)');
console.log('-'.repeat(64));

// ── 1. * and ** inside link and image targets stay literal ───────────────────
{
    const cases = [
        { md: '[a](x*y*z.md)',                 tag: 'a',   want: { href: 'x*y*z.md' } },
        { md: '[a](x**y**z.md)',               tag: 'a',   want: { href: 'x**y**z.md' } },
        { md: '[a](x*y*z.md "t*i*t")',         tag: 'a',   want: { href: 'x*y*z.md', title: 't*i*t' } },
        { md: '[a](x.md "**bold** title")',    tag: 'a',   want: { href: 'x.md', title: '**bold** title' } },
        { md: '[a](x~~y~~z.md)',               tag: 'a',   want: { href: 'x~~y~~z.md' } },
        { md: '![a](p*q*.png)',                tag: 'img', want: { alt: 'a', src: 'p*q*.png' } },
        { md: '![a](p.png "*t*")',             tag: 'img', want: { alt: 'a', src: 'p.png', title: '*t*' } },
        { md: 'see [one](a*b.md) and [two](c*d.md)', tag: 'a', want: { href: 'a*b.md' } },
    ];
    for (const c of cases) {
        const html = render(c.md);
        check(`emphasis does not reach the target: ${c.md}`,
            sameAttrs(attrsOf(html, c.tag), c.want) && !/<(em|strong|del)>/.test(html),
            `expected ${JSON.stringify(c.want)} and no emphasis tags, got ${html}`);
    }
    const two = render('see [one](a*b.md) and [two](c*d.md)');
    check('two links with * in their targets both keep them',
        two === 'see <a href="a*b.md">one</a> and <a href="c*d.md">two</a>', `got ${two}`);
}

// ── 2. Code spans are opaque: no links, images or emphasis inside ────────────
{
    const cases = [
        { md: `${BT}[a](b)${BT}`,                want: '<code>[a](b)</code>' },
        { md: `${BT}![i](x.png)${BT}`,           want: '<code>![i](x.png)</code>' },
        { md: `${BT}**not bold**${BT}`,          want: '<code>**not bold**</code>' },
        { md: `${BT}~~not struck~~${BT}`,        want: '<code>~~not struck~~</code>' },
        { md: `${BT}a*b${BT} and ${BT}c*d${BT}`, want: '<code>a*b</code> and <code>c*d</code>' },
        { md: `run ${BT}[x](javascript:alert(1))${BT} never`, want: '<code>[x](javascript:alert(1))</code>' },
    ];
    for (const c of cases) {
        const html = render(c.md);
        check(`code span stays literal: ${c.md}`,
            html.includes(c.want) && !/<a |<img |<em>|<strong>|<del>/.test(html), `got ${html}`);
    }
}

// ── 3. Image alt text is plain text ──────────────────────────────────────────
{
    const cases = [
        { md: '![**b**](x.png)',                      alt: 'b' },
        { md: '![*i* and ~~d~~](x.png)',              alt: 'i and d' },
        { md: `![the ${BT}cvs.run${BT} command](x.png)`, alt: 'the cvs.run command' },
        { md: '![say "hi"](x.png)',                   alt: 'say "hi"' },
    ];
    for (const c of cases) {
        const html = render(c.md);
        check(`alt text is plain: ${c.md}`,
            sameAttrs(attrsOf(html, 'img'), { alt: c.alt, src: 'x.png' }) && !/alt="[^"]*</.test(html),
            `expected alt ${JSON.stringify(c.alt)}, got ${html}`);
    }
}

// ── 4. What must keep working ────────────────────────────────────────────────
{
    const cases = [
        ['*em* and **strong** and ~~del~~',  '<em>em</em> and <strong>strong</strong> and <del>del</del>'],
        ['**[bold link](x.md)**',            '<strong><a href="x.md">bold link</a></strong>'],
        ['[**bold** text](x.md)',            '<a href="x.md"><strong>bold</strong> text</a>'],
        [`[${BT}code${BT} link](x.md)`,      '<a href="x.md"><code>code</code> link</a>'],
        ['*see [the guide](g.md)*',          '<em>see <a href="g.md">the guide</a></em>'],
        ['[![build](badge.svg "Build")](https://ci.example/run "CI")',
         '<a href="https://ci.example/run" title="CI"><img alt="build" src="badge.svg" title="Build"></a>'],
        ['[![**b**](b.svg)](u.md)',          '<a href="u.md"><img alt="b" src="b.svg"></a>'],
        ['![a](x.png)',                      '<img alt="a" src="x.png">'],
        ['[q](page?a=1&b=2)',                '<a href="page?a=1&amp;b=2">q</a>'],
        ['a < b & c > d',                    'a &lt; b &amp; c &gt; d'],
    ];
    for (const [md, want] of cases) {
        const html = render(md);
        check(`still renders: ${md}`, html === want, `expected ${want}\n       got      ${html}`);
    }
    const h = mdToHtml('## A *heading* with [a link](x*y.md)');
    check('headings get the same order',
        h === '<h2 id="a-heading-with-a-link">A <em>heading</em> with <a href="x*y.md">a link</a></h2>', `got ${h}`);
    const cell = mdToHtml(`| a | b |\n|---|---|\n| [l](x*y.md) | ${BT}[c](d)${BT} |`);
    check('table cells get the same order',
        cell.includes('<td><a href="x*y.md">l</a></td><td><code>[c](d)</code></td>'), `got ${cell}`);
}

// ── 5. Attributes stay safe (#757) ───────────────────────────────────────────
{
    // A code span or an image inside a target must not put rendered HTML in an attribute.
    const cases = [
        `[a](${BT}"onmouseover=alert(1)${BT})`,
        `[a](x.md "${BT}" onmouseover="alert(1)${BT}")`,
        '[a](![x](y" onerror="alert(1)))',
        `![a](${BT}"onerror=alert(1)${BT})`,
    ];
    for (const md of cases) {
        const html = render(md);
        const tag = md.startsWith('!') ? 'img' : 'a';
        const attrs = attrsOf(html, tag);
        const allowed = tag === 'img' ? ['alt', 'src', 'title'] : ['href', 'title'];
        check(`markup inside a target cannot add an attribute: ${md}`,
            !!attrs && Object.keys(attrs).every(k => allowed.includes(k)) &&
            !Object.values(attrs).some(v => /<(code|img|a|em|strong)\b/.test(v)),
            `got ${JSON.stringify(attrs)} from ${html}`);
    }
    for (const md of ['**[x](javascript:alert(1))**', '[*x*](JaVaScRiPt:alert(1) "t")', '*[x](vbscript:msgbox(1))*',
                      '[x](data:text/html,<script>alert(1)</script>)']) {
        const attrs = attrsOf(render(md), 'a');
        const href = attrs && attrs.href ? attrs.href.replace(/\s/g, '').toLowerCase() : '';
        check(`script URL is still neutralised: ${md}`,
            !!attrs && !/^(javascript|vbscript|data):/.test(href), `got ${JSON.stringify(attrs)}`);
    }
    // The renderer's private placeholder characters in the text itself.
    const pua = String.fromCharCode(0xE000) + '0' + String.fromCharCode(0xE001);
    const html = render(`x ${pua} ${BT}c${BT}`);
    const shown = html.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
    check('placeholder characters in the text cannot pull in another span',
        (html.match(/<code>/g) || []).length === 1 && shown === `x ${pua} <code>c</code>`, `got ${JSON.stringify(html)}`);
}

console.log('-'.repeat(64));
console.log(`REG-154: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
