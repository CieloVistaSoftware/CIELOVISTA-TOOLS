'use strict';
/**
 * REG-086 — tests/vscode/suite/index.js excludes home-filelist-gui.test.js
 *
 * Issue #448: npm run test:vscode failed because home-filelist-gui.test.js
 * requires a live VS Code workspace with a rendered FileList panel. In CI or
 * clean environments the webview is disposed before render() completes, causing
 * timeouts and "Webview is disposed" errors.
 *
 * Fix: added a GUI_TESTS exclusion Set in suite/index.js so the default suite
 * runner skips home-filelist-gui.test.js.
 *
 * Checks:
 *  1. suite/index.js exists
 *  2. GUI_TESTS set is defined in the file
 *  3. 'home-filelist-gui.test.js' is listed in GUI_TESTS
 *  4. The filter() call references GUI_TESTS (so the set is actually used)
 *  5. activation.test.js is NOT in GUI_TESTS (sanity: normal tests still run)
 */

const fs   = require('fs');
const path = require('path');

const ROOT  = path.join(__dirname, '..', '..');
const INDEX = path.join(ROOT, 'tests', 'vscode', 'suite', 'index.js');

let passed = 0;
let failed = 0;

function check(desc, cond) {
    if (cond) { console.log(`  ✓ ${desc}`); passed++; }
    else       { console.error(`  ✗ ${desc}`); failed++; }
}

console.log('REG-086: vscode suite excludes home-filelist-gui.test.js (issue #448)');
console.log('');

check('tests/vscode/suite/index.js exists', fs.existsSync(INDEX));

const src = fs.existsSync(INDEX) ? fs.readFileSync(INDEX, 'utf8') : '';

check(
    'GUI_TESTS exclusion Set is defined',
    src.includes('GUI_TESTS')
);

check(
    "home-filelist-gui.test.js is in GUI_TESTS",
    src.includes('home-filelist-gui.test.js')
);

check(
    'filter() references GUI_TESTS (exclusion is enforced)',
    src.includes('GUI_TESTS.has') || src.includes('!GUI_TESTS.has')
);

check(
    "activation.test.js is NOT in GUI_TESTS (normal tests still run)",
    !src.includes("GUI_TESTS") || !src.match(/GUI_TESTS\s*=.*activation\.test\.js/)
);

console.log('');
if (failed > 0) {
    console.error(`REG-086 FAILED: ${failed} check(s) failed`);
    process.exit(1);
} else {
    console.log(`REG-086 passed (${passed} checks)`);
}
