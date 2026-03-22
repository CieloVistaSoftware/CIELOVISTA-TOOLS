"use strict";
// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
Object.defineProperty(exports, "__esModule", { value: true });
exports.esc = esc;
exports.extractTitle = extractTitle;
exports.extractDescription = extractDescription;
exports.extractTags = extractTags;
exports.mdToHtml = mdToHtml;
/** Text extraction and HTML conversion utilities for doc-catalog. */
function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function extractTitle(content, fileName) {
    const h1 = content.match(/^#\s+(.+)$/m);
    if (h1) {
        return h1[1].trim();
    }
    return fileName.replace(/\.md$/i, '').replace(/[-_]/g, ' ');
}
function extractDescription(content) {
    const lines = content.split('\n');
    const textLines = [];
    let pastFirstHeading = false;
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
            continue;
        }
        if (trimmed.startsWith('#')) {
            if (pastFirstHeading && textLines.length) {
                break;
            }
            pastFirstHeading = true;
            continue;
        }
        if (trimmed.startsWith('>') || trimmed.startsWith('<!--') ||
            trimmed.startsWith('---') || trimmed.startsWith('|') ||
            trimmed.startsWith('```')) {
            continue;
        }
        textLines.push(trimmed.replace(/\*\*|__|\*|_|`/g, ''));
        if (textLines.join(' ').length > 160) {
            break;
        }
    }
    const desc = textLines.join(' ').trim();
    return desc.length > 160 ? desc.slice(0, 157) + '…' : desc || 'No description.';
}
function extractTags(content, fileName) {
    const tags = new Set();
    fileName.replace(/\.md$/i, '').split(/[-_. ]+/).forEach(w => {
        if (w.length > 2) {
            tags.add(w.toLowerCase());
        }
    });
    const headings = content.match(/^#{1,3}\s+(.+)$/gm) ?? [];
    for (const h of headings.slice(0, 5)) {
        h.replace(/^#+\s+/, '').split(/\s+/).forEach(w => {
            const clean = w.replace(/[^a-z0-9]/gi, '').toLowerCase();
            if (clean.length > 3) {
                tags.add(clean);
            }
        });
    }
    return [...tags].slice(0, 12);
}
function mdToHtml(md) {
    return md
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/```(\w*)\n([\s\S]*?)```/gm, '<pre><code class="lang-$1">$2</code></pre>')
        .replace(/```([\s\S]*?)```/gm, '<pre><code>$1</code></pre>')
        .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
        .replace(/^---+$/gm, '<hr>')
        .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
        .replace(/^\* (.+)$/gm, '<li>$1</li>')
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
        .replace(/^\|(.+)\|$/gm, (row) => {
        const cells = row.split('|').slice(1, -1).map(c => `<td>${c.trim()}</td>`).join('');
        return `<tr>${cells}</tr>`;
    })
        .replace(/\n\n/g, '</p><p>')
        .replace(/^(?!<[hlbptcr])(.+)$/gm, '$1<br>');
}
//# sourceMappingURL=content.js.map