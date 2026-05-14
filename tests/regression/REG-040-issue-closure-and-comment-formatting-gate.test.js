// Copyright (c) CieloVista Software. All rights reserved.
// REG-040: Issues #343/#346 — newline-safe comments + closure gating
//
// Run: node tests/regression/REG-040-issue-closure-and-comment-formatting-gate.test.js

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..', '..');
const FILER_SRC = fs.readFileSync(path.join(ROOT, 'src/shared/github-issue-filer.ts'), 'utf8');
const CLOSER_SRC = fs.readFileSync(path.join(ROOT, 'scripts/close-issue-with-evidence.ps1'), 'utf8');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  PASS ${name}`);
        passed += 1;
    } catch (err) {
        console.error(`  FAIL ${name}\n       ${err.message}`);
        failed += 1;
    }
}

console.log('REG-040: Comment formatting + closure gate (#343/#346)');
console.log('─'.repeat(64));

test('github issue filer normalizes escaped newline text', () => {
    assert(FILER_SRC.includes('function normalizeGithubMarkdownBody(input: string)'), 'normalization helper missing');
    assert(FILER_SRC.includes('.replace(/\\\\n/g, \'\\n\')'), 'escaped newline normalization missing');
    assert(FILER_SRC.includes('JSON.stringify({ body: normalizeGithubMarkdownBody(body) })'), 'comment payload is not normalized');
});

test('closure script blocks close when checklist is incomplete', () => {
    assert(CLOSER_SRC.includes("Test-HasUncheckedChecklist"), 'checklist guard function missing');
    assert(CLOSER_SRC.includes("'(?m)^\\s*[-*]\\s\\[\\s\\]'"), 'unchecked checklist regex missing');
    assert(CLOSER_SRC.includes('Closure blocked: issue #$IssueNumber still has unchecked checklist items.'), 'checklist block error missing');
});

test('closure script requires test evidence and uses body-file comments', () => {
    assert(CLOSER_SRC.includes('test evidence is required'), 'test evidence requirement missing');
    assert(CLOSER_SRC.includes('gh issue comment $IssueNumber --repo $Repo --body-file $tmp'), 'comment should use --body-file for real newlines');
    assert(CLOSER_SRC.includes('gh issue close $IssueNumber --repo $Repo'), 'issue close command missing');
});

console.log('─'.repeat(64));
if (failed === 0) {
    console.log(`✓ REG-040 passed (${passed} checks).\n`);
    process.exit(0);
}

console.error(`✗ REG-040 FAILED (${failed} of ${passed + failed} checks failed).\n`);
process.exit(1);
