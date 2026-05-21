// Copyright (c) CieloVista Software. All rights reserved.
// REG-036: Issue #343 — GitHub comment bodies must not contain literal \n sequences
//
// The TypeScript postIssueComment path uses normalizeGithubMarkdownBody() which
// converts any escaped \n sequences to real newlines before JSON.stringify.
// This regression test verifies:
//   1. normalizeGithubMarkdownBody() exists in the source
//   2. postIssueComment and postIssue call it before JSON.stringify
//   3. Comment body builders use real newlines (not literal \n escape strings)
//
// Run: node tests/regression/REG-036-github-comment-no-escaped-newlines.test.js

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT   = path.resolve(__dirname, '..', '..');
const FILER  = path.join(ROOT, 'src', 'shared', 'github-issue-filer.ts');

let passed = 0, failed = 0;

function test(name, fn) {
    try { fn(); console.log(`  PASS ${name}`); passed++; }
    catch (e) { console.error(`  FAIL ${name}\n       ${e.message}`); failed++; }
}

console.log('REG-036: GitHub comment bodies must not contain literal \\n sequences (#343)');
console.log('─'.repeat(70));

const src = fs.readFileSync(FILER, 'utf8');

// ── Structural checks ────────────────────────────────────────────────────────

test('github-issue-filer.ts exists', () => {
    if (!fs.existsSync(FILER)) { throw new Error(`${FILER} not found`); }
});

test('normalizeGithubMarkdownBody function exists — defensive escaped-\\n sanitizer', () => {
    if (!src.includes('function normalizeGithubMarkdownBody')) {
        throw new Error('normalizeGithubMarkdownBody must be defined in github-issue-filer.ts');
    }
});

test('normalizeGithubMarkdownBody replaces escaped \\n sequences', () => {
    // Must contain .replace(/\\n/g, '\\n') to convert \\n → actual newline
    if (!src.includes("replace(/\\\\n/g, '\\n')") && !src.includes('replace(/\\\\n/g, "\\n")')) {
        throw new Error('normalizeGithubMarkdownBody must replace /\\\\n/g with actual newline character');
    }
});

test('postIssueComment calls normalizeGithubMarkdownBody before JSON.stringify', () => {
    if (!src.includes('normalizeGithubMarkdownBody(body)')) {
        throw new Error('postIssueComment must call normalizeGithubMarkdownBody(body) to sanitize escaped newlines');
    }
});

test('buildBody uses lines.join(newline) — real newlines in output', () => {
    if (!src.includes("lines.join('\\n')") && !src.includes('lines.join("\\n")')) {
        throw new Error('buildBody must use lines.join("\\n") (actual newline) to assemble the body');
    }
});

test('dedup comment for fileErrorAsIssue uses real newline in template literal', () => {
    if (!src.includes("commentLines.join('\\n')")) {
        throw new Error('fileErrorAsIssue dedup comment must join with actual newline (not \\\\n escape string)');
    }
});

test('dedup comment for fileHealthBugAsIssue contains real newline via template literal', () => {
    const deduped = src.match(/const comment\s*=\s*`[^`]*`\s*;/g) || [];
    if (deduped.length === 0) {
        throw new Error('fileHealthBugAsIssue dedup comment must use template literal (backtick string) so \\n is a real newline');
    }
});

console.log('─'.repeat(70));
if (failed === 0) { console.log(`✓ REG-036 passed (${passed} checks).\n`); process.exit(0); }
else { console.error(`✗ REG-036 FAILED (${failed} of ${passed + failed} checks failed).\n`); process.exit(1); }
