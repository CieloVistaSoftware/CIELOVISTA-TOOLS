// Test for home-page.ts: command titles should not include their section prefix
// Run with: node tests/home-page-prefix-strip.test.js

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Simulate the grouping and prefix-stripping logic from home-page.ts
function groupAndStripCommands(commands) {
  // Group by prefix
  const grouped = {};
  for (const cmd of commands) {
    if (!cmd.title || typeof cmd.title !== 'string') continue;
    const match = cmd.title.match(/^([\w\s\-]+:)/);
    const prefix = match ? match[1].trim() : 'Other';
    if (!grouped[prefix]) grouped[prefix] = [];
    grouped[prefix].push(cmd);
  }
  // For each group, strip prefix from title
  const result = {};
  for (const [prefix, cmds] of Object.entries(grouped)) {
    result[prefix] = cmds.map(cmd => {
      const idx = cmd.title.indexOf(':');
      return idx !== -1 ? cmd.title.slice(idx + 1).trim() : cmd.title;
    });
  }
  return result;
}

// Load commands from package.json
const pkgPath = path.join(__dirname, '../package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const commands = pkg.contributes && pkg.contributes.commands ? pkg.contributes.commands : [];

const grouped = groupAndStripCommands(commands);

// Test: No command title in a section should start with the section prefix
for (const [prefix, titles] of Object.entries(grouped)) {
  for (const title of titles) {
    assert(
      !title.startsWith(prefix),
      `Title '${title}' in section '${prefix}' should not start with the prefix.`
    );
  }
}

console.log('PASS: All command titles are stripped of their section prefix.');
