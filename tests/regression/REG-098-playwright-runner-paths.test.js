// REG-098 — playwright-runner: relative paths passed to CLI; dialog has title (#490)
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const SRC  = fs.readFileSync(path.join(ROOT, 'src/features/playwright-runner.ts'), 'utf8');

let pass = 0, fail = 0;
function check(desc, cond) {
    if (cond) { console.log(`  ✓ ${desc}`); pass++; }
    else       { console.error(`  ✗ ${desc}`); fail++; }
}

// ── showOpenDialog has a title ────────────────────────────────────────────────

check('showOpenDialog includes a title property',
    SRC.includes('title:') && SRC.includes('showOpenDialog'));

// ── args use path.relative (not raw fsPath) ──────────────────────────────────

check('test file args use path.relative to produce relative paths',
    SRC.includes('path.relative(wsPath, f.fsPath)'));

check('backslashes replaced with forward slashes for Playwright CLI',
    SRC.includes(".replace(/\\\\/g, '/')"));

check('raw f.fsPath is NOT spread directly into args',
    !SRC.includes("...testFiles.map(f => f.fsPath)") &&
    !SRC.includes('...testFiles.map(f=>f.fsPath)'));

// ── sanity: spawn call still present ─────────────────────────────────────────

check('spawn call still uses npx playwright',
    SRC.includes("spawn('npx'") && SRC.includes("'playwright'"));

console.log(`\nREG-098: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
