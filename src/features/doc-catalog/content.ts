// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/** Text extraction and HTML conversion utilities for doc-catalog. */

export function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const TYPE_PREFIXES = /^(Feature|Command|Tool|Guide|Reference|Spec|Standard|Template|Readme|Changelog|Status|Module|Service|Plugin|Library|Package|Config|Schema|Report|Audit|Test|Workflow|Process|Policy)\s*:\s*/i;

export function extractDocType(content: string, rawTitle: string): string | undefined {
    const lines = content.split('\n');
    if (lines[0]?.trim() === '---') {
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line === '---') { break; }
            const m = line.match(/^type\s*:\s*(.+?)\s*$/i);
            if (m) { return m[1].trim(); }
        }
    }
    const m = rawTitle.match(TYPE_PREFIXES);
    return m ? m[1] : undefined;
}

export function stripTypePrefix(title: string): string {
    return title.replace(TYPE_PREFIXES, '').trim();
}

export function extractTitle(content: string, fileName: string): string {
    const h1 = content.match(/^#\s+(.+)$/m);
    if (h1) { return h1[1].trim(); }
    return fileName.replace(/\.md$/i, '').replace(/[-_]/g, ' ');
}

export function extractDescription(content: string): string {
    const lines = content.split('\n');
    const textLines: string[] = [];
    let pastFirstHeading = false;
    const metadataLine = /^\s*\*\*[^*]+\*\*\s*:/;
    let frontmatterDelimsSeen = 0;
    const inFrontmatterMode = lines[0]?.trim() === '---';

    for (let idx = 0; idx < lines.length; idx++) {
        const line = lines[idx];
        if (inFrontmatterMode && frontmatterDelimsSeen < 2) {
            if (line.trim() === '---') {
                frontmatterDelimsSeen += 1;
            }
            continue;
        }

        const trimmed = line.trim();
        if (!trimmed) { continue; }
        if (trimmed.startsWith('#')) {
            if (pastFirstHeading && textLines.length) { break; }
            pastFirstHeading = true;
            continue;
        }
        if (trimmed.startsWith('>') || trimmed.startsWith('<!--') ||
            trimmed.startsWith('---') || trimmed.startsWith('|') ||
            trimmed.startsWith('```') || metadataLine.test(trimmed)) { continue; }
        textLines.push(trimmed.replace(/\*\*|__|\*|_|`/g, ''));
        if (textLines.join(' ').length > 160) { break; }
    }

    const desc = textLines.join(' ').trim();
    return desc.length > 160 ? desc.slice(0, 157) + '…' : desc || 'No description.';
}

export function extractTags(content: string, fileName: string): string[] {
    const tags: Set<string> = new Set();
    fileName.replace(/\.md$/i, '').split(/[-_. ]+/).forEach(w => {
        if (w.length > 2) { tags.add(w.toLowerCase()); }
    });
    const headings = content.match(/^#{1,3}\s+(.+)$/gm) ?? [];
    for (const h of headings.slice(0, 5)) {
        h.replace(/^#+\s+/, '').split(/\s+/).forEach(w => {
            const clean = w.replace(/[^a-z0-9]/gi, '').toLowerCase();
            if (clean.length > 3) { tags.add(clean); }
        });
    }
    return [...tags].slice(0, 12);
}
