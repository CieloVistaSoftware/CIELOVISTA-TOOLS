// REG-099 — clean-generated-artifacts: no stale TARGETS that are never generated (#491)
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const SRC  = fs.readFileSync(path.join(ROOT, 'scripts/clean-generated-artifacts.js'), 'utf8');

let pass = 0, fail = 0;
function check(desc, cond) {
    if (cond) { console.log(`  ✓ ${desc}`); pass++; }
    else       { console.error(`  ✗ ${desc}`); fail++; }
}

// ── Known stale entries that must not reappear ────────────────────────────────

const STALE = [
    'temp/generated-mcp-viewer-script.js',
    'temp/inspect-mcp-script.js',
    'temp/mcp-viewer-inline-script.js',
    'temp_script.js',
];

for (const rel of STALE) {
    check(`TARGETS does not contain stale entry '${rel}'`, !SRC.includes(`'${rel}'`) && !SRC.includes(`"${rel}"`));
}

// ── playwright-report must still be present ───────────────────────────────────

check("TARGETS still contains 'playwright-report'",
    SRC.includes("'playwright-report'") || SRC.includes('"playwright-report"'));

// ── TARGETS const still exists ────────────────────────────────────────────────

check('TARGETS array is defined in clean-generated-artifacts.js',
    SRC.includes('const TARGETS'));

console.log(`\nREG-099: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
