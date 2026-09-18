// Copyright (c) CieloVista Software. All rights reserved.
// REG-148: Issue #740 — md-renderer: an image or link with a title renders a broken src
//
// Run: node tests/regression/REG-148-md-renderer-link-titles.test.js
//
// ![a](x.png "My title") used to render <img alt="a" src="x.png "My title"">:
// the renderer took everything inside the parentheses as the destination and
// did not escape quotes, so the image was broken and a quote could end the
// attribute early. CommonMark allows a title in "double", 'single' or
// (parenthesized) form after the destination, and a destination wrapped in
// <angle brackets> may contain spaces.
//
// This test renders markdown through the real renderer (out-test/, built by the
// runners) and checks images and links for every title form, an angle-bracket
// destination, the untitled case, and a title that tries to break out of its
// attribute. It reads nothing from, and writes nothing to, the repo tree.

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

/** Render one line of markdown and return the inner HTML of its paragraph. */
function render(md) {
    const html = mdToHtml(md);
    const m = /<p>([\s\S]*)<\/p>/.exec(html);
    return m ? m[1] : html;
}

/**
 * Parse the attributes of the first <tag ...> in html with an HTML-like
 * tokenizer, so a quote that ends an attribute early shows up as a wrong or
 * extra attribute rather than slipping past a substring check.
 */
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

console.log('REG-148: md-renderer link and image titles (#740)');
console.log('-'.repeat(64));

const CASES = [
    { name: 'double-quoted title',  target: 'x.png "My title"',   dest: 'x.png',       title: 'My title' },
    { name: 'single-quoted title',  target: "x.png 'My title'",   dest: 'x.png',       title: 'My title' },
    { name: 'parenthesized title',  target: 'x.png (My title)',   dest: 'x.png',       title: 'My title' },
    { name: 'angle-bracket destination with a space', target: '<my file.png> "T"', dest: 'my file.png', title: 'T' },
    { name: 'angle-bracket destination, no title',    target: '<my file.png>',     dest: 'my file.png' },
    { name: 'title containing a double quote', target: 'x.png "say \\"hi\\" onerror=alert(1) x"', dest: 'x.png', title: 'say "hi" onerror=alert(1) x' },
    { name: "single-quoted title containing a double quote", target: "x.png 'a\" onerror=\"alert(1)'", dest: 'x.png', title: 'a" onerror="alert(1)' },
];

for (const c of CASES) {
    const img = render(`![a](${c.target})`);
    const imgWant = { alt: 'a', src: c.dest };
    if (c.title !== undefined) { imgWant.title = c.title; }
    check(`image, ${c.name}`, sameAttrs(attrsOf(img, 'img'), imgWant),
        `expected attributes ${JSON.stringify(imgWant)}, got ${JSON.stringify(attrsOf(img, 'img'))} from ${img}`);

    const dest = c.dest.replace('.png', '.md');
    const link = render(`[text](${c.target.replace('.png', '.md')})`);
    const linkWant = { href: dest };
    if (c.title !== undefined) { linkWant.title = c.title; }
    check(`link, ${c.name}`, sameAttrs(attrsOf(link, 'a'), linkWant) && /<a [^>]*>text<\/a>$/.test(link),
        `expected attributes ${JSON.stringify(linkWant)} and text "text", got ${JSON.stringify(attrsOf(link, 'a'))} from ${link}`);
}

// No title: output is exactly what the renderer has always produced.
{
    const img = render('![a](x.png)');
    check('image, no title: output unchanged', img === '<img alt="a" src="x.png">', `got ${img}`);
    const link = render('[text](docs/x.md)');
    check('link, no title: output unchanged', link === '<a href="docs/x.md">text</a>', `got ${link}`);
    const amp = render('[q](page?a=1&b=2)');
    check('link with & in the destination is escaped once', amp === '<a href="page?a=1&amp;b=2">q</a>', `got ${amp}`);
}

// A destination that tries to close its own attribute.
{
    const link = render('[x](a"onmouseover="alert(1))');
    const attrs = attrsOf(link, 'a');
    check('a quote in a destination cannot add an attribute',
        !!attrs && Object.keys(attrs).join() === 'href' && attrs.href.startsWith('a"onmouseover='),
        `got ${JSON.stringify(attrs)} from ${link}`);
}

// Script URLs. Before #740, [x](javascript:alert(1)) rendered the broken href
// "javascript:alert(1" (the first ")" ended it). Balanced parentheses would make
// that href complete and runnable, so script schemes must not reach an href.
{
    for (const md of ['[x](javascript:alert(1))', '[x](JaVaScRiPt:alert(1) "t")', '[x](<java script:alert(1)>)',
                      '[x](vbscript:msgbox(1))', '[x](data:text/html,<script>alert(1)</script>)']) {
        const attrs = attrsOf(render(md), 'a');
        const href = attrs && attrs.href ? attrs.href.replace(/\s/g, '').toLowerCase() : '';
        check(`script URL is not emitted as an href: ${md}`,
            !!attrs && !/^(javascript|vbscript|data):/.test(href), `got ${JSON.stringify(attrs)}`);
    }
    const img = attrsOf(render('![d](data:image/png;base64,AAAA)'), 'img');
    check('an image may still be a data: URL', !!img && img.src === 'data:image/png;base64,AAAA', `got ${JSON.stringify(img)}`);
}

// A title with < > & is escaped, not emitted as markup.
{
    const img = render('![a](x.png "<b>&</b>")');
    check('title with < > & is escaped inside the attribute',
        img === '<img alt="a" src="x.png" title="&lt;b&gt;&amp;&lt;/b&gt;">', `got ${img}`);
}

// Badges: a titled image inside a link still becomes a linked image.
{
    const html = render('[![build](badge.svg "Build")](https://ci.example/run "CI")');
    check('titled image inside a titled link',
        html === '<a href="https://ci.example/run" title="CI"><img alt="build" src="badge.svg" title="Build"></a>', `got ${html}`);
}

// Balanced parentheses in a bare destination stay in the destination.
{
    const link = render('[w](https://en.wikipedia.org/wiki/Foo_(bar) "Wiki")');
    check('balanced parentheses in a destination',
        sameAttrs(attrsOf(link, 'a'), { href: 'https://en.wikipedia.org/wiki/Foo_(bar)', title: 'Wiki' }), `got ${link}`);
}

console.log('-'.repeat(64));
console.log(`REG-148: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
