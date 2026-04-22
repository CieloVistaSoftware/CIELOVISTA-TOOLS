// Test: Ensures all Dewey numbers in the NPM scripts panel are unique (no duplicates allowed)
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// This test will scan the rendered HTML for the NPM scripts panel and extract Dewey numbers
// It expects the panel HTML to be saved as data/button-click-output.txt (or similar)

const htmlPath = path.join(__dirname, '../data/button-click-output.txt');
assert(fs.existsSync(htmlPath), 'NPM scripts panel HTML not found: ' + htmlPath);

const html = fs.readFileSync(htmlPath, 'utf8');
const deweyRegex = /<span[^>]*>\s*(\d{3}\.\d{3})\s*<\/span>/g;
const found = [];
let match;
while ((match = deweyRegex.exec(html)) !== null) {
  found.push(match[1]);
}
const seen = new Set();
const duplicates = [];
for (const d of found) {
  if (seen.has(d)) duplicates.push(d);
  seen.add(d);
}
assert(duplicates.length === 0, 'Duplicate Dewey numbers found in NPM scripts: ' + duplicates.join(', '));
console.log('PASS: No duplicate Dewey numbers in NPM scripts.');
