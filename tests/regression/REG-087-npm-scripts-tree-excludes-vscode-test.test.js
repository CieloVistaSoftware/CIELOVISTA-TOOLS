'use strict';
/**
 * REG-087 — npm-scripts-tree excludes .vscode-test/ from package.json scan
 *
 * Issue #452: The npm scripts panel showed 75 scripts from
 * .vscode-test/vscode-win32-x64-archive-insiders/... — the VS Code binary
 * download folder used by @vscode/test-electron. These are not project scripts.
 *
 * Fix: added **\/.vscode-test\/** to the findFiles() exclude glob in
 * src/features/npm-scripts-tree.ts so that folder is never scanned.
 *
 * Checks:
 *  1. npm-scripts-tree.ts exists
 *  2. The findFiles exclude glob contains .vscode-test
 *  3. The exclude glob still contains node_modules (existing exclusions intact)
 *  4. The exclude glob still contains .claude (existing exclusions intact)
 */

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SRC  = path.join(ROOT, 'src', 'features', 'npm-scripts-tree.ts');

let passed = 0;
let failed = 0;

function check(desc, cond) {
    if (cond) { console.log(`  ✓ ${desc}`); passed++; }
    else       { console.error(`  ✗ ${desc}`); failed++; }
}

console.log('REG-087: npm-scripts-tree excludes .vscode-test/ from scan (issue #452)');
console.log('');

check('src/features/npm-scripts-tree.ts exists', fs.existsSync(SRC));

const src = fs.existsSync(SRC) ? fs.readFileSync(SRC, 'utf8') : '';

check(
    'findFiles exclude glob contains .vscode-test',
    src.includes('.vscode-test')
);

check(
    'findFiles exclude glob still contains node_modules',
    src.includes('node_modules')
);

check(
    'findFiles exclude glob still contains .claude',
    src.includes('.claude')
);

console.log('');
if (failed > 0) {
    console.error(`REG-087 FAILED: ${failed} check(s) failed`);
    process.exit(1);
} else {
    console.log(`REG-087 passed (${passed} checks)`);
}
