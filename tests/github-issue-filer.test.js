// Unit test for github-issue-filer — source and bundle checks.
// Since esbuild bundles all modules into out/extension.js, individual compiled
// files no longer exist. We verify against the TypeScript source.

'use strict';
const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC  = path.join(ROOT, 'src', 'shared', 'github-issue-filer.ts');
const BUNDLE = path.join(ROOT, 'out', 'extension.js');

const src    = fs.readFileSync(SRC, 'utf8');
const bundle = fs.existsSync(BUNDLE) ? fs.readFileSync(BUNDLE, 'utf8') : '';

let passed = 0, failed = 0;
function expect(label, cond, detail) {
    if (cond) { console.log('  PASS - ' + label); passed++; }
    else      { console.log('  FAIL - ' + label + (detail ? ': ' + detail : '')); failed++; }
}

// ── Source: exports ──────────────────────────────────────────────────────────
console.log('=== Source: exports ===');
expect('buildTitle exported',             src.includes('export function buildTitle'));
expect('buildBody exported',              src.includes('export function buildBody'));
expect('fileErrorAsIssue exported',       src.includes('export async function fileErrorAsIssue'));
expect('fileRegressionAsIssue exported',  src.includes('export async function fileRegressionAsIssue'));
expect('fileHealthBugAsIssue exported',   src.includes('export async function fileHealthBugAsIssue'));
expect('fetchAutoFiledIssueMap exported', src.includes('export async function fetchAutoFiledIssueMap'));

// ── buildTitle behavior ───────────────────────────────────────────────────────
console.log('\n=== buildTitle behavior ===');
expect('title starts with [type] tag',  src.includes('`[${e.type}]'));
expect('truncates long messages',        src.includes('msg.slice(0, max - 1)') || src.includes('msg.slice(0,max-1)'));
expect('truncation uses ellipsis \\u2026', src.includes('\\u2026'));

// ── buildBody behavior ────────────────────────────────────────────────────────
console.log('\n=== buildBody behavior ===');
expect('auto-filed header in body',      src.includes('Auto-filed from CVT Error Log Viewer'));
expect('Type field in body',             src.includes('**Type:**'));
expect('Source field in body',           src.includes('**Source:**'));
expect('Context field in body',          src.includes('**Context:**'));
expect('Timestamp field in body',        src.includes('**Timestamp:**'));
expect('Location field in body',         src.includes('**Location:**'));
expect('Message section in body',        src.includes('### Message'));
expect('Stack trace section in body',    src.includes('### Stack trace'));
expect('skips empty context',            src.includes("if (e.context)") || src.includes('e.context &&') || src.includes('e.context?'));
expect('skips empty command',            src.includes("if (e.command)") || src.includes('e.command &&') || src.includes('e.command?'));
expect('skips empty stack',              src.includes("if (e.stack)") || src.includes('e.stack &&') || src.includes('e.stack?.'));
expect('skips empty filename',           src.includes("if (e.filename)") || src.includes('e.filename &&') || src.includes('e.filename?'));

// ── Newline normalization behavior ───────────────────────────────────────────
console.log('\n=== newline normalization behavior ===');
expect('normalizeGithubMarkdownBody helper exists', src.includes('function normalizeGithubMarkdownBody'));
expect('normalizer preserves fenced blocks', src.includes('Decode escaped newlines only outside fenced blocks'));
expect('postIssueComment normalizes body', src.includes('JSON.stringify({ body: normalizeGithubMarkdownBody(body) })'));
expect('postIssue normalizes body', src.includes('body: normalizeGithubMarkdownBody(body)'));

// ── Bundle check ──────────────────────────────────────────────────────────────
console.log('\n=== Bundle ===');
if (bundle.length === 0) {
    console.log('  SKIP bundle checks — out/extension.js not found, run npm run compile');
} else {
    expect('bundle contains buildTitle',    bundle.includes('buildTitle'));
    expect('bundle contains buildBody',     bundle.includes('buildBody'));
    expect('bundle contains auto-filed text', bundle.includes('Auto-filed from CVT Error Log Viewer'));
}

console.log('');
console.log(`=== Result: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
