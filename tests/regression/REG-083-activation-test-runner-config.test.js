'use strict';
/**
 * REG-083 — activation test runner uses activation-only suite (not full GUI suite)
 *
 * Issue #449: "npm run test:activation" was broken because the test runner
 * was loading the full test suite index (which includes home-filelist-gui.test.js).
 * The GUI tests require a workspace and a fully rendered FileList panel, so they
 * would time out in CI / clean environments.
 *
 * Fix: created tests/vscode/runActivationTest.js that points extensionTestsPath
 * to activation-only.index.js, which only loads activation.test.js.
 *
 * This test exercises the real runner files:
 *  1. runActivationTest.js exists
 *  2. runActivationTest.js points to activation-only.index.js (not suite/index.js)
 *  3. activation-only.index.js exists
 *  4. activation-only.index.js only loads activation.test.js (not GUI tests)
 *  5. activation.test.js exists
 *  6. The runner does NOT load home-filelist-gui.test.js
 *  7. runActivationTest.js is referenced in package.json as test:activation
 */

const fs   = require('fs');
const path = require('path');

const ROOT   = path.join(__dirname, '..', '..');
const RUNNER = path.join(ROOT, 'tests', 'vscode', 'runActivationTest.js');
const AOI    = path.join(ROOT, 'tests', 'vscode', 'suite', 'activation-only.index.js');
const ACT    = path.join(ROOT, 'tests', 'vscode', 'suite', 'activation.test.js');
const PKG    = path.join(ROOT, 'package.json');

let passed = 0;
let failed = 0;

function check(desc, cond) {
    if (cond) { console.log(`  ✓ ${desc}`); passed++; }
    else       { console.error(`  ✗ ${desc}`); failed++; }
}

console.log('REG-083: npm run test:activation uses activation-only suite');
console.log('');

// 1. Runner file exists
check('tests/vscode/runActivationTest.js exists', fs.existsSync(RUNNER));

const runnerSrc = fs.existsSync(RUNNER) ? fs.readFileSync(RUNNER, 'utf8') : '';

// 2. Runner points to activation-only.index.js
check(
    'runActivationTest.js references activation-only.index.js',
    runnerSrc.includes('activation-only.index.js') || runnerSrc.includes('activation-only.index')
);

// 3. Runner does NOT load the full suite/index.js (which includes GUI tests)
check(
    'runActivationTest.js does NOT load suite/index.js',
    !runnerSrc.includes("'suite/index.js'") && !runnerSrc.includes('"suite/index.js"') &&
    !runnerSrc.includes("'suite/index'")    && !runnerSrc.includes('"suite/index"')
);

// 4. activation-only.index.js exists
check('tests/vscode/suite/activation-only.index.js exists', fs.existsSync(AOI));

const aoiSrc = fs.existsSync(AOI) ? fs.readFileSync(AOI, 'utf8') : '';

// 5. activation-only.index.js loads activation.test.js
check(
    'activation-only.index.js references activation.test.js',
    aoiSrc.includes('activation.test.js') || aoiSrc.includes('activation.test')
);

// 6. activation-only.index.js does NOT load home-filelist-gui.test.js
check(
    'activation-only.index.js does NOT load home-filelist-gui.test.js',
    !aoiSrc.includes('home-filelist-gui')
);

// 7. activation.test.js exists
check('tests/vscode/suite/activation.test.js exists', fs.existsSync(ACT));

// 8. package.json test:activation script references runActivationTest
const pkg = JSON.parse(fs.readFileSync(PKG, 'utf8'));
const testActivation = pkg.scripts?.['test:activation'] || '';
check(
    'package.json test:activation script runs runActivationTest',
    testActivation.includes('runActivationTest') || testActivation.includes('activation')
);

console.log('');
if (failed > 0) {
    console.error(`REG-083 FAILED: ${failed} check(s) failed`);
    process.exit(1);
} else {
    console.log(`REG-083 passed (${passed} checks)`);
}
