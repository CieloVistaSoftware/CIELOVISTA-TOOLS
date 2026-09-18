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

    const docIdIdx = fields.findIndex((f) => f.key === 'docid' || f.key === 'subject');
    const categoryIdx = fields.findIndex((f) => f.key === 'category');
    if (docIdIdx >= 0 && categoryIdx >= 0 && categoryIdx !== docIdIdx + 1) {
        const [categoryField] = fields.splice(categoryIdx, 1);
        const insertAt = Math.min(docIdIdx + 1, fields.length);
        fields.splice(insertAt, 0, categoryField);
    }

    const hasType = fields.some((f) => f.key === 'type' || f.key === 'doctype' || f.key === 'kind');
    if (!hasType) {
        const insertAt = docIdIdx >= 0 ? Math.min(docIdIdx + 1, fields.length) : 0;
        fields.splice(insertAt, 0, { key: 'type', value: 'FEATURE' });
    }

    const projectIdx = fields.findIndex((f) => f.key === 'project');
    const relPathIdx = fields.findIndex((f) => f.key === 'relativepath');
    if (projectIdx >= 0 && relPathIdx >= 0 && relPathIdx !== projectIdx + 1) {
        const [relativePathField] = fields.splice(relPathIdx, 1);
        const insertAt = Math.min(projectIdx + 1, fields.length);
        fields.splice(insertAt, 0, relativePathField);
    }

    const rows = fields.map((field) => {
        const labelCore = (field.key === 'docid' || field.key === 'subject')
            ? 'Doc Id'
            : field.key.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        return `<div class="fm-row"><span class="fm-label">${esc(labelCore)}:</span><span class="fm-value">${esc(field.value)}</span></div>`;
    }).join('');
    const block = `<div class="fm-block">${rows}</div>`;
    return { block, startAt: end + 1 };
}

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

        // ── ATX Headings ──────────────────────────────────────────────────────
        const h4 = line.match(/^#### (.+)$/);
        if (h4) {
            const id = getUniqueHeadingId(h4[1], headingIds);
            out.push(`<h4 id="${id}">${inlineMarkdown(esc(h4[1]))}</h4>`);
            i++;
            continue;
        }
        const h3 = line.match(/^### (.+)$/);
        if (h3) {
            const id = getUniqueHeadingId(h3[1], headingIds);
            out.push(`<h3 id="${id}">${inlineMarkdown(esc(h3[1]))}</h3>`);
            i++;
            continue;
        }
        const h2 = line.match(/^## (.+)$/);
        if (h2) {
            const id = getUniqueHeadingId(h2[1], headingIds);
            out.push(`<h2 id="${id}">${inlineMarkdown(esc(h2[1]))}</h2>`);
            i++;
            continue;
        }
        const h1 = line.match(/^# (.+)$/);
        if (h1) {
            const id = getUniqueHeadingId(h1[1], headingIds);
            out.push(`<h1 id="${id}">${inlineMarkdown(esc(h1[1]))}</h1>`);
            i++;
            continue;
        }

        // ── Horizontal rule ───────────────────────────────────────────────────
        if (/^---+$/.test(line.trim())) { out.push('<hr>'); i++; continue; }

        // ── Blockquote ────────────────────────────────────────────────────────
        const bq = line.match(/^>\s(.+)$/);
        if (bq) { out.push(`<blockquote>${inlineMarkdown(esc(bq[1]))}</blockquote>`); i++; continue; }

        // ── Lists ─────────────────────────────────────────────────────────────
        if (/^[*\-] .+$/.test(line) || /^\d+\. .+$/.test(line)) {
            const listLines: string[] = [];
            while (i < lines.length && (/^[*\-] .+$/.test(lines[i]) || /^\d+\. .+$/.test(lines[i]))) {
                listLines.push(lines[i]);
                i++;
            }
            const tag = /^\d+\./.test(listLines[0]) ? 'ol' : 'ul';
            const items = listLines.map(l => {
                const content = l.replace(/^[*\-] /, '').replace(/^\d+\. /, '');
                return `<li>${inlineMarkdown(esc(content))}</li>`;
            }).join('');
            out.push(`<${tag}>${items}</${tag}>`);
            continue;
        }

        // ── Blank line ────────────────────────────────────────────────────────
        if (line.trim() === '') { i++; continue; }

        // ── Paragraph ─────────────────────────────────────────────────────────
        const paraLines: string[] = [];
        while (i < lines.length && lines[i].trim() !== '' &&
               !/^[#>*\-`~]/.test(lines[i]) && !/^\d+\. /.test(lines[i]) &&
               !/^\|.+\|$/.test(lines[i].trim()) && !/^---+$/.test(lines[i].trim())) {
            paraLines.push(lines[i]);
            i++;
        }
        if (paraLines.length > 0) {
            out.push(`<p>${paraLines.map(l => inlineMarkdown(esc(l))).join('<br>')}</p>`);
        } else {
            i++;
        }
    }

    return out.join('\n');
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

function inlineMarkdown(s: string): string {
    const styled = s
        .replace(/\*\*(.+?)\*\*/g,        '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g,            '<em>$1</em>')
        .replace(/`([^`]+)`/g,            '<code>$1</code>')
        .replace(/~~(.+?)~~/g,            '<del>$1</del>');
    // Images first, so a badge [![alt](img.svg)](url) becomes a linked image.
    return replaceLinks(replaceLinks(styled, true), false);
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
 */
function replaceLinks(s: string, images: boolean): string {
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
        const href  = escAttr(safeDest(unEsc(target.dest), images));
        const title = target.title === undefined ? '' : ` title="${escAttr(unEsc(target.title))}"`;
        out += s.slice(last, m.index);
        out += images
            ? `<img alt="${m[1].replace(/"/g, '&quot;')}" src="${href}"${title}>`
            : `<a href="${href}"${title}>${m[1]}</a>`;
        last = target.end;
        opener.lastIndex = target.end;
    }
    return out + s.slice(last);
}
