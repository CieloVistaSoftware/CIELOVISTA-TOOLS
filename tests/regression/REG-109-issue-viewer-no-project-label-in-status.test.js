/**
 * tests/regression/REG-109-issue-viewer-no-project-label-in-status.test.js
 *
 * Regression test for issue #525:
 *   "Issue Viewer: project:* labels should not appear in the Status column"
 *
 * The Status column in the Issue Viewer was rendering all labels including
 * project:cielovista-tools, which was already shown in the dedicated project column.
 *
 * Fix: filter labels with .filter(l => !l.name.startsWith('project:')) before
 * building the Status cell badges.
 *
 * Run: node tests/regression/REG-109-issue-viewer-no-project-label-in-status.test.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const SRC  = path.join(ROOT, 'src', 'shared', 'github-issues-view.ts');
const src  = fs.readFileSync(SRC, 'utf8');

let passed = 0, failed = 0;

function check(label, condition) {
    if (condition) { console.log(`  ✓ ${label}`); passed++; }
    else           { console.error(`  ✗ ${label}`); failed++; }
}

console.log('\nREG-109: Issue Viewer — project:* labels excluded from Status column\n' + '─'.repeat(60));

check('labels for Status cell filter out project: prefix',
    /iss\.labels\.filter\s*\(\s*\([^)]*\)\s*=>\s*!l\.name\.startsWith\s*\(\s*['"]project:['"]\s*\)/.test(src));

check('project: filter is applied before the .map() that builds badge HTML',
    src.indexOf("!l.name.startsWith('project:')") < src.indexOf("return `<span class=\"label\""));

check('project column still uses iss.labels.find to extract project name',
    src.includes("iss.labels.find((l) => l.name.startsWith('project:'))") ||
    src.includes('iss.labels.find((l) => l.name.startsWith("project:"))'));

console.log('');
if (failed > 0) { console.error(`FAILED ${failed} / ${passed + failed}`); process.exit(1); }
console.log(`PASSED ${passed} / ${passed}`);
process.exit(0);
