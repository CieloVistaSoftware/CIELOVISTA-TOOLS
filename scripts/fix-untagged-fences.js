// Copyright (c) 2026 CieloVista Software. All rights reserved.
// One-shot script: tag bare opening fences in project markdown files with 'text'.
// Skips .claude/, node_modules/, out/, .vscode-test/.
'use strict';

const fs   = require('fs');
const path = require('path');

const SKIP_DIRS = new Set(['.claude', 'node_modules', 'out', '.vscode-test', '.git']);

function walkMd(dir, results = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name)) { continue; }
            walkMd(full, results);
        } else if (entry.name.endsWith('.md')) {
            results.push(full);
        }
    }
    return results;
}

const root = path.resolve(__dirname, '..');
let totalFixed = 0;

for (const file of walkMd(root)) {
    const src   = fs.readFileSync(file, 'utf8');
    const lines = src.split('\n');
    let inBlock = false;
    let changed = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!inBlock && line === '```') {
            lines[i] = '```text';
            inBlock  = true;
            changed  = true;
            totalFixed++;
        } else if (!inBlock && /^```\S/.test(line)) {
            inBlock = true;
        } else if (inBlock && line === '```') {
            inBlock = false;
        }
    }

    if (changed) {
        fs.writeFileSync(file, lines.join('\n'), 'utf8');
        console.log('Fixed: ' + path.relative(root, file));
    }
}

console.log(`\nDone — ${totalFixed} opening fence(s) tagged.`);
