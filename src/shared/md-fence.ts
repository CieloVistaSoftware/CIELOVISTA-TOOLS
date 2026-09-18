// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * md-fence.ts — CommonMark fenced code block detection, in one place (#799).
 *
 * Everything in cvt that reads Markdown and has to know where a code fence
 * opens and closes (the renderer, the help panel, the front-matter
 * description scanner, the code-highlight audit, the README compliance
 * checker) asks this module, so they can never disagree about it.
 *
 * The CommonMark rules (spec section 4.5) implemented here:
 *   - A fence is a run of at least three backticks or at least three tildes,
 *     indented by 0 to 3 spaces. Four spaces is not a fence.
 *   - An opening fence may be followed by an info string (the language is its
 *     first word). A backtick fence's info string may not contain a backtick,
 *     so a line like ```foo``` is inline code, not a fence.
 *   - A closing fence uses the opener's character, is at least as long, is
 *     itself indented 0 to 3 spaces (its indent need not match the opener's),
 *     and has nothing after it but spaces or tabs.
 *   - Each content line loses up to as many leading spaces as the opener was
 *     indented.
 *   - A fence that is never closed runs to the end of the document.
 *
 * Pure functions only.
 */

/** An opening code fence. */
export interface FenceOpen {
    /** Leading spaces before the fence characters, 0 to 3. */
    indent: number;
    /** The fence characters themselves, e.g. three backticks or four tildes. */
    marker: string;
    /** The info string after the marker, trimmed. '' when there is none. */
    info: string;
}

/** One fenced code block found by scanFences(). */
export interface FenceBlock {
    open: FenceOpen;
    /** Index of the opening fence line. */
    openLine: number;
    /** Index of the closing fence line, or -1 when the block runs to the end. */
    closeLine: number;
}

const OPEN_RE  = /^( {0,3})(`{3,}|~{3,})(.*)$/;
const CLOSE_RE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;

/** The line without a trailing carriage return (a CRLF file split on "\n"). */
function noCr(line: string): string {
    return line.endsWith('\r') ? line.slice(0, -1) : line;
}

/** The opening fence on `line`, or undefined when the line does not open one. */
export function parseFenceOpen(line: string): FenceOpen | undefined {
    const m = OPEN_RE.exec(noCr(line));
    if (!m) { return undefined; }
    const marker = m[2];
    const info   = m[3].trim();
    if (marker[0] === '`' && info.includes('`')) { return undefined; }
    return { indent: m[1].length, marker, info };
}

/** True when `line` closes the block that `open` opened. */
export function isFenceClose(line: string, open: FenceOpen): boolean {
    const m = CLOSE_RE.exec(noCr(line));
    return !!m && m[1][0] === open.marker[0] && m[1].length >= open.marker.length;
}

/** A content line with up to the opener's indentation removed. */
export function stripFenceIndent(line: string, open: FenceOpen): string {
    let n = 0;
    while (n < open.indent && line[n] === ' ') { n++; }
    return line.slice(n);
}

/**
 * `line` with its opening fence's info string set to `info`, keeping the
 * indentation, the marker and any trailing carriage return. Undefined when
 * the line is not an opening fence with the given marker and no info string
 * (so a caller holding a stale line number never rewrites the wrong line).
 */
export function withFenceInfo(line: string, marker: string, info: string): string | undefined {
    const open = parseFenceOpen(line);
    if (!open || open.marker !== marker || open.info !== '') { return undefined; }
    return ' '.repeat(open.indent) + open.marker + info + (line.endsWith('\r') ? '\r' : '');
}

/** Every fenced code block in `lines`, in document order. */
export function scanFences(lines: string[]): FenceBlock[] {
    const blocks: FenceBlock[] = [];
    let i = 0;
    while (i < lines.length) {
        const open = parseFenceOpen(lines[i]);
        if (!open) { i++; continue; }
        const openLine = i;
        i++;
        while (i < lines.length && !isFenceClose(lines[i], open)) { i++; }
        blocks.push({ open, openLine, closeLine: i < lines.length ? i : -1 });
        i++;
    }
    return blocks;
}

/**
 * One flag per line: true when the line belongs to a fenced code block
 * (its opening fence, its content or its closing fence).
 */
export function fencedLineMask(lines: string[]): boolean[] {
    const mask = new Array<boolean>(lines.length).fill(false);
    for (const b of scanFences(lines)) {
        const end = b.closeLine === -1 ? lines.length - 1 : b.closeLine;
        for (let k = b.openLine; k <= end; k++) { mask[k] = true; }
    }
    return mask;
}
