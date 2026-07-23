// Copyright (c) CieloVista Software. All rights reserved.
// scripts/generate-marketplace-features.js
//
// Fixes GitHub issue #644: the cvt-demo Marketplace page ("What's inside")
// used to list 4 hand-picked feature cards. This script derives the FULL
// feature list from the canonical command catalog
// (src/features/cvs-command-launcher/catalog.ts) and injects it into
// docs/_today/marketplace.html between generated-content markers, so new
// feature groups show up automatically the next time this script runs —
// no second manual edit required.
//
// Run: node scripts/generate-marketplace-features.js
// Wire: called as part of npm run rebuild via npm run docs:marketplace

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT          = path.resolve(__dirname, '..');
const CATALOG_PATH   = path.join(ROOT, 'src', 'features', 'cvs-command-launcher', 'catalog.ts');
const MARKETPLACE_HTML = path.join(ROOT, 'docs', '_today', 'marketplace.html');

const CHIPS_START = '<!-- AUTO-GENERATED:INCLUDED-FEATURES:START (scripts/generate-marketplace-features.js — do not hand-edit) -->';
const CHIPS_END   = '<!-- AUTO-GENERATED:INCLUDED-FEATURES:END -->';
const CARDS_START = '<!-- AUTO-GENERATED:FEATURE-CARDS:START (scripts/generate-marketplace-features.js — do not hand-edit) -->';
const CARDS_END   = '<!-- AUTO-GENERATED:FEATURE-CARDS:END -->';

const SCOPE_LABELS = {
    global:      'Global',
    workspace:   'Workspace',
    diskcleanup: 'DiskCleanUp',
    tools:       'Internal',
};

// ── catalog.ts parsing ───────────────────────────────────────────────────────
// catalog.ts is TypeScript (ES modules) and is compiled as part of the
// extension bundle, not something this plain Node script can `require()`.
// Every RAW_CATALOG entry is a flat `{ key: 'value', ... }` object literal
// with no nested braces (only nested `[...]` tag/tooltip arrays), so a
// string-literal-aware brace scan is sufficient to recover every entry
// without needing a TypeScript compiler here.

/** Extract each top-level `{ ... }` object literal from the RAW_CATALOG array body. */
function extractCatalogEntries(src) {
    const anchor = 'const RAW_CATALOG';
    const anchorIdx = src.indexOf(anchor);
    if (anchorIdx === -1) {
        throw new Error(`Could not find "${anchor}" in ${CATALOG_PATH}`);
    }
    const eqIdx = src.indexOf('=', anchorIdx);
    const arrStart = src.indexOf('[', eqIdx);
    if (arrStart === -1) {
        throw new Error('Could not find RAW_CATALOG array literal start');
    }

    // Find the matching closing `]` for the outer array, skipping string literals.
    let depth = 0;
    let str = null;
    let arrEnd = -1;
    for (let i = arrStart; i < src.length; i++) {
        const ch = src[i];
        const prev = src[i - 1];
        if (str) {
            if (ch === str && prev !== '\\') { str = null; }
            continue;
        }
        if (ch === "'" || ch === '"' || ch === '`') { str = ch; continue; }
        if (ch === '[') { depth++; }
        else if (ch === ']') { depth--; if (depth === 0) { arrEnd = i; break; } }
    }
    if (arrEnd === -1) {
        throw new Error('Could not find matching close bracket for RAW_CATALOG array');
    }
    const arrBody = src.slice(arrStart + 1, arrEnd);

    // Split the array body into individual `{ ... }` entries.
    const entries = [];
    let cursor = 0;
    while (cursor < arrBody.length) {
        const openIdx = arrBody.indexOf('{', cursor);
        if (openIdx === -1) { break; }
        let braceDepth = 1;
        let entryStr = null;
        let closeIdx = -1;
        for (let k = openIdx + 1; k < arrBody.length; k++) {
            const ch = arrBody[k];
            const prev = arrBody[k - 1];
            if (entryStr) {
                if (ch === entryStr && prev !== '\\') { entryStr = null; }
                continue;
            }
            if (ch === "'" || ch === '"' || ch === '`') { entryStr = ch; continue; }
            if (ch === '{') { braceDepth++; }
            else if (ch === '}') { braceDepth--; if (braceDepth === 0) { closeIdx = k; break; } }
        }
        if (closeIdx === -1) { break; }
        entries.push(arrBody.slice(openIdx, closeIdx + 1));
        cursor = closeIdx + 1;
    }
    return entries;
}

/** Read a single-quoted `key: 'value'` field out of one entry's source text. */
function readField(entryText, key) {
    const re = new RegExp(key + "\\s*:\\s*'((?:[^'\\\\]|\\\\.)*)'");
    const m = entryText.match(re);
    return m ? m[1].replace(/\\'/g, "'") : null;
}

/** Group RAW_CATALOG entries by their `group` field, matching the catalog's own organization. */
function groupCatalogEntries(entries) {
    const groups = new Map();
    for (const entryText of entries) {
        const group       = readField(entryText, 'group');
        const groupIcon    = readField(entryText, 'groupIcon');
        const description  = readField(entryText, 'description');
        const scope        = readField(entryText, 'scope');
        const title        = readField(entryText, 'title');
        if (!group) { continue; }

        if (!groups.has(group)) {
            groups.set(group, { name: group, icon: groupIcon || '🧩', count: 0, descriptions: [], scopes: new Set(), titles: [] });
        }
        const g = groups.get(group);
        g.count++;
        if (description) { g.descriptions.push(description); }
        if (scope) { g.scopes.add(scope); }
        if (title) { g.titles.push(title); }
    }
    // Sort by command count (most substantial feature areas first), stable by name.
    return [...groups.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function scopeLabel(group) {
    if (group.scopes.size === 1) {
        const only = [...group.scopes][0];
        return SCOPE_LABELS[only] || only;
    }
    return 'Mixed';
}

function groupDescription(group) {
    const first = group.descriptions[0] || `${group.count} command${group.count === 1 ? '' : 's'} in this area.`;
    if (group.count <= 1) { return first; }
    return `${first} Includes ${group.count} commands in this group.`;
}

function escHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ── HTML fragment builders ──────────────────────────────────────────────────

function buildChipsHtml(groups) {
    const chips = groups.map(g => `<div class="flex items-center gap-sm text-on-surface-variant font-body-md">
<span class="text-primary text-[18px]" aria-hidden="true">${g.icon}</span>${escHtml(g.name)}
</div>`).join('\n');
    return `${CHIPS_START}\n<div class="grid grid-cols-2 md:grid-cols-4 gap-sm">\n${chips}\n</div>\n${CHIPS_END}`;
}

function buildCardsHtml(groups) {
    const cards = groups.map(g => `<div class="bg-surface-container-lowest rounded-xl border border-outline-variant/30 p-lg flex flex-col gap-sm">
<div class="flex items-center gap-sm">
<div class="w-10 h-10 rounded-xl bg-primary-container flex items-center justify-center shrink-0 text-[20px]" aria-hidden="true">${g.icon}</div>
<div>
<h3 class="font-headline-md text-headline-md text-on-surface leading-tight">${escHtml(g.name)}</h3>
<span class="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest">${escHtml(scopeLabel(g))} &nbsp;·&nbsp; ${g.count} command${g.count === 1 ? '' : 's'}</span>
</div>
</div>
<p class="text-on-surface-variant font-body-md">${escHtml(groupDescription(g))}</p>
</div>`).join('\n');
    return `${CARDS_START}\n${cards}\n${CARDS_END}`;
}

function replaceBetweenMarkers(html, startMarker, endMarker, replacement) {
    const startIdx = html.indexOf(startMarker);
    const endIdx = html.indexOf(endMarker);
    if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
        throw new Error(`Could not find marker pair in marketplace.html: "${startMarker}" / "${endMarker}"`);
    }
    return html.slice(0, startIdx) + replacement + html.slice(endIdx + endMarker.length);
}

// ── main ─────────────────────────────────────────────────────────────────────

function main() {
    const catalogSrc = fs.readFileSync(CATALOG_PATH, 'utf8');
    const entries = extractCatalogEntries(catalogSrc);
    if (entries.length === 0) {
        throw new Error('Parsed zero catalog entries — catalog.ts format may have changed; update scripts/generate-marketplace-features.js');
    }
    const groups = groupCatalogEntries(entries);

    let html = fs.readFileSync(MARKETPLACE_HTML, 'utf8');
    html = replaceBetweenMarkers(html, CHIPS_START, CHIPS_END, buildChipsHtml(groups));
    html = replaceBetweenMarkers(html, CARDS_START, CARDS_END, buildCardsHtml(groups));
    fs.writeFileSync(MARKETPLACE_HTML, html, 'utf8');

    console.log('\nCieloVista Tools — Marketplace Feature Sync');
    console.log('─'.repeat(50));
    console.log(`✓ Parsed ${entries.length} commands across ${groups.length} feature groups from catalog.ts`);
    for (const g of groups) {
        console.log(`  ${g.icon}  ${g.name} (${g.count})`);
    }
    console.log(`✓ Updated ${path.relative(ROOT, MARKETPLACE_HTML)}\n`);
}

main();
