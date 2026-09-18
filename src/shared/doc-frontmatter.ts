// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * doc-frontmatter.ts — the one reader and writer of markdown frontmatter (#730).
 *
 * THE CONTRACT (#707, #708): three hand-written fields, at the TOP.
 *
 *     ---
 *     id: regression-log
 *     title: Regression Log
 *     description: What each REG-NNN test guards and why it exists.
 *     ---
 *
 * Anything derivable (path, dates, category, tags) is not typed into a
 * document. scripts/docs-sync.js enforces this on docs/ and src/.
 *
 * Before this module four features each parsed frontmatter their own way, and
 * all of them still wrote the retired 13-field block at the bottom. Two of the
 * parsers found a trailer by matching lazily from the FIRST `---` line, so in
 * a document with a horizontal rule in its body AND a trailer at the end --
 * the shape of every src/ README before #707 -- everything from the rule down
 * was read as "metadata". doc-header's applyHeader() then kept the text above
 * the rule and deleted the rest: 5 of 6 prose lines in the reproduction in
 * tests/unit/doc-header.test.js. #731 restored 2,246 lines lost to damage of
 * that shape.
 *
 * So a trailer is recognised only when EVERY non-blank line between the last
 * two `---` lines is a field. A horizontal rule followed by prose is body.
 *
 * Pure functions only — no vscode, no fs.
 */

export const CONTRACT_FIELDS = ['id', 'title', 'description'] as const;

export type Placement = 'top' | 'bottom' | 'none';

export interface ParsedDoc {
    /** Field names lower-cased; values unquoted. */
    fields:    Record<string, string>;
    placement: Placement;
    /** The document without its frontmatter block. */
    body:      string;
    /** The line ending the file uses, preserved on write. */
    eol:       '\n' | '\r\n';
}

const FIELD_LINE = /^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/;
/** YAML continuation inside a block: an indented line or a list item. */
const CONTINUATION = /^(\s+\S|-\s)/;

function unquote(value: string): string {
    const v = value.trim();
    if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
        return v.slice(1, -1);
    }
    return v;
}

/** A block qualifies as frontmatter only if it holds a field and nothing that is not one. */
function readBlock(lines: string[]): Record<string, string> | null {
    const fields: Record<string, string> = {};
    let sawField = false;
    for (const line of lines) {
        if (line.trim() === '') { continue; }
        const m = line.match(FIELD_LINE);
        if (m) { fields[m[1].toLowerCase()] = unquote(m[2]); sawField = true; continue; }
        if (CONTINUATION.test(line)) { continue; }
        return null;
    }
    return sawField ? fields : null;
}

export function readFrontmatter(text: string): ParsedDoc {
    const eol: '\n' | '\r\n' = text.includes('\r\n') ? '\r\n' : '\n';
    const lines = text.split(/\r?\n/);

    // Top: the very first line is ---, and a closing --- follows.
    if (lines[0]?.trim() === '---') {
        const close = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
        if (close > 0) {
            const fields = readBlock(lines.slice(1, close));
            if (fields) {
                return { fields, placement: 'top', body: lines.slice(close + 1).join(eol), eol };
            }
        }
    }

    // Bottom: the last non-blank line is ---, and the block above it back to
    // the previous --- is made only of fields.
    let end = lines.length - 1;
    while (end >= 0 && lines[end].trim() === '') { end--; }
    if (end > 0 && lines[end].trim() === '---') {
        let start = end - 1;
        while (start >= 0 && lines[start].trim() !== '---') { start--; }
        if (start >= 0) {
            const fields = readBlock(lines.slice(start + 1, end));
            if (fields) {
                return { fields, placement: 'bottom', body: lines.slice(0, start).join(eol), eol };
            }
        }
    }

    return { fields: {}, placement: 'none', body: text, eol };
}

/** Everything wrong with a document under the three-field contract; empty when compliant. */
export function contractViolations(text: string): string[] {
    const { fields, placement } = readFrontmatter(text);
    if (placement === 'none') { return ['no frontmatter']; }
    const out: string[] = [];
    if (placement === 'bottom') { out.push('frontmatter at the bottom'); }
    for (const f of CONTRACT_FIELDS) {
        if (!fields[f]) { out.push(`missing ${f}`); }
    }
    const extra = Object.keys(fields).filter(k => !(CONTRACT_FIELDS as readonly string[]).includes(k));
    if (extra.length) { out.push(`fields beyond the contract: ${extra.join(', ')}`); }
    return out;
}

/** The id a document gets when it declares none: its file name, slugged. */
export function idFromFileName(fileName: string): string {
    return fileName
        .replace(/\.md$/i, '')
        .replace(/[_\s.]+/g, '-')
        .replace(/[^A-Za-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase();
}

export function titleFromBody(body: string, fileName: string): string {
    const h1 = body.match(/^#\s+(.+)$/m);
    if (h1) { return h1[1].trim().replace(/\*\*|__|`/g, ''); }
    return fileName.replace(/\.md$/i, '').replace(/[-_.]/g, ' ');
}

/** The first prose paragraph, trimmed to about a sentence. */
export function descriptionFromBody(body: string): string {
    const text: string[] = [];
    let inFence = false;
    for (const raw of body.split(/\r?\n/)) {
        const t = raw.trim();
        if (t.startsWith('```')) { inFence = !inFence; continue; }
        if (inFence) { continue; }
        if (!t) { if (text.length) { break; } continue; }
        if (/^(#|>|<!--|\||---|[-*]\s|\d+\.\s)/.test(t)) { if (text.length) { break; } continue; }
        text.push(t.replace(/\*\*|__|`/g, ''));
        if (text.join(' ').length > 160) { break; }
    }
    const desc = text.join(' ').trim();
    return desc.length > 160 ? `${desc.slice(0, 157).trimEnd()}...` : desc;
}

/** YAML-safe scalar: quoted only when it has to be. */
function scalar(value: string): string {
    const v = value.replace(/\s+/g, ' ').trim();
    if (/: |\s#|^[-?:,[\]{}#&*!|>'"%@`]|:$/.test(v)) {
        return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    }
    return v;
}

/**
 * The document rewritten to the contract: id, title and description at the
 * top, taken from its existing frontmatter where present and derived from the
 * body where not. The body is kept byte for byte, apart from the horizontal
 * rule that separated a trailer from it. Every other field is dropped.
 */
export function toContract(text: string, fileName: string): string {
    const { fields, placement, body, eol } = readFrontmatter(text);
    const lines = body.split(/\r?\n/);
    if (placement === 'bottom') {
        while (lines.length && lines[lines.length - 1].trim() === '') { lines.pop(); }
        if (lines.length && lines[lines.length - 1].trim() === '---') { lines.pop(); }
        while (lines.length && lines[lines.length - 1].trim() === '') { lines.pop(); }
    }
    while (lines.length && lines[0].trim() === '') { lines.shift(); }
    const cleanBody = lines.join(eol);

    const id          = fields.id || idFromFileName(fileName);
    const title       = fields.title || titleFromBody(cleanBody, fileName);
    const description = fields.description || descriptionFromBody(cleanBody) || title;

    const head = ['---', `id: ${scalar(id)}`, `title: ${scalar(title)}`, `description: ${scalar(description)}`, '---', '', ''];   // then one blank line
    const out = head.join(eol) + cleanBody;
    return out.endsWith(eol) ? out : out + eol;
}
