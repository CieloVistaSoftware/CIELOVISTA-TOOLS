/**
 * tests/regression/REG-060-regression-log-viewer-acceptance.test.js
 *
 * Guards issue #375: Regression Log Viewer acceptance criteria.
 * All checks are source-level reads — no compilation or network needed.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const SRC     = path.join(__dirname, '../../src/features/regression-log-viewer.ts');
const EXT_SRC = path.join(__dirname, '../../src/extension.ts');
const src     = fs.readFileSync(SRC, 'utf8');
const extSrc  = fs.readFileSync(EXT_SRC, 'utf8');

let passed = 0;
let failed = 0;

function check(label, condition) {
    if (condition) {
        console.log(`  PASS - ${label}`);
        passed++;
    } else {
        console.log(`  FAIL - ${label}`);
        failed++;
    }
}

console.log('\nREG-060: regression-log-viewer acceptance criteria\n' + '─'.repeat(60));

// ── Command registration ──────────────────────────────────────────────────────
check("command 'cvs.tools.regressionLog' registered",
    src.includes("'cvs.tools.regressionLog'") || extSrc.includes("'cvs.tools.regressionLog'"));

// ── Header pills: open count + fixed count ────────────────────────────────────
check('openCount computed from entries',
    src.includes('openCount'));

check('fixedCount computed from entries',
    src.includes('fixedCount'));

check('open pill rendered in toolbar',
    src.includes('pill-open'));

check('fixed pill rendered in toolbar',
    src.includes('pill-fixed'));

// ── Per-entry actions ─────────────────────────────────────────────────────────
check('"file-as-issue" action rendered for un-filed entries',
    src.includes('data-action="file-as-issue"'));

check('"mark-fixed" action rendered for open entries',
    src.includes('data-action="mark-fixed"'));

check('"open-issue" action rendered for already-filed entries',
    src.includes('data-action="open-issue"'));

check('"open-markdown" toolbar button exists',
    src.includes('data-action="open-markdown"'));

// ── GitHub issue filing integration ──────────────────────────────────────────
check('fileRegressionAsIssue imported from shared',
    src.includes("from '../shared/github-issue-filer'"));

check('fileRegressionAsIssue called on file-as-issue command',
    src.includes('fileRegressionAsIssue(entry)'));

check('patchEntry writes githubIssueNumber after filing',
    src.includes('githubIssueNumber'));

check('patchEntry writes githubIssueUrl after filing',
    src.includes('githubIssueUrl'));

// ── Mark Fixed: prompts for release version, writes fixedDate ────────────────
check('mark-fixed prompts user for release version',
    src.includes('showInputBox'));

check('mark-fixed writes fixedDate to entry',
    src.includes('fixedDate'));

check('mark-fixed writes releaseVersion to entry',
    src.includes('releaseVersion'));

// ── Empty state ───────────────────────────────────────────────────────────────
check('empty state rendered when no regressions',
    src.includes('No regressions on record'));

// ── Open Markdown toolbar button opens REGRESSION-LOG.md beside panel ────────
check('open-markdown opens REGRESSION-LOG.md in Beside column',
    src.includes('REGRESSION-LOG.md') && src.includes('ViewColumn.Beside'));

// ── Panel lifecycle ───────────────────────────────────────────────────────────
check('panel disposed on deactivate',
    src.includes('_panel?.dispose()'));

console.log('');
if (failed > 0) {
    console.log(`FAILED ${failed} / ${passed + failed}`);
    process.exit(1);
}
console.log(`PASSED ${passed} / ${passed}`);
process.exit(0);
