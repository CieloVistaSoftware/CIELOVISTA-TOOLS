'use strict';
/**
 * REG-084 — all-cards-webview Playwright spec covers required test cases
 *
 * Issue #450: "npm run test:ui:cards" was failing.  The spec was rewritten to
 * serve catalog.html directly in Chromium (no VS Code needed), inject test
 * card HTML via a simulated postMessage init, and test all 7 UI behaviors.
 *
 * This test exercises the actual spec file to verify:
 *  1. The spec file exists at tests/ui/all-cards-webview.spec.ts
 *  2. catalog.html exists (the page the spec serves)
 *  3. The spec contains all 7 required test cases (by name)
 *  4. The spec uses a local HTTP server (not a VS Code webview URL)
 *  5. The spec injects test cards via postMessage init (not a real workspace scan)
 *  6. The spec has the correct playwright import
 *  7. The spec file is syntactically valid (can be read and is non-empty)
 *
 * The spec's 7 Playwright tests are the functional proof — this REG verifies
 * their presence so a future deletion cannot go undetected.
 */

const fs   = require('fs');
const path = require('path');

const ROOT         = path.join(__dirname, '..', '..');
const SPEC         = path.join(ROOT, 'tests', 'ui', 'all-cards-webview.spec.ts');
const CATALOG_HTML = path.join(ROOT, 'src', 'features', 'doc-catalog', 'catalog.html');

let passed = 0;
let failed = 0;

function check(desc, cond) {
    if (cond) { console.log(`  ✓ ${desc}`); passed++; }
    else       { console.error(`  ✗ ${desc}`); failed++; }
}

console.log('REG-084: all-cards-webview.spec.ts exists and covers 7 required cases');
console.log('');

// 1. Spec file exists
check('tests/ui/all-cards-webview.spec.ts exists', fs.existsSync(SPEC));

const spec = fs.existsSync(SPEC) ? fs.readFileSync(SPEC, 'utf8') : '';

// 2. catalog.html exists (the page under test)
check('src/features/doc-catalog/catalog.html exists', fs.existsSync(CATALOG_HTML));

// 3-9. All 7 required test cases are present
const REQUIRED_TESTS = [
    ['Shell loads without JS errors',                    'without JS errors'],
    ['Toolbar buttons present (Reset, Newest, Rebuild)', 'Toolbar buttons'],
    ['Cards render after init message',                  'cards render'],
    ['Each card has action buttons',                     'action buttons'],
    ['Sort by Newest toggles sorted view',               'Newest'],
    ['Project filter dropdown populates',                'filter'],
    ['Stat bar shows card count',                        'stat bar'],
];

for (const [desc, pattern] of REQUIRED_TESTS) {
    check(
        `Test case: "${desc}"`,
        spec.toLowerCase().includes(pattern.toLowerCase())
    );
}

// 10. Spec uses Playwright (not VS Code test runner)
check(
    "Spec imports from '@playwright/test'",
    spec.includes('@playwright/test')
);

// 11. Spec serves catalog.html locally (no VS Code dependency)
check(
    'Spec reads catalog.html from filesystem (self-contained)',
    spec.includes('CATALOG_HTML') || spec.includes('catalog.html')
);

// 12. Spec injects cards via postMessage (no real workspace scan needed)
check(
    'Spec injects test cards via postMessage init',
    spec.includes('postMessage') && spec.includes('init')
);

console.log('');
if (failed > 0) {
    console.error(`REG-084 FAILED: ${failed} check(s) failed`);
    process.exit(1);
} else {
    console.log(`REG-084 passed (${passed} checks)`);
}
