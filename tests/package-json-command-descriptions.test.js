// Test: All commands in package.json have a non-empty description
// Run with: node tests/package-json-command-descriptions.test.js

const fs = require('fs');
const path = require('path');

const pkgPath = path.join(__dirname, '../package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const missing = [];

(pkg.contributes.commands || []).forEach(cmd => {
  if (!('description' in cmd) || typeof cmd.description !== 'string' || !cmd.description.trim()) {
    missing.push(cmd.command);
  }
});

if (missing.length === 0) {
  console.log('PASS: All commands have a non-empty description.');
  process.exit(0);
} else {
  console.error('FAIL: The following commands are missing a description:');
  missing.forEach(c => console.error('  -', c));
  process.exit(1);
}
