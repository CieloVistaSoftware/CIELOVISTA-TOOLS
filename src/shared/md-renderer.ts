// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
// Pure TypeScript Markdown renderer with server-side syntax highlighting.
// Produces clean HTML suitable for VS Code webview panels.

import hljs      from 'highlight.js/lib/core';
import typescript from 'highlight.js/lib/languages/typescript';
import javascript from 'highlight.js/lib/languages/javascript';
import json       from 'highlight.js/lib/languages/json';
import yaml       from 'highlight.js/lib/languages/yaml';
import powershell from 'highlight.js/lib/languages/powershell';
import bash       from 'highlight.js/lib/languages/bash';
import css        from 'highlight.js/lib/languages/css';
import xml        from 'highlight.js/lib/languages/xml';
import markdown   from 'highlight.js/lib/languages/markdown';
import plaintext  from 'highlight.js/lib/languages/plaintext';

hljs.registerLanguage('typescript',  typescript);
hljs.registerLanguage('ts',          typescript);
hljs.registerLanguage('javascript',  javascript);
hljs.registerLanguage('js',          javascript);
hljs.registerLanguage('json',        json);
hljs.registerLanguage('yaml',        yaml);
hljs.registerLanguage('yml',         yaml);
hljs.registerLanguage('powershell',  powershell);
hljs.registerLanguage('ps1',         powershell);
hljs.registerLanguage('bash',        bash);
hljs.registerLanguage('sh',          bash);
hljs.registerLanguage('shell',       bash);
hljs.registerLanguage('css',         css);
hljs.registerLanguage('xml',         xml);
hljs.registerLanguage('html',        xml);
hljs.registerLanguage('markdown',    markdown);
hljs.registerLanguage('md',          markdown);
hljs.registerLanguage('plaintext',   plaintext);
hljs.registerLanguage('text',        plaintext);

function highlightCode(code: string, lang: string): string {
    try {
        if (lang && hljs.getLanguage(lang)) {
            return hljs.highlight(code, { language: lang }).value;
        }
        return hljs.highlightAuto(code).value;
    } catch {
        return esc(code);
    }
}

function parseFrontmatter(lines: string[]): { block: string; startAt: number } {
    if (lines[0]?.trim() !== '---') { return { block: '', startAt: 0 }; }
    const end = lines.findIndex((l, idx) => idx > 0 && l.trim() === '---');
    if (end === -1) { return { block: '', startAt: 0 }; }
    const pairs = lines.slice(1, end)
        .map(l => l.match(/^([^:]+):\s*(.*)$/))
        .filter(Boolean) as RegExpMatchArray[];
    if (pairs.length === 0) { return { block: '', startAt: end + 1 }; }

    const fields = pairs.map(([, k, v]) => ({ key: k.trim().toLowerCase(), value: v.trim() }));

    const hasType = fields.some((f) => f.key === 'type' || f.key === 'doctype' || f.key === 'kind');
    if (!hasType) {
        fields.splice(0, 0, { key: 'type', value: 'FEATURE' });
    }

    const projectIdx = fields.findIndex((f) => f.key === 'project');
    const relPathIdx = fields.findIndex((f) => f.key === 'relativepath');
    if (projectIdx >= 0 && relPathIdx >= 0 && relPathIdx !== projectIdx + 1) {
        const [relativePathField] = fields.splice(relPathIdx, 1);
        const insertAt = Math.min(projectIdx + 1, fields.length);
        fields.splice(insertAt, 0, relativePathField);
    }

    const rows = fields.map((field) => {
        const labelCore = field.key.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        return `<div class="fm-row"><span class="fm-label">${esc(labelCore)}:</span><span class="fm-value">${esc(field.value)}</span></div>`;
    }).join('');
    const block = `<div class="fm-block">${rows}</div>`;
    return { block, startAt: end + 1 };
}

// Block patterns, shared by mdToHtml()'s block rules and startsBlock() so the
// two can never disagree about where a paragraph ends (#756, #773).
const HEADING      = /^(#{1,6}) (.+)$/;
const BLOCKQUOTE   = /^>[ \t]?(.*)$/;
const BULLET_ITEM  = /^[*+\-] .+$/;
const ORDERED_ITEM = /^(\d{1,9})\. .+$/;

export function mdToHtml(input: string): string {
    const lines  = input.split('\n').map(l => l.replace(/\r$/, ''));
    const { block: fmBlock, startAt } = parseFrontmatter(lines);
    const out: string[] = fmBlock ? [fmBlock] : [];
    const headingIds = new Map<string, number>();
    let i = startAt;

    while (i < lines.length) {
        const line = lines[i];

        // ── HTML comment lines — invisible metadata, skip rendering ────────────
        if (/^\s*<!--[\s\S]*?-->\s*$/.test(line)) { i++; continue; }

        // ── Fenced code blocks ────────────────────────────────────────────────
        const fenceMatch = line.match(/^(`{3,}|~{3,})(\w*).*$/);
        if (fenceMatch) {
            const fence = fenceMatch[1];
            const lang  = fenceMatch[2] || '';
            const codeLines: string[] = [];
            i++;
            while (i < lines.length && !lines[i].startsWith(fence)) {
                codeLines.push(lines[i]);
                i++;
            }
            const rawCode    = codeLines.join('\n');
            const highlighted = highlightCode(rawCode, lang);
            const langClass  = lang ? ` class="language-${esc(lang)}"` : '';
            out.push(`<pre><code${langClass}>${highlighted}</code></pre>`);
            i++; // skip closing fence
            continue;
        }

        // ── Tables ────────────────────────────────────────────────────────────
        if (/^\|.+\|$/.test(line.trim())) {
            const tableLines: string[] = [];
            while (i < lines.length && /^\|.+\|$/.test(lines[i].trim())) {
                tableLines.push(lines[i].trim());
                i++;
            }
            if (tableLines.length >= 2 && /^\|[\s\-:|]+\|$/.test(tableLines[1])) {
                const alignments = tableLines[1].split('|').slice(1,-1).map(c => {
                    const t = c.trim();
                    if (/^:-+:$/.test(t)) { return ' style="text-align:center"'; }
                    if (/^-+:$/.test(t))  { return ' style="text-align:right"'; }
                    return '';
                });
                const headerCells = tableLines[0].split('|').slice(1,-1).map((c, ci) =>
                    `<th${alignments[ci] ?? ''}>${inlineMarkdown(esc(c.trim()))}</th>`
                ).join('');
                const bodyRows = tableLines.slice(2).map(row => {
                    const cells = row.split('|').slice(1,-1).map((c, ci) =>
                        `<td${alignments[ci] ?? ''}>${inlineMarkdown(esc(c.trim()))}</td>`
                    ).join('');
                    return `<tr>${cells}</tr>`;
                }).join('');
                out.push(`<table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>`);
            } else {
                tableLines.forEach(l => out.push(`<p>${inlineMarkdown(esc(l))}</p>`));
            }
            continue;
        }

        // ── ATX Headings (h1 to h6) ───────────────────────────────────────────
        const heading = line.match(HEADING);
        if (heading) {
            const level = heading[1].length;
            const id = getUniqueHeadingId(heading[2], headingIds);
            out.push(`<h${level} id="${id}">${inlineMarkdown(esc(heading[2]))}</h${level}>`);
            i++;
            continue;
        }

        // ── Horizontal rule ───────────────────────────────────────────────────
        if (/^---+$/.test(line.trim())) { out.push('<hr>'); i++; continue; }

        // ── Blockquote ────────────────────────────────────────────────────────
        // CommonMark: each line is ">" optionally followed by one space. The
        // consecutive lines form one quote; a line that is only ">" is a blank
        // line inside it and separates its paragraphs (#773).
        if (BLOCKQUOTE.test(line)) {
            const paras: string[][] = [[]];
            while (i < lines.length && BLOCKQUOTE.test(lines[i])) {
                const content = lines[i].replace(BLOCKQUOTE, '$1');
                if (content.trim() === '') { paras.push([]); }
                else { paras[paras.length - 1].push(inlineMarkdown(esc(content))); }
                i++;
            }
            const filled = paras.filter(p => p.length > 0).map(p => p.join('<br>'));
            // One paragraph keeps the renderer's original <blockquote>text</blockquote> form.
            const body = filled.length === 1 ? filled[0] : filled.map(p => `<p>${p}</p>`).join('');
            out.push(`<blockquote>${body}</blockquote>`);
            continue;
        }

        // ── Lists ─────────────────────────────────────────────────────────────
        if (BULLET_ITEM.test(line) || ORDERED_ITEM.test(line)) {
            const listLines: string[] = [];
            while (i < lines.length && (BULLET_ITEM.test(lines[i]) || ORDERED_ITEM.test(lines[i]))) {
                listLines.push(lines[i]);
                i++;
            }
            const first = ORDERED_ITEM.exec(listLines[0]);
            const tag = first ? 'ol' : 'ul';
            // CommonMark: an ordered list starts at its first item's number (#773).
            const startNum = first ? parseInt(first[1], 10) : 1;
            const start = startNum !== 1 ? ` start="${startNum}"` : '';
            const items = listLines.map(l => {
                // Strip exactly one marker, so "- 1. text" keeps its "1." (#784).
                const content = l.replace(/^(?:[*+\-]|\d{1,9}\.) /, '');
                return `<li>${inlineMarkdown(esc(content))}</li>`;
            }).join('');
            out.push(`<${tag}${start}>${items}</${tag}>`);
            continue;
        }

        // ── Blank line ────────────────────────────────────────────────────────
        if (line.trim() === '') { i++; continue; }

        // ── Paragraph ─────────────────────────────────────────────────────────
        // This line has already failed every block rule above, so it always
        // starts a paragraph. Later lines join it until a blank line or a line
        // that would start a real block. (#756: the old stop test was any line
        // starting with # > * - ` ~, and it was applied to the first line too,
        // so "**Note:** text" collected nothing and was skipped.)
        const paraLines: string[] = [line];
        i++;
        while (i < lines.length && lines[i].trim() !== '' && !startsBlock(lines[i])) {
            paraLines.push(lines[i]);
            i++;
        }
        out.push(`<p>${paraLines.map(l => inlineMarkdown(esc(l))).join('<br>')}</p>`);
    }

    return out.join('\n');
}

/**
 * True when `line` would be taken by one of mdToHtml()'s block rules (comment,
 * fence, table, heading, rule, blockquote, list) rather than continue a
 * paragraph. The patterns are the same ones the block rules use.
 */
function startsBlock(line: string): boolean {
    const t = line.trim();
    return /^\s*<!--[\s\S]*?-->\s*$/.test(line)
        || /^(`{3,}|~{3,})/.test(line)
        || /^\|.+\|$/.test(t)
        || HEADING.test(line)
        || /^---+$/.test(t)
        || BLOCKQUOTE.test(line)
        || BULLET_ITEM.test(line)
        || ORDERED_ITEM.test(line);
}

function getUniqueHeadingId(rawHeading: string, seen: Map<string, number>): string {
    const base = slugifyHeading(rawHeading) || 'section';
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
}

function slugifyHeading(rawHeading: string): string {
    return rawHeading
        .toLowerCase()
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/[*_`~]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
}

function esc(s: string): string {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Inline markup ─────────────────────────────────────────────────────────────
// CommonMark precedence (#754): code spans bind first, then links and images,
// then emphasis. Each finished code span, image and link is swapped for a
// placeholder token so later passes cannot reach inside it: a * in a URL is
// not emphasis, [a](b) inside a code span is not a link, and emphasis cannot
// leak into an href, src, title or alt attribute. Placeholders are expanded
// back to HTML at the very end.

/** A span already rendered, held out of the later passes. */
interface Held {
    html: string;    // what it renders as
    source: string;  // the (esc()'d) markdown it came from, for attribute values
    text: string;    // its plain text, for image alt text
}

const PH_OPEN  = '';
const PH_CLOSE = '';
const PH_TOKEN = /(\d+)/g;

/** Expand every placeholder in `s` (recursively) to one form of its span. */
function expand(s: string, held: Held[], form: keyof Held): string {
    return s.replace(PH_TOKEN, (_, n: string) => expand(held[Number(n)][form], held, form));
}

// Underscore emphasis (#773) follows CommonMark's intraword rule: an opening
// _ or __ may not follow a letter or digit, and a closing one may not be
// followed by one. So snake_case_names and file_name.md stay literal, while
// _word_ and __word__ between spaces or punctuation are emphasis. The
// delimiter must also touch its content (no space inside) and may not be
// backslash-escaped. A placeholder (a held code span, link or image) counts
// as punctuation, as its first source character does in CommonMark.
// WORD_CHAR is anything that is not whitespace, punctuation, a symbol or a
// placeholder delimiter. A delimiter is matched as a whole run (an extra _ on
// either side means it is part of a longer run), so the flanking test sees
// the characters around the run, as CommonMark's does: in foo__bar the __ is
// intraword and stays literal.
const WORD_CHAR = String.raw`[^\s\p{P}\p{S}]`;
const UNDERSCORE_BOTH   = new RegExp(String.raw`(?<!${WORD_CHAR}|[\\_])___(?![\s_])(.+?)(?<![\s\\_])___(?!${WORD_CHAR}|_)`, 'gu');
const UNDERSCORE_STRONG = new RegExp(String.raw`(?<!${WORD_CHAR}|[\\_])__(?![\s_])(.+?)(?<![\s\\_])__(?!${WORD_CHAR}|_)`, 'gu');
const UNDERSCORE_EM     = new RegExp(String.raw`(?<!${WORD_CHAR}|[\\_])_(?![\s_])(.+?)(?<![\s\\_])_(?!${WORD_CHAR}|_)`, 'gu');

function emphasis(s: string): string {
    return s
        .replace(/\*\*(.+?)\*\*/g,  '<strong>$1</strong>')
        .replace(UNDERSCORE_BOTH,   '<em><strong>$1</strong></em>')
        .replace(UNDERSCORE_STRONG, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g,      '<em>$1</em>')
        .replace(UNDERSCORE_EM,     '<em>$1</em>')
        .replace(/~~(.+?)~~/g,      '<del>$1</del>');
}

function stripTags(s: string): string {
    return s.replace(/<[^>]*>/g, '');
}

function inlineMarkdown(s: string): string {
    const held: Held[] = [];
    const hold = (h: Held): string => `${PH_OPEN}${held.push(h) - 1}${PH_CLOSE}`;
    // The placeholder delimiters are private-use characters; one already in
    // the text is emitted as its numeric reference so it cannot pose as a token.
    let t = s.replace(/[]/g, c => `&#${c.charCodeAt(0)};`);
    t = t.replace(/`([^`]+)`/g, (source: string, code: string) =>
        hold({ html: `<code>${code}</code>`, source, text: code }));
    // Images first, so a badge [![alt](img.svg)](url) becomes a linked image.
    t = replaceLinks(t, true, held, hold);
    t = replaceLinks(t, false, held, hold);
    return expand(emphasis(t), held, 'html');
}

// ── Inline links and images ───────────────────────────────────────────────────
// CommonMark: [text](destination "title"). The destination may be wrapped in
// <angle brackets> (which permits spaces) or be bare (balanced parentheses
// allowed); the optional title is "double", 'single' or (parenthesized), and
// must be separated from the destination by whitespace. The input here has
// already been through esc(), so < > & arrive as &lt; &gt; &amp;.

interface LinkTarget { dest: string; title: string | undefined; end: number; }

const ASCII_PUNCT = /[!-/:-@[-`{-~]/;

/** Undo esc() so a captured value can be escaped once, for an attribute. */
function unEsc(s: string): string {
    return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

/** Escape for a double-quoted HTML attribute value. */
function escAttr(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * A destination whose scheme would run script when followed becomes "#".
 * Balanced parentheses (#740) turned [x](javascript:alert(1)) from a broken
 * href into a working one, so script schemes are refused outright. data: is
 * refused for links only; an image may legitimately be a data: URL.
 */
function safeDest(dest: string, images: boolean): string {
    const scheme = Array.from(dest).filter(ch => ch.charCodeAt(0) > 32 && ch.charCodeAt(0) !== 127).join('').toLowerCase();
    if (/^(javascript|vbscript):/.test(scheme)) { return '#'; }
    if (!images && scheme.startsWith('data:')) { return '#'; }
    return dest;
}

function isSpace(c: string | undefined): boolean {
    return c === ' ' || c === '\t' || c === '\n';
}

/**
 * Parse the part of a link after its opening "(" (s[start] is the first
 * character inside). Returns the destination, optional title and the index
 * just past the closing ")", or undefined if it is not a CommonMark target.
 */
function parseLinkTarget(s: string, start: number): LinkTarget | undefined {
    let i = start;
    while (isSpace(s[i])) { i++; }

    let dest = '';
    if (s.startsWith('&lt;', i)) {
        const close = s.indexOf('&gt;', i + 4);
        if (close < 0) { return undefined; }
        dest = s.slice(i + 4, close);
        if (dest.includes('&lt;') || dest.includes('\n')) { return undefined; }
        i = close + 4;
    } else {
        let depth = 0;
        const from = i;
        while (i < s.length) {
            const c = s[i];
            if (c === '\\' && (s[i + 1] === '(' || s[i + 1] === ')')) { dest += s[i + 1]; i += 2; continue; }
            if (isSpace(c)) { break; }
            if (c === '(') { depth++; }
            if (c === ')') { if (depth === 0) { break; } depth--; }
            dest += c;
            i++;
        }
        if (i === from || depth !== 0) { return undefined; }
    }

    const beforeGap = i;
    while (isSpace(s[i])) { i++; }
    let title: string | undefined;
    const opener = s[i];
    if (i > beforeGap && (opener === '"' || opener === "'" || opener === '(')) {
        const closer = opener === '(' ? ')' : opener;
        let j = i + 1;
        let t = '';
        while (j < s.length && s[j] !== closer) {
            if (s[j] === '\\' && s[j + 1] !== undefined && ASCII_PUNCT.test(s[j + 1])) { t += s[j + 1]; j += 2; continue; }
            if (opener === '(' && s[j] === '(') { return undefined; }
            t += s[j];
            j++;
        }
        if (j >= s.length) { return undefined; }
        title = t;
        i = j + 1;
        while (isSpace(s[i])) { i++; }
    }
    if (s[i] !== ')') { return undefined; }
    return { dest, title, end: i + 1 };
}

/**
 * Replace every ![alt](target) (images === true) or [text](target) with HTML.
 * A target that is not valid CommonMark falls back to the pre-#740 rule:
 * everything up to the first ")" is the destination.
 *
 * `s` may hold placeholders for code spans (and, for links, images). Each
 * rendered image or link is itself held and replaced by a placeholder. A
 * placeholder inside a destination or title is expanded back to its markdown
 * source before escaping, so rendered HTML never lands in an attribute.
 */
function replaceLinks(s: string, images: boolean, held: Held[], hold: (h: Held) => string): string {
    const opener = images ? /!\[([^\]]*)\]\(/g : /\[([^\]]+)\]\(/g;
    let out = '';
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = opener.exec(s)) !== null) {
        const inner = m.index + m[0].length;
        let target = parseLinkTarget(s, inner);
        if (!target) {
            const close = s.indexOf(')', inner);
            if (close <= inner) { continue; }
            target = { dest: s.slice(inner, close), title: undefined, end: close + 1 };
        }
        const dest  = unEsc(expand(target.dest, held, 'source'));
        const href  = escAttr(safeDest(dest, images));
        const title = target.title === undefined ? '' : ` title="${escAttr(unEsc(expand(target.title, held, 'source')))}"`;
        const source = s.slice(m.index, target.end);
        // Alt text is the label's plain text: emphasis and code markup removed.
        const text  = stripTags(expand(emphasis(m[1]), held, 'text'));
        out += s.slice(last, m.index);
        out += hold(images
            ? { html: `<img alt="${text.replace(/"/g, '&quot;')}" src="${href}"${title}>`, source, text }
            : { html: `<a href="${href}"${title}>${emphasis(m[1])}</a>`, source, text });
        last = target.end;
        opener.lastIndex = target.end;
    }
    return out + s.slice(last);
}
