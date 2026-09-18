// Copyright (c) 2026 CieloVista Software. All rights reserved.
// One-shot script: tag bare opening fences in project markdown files with 'text'.
// Reads the docs every doc feature reads: the one walk and skip list (#812).
'use strict';

const fs   = require('fs');
const path = require('path');
const { walkDocTree } = require('./lib/doc-walk');

const root = path.resolve(__dirname, '..');
let totalFixed = 0;

for (const file of walkDocTree(root, { maxDepth: Infinity })) {
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
