'use strict';
/**
 * REG-081 — background-health-runner does not reference home-page.spec.ts
 *
 * Issue #440: background-health-runner.ts had a check (chk-home-page-ui) that
 * used __dirname to locate home-page.spec.ts.  That path only exists in the
 * development tree — not in an installed VSIX — so the check always threw
 * "file not found" for every user who installed the extension.
 *
 * Fix: removed chk-home-page-ui from the CHECKS array entirely.
 *
 * This test exercises the actual CHECKS array defined in the source by:
 *  1. Verifying no check ID is 'chk-home-page-ui'
 *  2. Verifying no check uses __dirname to reference a .spec.ts test file
 *  3. Verifying every check's run() body does NOT reference home-page.spec.ts
 *  4. Confirming the remaining checks reference only paths that exist at
 *     the extension root (not paths inside tests/ that are stripped from VSIX)
 *
 * All checks are derived by parsing the real source — not by reimplementing.
 */

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SRC  = path.join(ROOT, 'src', 'features', 'background-health-runner.ts');

let passed = 0;
let failed = 0;

function check(desc, cond) {
    if (cond) { console.log(`  ✓ ${desc}`); passed++; }
    else       { console.error(`  ✗ ${desc}`); failed++; }
}

console.log('REG-081: background-health-runner — home-page.spec.ts path removed');
console.log('');

const src = fs.readFileSync(SRC, 'utf8');

// 1. The removed check ID is gone
check(
    "CHECKS does not contain 'chk-home-page-ui'",
    !src.includes("'chk-home-page-ui'") && !src.includes('"chk-home-page-ui"')
);

// 2. No __dirname reference pointing to a .spec.ts file
//    (the bug pattern: path.join(__dirname, '...', '*.spec.ts'))
const dirnamePlusSpec = /__dirname.*\.spec\.ts/.test(src);
check(
    'No __dirname + .spec.ts path reference in source',
    !dirnamePlusSpec
);

// 3. No reference to home-page.spec.ts at all
check(
    'No reference to home-page.spec.ts anywhere in source',
    !src.includes('home-page.spec.ts')
);

// 4. The CHECKS array still exists and has entries (feature wasn't deleted entirely)
check(
    'CHECKS array still defined (feature still active)',
    src.includes('const CHECKS') || src.includes('const CHECKS:')
);

// 5. Remaining checks use paths that exist at extension root, not tests/
//    Verify by extracting all path.join(__dirname, ...) calls and checking
//    they don't reference 'tests/' directories (stripped from VSIX)
const dirnamePaths = [...src.matchAll(/path\.(?:join|resolve)\s*\(\s*__dirname[\s\S]*?\)/g)]
    .map(m => m[0]);
const badPath = dirnamePaths.find(p => p.includes('/tests/') || p.includes("'tests'") || p.includes('"tests"'));
check(
    'No __dirname paths referencing tests/ directory (not bundled in VSIX)',
    !badPath
);

console.log('');
if (failed > 0) {
    console.error(`REG-081 FAILED: ${failed} check(s) failed`);
    process.exit(1);
} else {
    console.log(`REG-081 passed (${passed} checks)`);
}
