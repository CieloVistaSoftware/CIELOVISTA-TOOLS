// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Test: Ensures all Dewey numbers in the catalog are unique (no duplicates allowed)

const path = require('path');
const fs = require('fs');

describe('Catalog Dewey Number Uniqueness', () => {
  it('should have no duplicate Dewey numbers', () => {
    const catalogPath = path.join(__dirname, '../src/features/cvs-command-launcher/catalog.ts');
    const content = fs.readFileSync(catalogPath, 'utf8');
    const arrMatch = content.match(/export const CATALOG: CmdEntry\[] = \[(.*?)];/s);
    expect(arrMatch).toBeTruthy();
    const arrText = arrMatch[1];
    const deweyRegex = /dewey\s*:\s*['"](\d{3}\.[0-9]{3})['"]/g;
    const seen = new Map();
    let match;
    let duplicates = [];
    while ((match = deweyRegex.exec(arrText)) !== null) {
      const dewey = match[1];
      if (seen.has(dewey)) {
        duplicates.push(dewey);
      } else {
        seen.set(dewey, true);
      }
    }
    expect(duplicates).toEqual([]);
  });
});
