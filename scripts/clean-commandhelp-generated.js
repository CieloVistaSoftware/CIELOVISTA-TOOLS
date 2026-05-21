// scripts/clean-commandhelp-generated.js
// Deletes auto-generated numbered help files from src/features/CommandHelp/
// (e.g. cvs-command-launcher.000.100.md, npm-catalog.200.113.md)
// README.md files in the directory are kept.
//
// Run: node scripts/clean-commandhelp-generated.js

'use strict';

const fs   = require('fs');
const path = require('path');

const HELP_DIR = path.join(__dirname, '../src/features/CommandHelp');

const NUMBERED = /^.+\.\d{3}\.\d{3}\.md$/i;

if (!fs.existsSync(HELP_DIR)) {
    console.log('CommandHelp directory not found — nothing to clean.');
    process.exit(0);
}

const files = fs.readdirSync(HELP_DIR).filter(f => NUMBERED.test(f));

if (files.length === 0) {
    console.log('No generated files found — already clean.');
    process.exit(0);
}

for (const file of files) {
    const full = path.join(HELP_DIR, file);
    console.log(`  ...moving canonical file: ${file}`);
    fs.unlinkSync(full);
}

console.log(`\nRemoved ${files.length} generated file${files.length === 1 ? '' : 's'} from src/features/CommandHelp/`);
