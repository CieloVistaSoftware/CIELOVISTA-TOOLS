'use strict';
/**
 * REG-078 — .vscode/settings.json excludes .vscode-test from npm scripts
 *
 * Issue #452: VS Code's NPM Scripts explorer showed all scripts from
 * .vscode-test/vscode-win32-x64-archive-insiders/ — the downloaded VS Code
 * binary used for extension tests.  Those scripts (test-browser, test-node,
 * compile, preinstall, etc.) can never be run by a developer; they belong to
 * VS Code itself.
 *
 * Fix: add "npm.exclude": "**\/.vscode-test\/**" to .vscode/settings.json so
 * VS Code's npm script detector ignores that directory.
 *
 * This test reads and parses the actual settings file to verify the setting is
 * present and well-formed — the same path VS Code will read at startup.
 *
 * Checks:
 *  1. .vscode/settings.json is valid JSON
 *  2. npm.exclude is present
 *  3. npm.exclude contains the .vscode-test glob pattern
 */

const fs   = require('fs');
const path = require('path');

const ROOT     = path.join(__dirname, '..', '..');
const SETTINGS = path.join(ROOT, '.vscode', 'settings.json');

let passed = 0;
let failed = 0;

function check(desc, cond) {
    if (cond) { console.log(`  ✓ ${desc}`); passed++; }
    else       { console.error(`  ✗ ${desc}`); failed++; }
}

console.log('REG-078: .vscode-test excluded from npm scripts explorer');
console.log('');

// Check 1: settings file is valid JSON
let settings = null;
try {
    settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
} catch (e) {
    settings = null;
}
check('.vscode/settings.json parses as valid JSON', settings !== null);

// Check 2: npm.exclude is present
check('npm.exclude setting is present', settings !== null && 'npm.exclude' in settings);

// Check 3: the exclude value covers .vscode-test
const exclude = settings ? settings['npm.exclude'] : '';
const excludeStr = Array.isArray(exclude) ? exclude.join('\n') : String(exclude || '');
check('npm.exclude covers **/.vscode-test/** pattern',
    excludeStr.includes('.vscode-test'));

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('');
if (failed > 0) {
    console.error(`REG-078 FAILED: ${failed} check(s) failed`);
    process.exit(1);
} else {
    console.log(`REG-078 passed (${passed} checks)`);
}
