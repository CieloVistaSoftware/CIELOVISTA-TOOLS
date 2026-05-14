// Copyright (c) CieloVista Software. All rights reserved.
// REG-039: Issue #342 — Docs audit table view + copy actions
//
// Run: node tests/regression/REG-039-doc-audit-table-copy-controls.test.js

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..', '..');
const HTML_SRC = fs.readFileSync(path.join(ROOT, 'src/features/doc-auditor/html.ts'), 'utf8');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'src/features/doc-auditor/index.ts'), 'utf8');

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

console.log('REG-039: Docs audit table + copy controls (#342)');
console.log('─'.repeat(64));

test('html renders findings table with all requested columns', () => {
    assert(HTML_SRC.includes('Findings Table'), 'Findings Table section is missing');
    assert(HTML_SRC.includes('<th>Category</th>'), 'Category column header missing');
    assert(HTML_SRC.includes('<th>Filename</th>'), 'Filename column header missing');
    assert(HTML_SRC.includes('<th>Project</th>'), 'Project column header missing');
    assert(HTML_SRC.includes('<th>Location</th>'), 'Location column header missing');
    assert(HTML_SRC.includes('<th>Size (bytes)</th>'), 'Size column header missing');
    assert(HTML_SRC.includes('<th>Last updated</th>'), 'Last updated column header missing');
});

test('html renders copy and copy-chat toolbar actions', () => {
    assert(HTML_SRC.includes('data-action="copy-report"'), 'Copy action button missing');
    assert(HTML_SRC.includes('data-action="copy-chat"'), 'Copy to Chat action button missing');
    assert(HTML_SRC.includes("command: action === 'copy-chat' ? 'copy-chat' : 'copy'"), 'webview postMessage mapping missing');
});

test('index handles copy action via clipboard', () => {
    assert(INDEX_SRC.includes("case 'copy':"), 'copy message handler missing');
    assert(INDEX_SRC.includes('vscode.env.clipboard.writeText(text)'), 'copy handler must write to clipboard');
});

test('index handles copy-chat action with fallback to clipboard', () => {
    assert(INDEX_SRC.includes("case 'copy-chat':"), 'copy-chat message handler missing');
    assert(INDEX_SRC.includes('const sent = await sendToCopilotChat(text);'), 'copy-chat should try Copilot Chat injection');
    assert(INDEX_SRC.includes('Could not inject into Copilot Chat. Copied to clipboard instead.'), 'copy-chat fallback message missing');
});

console.log('─'.repeat(64));
if (failed === 0) {
    console.log(`✓ REG-039 passed (${passed} checks).\n`);
    process.exit(0);
}

console.error(`✗ REG-039 FAILED (${failed} of ${passed + failed} checks failed).\n`);
process.exit(1);
