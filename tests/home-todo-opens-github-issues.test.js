'use strict';
/**
 * tests/home-todo-opens-github-issues.test.js
 *
 * Regression guard for CVT Home quick-launch Issue Viewer behavior.
 *
 * Requirement:
 *   Home Issue Viewer button must open the GitHub Issues panel (showGithubIssues)
 *   and must not route to local TODO doc preview.
 *
 * Run: node tests/home-todo-opens-github-issues.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const SRC    = path.join(__dirname, '..', 'src', 'features', 'home-page.ts');
// esbuild bundles all features into a single out/extension.js
const BUNDLE = path.join(__dirname, '..', 'out', 'extension.js');

const src    = fs.readFileSync(SRC, 'utf8');
const bundle = fs.existsSync(BUNDLE) ? fs.readFileSync(BUNDLE, 'utf8') : '';

function mustContain(haystack, needle, label) {
  assert.ok(haystack.includes(needle), `${label}\nMissing: ${needle}`);
}

function mustNotContain(haystack, needle, label) {
  assert.ok(!haystack.includes(needle), `${label}\nUnexpected: ${needle}`);
}

// Source checks
mustContain(src, "label: 'Issue Viewer'", 'SOURCE: Home quick-launch Issue Viewer button label must exist');
mustContain(src, "desc: 'Live GitHub issues for cielovista-tools'", 'SOURCE: Issue Viewer description must indicate GitHub issues');
mustContain(src, "cmd: '__openIssues__'", 'SOURCE: Issue Viewer command key must remain wired');
mustContain(src, "if (msg.command === '__openIssues__')", 'SOURCE: Issue Viewer command handler must exist');
mustContain(src, 'showGithubIssues(', 'SOURCE: Issue Viewer command must open GitHub issues view');
mustContain(src, "from '../shared/github-issues-view'", 'SOURCE: Home page must import GitHub issues view helper');
mustNotContain(src, 'openDocPreview(todoPath, \'Home\')', 'SOURCE: Issue Viewer command must not open local TODO doc preview');
mustNotContain(src, 'TODO-UPDATED.md', 'SOURCE: Issue Viewer command must not depend on local TODO-UPDATED.md file');

// Bundle checks (esbuild inlines all feature modules into out/extension.js)
assert.ok(bundle.length > 0,
  'BUNDLE: out/extension.js not found. Run npm run compile or npm run rebuild.');
mustContain(bundle, 'showGithubIssues', 'BUNDLE: GitHub issues helper wiring missing in compiled bundle');
mustNotContain(bundle, 'TODO-UPDATED.md', 'BUNDLE: Local TODO doc path should not appear in compiled bundle');
assert.ok(
  bundle.includes('__openIssues__') || bundle.includes('__openTodo__'),
  'BUNDLE: Expected Home quick-launch issues command key (__openIssues__ or legacy __openTodo__) in compiled bundle'
);

console.log('PASS: Home Issue Viewer button routes to GitHub Issues (regression guard).');
