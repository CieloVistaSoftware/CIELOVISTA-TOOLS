// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * doc-auditor-html.test.js
 * Issue #328: all file paths in audit report cards must be clickable (data-action="open-file").
 * Run: node tests/unit/doc-auditor-html.test.js
 */
'use strict';

const assert = require('assert');
const path   = require('path');
const fs     = require('fs');

const OUT = path.join(__dirname, '../../out/features/doc-auditor/html.js');
if (!fs.existsSync(OUT)) { console.error(`SKIP: ${OUT} not found — run npm run compile`); process.exit(0); }

const { buildAuditHtml } = require(OUT);

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log(`  ✓ ${name}`); passed++; }
    catch (e) { console.error(`  ✗ ${name}\n    → ${e.message}`); failed++; }
}
function ok(v, msg) { assert.ok(v, msg); }

function makeFile(filePath, projectName = 'test-project', fileName = 'test.md') {
    return { filePath, fileName, projectName, sizeBytes: 1024, modifiedAt: '2026-05-13T10:00:00.000Z', content: '# Test' };
}

const RESULTS = {
    totalDocsScanned: 10, projectsScanned: 2, warningCandidates: [],
    duplicates: [{ fileName: 'CLAUDE.md', files: [makeFile('C:\\alpha\\CLAUDE.md', 'alpha', 'CLAUDE.md'), makeFile('C:\\beta\\CLAUDE.md', 'beta', 'CLAUDE.md')] }],
    similar:    [{ similarity: 0.85, reason: 'overlap', fileA: makeFile('C:\\alpha\\guide.md', 'alpha', 'guide.md'), fileB: makeFile('C:\\beta\\manual.md', 'beta', 'manual.md') }],
    moveCandidates: [{ reason: 'global', file: makeFile('C:\\alpha\\coding-standards.md', 'alpha', 'coding-standards.md') }],
    orphans:        [{ reason: 'no links', file: makeFile('C:\\alpha\\old-notes.md', 'alpha', 'old-notes.md') }],
};

console.log('\ndoc-auditor html unit tests (#328)\n' + '─'.repeat(50));

const html = buildAuditHtml(RESULTS);

// Count all data-action="open-file" occurrences
function countOpenFile(h) {
    return (h.match(/data-action="open-file"/g) || []).length;
}
// Find occurrences of data-path with specific file path
function hasOpenFileForPath(h, fp) {
    const escaped = fp.replace(/\\/g, '\\\\');
    return h.includes(`data-action="open-file" data-path="${escaped}"`) ||
           h.includes(`data-path="${escaped}" data-action="open-file"`) ||
           // path-label uses data-action="open-file" data-path=
           h.includes(`data-path="${fp}"`);
}

test('rendered HTML contains data-action="open-file"', () => {
    ok(countOpenFile(html) > 0, 'Must include at least one open-file action');
});

test('findings table is rendered with expected columns', () => {
    ok(html.includes('Findings Table'), 'Findings Table heading must render');
    ok(html.includes('<th>Category</th>'), 'Table must include Category column');
    ok(html.includes('<th>Filename</th>'), 'Table must include Filename column');
    ok(html.includes('<th>Project</th>'), 'Table must include Project column');
    ok(html.includes('<th>Location</th>'), 'Table must include Location column');
    ok(html.includes('<th>Size (bytes)</th>'), 'Table must include Size column');
    ok(html.includes('<th>Last updated</th>'), 'Table must include Last updated column');
});

test('copy controls are rendered for report and chat', () => {
    ok(html.includes('data-action="copy-report"'), 'Copy button action must exist');
    ok(html.includes('data-action="copy-chat"'), 'Copy to Chat button action must exist');
    ok(html.includes("command: action === 'copy-chat' ? 'copy-chat' : 'copy'"), 'Webview script must post copy commands');
});

test('each file in duplicate group has an open-file action', () => {
    // 2 files in duplicate group → at least 2 open-file per pane (path-label + button)
    ok(countOpenFile(html) >= 4, `Expected ≥4 open-file actions, got ${countOpenFile(html)}`);
});

test('duplicate file paths are marked data-path with open-file', () => {
    ok(hasOpenFileForPath(html, 'C:\\alpha\\CLAUDE.md'), 'C:\\alpha\\CLAUDE.md must have open-file action');
    ok(hasOpenFileForPath(html, 'C:\\beta\\CLAUDE.md'),  'C:\\beta\\CLAUDE.md must have open-file action');
});

test('orphan file path is marked data-path with open-file', () => {
    ok(hasOpenFileForPath(html, 'C:\\alpha\\old-notes.md'), 'old-notes.md must have open-file action');
});

test('move-candidate file path is marked data-path with open-file', () => {
    ok(hasOpenFileForPath(html, 'C:\\alpha\\coding-standards.md'), 'coding-standards.md must have open-file action');
});

test('similar-pair file paths are marked data-path with open-file', () => {
    ok(hasOpenFileForPath(html, 'C:\\alpha\\guide.md'), 'guide.md must have open-file action');
    ok(hasOpenFileForPath(html, 'C:\\beta\\manual.md'),  'manual.md must have open-file action');
});

console.log('\n' + '─'.repeat(50));
if (failed === 0) { console.log(`✓ All ${passed} tests passed\n`); process.exit(0); }
else { console.error(`\n✗ ${failed} test(s) FAILED\n`); process.exit(1); }
