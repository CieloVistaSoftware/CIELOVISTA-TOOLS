// REG-022: Issue #12 — md-renderer table rendering
// Guards that pipe-syntax GFM tables produce proper <table> HTML with
// <thead>/<tbody>, that column alignment is applied, and that the else-branch
// (plain-text fallback) is NOT hit for valid table input.

'use strict';
const assert = require('assert');
const path   = require('path');
const fs     = require('fs');

// ── Locate compiled output ───────────────────────────────────────────────────
const outFile = path.join(__dirname, '../../out/shared/md-renderer.js');
if (!fs.existsSync(outFile)) {
    console.error(`SKIP: compiled output not found at ${outFile} — run tsc first`);
    process.exit(0);
}
const { mdToHtml } = require(outFile);

// ── Helpers ──────────────────────────────────────────────────────────────────
function assertContains(html, needle, msg) {
    if (!html.includes(needle)) {
        throw new Error(`${msg}\nExpected to contain: ${needle}\nActual HTML: ${html.substring(0, 400)}`);
    }
}
function assertNotContains(html, needle, msg) {
    if (html.includes(needle)) {
        throw new Error(`${msg}\nDid NOT expect: ${needle}\nActual HTML: ${html.substring(0, 400)}`);
    }
}

// ── Test 1: basic 2-column table ─────────────────────────────────────────────
{
    const md = `| Name | Age |\n| ---- | --- |\n| Alice | 30 |\n| Bob | 25 |`;
    const html = mdToHtml(md);
    assertContains(html, '<table>', 'basic table: missing <table>');
    assertContains(html, '<thead>', 'basic table: missing <thead>');
    assertContains(html, '<tbody>', 'basic table: missing <tbody>');
    assertContains(html, '<th>', 'basic table: missing <th>');
    assertContains(html, 'Name', 'basic table: missing header text');
    assertContains(html, 'Alice', 'basic table: missing body row');
    assertNotContains(html, '<p>| Name', 'basic table: header must not be in <p>');
    console.log('  PASS: basic 2-column table renders as <table>');
}

// ── Test 2: column alignment ──────────────────────────────────────────────────
{
    const md = `| Left | Center | Right |\n| :--- | :---: | ---: |\n| a | b | c |`;
    const html = mdToHtml(md);
    assertContains(html, 'text-align:center', 'alignment: missing center on :---:');
    assertContains(html, 'text-align:right',  'alignment: missing right on ---:');
    assertNotContains(html, 'style="text-align:left"', 'alignment: left-align cells must not carry inline style');
    console.log('  PASS: column alignment markers applied to th and td');
}

// ── Test 3: inline markdown in cells ─────────────────────────────────────────
{
    const md = `| **Bold** | \`code\` |\n| --- | --- |\n| *italic* | plain |`;
    const html = mdToHtml(md);
    assertContains(html, '<strong>Bold</strong>', 'inline: bold not rendered in header');
    assertContains(html, '<code>code</code>',     'inline: code not rendered in header');
    assertContains(html, '<em>italic</em>',       'inline: italic not rendered in body');
    console.log('  PASS: inline markdown in table cells renders correctly');
}

// ── Test 4: table without trailing blank line (edge case) ─────────────────────
{
    const md = `# Heading\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\nParagraph after.`;
    const html = mdToHtml(md);
    assertContains(html, '<table>', 'edge: table inside doc must still render');
    assertContains(html, '<h1', 'edge: heading before table must render');
    assertContains(html, 'Paragraph after', 'edge: paragraph after table must render');
    console.log('  PASS: table embedded in document renders correctly');
}

console.log('\nREG-022 md-renderer table rendering: all checks passed.');
