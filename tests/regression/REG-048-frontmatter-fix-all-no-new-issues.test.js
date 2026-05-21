// Copyright (c) CieloVista Software. All rights reserved.
// REG-048: Frontmatter Viewer Fix All must never open new GitHub issues.
//
// Ensures the fix-all message handler only restores already-filed IDs from
// _filedIssues and does not call fileFrontmatterViolationAsIssue.
//
// Run: node tests/regression/REG-048-frontmatter-fix-all-no-new-issues.test.js

'use strict';

const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'features', 'frontmatter-viewer.ts'),
    'utf8'
);

let passed = 0;
let failed = 0;

function pass(msg) { console.log(`  PASS ${msg}`); passed += 1; }
function fail(msg) { console.error(`  FAIL ${msg}`); failed += 1; }

console.log('REG-048: Frontmatter Fix All does not file new issues');
console.log('─'.repeat(64));

const start = SRC.indexOf("if (msg.command === 'fix-all'");
const end = SRC.indexOf("if (msg.command === 'fix'", start);

if (start < 0 || end < 0 || end <= start) {
    fail('Could not locate fix-all handler block boundaries');
} else {
    const block = SRC.slice(start, end);

    if (block.includes("_filedIssues.get(normalizeRelPath(String(item.relPath)))")) {
        pass('fix-all reads existing filed IDs from _filedIssues map');
    } else {
        fail('fix-all must read known issue IDs from _filedIssues');
    }

    if (block.includes('fileFrontmatterViolationAsIssue(')) {
        fail('fix-all must NOT call fileFrontmatterViolationAsIssue');
    } else {
        pass('fix-all does not call fileFrontmatterViolationAsIssue');
    }

    if (block.includes('This will not open new issues.')) {
        pass('fix-all confirmation explicitly states no new issues are opened');
    } else {
        fail('fix-all confirmation message must state no new issues are opened');
    }

    if (block.includes("type: 'fix-result'") && block.includes('ok: true') && block.includes('number: known.number')) {
        pass('fix-all emits fix-result from known issue IDs');
    } else {
        fail('fix-all should emit fix-result payload from known IDs');
    }
}

console.log('─'.repeat(64));
console.log(`${passed + failed} checks: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
