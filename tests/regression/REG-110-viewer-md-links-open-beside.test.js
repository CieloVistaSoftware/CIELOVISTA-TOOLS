/**
 * tests/regression/REG-110-viewer-md-links-open-beside.test.js
 *
 * Regression test for issue #517:
 *   "All viewers: .md doc links must open preview to the RIGHT of the current panel"
 *
 * Every webview that opens files from a panel must use:
 *   { viewColumn: ViewColumn.Beside, preview: true, preserveFocus: true }
 * so the viewer retains focus while the doc opens to the right.
 *
 * Run: node tests/regression/REG-110-viewer-md-links-open-beside.test.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const SRC  = path.join(ROOT, 'src');

let passed = 0, failed = 0;

function check(label, condition) {
    if (condition) { console.log(`  ✓ ${label}`); passed++; }
    else           { console.error(`  ✗ ${label}`); failed++; }
}

function read(rel) { return fs.readFileSync(path.join(SRC, rel), 'utf8'); }

console.log('\nREG-110: Viewer file links open with ViewColumn.Beside + preserveFocus\n' + '─'.repeat(60));

// ── command-registry-viewer.ts ────────────────────────────────────────────────
const crv = read('features/command-registry-viewer.ts');
check('command-registry-viewer uses preserveFocus:true on openFile',
    crv.includes('preserveFocus: true'));
check('command-registry-viewer uses ViewColumn.Beside on openFile',
    crv.includes('ViewColumn.Beside'));

// ── code-highlight-audit.ts ───────────────────────────────────────────────────
const cha = read('features/code-highlight-audit.ts');
check('code-highlight-audit uses preserveFocus:true on open command',
    cha.includes('preserveFocus: true'));
check('code-highlight-audit uses ViewColumn.Beside on open command',
    cha.includes('ViewColumn.Beside'));

// ── code-auditor.ts ───────────────────────────────────────────────────────────
const ca = read('features/code-auditor.ts');
check('code-auditor uses preserveFocus:true on open command',
    ca.includes('preserveFocus: true'));
check('code-auditor uses ViewColumn.Beside on open command',
    ca.includes('ViewColumn.Beside'));

console.log('');
if (failed > 0) { console.error(`FAILED ${failed} / ${passed + failed}`); process.exit(1); }
console.log(`PASSED ${passed} / ${passed}`);
process.exit(0);
