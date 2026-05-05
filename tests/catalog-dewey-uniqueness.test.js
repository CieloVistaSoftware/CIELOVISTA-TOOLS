// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Test: Ensures all Dewey numbers in the catalog are unique (no duplicates allowed)

'use strict';
const assert = require('assert');
const path   = require('path');
const fs     = require('fs');

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log('  PASS  ' + name); passed++; }
    catch (e) { console.error('  FAIL  ' + name + '\n         → ' + e.message); failed++; }
}

console.log('\nCatalog Dewey Number Uniqueness\n' + '─'.repeat(50));

test('catalog.ts has no duplicate Dewey numbers', () => {
    const catalogPath = path.join(__dirname, '../src/features/cvs-command-launcher/catalog.ts');
    assert.ok(fs.existsSync(catalogPath), 'catalog.ts not found at ' + catalogPath);
    const content  = fs.readFileSync(catalogPath, 'utf8');
    const arrMatch = content.match(/export const CATALOG[\s\S]*?\[([\s\S]*?)\];/);
    assert.ok(arrMatch, 'Could not locate CATALOG array in catalog.ts');
    const arrText     = arrMatch[1];
    const deweyRegex  = /dewey\s*:\s*['"](\d{3}\.[0-9]{3})['"]/g;
    const seen        = new Map();
    const duplicates  = [];
    let m;
    while ((m = deweyRegex.exec(arrText)) !== null) {
        const dewey = m[1];
        if (seen.has(dewey)) { duplicates.push(dewey); } else { seen.set(dewey, true); }
    }
    assert.deepStrictEqual(duplicates, [], 'Duplicate Dewey numbers found: ' + duplicates.join(', '));
});

console.log('\nResult: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) { process.exit(1); }
