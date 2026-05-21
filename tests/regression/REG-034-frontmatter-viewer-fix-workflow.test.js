// Copyright (c) CieloVista Software. All rights reserved.
// REG-034: Issue #339 — Frontmatter Viewer per-row Fix workflow
//
// Validates that frontmatter-viewer wiring includes:
// 1) a Fix action for violation rows,
// 2) generated failing regression test creation,
// 3) GitHub issue filing with proposed fix + test checklist,
// 4) webview status update/open-issue behavior.
//
// Run: node tests/regression/REG-034-frontmatter-viewer-fix-workflow.test.js

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'src/features/frontmatter-viewer.ts'), 'utf8');

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

console.log('REG-034: Frontmatter Viewer Fix workflow (#339)');
console.log('─'.repeat(60));

test('violation rows render Fix button action', () => {
    assert(SRC.includes('data-action="fix"'), 'Fix button action is missing');
    assert(SRC.includes('data-violations='), 'Fix button must carry violation payload');
    assert(SRC.includes('data-rel-path='), 'Fix button must carry relative file path');
    // data-fix-id is the round-trip key: button → postMessage → fix-result handler → button re-selector.
    // Without this attribute the result message can never find the button to update it.
    assert(SRC.includes('data-fix-id='), 'Fix button must carry data-fix-id so the result handler can re-select it');
});

test('webview click handler dispatches fix command', () => {
    assert(SRC.includes("command: 'fix'"), 'webview must post fix command');
    assert(SRC.includes('fixId: fixEl.dataset.fixId'), 'fix payload must include fixId');
    assert(SRC.includes('violations: fixEl.dataset.violations'), 'fix payload must include violation data');
});

test('fix-result handler re-selects button by data-fix-id', () => {
    // The fix-result message must re-select the exact button using the fixId from the HTML attribute,
    // not by index or DOM position — otherwise the wrong button gets updated on concurrent clicks.
    assert(SRC.includes("'[data-fix-id=\"' + m.fixId + '\"]'") ||
           SRC.includes('"[data-fix-id=\\"" + m.fixId + "\\"]"') ||
           SRC.includes('[data-fix-id="\''), 'fix-result handler must re-select button via [data-fix-id]');
    assert(SRC.includes("if (m.type !== 'fix-result' || !m.fixId)"),
        'fix-result handler must guard on m.fixId presence');
});

test('open-issue click handler reads url from data-url attribute', () => {
    assert(SRC.includes("data-action=\"open-issue\"") || SRC.includes("data-action='open-issue'"),
        'Converted Fix button must use data-action="open-issue"');
    assert(SRC.includes('openIssueEl.dataset.url'),
        'open-issue handler must read URL from dataset.url, not a hardcoded value');
    assert(SRC.includes("command: 'open-issue'"),
        'open-issue handler must dispatch open-issue command to extension host');
});

test('feature creates failing test file before issue filing', () => {
    assert(SRC.includes('function createFailingFixTest'), 'createFailingFixTest helper is missing');
    assert(SRC.includes("path.join(root, 'tests', 'regression')"), 'failing test must be written under tests/regression');
    assert(SRC.includes('REG-339-frontmatter-fix-'), 'test filename prefix must track issue #339 workflow');
});

test('issue body includes what is wrong and proposed fix details', () => {
    assert(SRC.includes('## Violations'), 'issue body must include violation section');
    assert(SRC.includes('## Proposed Fix'), 'issue body must include proposed fix section');
    assert(SRC.includes('## Reproduction Test (Auto-generated)'), 'issue body must include reproduction test section');
});

test('issue body includes review and pass-before-close checklist', () => {
    assert(SRC.includes('Reproduction test passes after the fix.'), 'issue must require passing test');
    assert(SRC.includes('User reviewed and approved the fix.'), 'issue must require user review approval');
});

test('extension host files frontmatter issue and returns link/status', () => {
    assert(SRC.includes('fileFrontmatterViolationAsIssue'), 'frontmatter issue filer call is missing');
    assert(SRC.includes("type: 'fix-result'"), 'webview fix-result message is missing');
    assert(SRC.includes("btn.dataset.action = 'open-issue'"), 'Fix button should convert to open-issue action after filing');
});

console.log('─'.repeat(60));
if (failed === 0) {
    console.log(`✓ REG-034 passed (${passed} checks).\n`);
    process.exit(0);
} else {
    console.error(`✗ REG-034 FAILED (${failed} of ${passed + failed} checks failed).\n`);
    process.exit(1);
}
