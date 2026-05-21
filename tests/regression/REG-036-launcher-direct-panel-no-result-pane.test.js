/**
 * REG-036-launcher-direct-panel-no-result-pane.test.js
 *
 * Regression guard for issues #340 and #344:
 * Frontmatter Viewer and Tools Error Log already open their own webviews,
 * so launcher runWithOutput must NOT open an extra result panel for them.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..', '..');
const INDEX_TS = path.join(ROOT, 'src', 'features', 'cvs-command-launcher', 'index.ts');
const src = fs.readFileSync(INDEX_TS, 'utf8');

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

console.log('REG-036: launcher direct-panel commands skip result pane (#340/#344)');
console.log('─'.repeat(72));

test('DIRECT_PANEL_COMMANDS set exists', () => {
    assert(src.includes('const DIRECT_PANEL_COMMANDS = new Set<string>(['), 'DIRECT_PANEL_COMMANDS set is missing');
});

test('frontmatter viewer command is direct-panel', () => {
    assert(src.includes("'cvs.headers.frontmatterViewer'"), 'frontmatter viewer command must be in DIRECT_PANEL_COMMANDS');
});

test('error log command is direct-panel', () => {
    assert(src.includes("'cvs.tools.errorLog'"), 'error log command must be in DIRECT_PANEL_COMMANDS');
});

test('execute path bypasses result panel for direct-panel commands', () => {
    assert(
        src.includes("entry?.action === 'read' || DIRECT_PANEL_COMMANDS.has(commandId)"),
        'direct-panel commands must run through direct execution path'
    );
});

console.log('─'.repeat(72));
if (failed === 0) {
    console.log(`✓ REG-036 passed (${passed} checks).\n`);
    process.exit(0);
} else {
    console.error(`✗ REG-036 FAILED (${failed} of ${passed + failed} checks failed).\n`);
    process.exit(1);
}
