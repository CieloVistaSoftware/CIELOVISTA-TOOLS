// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
// Pure TypeScript Markdown renderer with server-side syntax highlighting.
// Produces clean HTML suitable for VS Code webview panels.

import hljs from 'highlight.js';

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

export function mdToHtml(input: string): string {
    const lines  = input.split('\n').map(l => l.replace(/\r$/, ''));
    const out: string[] = [];
    const headingIds = new Map<string, number>();
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

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
    return s
        .replace(/\*\*(.+?)\*\*/g,        '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g,            '<em>$1</em>')
        .replace(/`([^`]+)`/g,            '<code>$1</code>')
        .replace(/~~(.+?)~~/g,            '<del>$1</del>')
        .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2">')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g,  '<a href="$2">$1</a>');
}
