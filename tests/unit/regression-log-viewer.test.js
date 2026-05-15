/**
 * tests/unit/regression-log-viewer.test.js
 *
 * Structural regression checks for the Regression Log Viewer feature.
 * Run: node tests/unit/regression-log-viewer.test.js
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const VIEWER_SRC = path.join(ROOT, 'src', 'features', 'regression-log-viewer.ts');
const HOME_SRC = path.join(ROOT, 'src', 'features', 'home-page.ts');
const BUNDLE = path.join(ROOT, 'out', 'extension.js');

const viewerSrc = fs.readFileSync(VIEWER_SRC, 'utf8');
const homeSrc = fs.readFileSync(HOME_SRC, 'utf8');
const bundle = fs.existsSync(BUNDLE) ? fs.readFileSync(BUNDLE, 'utf8') : '';

function mustContain(haystack, needle, label) {
    assert.ok(haystack.includes(needle), `${label}\nMissing: ${needle}`);
}

function mustMatch(haystack, pattern, label) {
    assert.ok(pattern.test(haystack), `${label}\nPattern: ${pattern}`);
}

mustContain(viewerSrc, "registerCommand('cvs.tools.regressionLog'", 'SOURCE: Regression Log command must be registered');
mustContain(viewerSrc, "fileRegressionAsIssue", 'SOURCE: viewer must file regressions as GitHub issues');
mustContain(viewerSrc, "data/regressions.json", 'SOURCE: viewer must reference structured regressions.json data');
mustContain(viewerSrc, "docs/REGRESSION-LOG.md", 'SOURCE: viewer must reference the markdown narrative log');
mustContain(viewerSrc, "sortEntriesNewestFirst", 'SOURCE: entries must be sorted newest-first');
mustContain(viewerSrc, "<span class=\"pill pill-open\">⚠️ ${openCount} open</span>", 'SOURCE: open-count pill must always render');
mustContain(viewerSrc, "<span class=\"pill pill-fixed\">✅ ${fixedCount} fixed</span>", 'SOURCE: fixed-count pill must always render');
mustMatch(viewerSrc, /e\.status !== 'fixed'[\s\S]{0,220}File as Issue/, 'SOURCE: only open entries should render the File as Issue button');
mustMatch(viewerSrc, /data-action="mark-fixed"[\s\S]{0,220}Record this regression as fixed/, 'SOURCE: open entries must offer Mark Fixed');
mustContain(viewerSrc, "refreshPanel();", 'SOURCE: viewer should refresh after file/fix actions so counts and status stay current');

mustContain(homeSrc, "label: 'Regression Log'", 'SOURCE: Home quick-launch Regression Log button label must exist');
mustContain(homeSrc, "cmd: 'cvs.tools.regressionLog'", 'SOURCE: Home quick-launch Regression Log command must be wired');
mustMatch(homeSrc, /OPEN_DIRECT[\s\S]{0,800}cvs\.tools\.regressionLog/, 'SOURCE: Home quick-launch Regression Log command must route directly');

assert.ok(bundle.length > 0, 'BUNDLE: out/extension.js not found. Run npm run compile first.');
mustContain(bundle, 'cvs.tools.regressionLog', 'BUNDLE: compiled bundle must include Regression Log command wiring');
mustContain(bundle, 'Regression Log', 'BUNDLE: compiled bundle must include Regression Log UI text');

console.log('PASS: Regression Log Viewer is wired in source and compiled bundle.');
